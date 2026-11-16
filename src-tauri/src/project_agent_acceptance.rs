//! Opt-in packaged-app acceptance. Never available in release builds or a normal database.
use crate::{types::*, AppState};
use serde_json::{json, Value};
use std::{sync::Arc, time::Duration};
use tauri::Manager;

pub fn start(state: Arc<AppState>) -> Result<(), String> {
    let Ok(phase) = std::env::var("HARBOR_AGENT_ACCEPTANCE") else {
        return Ok(());
    };
    let isolated = std::env::var_os("HARBOR_TEST_DATA_DIR").map(std::path::PathBuf::from);
    if isolated.as_ref() != Some(&state.data)
        || !state
            .data
            .file_name()
            .is_some_and(|n| n.to_string_lossy().starts_with("harbor-owned-acceptance-"))
    {
        return Err(
            "Agent acceptance requires a dedicated harbor-owned-acceptance-* data directory".into(),
        );
    }
    tauri::async_runtime::spawn(async move {
        let result = tokio::time::timeout(Duration::from_secs(240), run(&state, &phase))
            .await
            .map_err(|_| "Packaged agent acceptance timed out".to_owned())
            .and_then(|r| r);
        let report = match &result {
            Ok(value) => json!({"passed":true,"phase":phase,"evidence":value}),
            Err(error) => json!({"passed":false,"phase":phase,"error":error}),
        };
        let _ = std::fs::write(
            state.data.join(format!("acceptance-{phase}.json")),
            serde_json::to_vec_pretty(&report).unwrap(),
        );
        eprintln!("Harbor agent acceptance: {report}");
        for session in state
            .db
            .list::<SessionRecord>("session")
            .unwrap_or_default()
        {
            state.stop(&session.id).await;
        }
        state.app.exit(if result.is_ok() { 0 } else { 1 });
    });
    Ok(())
}
async fn prompt(
    state: &Arc<AppState>,
    session: &str,
    text: &str,
    files: Vec<PromptAttachment>,
) -> Result<(), String> {
    let guard = state.operations.session(session).await;
    crate::send_prompt_locked_with_origin(
        state,
        session.into(),
        text.into(),
        Some(files),
        None,
        guard,
        false,
        None,
    )
    .await
}
async fn service_requests(state: &Arc<AppState>) -> Result<(), String> {
    service_requests_except(state, None).await
}
async fn service_requests_except(state: &Arc<AppState>, skip: Option<&str>) -> Result<(), String> {
    let connections = state
        .connections
        .lock()
        .await
        .values()
        .cloned()
        .collect::<Vec<_>>();
    for rpc in connections {
        let requests = rpc
            .inbound
            .lock()
            .await
            .values()
            .cloned()
            .collect::<Vec<_>>();
        for request in requests {
            if skip.is_some_and(|id| request["params"]["sessionId"] == id) {
                continue;
            }
            let answer = match request["method"].as_str().unwrap_or("") {
                "session/request_permission" => {
                    let choice = request["params"]["options"]
                        .as_array()
                        .and_then(|a| a.iter().find(|v| v["kind"] == "allow_once"))
                        .ok_or("No one-shot approval")?;
                    json!({"outcome":{"outcome":"selected","optionId":choice["optionId"]}})
                }
                "elicitation/create" => {
                    let fields = request["params"]["requestedSchema"]["properties"]
                        .as_object()
                        .ok_or("No question fields")?;
                    let content = fields
                        .keys()
                        .map(|k| (k.clone(), json!("HARBOR-ANSWER-42")))
                        .collect::<serde_json::Map<_, _>>();
                    json!({"action":"accept","content":content})
                }
                other => return Err(format!("Unexpected acceptance request: {other}")),
            };
            rpc.answer(request["id"].clone(), answer).await?;
        }
    }
    Ok(())
}
async fn until(
    state: &Arc<AppState>,
    check: impl Fn() -> Result<bool, String>,
) -> Result<(), String> {
    for _ in 0..1200 {
        service_requests(state).await?;
        if check()? {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    Err("Expected agent state was not reached".into())
}
async fn run(state: &Arc<AppState>, phase: &str) -> Result<Value, String> {
    if phase == "image" {
        return image_forwarding(state).await;
    }
    if phase == "restart" || phase == "queue" {
        let receipt: Value = serde_json::from_slice(
            &std::fs::read(state.data.join("acceptance-create.json")).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        let root = receipt["evidence"]["root"]
            .as_str()
            .ok_or("Missing accepted root")?;
        let child = receipt["evidence"]["child"]
            .as_str()
            .ok_or("Missing accepted child")?;
        let messages = state
            .db
            .list::<crate::project_agents::Message>("project-message")?;
        for id in [root, child] {
            let saved = state.db.get::<SessionRecord>("session", id)?;
            crate::connect(state, &saved, true).await?;
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
        if state
            .db
            .list::<crate::project_agents::Message>("project-message")?
            .len()
            != messages.len()
        {
            return Err("Reconnect redispatched a message".into());
        }
        let human=state.db.events(child,0.,5000)?.into_iter().filter(|e|e.kind=="user_message" && e.payload["text"]=="HUMAN-ATTACHMENT-42: Read the attached note and reply briefly. Do not send a parent report for this check.").count();
        if human != 1 {
            return Err(format!(
                "Expected one authored human input after restart, got {human}"
            ));
        }
        if phase == "queue" {
            return queued_delivery(state, root, child).await;
        }
        return Ok(
            json!({"root":root,"child":child,"messages":messages.len(),"redispatched":false,"humanCopies":human}),
        );
    }
    if phase != "create" {
        return Err("Unknown acceptance phase".into());
    }
    let mut provider = state.provider("codex")?;
    provider.command = std::env::var("HARBOR_SMOKE_COMMAND")
        .map_err(|_| "Set HARBOR_SMOKE_COMMAND to an authenticated Codex ACP installation")?;
    provider.args = vec![];
    state.db.put("provider", "codex", &provider)?;
    let workspace = state.data.join("workspace");
    std::fs::create_dir_all(&workspace).map_err(|e| e.to_string())?;
    let project = state.db.save_project(
        None,
        "Harbor-owned acceptance",
        "folder",
        "gray",
        workspace.to_str().ok_or("Invalid workspace")?,
    )?;
    let root = crate::projects::create_project_orchestrator(
        state.app.state::<Arc<AppState>>(),
        project.id.clone(),
        "codex".into(),
        "Harbor-owned acceptance".into(),
        None,
        false,
        None,
    )
    .await?;
    if root.error.is_some() {
        return Err(format!("Root initialization: {:?}", root.error));
    }
    let copy = state.clone();
    let rid = root.id.clone();
    let initial = tokio::spawn(async move {
        prompt(&copy,&rid,"Create exactly one ordinary Harbor agent titled Acceptance child. Its assignment is: Send your parent exactly HARBOR-CHILD-HELLO-42 using harbor_project.send_message, then finish. Do not modify files. After creating it, finish your turn promptly. When the report arrives acknowledge it briefly without sending another agent message or creating another child. This is a bounded disposable acceptance check.",vec![]).await
    });
    until(state, || {
        let messages = state
            .db
            .list::<crate::project_agents::Message>("project-message")?;
        Ok(messages.iter().any(|m| {
            m.recipient_id == root.id
                && m.text == "HARBOR-CHILD-HELLO-42"
                && m.status == "delivered"
        }) && state
            .db
            .list::<SessionRecord>("session")?
            .iter()
            .all(|s| matches!(s.status.as_str(), "idle" | "completed")))
    })
    .await?;
    initial.await.map_err(|e| e.to_string())??;
    let children = state
        .db
        .list::<SessionRecord>("session")?
        .into_iter()
        .filter(|s| s.parent_session_id.as_deref() == Some(&root.id))
        .collect::<Vec<_>>();
    if children.len() != 1 {
        return Err(format!(
            "Expected one ordinary child, got {}",
            children.len()
        ));
    }
    let child = &children[0];
    if child.is_orchestrator
        || child.provider_id != root.provider_id
        || child.worktree_id.is_some()
        || child.acp_session_id.is_none()
    {
        return Err("Child is not an independent ordinary session".into());
    }
    let root_events = state.db.events(&root.id, 0., 5000)?;
    if !root_events
        .iter()
        .any(|e| e.kind == "session/update" && e.payload.to_string().contains("create_agent"))
    {
        return Err("Missing visible create_agent tool receipt".into());
    }
    let child_events = state.db.events(&child.id, 0., 5000)?;
    if !child_events
        .iter()
        .any(|e| e.kind == "session/update" && e.payload.to_string().contains("send_message"))
    {
        return Err("Missing visible send_message tool receipt".into());
    }
    let mut copies = 0;
    for e in &root_events {
        if e.kind == "agent_message" && e.payload["text"] == "HARBOR-CHILD-HELLO-42" {
            copies += 1;
        }
    }
    if copies != 1 {
        return Err(format!("Expected one genuine reply, got {copies}"));
    }
    let copy = state.clone();
    let cid = child.id.clone();
    let direct = tokio::spawn(async move {
        prompt(&copy,&cid,"HUMAN-ATTACHMENT-42: Read the attached note and reply briefly. Do not send a parent report for this check.",vec![PromptAttachment{name:"acceptance.txt".into(),mime_type:"text/plain".into(),data:"SGFyYm9yIGF0dGFjaG1lbnQgNDI=".into()}]).await
    });
    until(state, || Ok(direct.is_finished())).await?;
    direct.await.map_err(|e| e.to_string())??;
    let copy = state.clone();
    let cid = child.id.clone();
    let question = tokio::spawn(async move {
        prompt(&copy,&cid,"Call harbor_project.ask_user now with the question What is the acceptance marker? Use free text, no options. Then confirm the answer verbatim and finish without messaging the parent.",vec![]).await
    });
    until(state, || Ok(question.is_finished())).await?;
    question.await.map_err(|e| e.to_string())??;
    let child_events = state.db.events(&child.id, 0., 5000)?;
    if !child_events
        .iter()
        .any(|e| e.kind == "request" && e.payload["method"] == "elicitation/create")
    {
        return Err("Child did not own its question form".into());
    }
    let answer_text = child_events
        .iter()
        .filter(|e| {
            e.kind == "session/update"
                && e.payload["update"]["sessionUpdate"] == "agent_message_chunk"
        })
        .filter_map(|e| e.payload["update"]["content"]["text"].as_str())
        .collect::<String>();
    if !answer_text.contains("HARBOR-ANSWER-42") {
        return Err("Child did not receive the actual question answer".into());
    }
    let human = child_events
        .iter()
        .filter(|e| {
            e.kind == "user_message"
                && e.payload["text"]
                    .as_str()
                    .is_some_and(|s| s.starts_with("HUMAN-ATTACHMENT-42"))
        })
        .collect::<Vec<_>>();
    if human.len() != 1
        || human[0].payload["attachments"]
            .as_array()
            .is_none_or(|a| a.len() != 1)
        || human[0].payload.get("label").is_some()
    {
        return Err("Human attachment attribution was not preserved exactly once".into());
    }
    // Exercise the same model-control command used by the ordinary chat UI.
    let configured = state.db.get::<SessionRecord>("session", &child.id)?;
    let option = configured
        .config_options
        .as_array()
        .and_then(|a| {
            a.iter()
                .find(|o| o["category"] == "model" || o["id"] == "model")
        })
        .ok_or("No ordinary model control")?;
    let config_id = option["id"].as_str().ok_or("No model control ID")?;
    let original_model = option["currentValue"].clone();
    let choices = option["options"].as_array().ok_or("No model choices")?;
    let alternative = choices
        .iter()
        .flat_map(|v| {
            v["options"]
                .as_array()
                .map(|a| a.iter().collect::<Vec<_>>())
                .unwrap_or_else(|| vec![v])
        })
        .find(|v| v["value"] != original_model)
        .ok_or("No alternative model")?["value"]
        .clone();
    let parent_before = state
        .db
        .get::<SessionRecord>("session", &root.id)?
        .config_options;
    crate::set_config(
        state.app.state::<Arc<AppState>>(),
        child.id.clone(),
        config_id.into(),
        alternative.clone(),
    )
    .await?;
    if state
        .db
        .get::<SessionRecord>("session", &root.id)?
        .config_options
        != parent_before
    {
        return Err("Child model change altered parent configuration".into());
    }
    crate::set_config(
        state.app.state::<Arc<AppState>>(),
        child.id.clone(),
        config_id.into(),
        original_model,
    )
    .await?;
    let copy = state.clone();
    let rid = root.id.clone();
    let cid = child.id.clone();
    let parent_message = tokio::spawn(async move {
        prompt(&copy,&rid,&format!("Use harbor_project.send_message to send agent {cid} exactly this literal message: PARENT-FOLLOWUP-42. Do not wrap it in setup or criteria. Finish after sending. If it replies, acknowledge without sending another message."),vec![]).await
    });
    until(state, || Ok(parent_message.is_finished())).await?;
    parent_message.await.map_err(|e| e.to_string())??;
    until(state, || {
        Ok(state
            .db
            .list::<crate::project_agents::Message>("project-message")?
            .iter()
            .any(|m| {
                m.recipient_id == child.id
                    && m.text == "PARENT-FOLLOWUP-42"
                    && m.status == "delivered"
            })
            && state
                .db
                .list::<SessionRecord>("session")?
                .iter()
                .all(|s| matches!(s.status.as_str(), "completed" | "idle")))
    })
    .await?;
    let child_followups = state
        .db
        .events(&child.id, 0., 5000)?
        .into_iter()
        .filter(|e| {
            e.kind == "agent_message"
                && e.payload["text"] == "PARENT-FOLLOWUP-42"
                && e.payload["senderId"] == root.id
        })
        .count();
    if child_followups != 1 {
        return Err("Parent literal message was not visible exactly once".into());
    }
    Ok(
        json!({"root":root.id,"child":child.id,"project":project.id,"nativeRoot":root.acp_session_id,"nativeChild":child.acp_session_id,"ordinaryChild":true,"modelChanged":alternative,"parentMessageCopies":child_followups,"replyCopies":copies,"questionAnswer":"HARBOR-ANSWER-42","humanAttachmentCopies":1,"nativeSubagents":state.db.list::<SubagentRecord>("subagent")?.len()}),
    )
}

async fn queued_delivery(state: &Arc<AppState>, root: &str, child: &str) -> Result<Value, String> {
    let after = state
        .db
        .events(child, 0., 5000)?
        .last()
        .map(|e| e.sequence)
        .unwrap_or(0.);
    let rpc = state.connection(child).await?;
    let wire = state
        .db
        .get::<SessionRecord>("session", child)?
        .acp_session_id
        .ok_or("Missing child identity")?;
    let copy = state.clone();
    let cid = child.to_owned();
    let question = tokio::spawn(async move {
        prompt(&copy,&cid,"Ask harbor_project.ask_user: What is the queue acceptance marker? Free text only. Confirm its answer and finish. Do not message the parent during this check.",vec![]).await
    });
    for _ in 0..600 {
        if !rpc.inbound.lock().await.is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    if rpc.inbound.lock().await.is_empty() {
        return Err("Child did not block on its own question".into());
    }
    let copy = state.clone();
    let rid = root.to_owned();
    let cid = child.to_owned();
    let parent = tokio::spawn(async move {
        prompt(&copy,&rid,&format!("Send agent {cid} exactly PARENT-QUEUED-42 via harbor_project.send_message and finish immediately. The child is busy; do not wait, stop it, poll, or cancel it. When it replies, acknowledge without sending more messages."),vec![]).await
    });
    for _ in 0..600 {
        service_requests_except(state, Some(&wire)).await?;
        if parent.is_finished() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    if !parent.is_finished() {
        return Err("Parent waited on the busy child".into());
    }
    parent.await.map_err(|e| e.to_string())??;
    if rpc.inbound.lock().await.is_empty() {
        return Err("Agent delivery cancelled the child's question".into());
    }
    if !state
        .prompt_queues
        .snapshot(child, &None)
        .items
        .iter()
        .any(|m| m.text == "PARENT-QUEUED-42" && m.sender_title.is_some())
    {
        return Err("Busy recipient did not queue the agent message".into());
    }
    crate::submit_prompt(
        state.app.state::<Arc<AppState>>(),
        child.into(),
        None,
        "HUMAN-QUEUED-42: Acknowledge briefly, and do not message the parent for this check."
            .into(),
        None,
        crate::prompt_queue::SubmissionIntent::Send,
    )
    .await?;
    until(state, || {
        Ok(question.is_finished()
            && state.prompt_queues.snapshot(child, &None).items.is_empty()
            && state
                .db
                .list::<SessionRecord>("session")?
                .iter()
                .all(|s| matches!(s.status.as_str(), "completed" | "idle")))
    })
    .await?;
    question.await.map_err(|e| e.to_string())??;
    let events = state.db.events(child, after, 5000)?;
    let parent_copies = events
        .iter()
        .filter(|e| {
            e.kind == "agent_message"
                && e.payload["text"] == "PARENT-QUEUED-42"
                && e.payload["senderId"] == root
        })
        .count();
    let human_copies = events
        .iter()
        .filter(|e| {
            e.kind == "user_message"
                && e.payload["text"]
                    .as_str()
                    .is_some_and(|s| s.starts_with("HUMAN-QUEUED-42"))
                && e.payload.get("label").is_none()
        })
        .count();
    if parent_copies != 1 || human_copies != 1 {
        return Err("Queued message authorship or deduplication failed".into());
    }
    Ok(
        json!({"root":root,"child":child,"agentQueuedWhileQuestionPending":true,"parentReturnedWithoutWaiting":true,"questionNotCancelled":true,"parentCopies":parent_copies,"humanCopies":human_copies}),
    )
}

async fn image_forwarding(state: &Arc<AppState>) -> Result<Value, String> {
    use base64::Engine;
    let mut provider = state.provider("codex")?;
    provider.command = std::env::var("HARBOR_SMOKE_COMMAND")
        .map_err(|_| "Set authenticated HARBOR_SMOKE_COMMAND")?;
    provider.args = vec![];
    state.db.put("provider", "codex", &provider)?;
    let workspace = state.data.join("workspace");
    std::fs::create_dir_all(&workspace).map_err(|e| e.to_string())?;
    let project = state.db.save_project(
        None,
        "Image forwarding acceptance",
        "folder",
        "gray",
        workspace.to_str().unwrap(),
    )?;
    let root = crate::projects::create_project_orchestrator(
        state.app.state::<Arc<AppState>>(),
        project.id.clone(),
        "codex".into(),
        "Image forwarding acceptance".into(),
        None,
        false,
        None,
    )
    .await?;
    let image = PromptAttachment {
        name: "reference-image.png".into(),
        mime_type: "image/png".into(),
        data: base64::engine::general_purpose::STANDARD
            .encode(include_bytes!("../icons/128x128.png")),
    };
    let expected = image.data.clone();
    let copy = state.clone();
    let rid = root.id.clone();
    let turn = tokio::spawn(async move {
        prompt(&copy,&rid,"Create exactly one Harbor child titled Image recipient to inspect this actual attached image. Forward the original attachment through create_agent attachments using its reference or latest; do not send only a description. Assignment: Look at the attached image yourself, send the parent one brief message describing its dominant color and shape, then finish without editing files. Finish your own turn promptly after creating the child. When its report arrives acknowledge once without sending more messages.",vec![image]).await
    });
    until(state, || {
        Ok(turn.is_finished()
            && state
                .db
                .list::<SessionRecord>("session")?
                .iter()
                .any(|s| s.parent_session_id.as_deref() == Some(&root.id))
            && state
                .db
                .list::<SessionRecord>("session")?
                .iter()
                .all(|s| matches!(s.status.as_str(), "completed" | "idle")))
    })
    .await?;
    turn.await.map_err(|e| e.to_string())??;
    let child = state
        .db
        .list::<SessionRecord>("session")?
        .into_iter()
        .find(|s| s.parent_session_id.as_deref() == Some(&root.id))
        .ok_or("Missing image recipient")?;
    let assignment = state
        .db
        .list::<crate::project_agents::Message>("project-message")?
        .into_iter()
        .find(|m| m.recipient_id == child.id)
        .ok_or("Missing assignment")?;
    if assignment.attachments.len() != 1 || assignment.attachments[0].data != expected {
        return Err("Child did not receive the original image pixels".into());
    }
    let events = state.db.events(&child.id, 0., 5000)?;
    if !events.iter().any(|e| {
        e.kind == "agent_message"
            && e.payload["attachments"]
                .as_array()
                .is_some_and(|a| a.len() == 1 && a[0]["previewSource"].is_string())
    }) {
        return Err("Child image preview was not persisted".into());
    }
    let replies = state
        .db
        .list::<crate::project_agents::Message>("project-message")?
        .into_iter()
        .filter(|m| m.sender_id == child.id && m.recipient_id == root.id)
        .map(|m| m.text)
        .collect::<Vec<_>>();
    if replies.is_empty() {
        return Err("Child did not report its own image inspection".into());
    }
    Ok(
        json!({"root":root.id,"child":child.id,"exactImageBytesPreserved":true,"childPreviewPersisted":true,"childReply":replies}),
    )
}
