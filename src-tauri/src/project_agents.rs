//! Harbor-owned project chats and authenticated, asynchronous local agent tools.
use crate::{types::*, AppState};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex as StdMutex},
    time::Duration,
};
use tauri::Emitter;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::TcpListener,
    sync::Mutex,
};
pub fn is_agent(s: &SessionRecord) -> bool {
    s.is_orchestrator || s.parent_session_id.is_some()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub project_id: String,
    pub sender_id: String,
    pub sender_title: String,
    pub recipient_id: String,
    pub text: String,
    #[serde(default)]
    pub attachments: Vec<PromptAttachment>,
    pub status: String,
    #[serde(default)]
    pub created_at: f64,
}
#[derive(Default)]
pub struct Bridge {
    address: Mutex<Option<String>>,
    tokens: StdMutex<HashMap<String, String>>,
}
impl Bridge {
    pub fn revoke(&self, session: &str) {
        self.tokens.lock().unwrap().retain(|_, id| id != session);
    }
    pub async fn server(
        &self,
        state: &Arc<AppState>,
        session: &SessionRecord,
    ) -> Result<Value, String> {
        let mut address = self.address.lock().await;
        if address.is_none() {
            let listener = TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(|e| e.to_string())?;
            *address = Some(
                listener
                    .local_addr()
                    .map_err(|e| e.to_string())?
                    .to_string(),
            );
            let weak = Arc::downgrade(state);
            tauri::async_runtime::spawn(async move {
                while let Ok((stream, peer)) = listener.accept().await {
                    if !peer.ip().is_loopback() {
                        continue;
                    }
                    let Some(state) = weak.upgrade() else { break };
                    tauri::async_runtime::spawn(async move {
                        let (input, mut output) = stream.into_split();
                        let mut line = String::new();
                        let read = tokio::time::timeout(
                            Duration::from_secs(10),
                            BufReader::new(input)
                                .take(16 * 1024 * 1024)
                                .read_line(&mut line),
                        )
                        .await;
                        let response = if matches!(read,Ok(Ok(n)) if n>0) {
                            match serde_json::from_str::<Value>(&line) {
                                Ok(request) => match route(&state, &request).await {
                                    Ok(result) => json!({"result":result}),
                                    Err(error) => json!({"error":error}),
                                },
                                Err(_) => json!({"error":"Invalid agent request"}),
                            }
                        } else {
                            json!({"error":"Agent request timed out or exceeded its size limit"})
                        };
                        let _ = output.write_all(format!("{response}\n").as_bytes()).await;
                    });
                }
            });
        }
        let token = format!("{}{}", id(), id());
        self.tokens
            .lock()
            .unwrap()
            .insert(token.clone(), session.id.clone());
        Ok(
            json!({"name":"harbor_project","command":std::env::current_exe().map_err(|e|e.to_string())?,"args":["--harbor-project-tools"],"env":[{"name":"HARBOR_AGENT_ENDPOINT","value":address.as_ref().unwrap()},{"name":"HARBOR_AGENT_TOKEN","value":token},{"name":"HARBOR_AGENT_ROLE","value":if session.is_orchestrator {"orchestrator"} else {"worker"}}]}),
        )
    }
}
fn authorize(db: &crate::db::Database, caller_id: &str) -> Result<SessionRecord, String> {
    let caller = db.get::<SessionRecord>("session", caller_id)?;
    if !is_agent(&caller) || caller.archived {
        return Err("This project agent is not active".into());
    }
    let project = db.get::<Project>(
        "project",
        caller.project_id.as_deref().ok_or("Agent has no project")?,
    )?;
    let owner = caller.parent_session_id.as_deref().unwrap_or(&caller.id);
    if project.active_orchestrator_session_id.as_deref() != Some(owner) {
        return Err("This agent belongs to a previous project conversation".into());
    }
    Ok(caller)
}
fn target(
    db: &crate::db::Database,
    caller: &SessionRecord,
    recipient: &str,
) -> Result<SessionRecord, String> {
    let s = db.get::<SessionRecord>("session", recipient)?;
    if s.archived || !is_agent(&s) || s.project_id != caller.project_id {
        return Err("The recipient is not an active agent in this project".into());
    }
    let owner = caller.parent_session_id.as_deref().unwrap_or(&caller.id);
    if s.id != owner && s.parent_session_id.as_deref() != Some(owner) {
        return Err("The recipient belongs to a previous project conversation".into());
    }
    if s.id == caller.id {
        return Err("An agent cannot send messages to itself".into());
    }
    Ok(s)
}
async fn route(state: &Arc<AppState>, request: &Value) -> Result<Value, String> {
    let token = request["token"]
        .as_str()
        .ok_or("Agent authentication required")?;
    let caller_id = state
        .agent_bridge
        .tokens
        .lock()
        .unwrap()
        .get(token)
        .cloned()
        .ok_or("Invalid agent credentials")?;
    let caller = authorize(&state.db, &caller_id)?;
    let _project_guard = state
        .operations
        .project(caller.project_id.as_deref().ok_or("Agent has no project")?)
        .await;
    let caller = authorize(&state.db, &caller_id)?;
    let args = &request["arguments"];
    let method = request["method"].as_str().ok_or("Missing agent method")?;
    let request_id = request["requestId"]
        .as_str()
        .filter(|s| uuid::Uuid::parse_str(s).is_ok())
        .ok_or("Invalid request identity")?;
    let _operation = state.operations.lock_agent_request(request_id).await;
    let receipt_key = format!("{}:{request_id}", caller.id);
    if let Ok(saved) = state.db.get::<Value>("agent-request", &receipt_key) {
        return Ok(saved);
    }
    let result=match method {
        "list_agents"=>json!(state.db.list::<SessionRecord>("session")?.into_iter().filter(|s|!s.archived && s.project_id==caller.project_id && (s.id==caller.parent_session_id.as_deref().unwrap_or(&caller.id) || s.parent_session_id.as_deref()==Some(caller.parent_session_id.as_deref().unwrap_or(&caller.id)))).map(|s|json!({"sessionId":s.id,"parentSessionId":s.parent_session_id,"title":s.title,"status":s.status,"providerId":s.provider_id,"model":crate::model_config::selections(&ProviderConfiguration{agent_info:None,config_options:s.config_options,models:s.models,modes:Some(s.modes)})})).collect::<Vec<_>>()),
        "create_agent"=>{
            if !caller.is_orchestrator {return Err("Only the orchestrator may create project agents".into());}
            let title=required(args,"title",256)?;
            let assignment=required(args,"assignment",262144)?;
            let attachments = crate::project_attachments::resolve(&state.db, &state.data, &caller.id, args)?;
            let mut child=caller.clone();child.id=id();child.title=title;child.parent_session_id=Some(caller.id.clone());child.is_orchestrator=false;
            child.acp_session_id=None;child.native_session_id=None;child.worktree_id=None;
            child.status="connecting".into();child.error=None;child.draft=String::new();child.scroll_top=0.;child.review_open=false;child.created_at=now();child.updated_at=now();
            if let Some(workspace)=child.workspace_id.as_deref().and_then(|i|state.db.get::<Workspace>("workspace",i).ok()) {child.cwd=workspace.path;}
            let selected=args.get("model").cloned().unwrap_or_else(||crate::model_config::selections(&ProviderConfiguration{agent_info:None,config_options:caller.config_options.clone(),models:caller.models.clone(),modes:Some(caller.modes.clone())}));
            child.config_options=json!([]);child.models=Value::Null;child.modes=Value::Null;child.capabilities=AgentCapabilities::default();
            let message=Message{id:id(),project_id:caller.project_id.clone().unwrap(),sender_id:caller.id.clone(),sender_title:caller.title.clone(),recipient_id:child.id.clone(),text:assignment,attachments,status:"queued".into(),created_at:now()};
            let result=json!({"sessionId":child.id,"messageId":message.id,"status":"queued"});
            let preference_key=format!("{}:{}",child.id,child.provider_id);
            // Persist creation and its assignment together before acknowledging the tool.
            {let mut c=state.db.0.lock().map_err(|e|e.to_string())?;let tx=c.transaction().map_err(|e|e.to_string())?;
             for (kind,key,value) in [("session",child.id.as_str(),serde_json::to_value(&child).unwrap()),("project-message",message.id.as_str(),serde_json::to_value(&message).unwrap()),("agent-request",receipt_key.as_str(),result.clone()),("preference",preference_key.as_str(),selected.clone())] {tx.execute("INSERT INTO records VALUES(?1,?2,?3)",rusqlite::params![kind,key,value.to_string()]).map_err(|e|e.to_string())?;}
             tx.commit().map_err(|e|e.to_string())?;}
            let _=state.app.emit("session-changed",&child);
            dispatch(state.clone(),message,Some(selected));
            return Ok(result);
        },
        "send_message"=>{
            let recipient=required(args,"sessionId",128)?;target(&state.db,&caller,&recipient)?;
            let text=required(args,"message",262144)?;
            let attachments=crate::project_attachments::resolve(&state.db, &state.data, &caller.id, args)?;
            let message=Message{id:id(),project_id:caller.project_id.clone().unwrap(),sender_id:caller.id.clone(),sender_title:caller.title.clone(),recipient_id:recipient,text,attachments,status:"queued".into(),created_at:now()};
            let result=json!({"messageId":message.id,"sessionId":message.recipient_id,"status":"queued"});
            {let mut c=state.db.0.lock().map_err(|e|e.to_string())?;let tx=c.transaction().map_err(|e|e.to_string())?;
             tx.execute("INSERT INTO records VALUES('project-message',?1,?2)",rusqlite::params![message.id,serde_json::to_string(&message).unwrap()]).map_err(|e|e.to_string())?;
             tx.execute("INSERT INTO records VALUES('agent-request',?1,?2)",rusqlite::params![receipt_key,result.to_string()]).map_err(|e|e.to_string())?;tx.commit().map_err(|e|e.to_string())?;}
            dispatch(state.clone(),message,None);return Ok(result);
        },
        "stop_agent"=>{
            if !caller.is_orchestrator {return Err("Only the orchestrator may stop agents".into());}
            let recipient=required(args,"sessionId",128)?;target(&state.db,&caller,&recipient)?;
            let guard=state.operations.session(&recipient).await;
            state.connection(&recipient).await?;
            state.prompt_queues.pause_session(state,&recipient);
            crate::cancel_turn_impl(state, recipient.clone(), None).await?;drop(guard);
            json!({"sessionId":recipient,"status":"cancellation_requested"})
        },_=>return Err("Unknown Harbor agent tool".into()),
    };
    state.db.put("agent-request", &receipt_key, &result)?;
    Ok(result)
}
fn required(args: &Value, key: &str, max: usize) -> Result<String, String> {
    args[key]
        .as_str()
        .filter(|v| !v.trim().is_empty() && v.len() <= max)
        .map(str::to_owned)
        .ok_or_else(|| format!("Provide {key} (1–{max} bytes)"))
}
fn dispatch(state: Arc<AppState>, message: Message, selected: Option<Value>) {
    tauri::async_runtime::spawn(async move {
        let result: Result<(), String> = async {
            let _guard = state.operations.session(&message.recipient_id).await;
            let saved = state
                .db
                .get::<SessionRecord>("session", &message.recipient_id)?;
            if saved.archived {
                return Err("Recipient was archived".into());
            }
            if state.connection(&saved.id).await.is_err() {
                let connected =
                    crate::connect(&state, &saved, saved.acp_session_id.is_some()).await?;
                if let Some(selected) = selected {
                    let rpc = state.connection(&saved.id).await?;
                    let mut config = ProviderConfiguration {
                        agent_info: None,
                        config_options: connected.config_options,
                        models: connected.models,
                        modes: Some(connected.modes),
                    };
                    crate::model_config::apply(
                        &rpc,
                        connected
                            .acp_session_id
                            .as_deref()
                            .ok_or("Missing session identity")?,
                        &mut config,
                        &selected,
                        true,
                    )
                    .await?;
                    state.update(&saved.id, |s| {
                        s.config_options = config.config_options;
                        s.models = config.models;
                        s.modes = config.modes.unwrap_or(Value::Null);
                    })?;
                }
            }
            state.prompt_queues.submit_agent(&state, &message);
            Ok(())
        }
        .await;
        if let Err(error) = result {
            let _ = delivery_status(&state.db, &message.id, "interrupted");
            let _ = state.update(&message.recipient_id, |s| {
                s.status = "error".into();
                s.error = Some(error);
            });
        }
    });
}

