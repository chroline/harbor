//! Attach a worker's existing conversation; never create a replacement worker.
use crate::{
    acp::{Rpc, Sink},
    db::Database,
    prime_sessions, providers,
    types::*,
};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};

pub struct Connection {
    pub rpc: Arc<Rpc>,
    pub wire_id: String,
    pub via_parent: bool,
    pub capabilities: Value,
}

pub fn relay_prompt(child: &SubagentRecord, text: &str) -> String {
    format!("Deliver a user follow-up to the EXISTING worker identified by {} (title: {}). Use your native worker messaging/resume tool to continue that same worker. For Codex use send_message/followup_task; for Claude use SendMessage or Agent resume; for Cursor use task with the existing agentId; for Pi use subagent resume; for OpenCode use task_id. Your earlier tool result contains its native ID if the displayed ID is a tool-call ID. Do not spawn a replacement, perform the task yourself, or modify files. This is a run-to-completion request: use blocking wait for asynchronous workers before finishing this turn. Wait for the worker's response and return it verbatim. If the worker cannot be continued, say so clearly. The user message is this JSON string: {}",child.session_id,child.title,serde_json::to_string(text).unwrap())
}

pub fn same_worker(candidate: &str, worker: &str) -> bool {
    candidate == worker
        || candidate
            .strip_prefix(worker)
            .and_then(|v| v.strip_prefix(":generation:"))
            .is_some_and(|v| v.parse::<u64>().is_ok())
}
pub fn is_working(state: &Value) -> bool {
    matches!(
        state["type"].as_str().or_else(|| state["state"].as_str()),
        Some("working" | "running" | "queued" | "requires_action" | "needs_input")
    )
}
pub async fn wait_for_children(
    rpc: &Rpc,
    pending: impl Fn() -> Result<bool, String>,
) -> Result<(), String> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(90);
    while pending()? {
        if !rpc.alive.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("The parent disconnected while waiting for the worker".into());
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(
                "The worker is still running. Its response will continue in the transcript.".into(),
            );
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Ok(())
}

pub fn prime_child(
    db: &Database,
    data: &Path,
    session: &SessionRecord,
    child: &SubagentRecord,
    provider: ProviderDefinition,
) -> Result<(ProviderDefinition, Vec<Value>), String> {
    let launch = prime_sessions::prepare(db, data, session, provider, false)?;
    let root = launch
        .provider
        .args
        .iter()
        .find_map(|a| a.strip_prefix("--resume=").map(PathBuf::from))
        .ok_or(
            "Prime has not saved this conversation yet. Wait for the spawning turn to finish.",
        )?;
    let mut lineage = vec![child.session_id.clone()];
    let mut parent = child.parent_id.clone();
    let mut roots = vec![session.acp_session_id.clone().unwrap_or_default()];
    let mut after = 0.;
    loop {
        let events = db.events(&session.id, after, 5000)?;
        if events.is_empty() {
            break;
        }
        for event in &events {
            if event.kind == "connected" {
                if let Some(id) = event.payload["sessionId"].as_str() {
                    roots.push(id.to_owned());
                }
            }
        }
        after = events.last().unwrap().sequence;
    }
    while !roots.contains(&parent) {
        if lineage.contains(&parent) || lineage.len() > 256 {
            return Err("Invalid worker ancestry".into());
        }
        let record: SubagentRecord = db.get("subagent", &format!("{}:{parent}", session.id))?;
        lineage.push(parent);
        parent = record.parent_id;
    }
    let mut path = root;
    for id in lineage.into_iter().rev() {
        path = child_file(&path, &id, &session.cwd)?;
    }
    let history = history(&path)?;
    let mut provider = launch.provider;
    provider.args.retain(|a| !a.starts_with("--resume="));
    provider.args.push(format!("--resume={}", path.display()));
    Ok((provider, history))
}