pub fn delivery_status(db: &crate::db::Database, id: &str, status: &str) -> Result<(), String> {
    db.0.lock().map_err(|e|e.to_string())?.execute("UPDATE records SET data=json_set(data,'$.status',?2) WHERE kind='project-message' AND id=?1", rusqlite::params![id,status]).map_err(|e|e.to_string())?;
    Ok(())
}

/// The visible input and its deduplication marker commit together, before transport submission.
pub fn record_input(state: &AppState, message: &Message, payload: Value) -> Result<(), String> {
    if let Some(event) = record_input_db(&state.db, message, payload)? {
        let _ = state.app.emit("session-event", event);
    }
    Ok(())
}
fn record_input_db(
    db: &crate::db::Database,
    message: &Message,
    payload: Value,
) -> Result<Option<SessionEvent>, String> {
    let mut connection = db.0.lock().map_err(|e| e.to_string())?;
    let tx = connection.transaction().map_err(|e| e.to_string())?;
    let mut saved = message.clone();
    saved.status = "dispatching".into();
    let updated = tx
        .execute(
            "UPDATE records SET data=?2 WHERE kind='project-message' AND id=?1",
            rusqlite::params![
                saved.id,
                serde_json::to_string(&saved).map_err(|e| e.to_string())?
            ],
        )
        .map_err(|e| e.to_string())?;
    if updated != 1 {
        return Err("This agent delivery was removed".into());
    }
    let inserted = tx
        .execute(
            "INSERT OR IGNORE INTO records VALUES('agent-message-shown',?1,'true')",
            [&saved.id],
        )
        .map_err(|e| e.to_string())?;
    let event = if inserted == 1 {
        let timestamp = now();
        tx.execute("INSERT INTO events(session_id,kind,payload,timestamp) VALUES(?1,'agent_message',?2,?3)", rusqlite::params![saved.recipient_id,payload.to_string(),timestamp]).map_err(|e|e.to_string())?;
        Some(SessionEvent {
            sequence: tx.last_insert_rowid() as f64,
            session_id: saved.recipient_id,
            kind: "agent_message".into(),
            payload,
            timestamp,
        })
    } else {
        None
    };
    tx.commit().map_err(|e| e.to_string())?;
    Ok(event)
}

pub fn history_order(db: &crate::db::Database, session: &str, payload: &mut Value) {
    let u = &payload["update"];
    let (field, key) = if let Some(id) = u["messageId"].as_str() {
        ("messageId", id)
    } else if let Some(id) = u["toolCallId"].as_str() {
        ("toolCallId", id)
    } else {
        return;
    };
    let wire = payload["sessionId"].as_str().unwrap_or("");
    let found=db.0.lock().ok().and_then(|c|c.query_row(&format!("SELECT sequence,timestamp FROM events WHERE session_id=?1 AND kind='session/update' AND json_extract(payload,'$.sessionId')=?2 AND json_extract(payload,'$.update.{field}')=?3 ORDER BY sequence LIMIT 1"),rusqlite::params![session,wire,key],|r|Ok((r.get::<_,f64>(0)?,r.get::<_,f64>(1)?))).ok());
    if let Some((sequence, time)) = found {
        if !payload["update"]["_meta"].is_object() {
            payload["update"]["_meta"] = json!({});
        }
        if !payload["update"]["_meta"]["harbor"].is_object() {
            payload["update"]["_meta"]["harbor"] = json!({});
        }
        payload["update"]["_meta"]["harbor"]["originalSequence"] = json!(sequence);
        payload["update"]["_meta"]["harbor"]["originalTimestamp"] = json!(time);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn session(project: &Project, id: &str, parent: Option<&str>) -> SessionRecord {
        serde_json::from_value(json!({"id":id,"title":"Agent","projectId":project.id,"parentSessionId":parent,"isOrchestrator":parent.is_none(),"providerId":"codex","cwd":"/tmp","status":"idle","mode":"gui","createdAt":0,"updatedAt":0,"configOptions":[],"modes":null,"models":null,"capabilities":AgentCapabilities::default(),"error":null,"draft":"","scrollTop":0,"reviewOpen":false,"archived":false})).unwrap()
    }
    #[test]
    fn regular_session_ownership_scopes_messages_to_current_project_and_original_parent() {
        let dir = tempfile::tempdir().unwrap();
        let db = crate::db::Database::open(&dir.path().join("test.sqlite")).unwrap();
        let mut a = db
            .save_project(None, "A", "folder", "gray", dir.path().to_str().unwrap())
            .unwrap();
        a.active_orchestrator_session_id = Some("root".into());
        db.put("project", &a.id, &a).unwrap();
        let b = db
            .save_project(None, "B", "folder", "gray", dir.path().to_str().unwrap())
            .unwrap();
        for s in [
            session(&a, "root", None),
            session(&a, "child", Some("root")),
            session(&a, "peer", Some("root")),
            session(&a, "old", Some("previous")),
            session(&b, "foreign", Some("foreign-root")),
        ] {
            db.put("session", &s.id, &s).unwrap();
        }
        let child = authorize(&db, "child").unwrap();
        assert!(!child.is_orchestrator);
        assert!(child.acp_session_id.is_none());
        assert_eq!(target(&db, &child, "root").unwrap().id, "root");
        assert_eq!(target(&db, &child, "peer").unwrap().id, "peer");
        assert!(target(&db, &child, "foreign").is_err());
        assert!(target(&db, &child, "child").is_err());
        assert!(target(&db, &child, "old").is_err());
        assert!(authorize(&db, "old").is_err());
        let mut archived = child.clone();
        archived.archived = true;
        db.put("session", "child", &archived).unwrap();
        assert!(authorize(&db, "child").is_err());
        let mut ordinary = child;
        ordinary.parent_session_id = None;
        ordinary.is_orchestrator = false;
        db.put("session", "ordinary", &ordinary).unwrap();
        assert!(!is_agent(&ordinary));
    }
    #[test]
    fn authored_input_and_deduplication_marker_are_atomic_and_repeatable() {
        let dir = tempfile::tempdir().unwrap();
        let db = crate::db::Database::open(&dir.path().join("test.sqlite")).unwrap();
        let message = Message {
            id: "delivery".into(),
            project_id: "project".into(),
            sender_id: "root".into(),
            sender_title: "Root".into(),
            recipient_id: "child".into(),
            text: "Hello".into(),
            attachments: vec![],
            status: "queued".into(),
            created_at: 0.,
        };
        db.put("project-message", &message.id, &message).unwrap();
        db.0.lock().unwrap().execute_batch("CREATE TRIGGER fail_input BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'disk unavailable'); END;").unwrap();
        assert!(record_input_db(&db, &message, json!({"text":"Hello"})).is_err());
        assert!(db.get::<Value>("agent-message-shown", "delivery").is_err());
        assert_eq!(
            db.get::<Message>("project-message", "delivery")
                .unwrap()
                .status,
            "queued"
        );
        db.0.lock()
            .unwrap()
            .execute_batch("DROP TRIGGER fail_input;")
            .unwrap();
        assert!(record_input_db(&db, &message, json!({"text":"Hello"}))
            .unwrap()
            .is_some());
        assert!(record_input_db(&db, &message, json!({"text":"Hello"}))
            .unwrap()
            .is_none());
        assert_eq!(db.events("child", 0., 10).unwrap().len(), 1);
        db.delete("project-message", "delivery").unwrap();
        delivery_status(&db, "delivery", "delivered").unwrap();
        assert!(db.get::<Message>("project-message", "delivery").is_err());
        assert!(record_input_db(&db, &message, json!({"text":"Hello"})).is_err());
        assert_eq!(db.events("child", 0., 10).unwrap().len(), 1);
    }
    #[test]
    fn original_history_order_is_derived_from_saved_receipt_not_replay_time() {
        let dir = tempfile::tempdir().unwrap();
        let db = crate::db::Database::open(&dir.path().join("test.sqlite")).unwrap();
        let mut payload = json!({"sessionId":"wire","update":{"sessionUpdate":"agent_message_chunk","messageId":"answer","content":{"type":"text","text":"Hello"}}});
        let original = db.event("chat", "session/update", payload.clone()).unwrap();
        history_order(&db, "chat", &mut payload);
        assert_eq!(
            payload["update"]["_meta"]["harbor"]["originalSequence"],
            original.sequence
        );
        assert_eq!(
            payload["update"]["_meta"]["harbor"]["originalTimestamp"],
            original.timestamp
        );
        payload["sessionId"] = json!("different-wire");
        payload["update"]["_meta"] = json!({});
        history_order(&db, "chat", &mut payload);
        assert!(payload["update"]["_meta"]["harbor"].is_null());
    }
}