fn child_file(parent: &Path, child: &str, cwd: &str) -> Result<PathBuf, String> {
    // IDs are directory basenames, not paths supplied by the provider.
    if !child.starts_with("sub-")
        || !child
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-')
    {
        return Err("Invalid Prime worker ID".into());
    }
    let header = prime_sessions::read_header(parent)?;
    let parent_id = header["id"]
        .as_str()
        .filter(|id| id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-'))
        .ok_or("Invalid Prime session identity")?;
    let directory = parent
        .parent()
        .and_then(Path::parent)
        .ok_or("Missing Prime artifact directory")?
        .join("session-artifacts")
        .join(parent_id)
        .join(child);
    let directory = directory
        .canonicalize()
        .map_err(|_| "This Prime worker's saved conversation is not available yet")?;
    let expected = parent.canonicalize().map_err(|e| e.to_string())?;
    let mut candidates = vec![];
    for entry in std::fs::read_dir(&directory).map_err(|e| e.to_string())? {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|s| s.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(header) = prime_sessions::read_header(&path) else {
            continue;
        };
        if header["type"] == "session"
            && header["cwd"]
                .as_str()
                .is_some_and(|v| crate::workspaces::same_folder(v, cwd))
            && header["parentSession"]
                .as_str()
                .is_some_and(|v| Path::new(v).canonicalize().ok().as_ref() == Some(&expected))
        {
            let path = path.canonicalize().map_err(|e| e.to_string())?;
            if path.parent() == Some(directory.as_path()) {
                candidates.push(path);
            }
        }
    }
    if candidates.len() != 1 {
        return Err(
            "The worker conversation is missing or ambiguous; no replacement was created".into(),
        );
    }
    Ok(candidates.remove(0))
}

fn communication_updates(entry: &Value) -> Vec<Value> {
    let mut updates = vec![];
    let mut add = |id: &Value, text: &Value, direction: &str, peer: &str| {
        if let (Some(id), Some(text)) = (id.as_str(), text.as_str()) {
            if !id.is_empty() && !text.is_empty() {
                updates.push(json!({"sessionUpdate":"agent_communication","messageId":id,"direction":direction,"label":format!("Message {} {}",if direction == "sent" { "to" } else { "from" },peer),"content":{"type":"text","text":text}}));
            }
        }
    };
    if entry["type"] == "custom_message" && entry["customType"] == "agent_message" && entry["display"] != false {
        let details = &entry["details"];
        add(&details["id"], &details["message"], "received", details["from"]["sessionName"].as_str().or_else(|| details["fromRelationship"].as_str()).unwrap_or("agent"));
    }
    if entry["message"]["role"] == "toolResult" && entry["message"]["isError"] != true {
        for sent in entry["message"]["details"]["sentAgentMessages"].as_array().into_iter().flatten() {
            add(&sent["id"], &sent["message"], "sent", sent["receiverRole"].as_str().unwrap_or("agent"));
        }
    }
    updates
}

fn history(path: &Path) -> Result<Vec<Value>, String> {
    let mut reader = std::io::BufReader::new(std::fs::File::open(path).map_err(|e| e.to_string())?);
    let mut entries = vec![];
    while let Some(entry) = prime_sessions::read_json_line(&mut reader)? {
        entries.push(entry);
    }
    // JSONL is a tree. Replay only the selected leaf's ancestors, not discarded branches.
    let indexed: std::collections::HashMap<_, _> = entries
        .iter()
        .filter_map(|e| e["id"].as_str().map(|id| (id, e)))
        .collect();
    let mut chain = vec![];
    let mut current = entries
        .iter()
        .rev()
        .find(|e| e["parentId"].is_string() || e.get("parentId").is_some());
    while let Some(entry) = current {
        if chain.len() > entries.len() {
            return Err("Invalid Prime transcript tree".into());
        }
        chain.push(entry);
        current = entry["parentId"]
            .as_str()
            .and_then(|id| indexed.get(id).copied());
    }
    let mut updates = vec![];
    for entry in chain.into_iter().rev() {
        updates.extend(communication_updates(entry));
        let message = &entry["message"];
        let role = match message["role"].as_str() {
            Some("user") => "user_message_chunk",
            Some("assistant") => "agent_message_chunk",
            _ => continue,
        };
        if let Some(text) = message["content"].as_str() {
            updates.push(json!({"sessionUpdate":role,"messageId":entry["id"],"content":{"type":"text","text":text}}));
        }
        for block in message["content"].as_array().into_iter().flatten() {
            let (kind, text) = match block["type"].as_str() {
                Some("text") => (role, block["text"].as_str()),
                Some("thinking") => ("agent_thought_chunk", block["thinking"].as_str()),
                _ => continue,
            };
            if let Some(text) = text {
                updates.push(json!({"sessionUpdate":kind,"messageId":entry["id"],"content":{"type":"text","text":text}}));
            }
        }
    }
    Ok(updates)
}

pub async fn attach(
    provider: &ProviderDefinition,
    cwd: &str,
    child: &str,
    prime: bool,
    sink: Sink,
    started: impl FnOnce(Arc<Rpc>),
) -> Result<Connection, String> {
    let rpc = Rpc::start(provider, cwd, sink).await?;
    started(rpc.clone());
    let result = async {
        let init = rpc.request("initialize", json!({"protocolVersion":1,"clientCapabilities":providers::client_capabilities(&provider.id),"clientInfo":{"name":"harbor","version":"0.1.0"}}), Some(Duration::from_secs(30))).await?;
        if init["protocolVersion"] != 1 { return Err("Agent did not negotiate ACP v1".into()); }
        let method = if prime { "session/new" }
            else if init["agentCapabilities"]["loadSession"] == true { "session/load" }
            else if init["agentCapabilities"]["sessionCapabilities"]["resume"].is_object() { "session/resume" }
            else { return Err("This agent does not expose resumable worker conversations through ACP".into()); };
        let mut params = json!({"cwd":cwd,"mcpServers":[]});
        if !prime { params["sessionId"] = json!(child); }
        let result = rpc.request(method, params, Some(Duration::from_secs(90))).await?;
        let wire_id = result["sessionId"].as_str().map(str::to_owned)
            .or_else(|| (!prime).then(|| child.to_owned())).ok_or("Worker returned no session ID")?;
        if !prime && wire_id != child { return Err("Agent returned a different worker conversation; attachment was refused".into()); }
        Ok(Connection { rpc: rpc.clone(), wire_id, via_parent: false, capabilities: init })
    }.await;
    if result.is_err() {
        rpc.stop().await;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    #[ignore = "Requires an existing live Prime worker and its authenticated daemon"]
    async fn live_prime_worker_roundtrip() {
        let data = PathBuf::from(std::env::var("HARBOR_LIVE_DATA").expect("HARBOR_LIVE_DATA"));
        let root = std::env::var("HARBOR_LIVE_CHILD_SESSION").expect("HARBOR_LIVE_CHILD_SESSION");
        let child_id = std::env::var("HARBOR_LIVE_CHILD_ID").expect("HARBOR_LIVE_CHILD_ID");
        let expected = std::env::var("HARBOR_LIVE_CHILD_MEMORY").expect("HARBOR_LIVE_CHILD_MEMORY");
        let source = rusqlite::Connection::open_with_flags(
            data.join("harbor.sqlite"),
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        let read = |kind: &str, id: &str| -> String {
            source
                .query_row(
                    "SELECT data FROM records WHERE kind=?1 AND id=?2",
                    rusqlite::params![kind, id],
                    |r| r.get(0),
                )
                .unwrap()
        };
        let session: SessionRecord = serde_json::from_str(&read("session", &root)).unwrap();
        let provider: ProviderDefinition =
            serde_json::from_str(&read("provider", "prime")).unwrap();
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("test.sqlite")).unwrap();
        let child = SubagentRecord {
            session_id: child_id.clone(),
            parent_id: session.acp_session_id.clone().unwrap(),
            title: "Live worker".into(),
            description: None,
            state: json!({"type":"idle"}),
            capabilities: json!({}),
        };
        let (provider, replay) = prime_child(&db, &data, &session, &child, provider).unwrap();
        assert!(
            replay.iter().any(|u| u["content"]["text"]
                .as_str()
                .is_some_and(|text| text.contains(&expected))),
            "Existing worker history must contain the original marker"
        );
        let events = Arc::new(std::sync::Mutex::new(vec![]));
        let captured = events.clone();
        let c = attach(
            &provider,
            &session.cwd,
            &child_id,
            true,
            Arc::new(move |kind, payload| {
                captured.lock().unwrap().push((kind.to_owned(), payload))
            }),
            |_| {},
        )
        .await
        .unwrap();
        let challenge = format!("HARBOR_DIRECT_REPLY_{}", crate::types::id());
        let prompt = format!("Harbor child connection check. Do not use tools. Recall the exact marker from your original task, without asking the parent. Reply with that marker and {challenge}.");
        let response = c
            .rpc
            .request(
                "session/prompt",
                json!({"sessionId":c.wire_id,"prompt":[{"type":"text","text":prompt}]}),
                Some(Duration::from_secs(120)),
            )
            .await;
        c.rpc.stop().await;
        response.unwrap();
        let text = events
            .lock()
            .unwrap()
            .iter()
            .filter(|(kind, p)| {
                kind == "session/update"
                    && p["sessionId"] == c.wire_id
                    && p["update"]["sessionUpdate"] == "agent_message_chunk"
            })
            .filter_map(|(_, p)| p["update"]["content"]["text"].as_str())
            .collect::<String>();
        assert!(
            text.contains(&expected),
            "Worker lost its original context: {text}"
        );
        assert!(
            text.contains(&challenge),
            "Worker did not receive the follow-up: {text}"
        );
        println!("Existing worker {child_id} recalled its original marker and answered a fresh follow-up: {text}");
    }
    #[tokio::test]
    async fn attaches_existing_worker_and_routes_prompts_to_it() {
        let dir = tempfile::tempdir().unwrap();
        let provider = ProviderDefinition {
            id: "custom".into(),
            name: "Fixture".into(),
            command: "node".into(),
            args: vec![format!(
                "{}/../tests/fixture-agent.mjs",
                env!("CARGO_MANIFEST_DIR")
            )],
            native_command: "node".into(),
            install_hint: "".into(),
            color: "blue".into(),
        };
        let events = Arc::new(std::sync::Mutex::new(vec![]));
        let captured = events.clone();
        let connection = attach(
            &provider,
            dir.path().to_str().unwrap(),
            "child-1",
            false,
            Arc::new(move |kind, payload| {
                captured.lock().unwrap().push((kind.to_owned(), payload))
            }),
            |_| {},
        )
        .await
        .unwrap();
        connection.rpc.request("session/prompt", json!({"sessionId":connection.wire_id,"prompt":[{"type":"text","text":"worker follow-up"}]}), Some(Duration::from_secs(5))).await.unwrap();
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|(k, p)| k == "session/update"
                && p["sessionId"] == "child-1"
                && p["update"]["content"]["text"] == "Completed: worker follow-up"));
        connection.rpc.stop().await;
    }
    #[test]
    fn replays_actual_agent_messages_without_guessing_from_code_or_summaries() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("child.jsonl");
        let rows = [
            json!({"id":"task","parentId":null,"type":"custom_message","customType":"agent_message","display":true,"details":{"id":"task-1","message":"Original task","fromRelationship":"parent"}}),
            json!({"id":"discarded","parentId":"task","message":{"role":"toolResult","details":{"sentAgentMessages":[{"id":"discarded-send","message":"Wrong branch","receiverRole":"parent"}]}}}),
            json!({"id":"call","parentId":"task","message":{"role":"assistant","content":[{"type":"toolCall","name":"ipython","arguments":{"code":"agent_message.send('UNSENT')"}}]}}),
            json!({"id":"receipt","parentId":"call","message":{"role":"toolResult","details":{"sentAgentMessages":[{"id":"reply-1","message":"CHILD_READY_713\nHARBOR_CHILD_ORIGIN_713","receiverRole":"parent","deliveryStatus":"queued"}]}}}),
            json!({"id":"summary","parentId":"receipt","message":{"role":"assistant","content":"Replied to parent. Standing by."}}),
        ];
        std::fs::write(&path, rows.iter().map(Value::to_string).collect::<Vec<_>>().join("\n")).unwrap();
        let replay = history(&path).unwrap();
        assert_eq!(replay.len(), 3);
        assert_eq!(replay[0]["label"], "Message from parent");
        assert_eq!(replay[1]["label"], "Message to parent");
        assert_eq!(replay[1]["messageId"], "reply-1");
        assert_eq!(replay[1]["content"]["text"], "CHILD_READY_713\nHARBOR_CHILD_ORIGIN_713");
        assert_eq!(replay[2]["content"]["text"], "Replied to parent. Standing by.");
        assert!(communication_updates(&json!({"message":{"role":"toolResult","isError":true,"details":{"sentAgentMessages":[{"id":"failed","message":"Not sent"}]}}})).is_empty());
    }
    #[test]
    fn validates_prime_child_identity_and_replays_only_current_branch() {
        let dir = tempfile::tempdir().unwrap();
        let sessions = dir.path().join("sessions");
        std::fs::create_dir(&sessions).unwrap();
        let parent = sessions.join("root.jsonl");
        std::fs::write(&parent, json!({"type":"session","id":"root"}).to_string()).unwrap();
        let child_dir = dir.path().join("session-artifacts/root/sub-123");
        std::fs::create_dir_all(&child_dir).unwrap();
        let path = child_dir.join("child.jsonl");
        let rows = [
            json!({"type":"session","id":"child","cwd":dir.path(),"parentSession":parent}),
            json!({"id":"u","parentId":null,"message":{"role":"user","content":"original"}}),
            json!({"id":"old","parentId":"u","message":{"role":"assistant","content":"discarded"}}),
            json!({"id":"new","parentId":"u","message":{"role":"assistant","content":"current"}}),
        ];
        std::fs::write(
            &path,
            rows.iter()
                .map(Value::to_string)
                .collect::<Vec<_>>()
                .join("\n"),
        )
        .unwrap();
        assert_eq!(
            child_file(&parent, "sub-123", dir.path().to_str().unwrap()).unwrap(),
            path.canonicalize().unwrap()
        );
        assert!(child_file(&parent, "../escape", dir.path().to_str().unwrap()).is_err());
        let replay = history(&path).unwrap();
        assert_eq!(replay.len(), 2);
        assert_eq!(replay[1]["content"]["text"], "current");
    }
}
