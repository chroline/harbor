mod acp;
mod attachments;
mod commands;
mod db;
mod editors;
#[cfg(test)]
mod live_tests;
mod model_config;
mod operations;
mod providers;
mod prime_sessions;
mod subagents;
mod terminal;
mod tab_windows;
mod types;
mod workspaces;
mod worktrees;
use acp::{Rpc, Sink};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex as StdMutex,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Mutex;
use types::*;

pub struct AppState {
    db: db::Database,
    data: PathBuf,
    app: tauri::AppHandle,
    connections: Mutex<HashMap<String, Arc<Rpc>>>,
    relay_targets: StdMutex<HashMap<String, (String,String)>>,
    child_transports: StdMutex<HashMap<String, Arc<Rpc>>>,
    child_connections: Mutex<HashMap<String, Arc<Mutex<Option<subagents::Connection>>>>>,
    terminals: Mutex<HashMap<String, Arc<terminal::NativeTerminal>>>,
    tab_windows: tab_windows::TabWindows,
    discoveries: Mutex<HashMap<String, Arc<Mutex<Option<model_config::Discovery>>>>>,
    command_catalogs: commands::Catalogs,
    generations: StdMutex<HashMap<String, String>>,
    operations: operations::Operations,
    quitting: AtomicBool,
}
impl AppState {
    fn emit(&self, id: &str, kind: &str, payload: Value) {
        if kind == "terminal/data" {
            let _ = self.app.emit(
                "terminal-data",
                json!({"sessionId":id,"bytes":payload["bytes"],"end":payload["end"]}),
            );
            return;
        }
        let mut payload = if kind == "session/update" {
            providers::normalize_update(payload)
        } else {
            payload
        };
        if kind == "cursor/task" && !payload["sessionId"].is_string() {
            if let Ok(session) = self.db.get::<SessionRecord>("session",id) { payload["sessionId"] = json!(session.acp_session_id); }
        }
        if kind == "session/update" {
            if let Ok(session) = self.db.get::<SessionRecord>("session", id) {
                if session.provider_id == "grok" {
                    if let Some(worker) = providers::forwarded_grok_worker(session.acp_session_id.as_deref().unwrap_or(""), &payload) {
                        let child = worker["update"]["sessionId"].as_str().unwrap();
                        if self.db.get::<SubagentRecord>("subagent", &worker_key(id, child)).is_err() {
                            self.emit(id, "session/update", worker);
                        }
                    }
                }
            }
        }
        if kind == "session/update" && payload["update"]["sessionUpdate"] == "agent_message_chunk" {
            let relay = self.relay_targets.lock().unwrap().get(id).cloned();
            if let Some((child,wire)) = relay {
                if payload["sessionId"] == wire {
                    self.emit(id,"parent_relay_chunk",json!({"childId":child,"text":payload["update"]["content"]["text"],"messageId":payload["update"]["messageId"]}));
                    return;
                }
            }
        }
        if kind == "cursor/task" || (kind == "session/update" && payload["update"]["sessionUpdate"] == "tool_call_update") {
            if let Ok(session) = self.db.get::<SessionRecord>("session",id) {
                for announcement in providers::worker_announcements(&session.provider_id,kind,&payload) { self.emit(id,"session/update",announcement); }
            }
        }
        // Prime's roster is metadata, not a standard child announcement. Persist
        // the same ownership records used by every other provider.
        if let Some(children) = payload["update"]["_meta"]["ai.primeintellect.prime-agent"]["subagents"].as_array() {
            for child in children {
                if let Some(child_id) = child["id"].as_str() {
                    self.emit(id, "session/update", json!({"sessionId":payload["sessionId"],"update":{"sessionUpdate":"subagent_update","sessionId":child_id,"title":child["sessionName"],"state":{"type":child["status"]}}}));
                }
            }
        }
        if payload["update"]["sessionUpdate"] == "subagent_update" {
            let u = &payload["update"];
            if let (Some(child), Some(parent)) =
                (u["sessionId"].as_str(), payload["sessionId"].as_str())
            {
                let key = format!("{id}:{child}");
                let mut record =
                    self.db
                        .get::<SubagentRecord>("subagent", &key)
                        .unwrap_or(SubagentRecord {
                            session_id: child.into(),
                            parent_id: parent.into(),
                            title: "Subagent".into(),
                            description: None,
                            state: json!({"type":"unknown"}),
                            capabilities: json!({}),
                        });
                if record.parent_id == parent && child != parent {
                    if let Some(title) = u["title"].as_str() {
                        record.title = title.into()
                    }
                    if let Some(task) = u["description"].as_str() {
                        record.description = Some(task.into())
                    }
                    if let Some(state) = u.get("state") {
                        record.state = state.clone()
                    }
                    if let Some(caps) = u.get("capabilities") {
                        record.capabilities = caps.clone()
                    }
                    let _ = self.db.put("subagent", &key, &record);
                }
            }
        }
        match self.db.event(id, kind, payload) {
            Ok(event) => {
                let _ = self.app.emit("session-event", event);
            }
            Err(e) => {
                let _ = self.app.emit("storage-error", e);
            }
        }
    }
    fn update(
        &self,
        id: &str,
        f: impl FnOnce(&mut SessionRecord),
    ) -> Result<SessionRecord, String> {
        let s = self.db.update_session(id, f)?;
        let _ = self.app.emit("session-changed", &s);
        Ok(s)
    }
    fn notify(&self, title: &str, body: &str) {
        let enabled = self
            .db
            .get::<Value>("settings", "app")
            .ok()
            .and_then(|s| s["notifications"].as_bool())
            .unwrap_or(false);
        if enabled {
            let _ = self
                .app
                .notification()
                .builder()
                .title(title)
                .body(body)
                .show();
        }
    }
    fn provider(&self, id: &str) -> Result<ProviderDefinition, String> {
        self.db.get("provider", id)
    }
    async fn connection(&self, id: &str) -> Result<Arc<Rpc>, String> {
        self.connections
            .lock()
            .await
            .get(id)
            .filter(|r| r.alive.load(Ordering::SeqCst))
            .cloned()
            .ok_or("This agent is disconnected. Reconnect to continue.".into())
    }
    async fn stop(&self, id: &str) {
        self.relay_targets.lock().unwrap().remove(id);
        let transports = {
            let mut children = self.child_transports.lock().unwrap();
            let keys: Vec<_> = children.keys().filter(|key| key.starts_with(&format!("{id}:"))).cloned().collect();
            keys.into_iter().filter_map(|key| children.remove(&key)).collect::<Vec<_>>()
        };
        for rpc in transports { rpc.stop().await; }
        let slots = {
            let mut children = self.child_connections.lock().await;
            let keys: Vec<_> = children.keys().filter(|key| key.starts_with(&format!("{id}:"))).cloned().collect();
            keys.into_iter().filter_map(|key| children.remove(&key)).collect::<Vec<_>>()
        };
        for slot in slots {
            if let Some(connection) = slot.lock().await.take() { connection.rpc.stop().await; }
        }
        if let Some(t) = self.terminals.lock().await.remove(id) {
            t.stop()
        }
        let rpc = self.connections.lock().await.remove(id);
        if let Some(r) = rpc {
            r.stop().await;
        }
    }
    async fn shutdown(&self) {
        self.command_catalogs.stop().await;
        let terms = std::mem::take(&mut *self.terminals.lock().await);
        for (_, t) in terms {
            t.stop()
        }
        let discoveries = std::mem::take(&mut *self.discoveries.lock().await);
        for (id, slot) in discoveries {
            // An in-flight discovery is stopped by the connections loop below.
            if let Ok(mut slot) = slot.try_lock() {
                if let Some(discovery) = slot.take() {
                    discovery.stop().await;
                    self.connections
                        .lock()
                        .await
                        .remove(&format!("config:{id}"));
                }
            }
        }
        let transports = std::mem::take(&mut *self.child_transports.lock().unwrap());
        for (_,rpc) in transports { rpc.stop().await; }
        let children = std::mem::take(&mut *self.child_connections.lock().await);
        for (_,slot) in children { if let Some(c) = slot.lock().await.take() { c.rpc.stop().await; } }
        let connections = std::mem::take(&mut *self.connections.lock().await);
        for (id, r) in connections {
            r.stop().await;
            let _ = self.update(&id, |s| {
                s.status = "disconnected".into();
                s.mode = "gui".into()
            });
        }
    }
}
#[tauri::command]
async fn bootstrap(state: tauri::State<'_, Arc<AppState>>) -> Result<Bootstrap, String> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || Ok(Bootstrap {
        projects: state.db.list("project")?,
        workspaces: state
            .db
            .list::<Workspace>("workspace")?
            .into_iter()
            .map(workspaces::inspect)
            .collect(),
        providers: state.db.list("provider")?,
        sessions: state
            .db
            .list::<SessionRecord>("session")?
            .into_iter()
            .map(|mut s| {
                s.is_git = workspaces::git_directory(&s.cwd);
                s
            })
            .collect(),
        worktrees: state.db.list("worktree")?,
        archives: state.db.list("archive")?,
        settings: state
            .db
            .get("settings", "app")
            .unwrap_or(json!({"theme":"dark","notifications":false})),
    })).await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn save_project(
    state: tauri::State<'_, Arc<AppState>>,
    project_id: Option<String>,
    name: String,
    icon: String,
    color: String,
    workspace_path: String,
) -> Result<Project, String> {
    let db = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        db.db
            .save_project(project_id.as_deref(), &name, &icon, &color, &workspace_path)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn save_workspace(
    state: tauri::State<'_, Arc<AppState>>,
    path: String,
) -> Result<Workspace, String> {
    let state = state.inner().clone();
    tokio::task::spawn_blocking(move || state.db.save_workspace(&path))
        .await.map_err(|e| e.to_string())?
}
#[tauri::command]
fn save_provider(
    state: tauri::State<'_, Arc<AppState>>,
    provider: ProviderDefinition,
) -> Result<(), String> {
    if provider.id.is_empty() || provider.command.trim().is_empty() {
        return Err("Provider ID and executable are required".into());
    }
    state.db.put("provider", &provider.id, &provider)
}
#[tauri::command]
fn save_settings(state: tauri::State<'_, Arc<AppState>>, settings: Value) -> Result<(), String> {
    state.db.put("settings", "app", &settings)
}
#[tauri::command]
async fn probe_provider(
    state: tauri::State<'_, Arc<AppState>>,
    provider_id: String,
) -> Result<Value, String> {
    let p = state.provider(&provider_id)?;
    let path = acp::resolve_executable(&p.command);
    let native = acp::resolve_executable(&p.native_command);
    let version = if let Some(exe) = &native {
        let mut cmd = tokio::process::Command::new(exe);
        cmd.arg("--version").kill_on_drop(true);
        match tokio::time::timeout(Duration::from_secs(5), cmd.output()).await {
            Ok(Ok(o)) => String::from_utf8_lossy(&o.stdout).trim().to_string(),
            _ => "Unknown".into(),
        }
    } else {
        "Not installed".into()
    };
    Ok(
        json!({"installed":path.is_some(),"path":path,"nativePath":native,"version":version,"worktrunk":acp::resolve_executable("wt").is_some(),"hint":p.install_hint}),
    )
}
fn capability(init: &Value) -> AgentCapabilities {
    AgentCapabilities{load_session:init["agentCapabilities"]["loadSession"]==true,resume_session:init["agentCapabilities"]["sessionCapabilities"]["resume"].is_object(),config_options:false,native_handoff:false,native_handoff_reason:"Same-conversation round trip has not been verified for this installed provider/version.".into(),raw:init.clone()}
}
async fn connect(
    state: &Arc<AppState>,
    session: &SessionRecord,
    load: bool,
) -> Result<SessionRecord, String> {
    let provider = state.provider(&session.provider_id)?;
    let launch_state = state.clone();
    let launch_session = session.clone();
    let launch = match tokio::task::spawn_blocking(move || {
        prime_sessions::prepare(&launch_state.db, &launch_state.data, &launch_session, provider, load)
    }).await.map_err(|e| e.to_string()).and_then(|result| result) {
        Ok(launch) => launch,
        Err(error) => {
            state.update(&session.id, |s| { s.status = "error".into(); s.error = Some(error.clone()); })?;
            return Err(error);
        }
    };
    let provider = &launch.provider;
    let session_id = session.id.clone();
    let generation = id();
    state
        .generations
        .lock()
        .unwrap()
        .insert(session_id.clone(), generation.clone());
    let weak = Arc::downgrade(state);
    let replay = Arc::new(AtomicBool::new(load));
    let buffer = Arc::new(StdMutex::new(Vec::<(String, Value)>::new()));
    let replay_cb = replay.clone();
    let buffer_cb = buffer.clone();
    let sink: Sink = Arc::new(move |kind, payload| {
        if let Some(state) = weak.upgrade() {
            if state.generations.lock().unwrap().get(&session_id) != Some(&generation) {
                return;
            }
            if kind == "session/update" {
                let mut pending = buffer_cb.lock().unwrap();
                if replay_cb.load(Ordering::SeqCst) {
                    pending.push((kind.into(), payload));
                    return;
                }
            }
            let wire_id = if kind == "request" { payload["params"]["sessionId"].as_str() } else if kind == "session/update" { payload["sessionId"].as_str() } else { None };
            if wire_id.is_some_and(|child| state.child_transports.lock().unwrap().contains_key(&worker_key(&session_id,child))) { return; }
            state.emit(&session_id, kind, payload.clone());
            if kind == "request" {
                let _ = state.update(&session_id, |s| s.status = "needs_input".into());
                state.notify(
                    "Your agent needs you",
                    payload["params"]["toolCall"]["title"]
                        .as_str()
                        .unwrap_or("Open Harbor to respond."),
                );
            }
            if kind == "disconnected" {
                let _ = state.update(&session_id, |s| {
                    if s.mode == "gui" && !s.archived {
                        s.status = "disconnected".into();
                    }
                });
            }
            if kind == "session/update"
                && matches!(
                    payload["update"]["sessionUpdate"].as_str(),
                    Some("config_option_update" | "current_mode_update")
                )
            {
                let _ = state.update(&session_id, |s| {
                    if s.acp_session_id.as_deref() == payload["sessionId"].as_str() {
                        providers::apply_configuration_update(s, &payload["update"]);
                    }
                });
            }
        }
    });
    let rpc = match Rpc::start(provider, &session.cwd, sink).await {
        Ok(r) => r,
        Err(e) => {
            state.update(&session.id, |s| {
                s.status = "error".into();
                s.error = Some(e.clone())
            })?;
            return Err(e);
        }
    };
    state
        .connections
        .lock()
        .await
        .insert(session.id.clone(), rpc.clone());
    let result:Result<SessionRecord,String>=async {
  let init=rpc.request("initialize",json!({"protocolVersion":1,"clientCapabilities":providers::client_capabilities(&provider.id),"clientInfo":{"name":"harbor","title":"Harbor","version":"0.1.0"}}),Some(Duration::from_secs(30))).await?;
  if init["protocolVersion"]!=1{return Err("Agent did not negotiate ACP v1".into())}
  let mut caps=capability(&init);state.emit(&session.id,"initialized",init.clone());
  caps.native_handoff=providers::verified_handoff(provider,&init).await;
  if caps.native_handoff{caps.native_handoff_reason="Verified with codex-acp 2.1.1 and Codex CLI 0.154.0".into()}
  state.update(&session.id,|s|s.capabilities=caps.clone())?;
  // Existing CLI login is reused. Explicit authentication choices remain available on errors.
  let (method,params)=launch.request(session,&caps,load)?;
  let mut response=rpc.request(method,params,Some(Duration::from_secs(90))).await?;
  let acp_id=response["sessionId"].as_str().map(String::from).or_else(||if method!="session/new"{session.acp_session_id.clone()}else{None}).ok_or("Agent returned no session ID")?;
  launch.remember(&state.db,session)?;
  caps.config_options=response["configOptions"].is_array();
  if launch.resumed {
   let mut config=model_config::from_response(&response);
   let previous=ProviderConfiguration{agent_info:None,config_options:session.config_options.clone(),models:session.models.clone(),modes:Some(session.modes.clone())};
   model_config::apply(&rpc,&acp_id,&mut config,&model_config::selections(&previous),false).await?;
   response["configOptions"]=config.config_options;response["models"]=config.models;response["modes"]=config.modes.unwrap_or(Value::Null);
  }
  if !load {if let Ok(saved)=state.db.get::<Value>("preference",&format!("{}:{}",session.project_id.as_deref().or(session.workspace_id.as_deref()).unwrap_or("__freeform__"),session.provider_id)) {
   // Re-read the returned controls after each change: models may alter reasoning options.
   for old in saved.as_array().into_iter().flatten(){let Some(current)=response["configOptions"].as_array().and_then(|opts|opts.iter().find(|o|o["id"]==old["id"])) else{continue};
    let value=&old["currentValue"];let valid=if current["type"]=="boolean"{value.is_boolean()}else{current["options"].as_array().is_some_and(|opts|opts.iter().any(|o|o["value"]==*value||o["options"].as_array().is_some_and(|g|g.iter().any(|v|v["value"]==*value))))};
    if valid&&current["currentValue"]!=*value{let mut p=json!({"sessionId":acp_id,"configId":old["id"],"value":value});if value.is_boolean(){p["type"]=json!("boolean")}match rpc.request("session/set_config_option",p,Some(Duration::from_secs(30))).await{Ok(result)=>{if result["configOptions"].is_array(){response["configOptions"]=result["configOptions"].clone()}},Err(e)=>state.emit(&session.id,"diagnostic",json!({"message":format!("Remembered setting could not be applied: {e}")}))}}
   }
  }}
  if load&&method=="session/load"{state.emit(&session.id,"history_reset",json!({}));}
  {let mut pending=buffer.lock().unwrap();if load {for(k,v)in pending.drain(..){state.emit(&session.id,&k,v);}}replay.store(false,Ordering::SeqCst);}
  let has_requests = !rpc.inbound.lock().await.is_empty();
  let updated=state.update(&session.id,|s|{s.acp_session_id=Some(acp_id.clone());s.native_session_id=if caps.native_handoff{Some(acp_id.clone())}else{None};s.status=if has_requests {"needs_input"} else {"idle"}.into();s.mode="gui".into();s.error=None;s.capabilities=caps;s.config_options=response.get("configOptions").cloned().unwrap_or(json!([]));s.models=response["models"].clone();s.modes=response["modes"].clone();})?;
  state.emit(&session.id,"connected",json!({"agentInfo":init["agentInfo"],"sessionId":acp_id}));Ok(updated)
 }.await;
    if let Err(e) = &result {
        state.stop(&session.id).await;
        let _ = state.update(&session.id, |s| {
            s.status = "error".into();
            s.error = Some(e.clone())
        });
    }
    result
}
#[tauri::command]
async fn discover_commands(
    state: tauri::State<'_, Arc<AppState>>,
    provider_id: String,
    cwd: Option<String>,
) -> Result<Vec<AvailableCommand>, String> {
    let provider = state.provider(&provider_id)?;
    state.command_catalogs.get(&provider, cwd.as_deref()).await
}

#[tauri::command]
async fn discover_provider_config(
    state: tauri::State<'_, Arc<AppState>>,
    provider_id: String,
    selections: Value,
) -> Result<ProviderConfiguration, String> {
    if state.quitting.load(Ordering::SeqCst) {
        return Err("Harbor is quitting".into());
    }
    let provider = state.provider(&provider_id)?;
    let slot = state
        .discoveries
        .lock()
        .await
        .entry(provider_id.clone())
        .or_default()
        .clone();
    let mut discovery = slot.lock().await;
    let key = format!("config:{provider_id}");
    let signature =
        serde_json::to_string(&(&provider.command, &provider.args)).map_err(|e| e.to_string())?;
    if discovery
        .as_ref()
        .is_some_and(|d| d.signature != signature || !d.rpc.alive.load(Ordering::SeqCst))
    {
        if let Some(old) = discovery.take() {
            old.stop().await;
        }
        state.connections.lock().await.remove(&key);
    }
    if discovery.is_none() {
        let scratch = tempfile::Builder::new()
            .prefix("harbor-models-")
            .tempdir()
            .map_err(|e| e.to_string())?;
        let mut connections = state.connections.lock().await;
        if state.quitting.load(Ordering::SeqCst) {
            return Err("Harbor is quitting".into());
        }
        let rpc = Rpc::start_discovery(&provider, &scratch.path().to_string_lossy()).await?;
        connections.insert(key.clone(), rpc.clone());
        *discovery = Some(model_config::Discovery::new(signature, rpc, scratch));
    }
    let preference = format!("provider:{provider_id}");
    let selected = if selections.as_object().is_some_and(|v| !v.is_empty()) {
        selections
    } else {
        state
            .db
            .get::<Value>("preference", &preference)
            .unwrap_or(json!({}))
    };
    let result = tokio::time::timeout(
        Duration::from_secs(120),
        discovery.as_mut().unwrap().configure(&selected),
    )
    .await
    .map_err(|_| "Model discovery timed out".to_string())
    .and_then(|r| r);
    if result.is_err() {
        if let Some(failed) = discovery.take() {
            failed.stop().await;
        }
        state.connections.lock().await.remove(&key);
    }
    if let Ok(config) = &result {
        state
            .db
            .put("preference", &preference, &model_config::selections(config))?;
    }
    result
}
// ACP requires a cwd even for a freeform chat. Keep it outside repositories and
// retain it with the archived conversation so reconnect and restore preserve files.
fn freeform_directory(data: &Path, session_id: &str) -> Result<String, String> {
    let path = data.join("conversations").join(session_id);
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
async fn task_workspace(
    db: &db::Database,
    data: &Path,
    session_id: &str,
    workspace: Option<&Workspace>,
    new_worktree: bool,
    branch: String,
    base: String,
) -> Result<(String, Option<WorktreeRecord>), String> {
    if let Some(w) = workspace {
        workspaces::canonical_folder(&w.path)?;
    }
    let tree = if let Some(workspace) = workspace {
        if new_worktree {
            let path = workspace.path.clone();
            if !workspaces::git_root(&path) {
                return Err(
                    "New worktrees require a Git checkout root. Use the workspace folder instead."
                        .into(),
                );
            }
            let t = tokio::task::spawn_blocking(move || {
                worktrees::create(None, &path, &branch, &base)
            })
            .await
            .map_err(|e| e.to_string())??;
            db.put("worktree", &t.id, &t)?;
            Some(t)
        } else {
            db.list::<WorktreeRecord>("worktree")?
                .into_iter()
                .find(|t| {
                    workspaces::same_folder(&t.path, &workspace.path)
                        && t.owned
                        && t.state == "active"
                })
        }
    } else {
        None
    };
    let cwd = if let Some(workspace) = workspace {
        tree.as_ref()
            .map(|t| t.path.clone())
            .unwrap_or_else(|| workspace.path.clone())
    } else {
        freeform_directory(data, session_id)?
    };
    Ok((cwd, tree))
}
#[tauri::command]
async fn create_session(
    state: tauri::State<'_, Arc<AppState>>,
    workspace_id: Option<String>,
    provider_id: String,
    title: String,
    new_worktree: bool,
    branch: String,
    base: String,
    initial_config: Option<Value>,
) -> Result<SessionRecord, String> {
    if state.quitting.load(Ordering::SeqCst) {
        return Err("Harbor is quitting".into());
    }
    state.provider(&provider_id)?;
    let session_id = id();
    let _guard = state.operations.session(&session_id).await;
    let workspace_id = workspace_id.filter(|id| !id.trim().is_empty());
    let workspace = workspace_id
        .as_ref()
        .map(|id| state.db.get::<Workspace>("workspace", id))
        .transpose()?;
    // Protect this checkout from archival while creating/registering its chat.
    let workspace_guard = if let Some(workspace) = &workspace {
        Some(state.operations.workspace(&workspace.path).await)
    } else {
        None
    };
    let (cwd, tree) = task_workspace(
        &state.db,
        &state.data,
        &session_id,
        workspace.as_ref(),
        new_worktree,
        branch,
        base,
    )
    .await?;
    let session = SessionRecord {
        id: session_id,
        title: if title.trim().is_empty() {
            "New conversation".into()
        } else {
            title.chars().take(90).collect()
        },
        workspace_id,
        is_git: workspaces::git_directory(&cwd),
        project_id: None,
        provider_id,
        cwd,
        acp_session_id: None,
        native_session_id: None,
        worktree_id: tree.map(|t| t.id),
        status: "connecting".into(),
        mode: "gui".into(),
        created_at: now(),
        updated_at: now(),
        config_options: json!([]),
        modes: Value::Null,
        models: Value::Null,
        capabilities: AgentCapabilities::default(),
        error: None,
        draft: String::new(),
        scroll_top: 0.,
        review_open: false,
        archived: false,
    };
    state.db.put("session", &session.id, &session)?;
    if let Some(workspace_id) = &session.workspace_id {
        state.db.touch_workspace(workspace_id)?;
    }
    drop(workspace_guard);
    let _ = state.app.emit("session-changed", &session);
    match connect(state.inner(), &session, false).await {
        Ok(s) => {
            if let Some(selected) = initial_config {
                let rpc = state.connection(&s.id).await?;
                let mut config = ProviderConfiguration {
                    agent_info: None,
                    config_options: s.config_options.clone(),
                    models: s.models.clone(),
                    modes: Some(s.modes.clone()),
                };
                let result = model_config::apply(
                    &rpc,
                    s.acp_session_id
                        .as_deref()
                        .ok_or("Missing ACP session ID")?,
                    &mut config,
                    &selected,
                    true,
                )
                .await;
                return state.update(&s.id, |s| {
                    s.config_options = config.config_options;
                    s.models = config.models;
                    s.modes = config.modes.unwrap_or(Value::Null);
                    s.error = result.err();
                });
            }
            Ok(s)
        }
        Err(_) => state.db.get("session", &session.id),
    }
}
#[tauri::command]
async fn reconnect(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<SessionRecord, String> {
    let _guard = state.operations.session(&session_id).await;
    if state.quitting.load(Ordering::SeqCst) {
        return Err("Harbor is quitting".into());
    }
    let s: SessionRecord = state.db.get("session", &session_id)?;
    if s.mode == "gui"
        && matches!(
            s.status.as_str(),
            "idle" | "working" | "needs_input" | "completed"
        )
        && state.connection(&session_id).await.is_ok()
    {
        return Ok(s);
    }
    if s.archived {
        return Err("Restore this conversation before reconnecting".into());
    }
    if s.mode == "terminal"
        && state
            .terminals
            .lock()
            .await
            .get(&session_id)
            .is_some_and(|t| t.alive.load(Ordering::SeqCst))
    {
        return Err("Finish or cancel the native turn, then exit the CLI with /exit before returning to Chat. This preserves the latest messages.".into());
    }
    state.stop(&session_id).await;
    state.update(&session_id, |s| {
        s.status = "connecting".into();
        s.mode = "gui".into()
    })?;
    connect(state.inner(), &s, s.acp_session_id.is_some()).await
}
#[tauri::command]
async fn authenticate(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    method_id: String,
) -> Result<SessionRecord, String> {
    let rpc = state.connection(&session_id).await?;
    rpc.request(
        "authenticate",
        json!({"methodId":method_id}),
        Some(Duration::from_secs(300)),
    )
    .await?;
    let s: SessionRecord = state.db.get("session", &session_id)?;
    let (method, params) = if let Some(id) = &s.acp_session_id {
        (
            "session/load",
            json!({"sessionId":id,"cwd":s.cwd,"mcpServers":[]}),
        )
    } else {
        ("session/new", json!({"cwd":s.cwd,"mcpServers":[]}))
    };
    let response = rpc
        .request(method, params, Some(Duration::from_secs(90)))
        .await?;
    let id = response["sessionId"]
        .as_str()
        .map(str::to_owned)
        .or(s.acp_session_id)
        .ok_or("Agent returned no session identity")?;
    state.update(&session_id, |s| {
        s.acp_session_id = Some(id.clone());
        s.native_session_id = if s.capabilities.native_handoff {
            Some(id)
        } else {
            None
        };
        s.status = "idle".into();
        s.error = None;
        s.config_options = response["configOptions"].clone();
        s.models = response["models"].clone();
        s.modes = response["modes"].clone();
    })
}
#[tauri::command]
async fn set_config(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    config_id: String,
    value: Value,
) -> Result<SessionRecord, String> {
    let r = state.connection(&session_id).await?;
    let _configuration_guard = r.configuration_lock.lock().await;
    let s: SessionRecord = state.db.get("session", &session_id)?;
    if r.busy.load(Ordering::SeqCst) || s.mode != "gui" {
        return Err("Wait for the current turn to finish before changing configuration".into());
    }
    let mut p = json!({"sessionId":s.acp_session_id,"configId":config_id,"value":value});
    if value.is_boolean() {
        p["type"] = json!("boolean")
    }
    let dedicated_mode = config_id == "__legacy_mode"
        || model_config::has_matching_modes(&s.config_options, &s.modes, &config_id);
    let result = if config_id == "__legacy_model" {
        r.request(
            "session/set_model",
            json!({"sessionId":s.acp_session_id,"modelId":value}),
            Some(Duration::from_secs(30)),
        )
        .await?
    } else if dedicated_mode {
        r.request(
            "session/set_mode",
            json!({"sessionId":s.acp_session_id,"modeId":value}),
            Some(Duration::from_secs(30)),
        )
        .await?
    } else {
        r.request(
            "session/set_config_option",
            p,
            Some(Duration::from_secs(30)),
        )
        .await?
    };
    let updated = state.update(&session_id, |s| {
        s.error = None;
        if let Some(opts) = result.get("configOptions") {
            providers::apply_configuration_update(
                s,
                &json!({"sessionUpdate":"config_option_update","configOptions":opts}),
            );
        }
        if config_id == "__legacy_model" {
            s.models["currentModelId"] = value.clone()
        }
        if dedicated_mode {
            providers::apply_configuration_update(
                s,
                &json!({"sessionUpdate":"current_mode_update","currentModeId":value}),
            );
        }
    })?;
    state.db.put(
        "preference",
        &format!(
            "{}:{}",
            s.project_id.as_deref().or(s.workspace_id.as_deref()).unwrap_or("__freeform__"),
            s.provider_id
        ),
        &updated.config_options,
    )?;
    Ok(updated)
}
fn worker_key(session_id: &str, child_id: &str) -> String { format!("{session_id}:{child_id}") }

fn worker_payload(kind: &str, mut payload: Value, child_id: &str, wire_id: &str) -> Value {
    if kind == "session/update" && payload["sessionId"] == wire_id {
        payload["sessionId"] = json!(child_id);
    }
    if kind == "request" {
        payload["params"]["sessionId"] = json!(child_id);
        payload["params"]["_harborChildId"] = json!(child_id);
        payload["params"]["_harborRequestId"] = payload["id"].clone();
    }
    if matches!(kind, "request" | "answered") {
        payload["id"] = json!(format!("{child_id}:{}", payload["id"]));
    }
    payload
}

#[tauri::command]
async fn open_subagent(state: tauri::State<'_, Arc<AppState>>, session_id: String, child_id: String) -> Result<(), String> {
    state.connection(&session_id).await?;
    let session: SessionRecord = state.db.get("session", &session_id)?;
    if session.mode != "gui" { return Err("Return to Chat first".into()); }
    let child: SubagentRecord = state.db.get("subagent", &worker_key(&session_id, &child_id))
        .map_err(|_| "This worker does not belong to this conversation")?;
    let slot = state.child_connections.lock().await.entry(worker_key(&session_id, &child_id))
        .or_insert_with(|| Arc::new(Mutex::new(None))).clone();
    let mut slot = slot.lock().await;
    if slot.as_ref().is_some_and(|c| c.rpc.alive.load(Ordering::SeqCst)) { return Ok(()); }
    if let Some(old) = slot.take() { old.rpc.stop().await; }
    let provider = state.provider(&session.provider_id)?;
    let prime = provider.id == "prime";
    let (provider, history) = if prime {
        let state = state.inner().clone();
        let session = session.clone();
        tokio::task::spawn_blocking(move || subagents::prime_child(&state.db, &state.data, &session, &child, provider)).await.map_err(|e| e.to_string())??
    } else { (provider, vec![]) };
    let weak = Arc::downgrade(state.inner());
    let root = session_id.clone(); let child_cb = child_id.clone();
    let generation = state.generations.lock().unwrap().get(&root).cloned();
    let generation_cb = generation.clone();
    let wire = Arc::new(StdMutex::new(None::<String>)); let wire_cb = wire.clone();
    let buffer = Arc::new(StdMutex::new(Vec::<(String,Value)>::new())); let buffer_cb = buffer.clone();
    let sink: Sink = Arc::new(move |kind,payload| {
        if let Some(state) = weak.upgrade() {
            if state.generations.lock().unwrap().get(&root).cloned() != generation_cb { return; }
            let wire = wire_cb.lock().unwrap();
            let Some(wire) = wire.as_ref() else {
                if matches!(kind, "request" | "answered") {
                    state.emit(&root, kind, worker_payload(kind,payload,&child_cb,""));
                } else { buffer_cb.lock().unwrap().push((kind.into(),payload)); }
                return;
            };
            let payload = worker_payload(kind,payload,&child_cb,wire);
            if kind == "disconnected" {
                state.emit(&root,"child_disconnected",json!({"childId":child_cb}));
            } else if !matches!(kind,"initialized" | "connected") {
                state.emit(&root,kind,payload);
            }
        }
    });
    let started_state = state.inner().clone();
    let started_key = worker_key(&session_id,&child_id);
    let connection = if matches!(session.provider_id.as_str(),"codex" | "claude" | "pi") {
        subagents::Connection {rpc:state.connection(&session_id).await?,wire_id:session.acp_session_id.clone().ok_or("Missing parent session ID")?,via_parent:true,capabilities:session.capabilities.raw.clone()}
    } else { match subagents::attach(&provider,&session.cwd,&child_id,prime,sink,move |rpc| {
        started_state.child_transports.lock().unwrap().insert(started_key,rpc);
    }).await {
        Ok(connection) => connection,
        Err(error) => {
            state.child_transports.lock().unwrap().remove(&worker_key(&session_id,&child_id));
            if prime { return Err(error); }
            let parent = state.connection(&session_id).await?;
            subagents::Connection {rpc:parent,wire_id:session.acp_session_id.clone().ok_or("Missing parent session ID")?,via_parent:true,capabilities:session.capabilities.raw.clone()}
        }
    }};
    if state.generations.lock().unwrap().get(&session_id).cloned() != generation || state.connection(&session_id).await.is_err() {
        connection.rpc.stop().await;
        state.child_transports.lock().unwrap().remove(&worker_key(&session_id,&child_id));
        return Err("The parent connection changed while opening the worker".into());
    }
    if !connection.via_parent { state.emit(&session_id,"child_history_reset",json!({"childId":child_id})); }
    for update in history { state.emit(&session_id,"session/update",json!({"sessionId":child_id,"update":update})); }
    {
        let mut wire_guard = wire.lock().unwrap();
        for (kind,payload) in buffer.lock().unwrap().drain(..) {
            if kind == "session/update" {
                state.emit(&session_id,&kind,worker_payload(&kind,payload,&child_id,&connection.wire_id));
            }
        }
        *wire_guard = Some(connection.wire_id.clone());
    }
    state.emit(&session_id,"child_connected",json!({"childId":child_id,"viaParent":connection.via_parent}));
    *slot = Some(connection);
    Ok(())
}

#[tauri::command]
async fn send_subagent_prompt(state: tauri::State<'_, Arc<AppState>>, session_id: String, child_id: String, text: String, attachments: Option<Vec<PromptAttachment>>) -> Result<(), String> {
    let files = attachments.unwrap_or_default();
    if text.trim().is_empty() && files.is_empty() { return Err("Write a message or attach a file first".into()); }
    state.connection(&session_id).await?;
    let child: SubagentRecord = state.db.get("subagent", &worker_key(&session_id,&child_id))?;
    let activity = child.state["type"].as_str().or_else(|| child.state["state"].as_str()).unwrap_or("");
    if matches!(activity,"working" | "running" | "queued" | "needs_input" | "requires_action") { return Err("Wait for this worker's current turn to finish".into()); }
    let slot = state.child_connections.lock().await.get(&worker_key(&session_id,&child_id)).cloned().ok_or("Open this worker before messaging it")?;
    let previous: SessionRecord = state.db.get("session",&session_id)?;
    let (rpc,wire_id,via_parent,capabilities) = {
        let slot = slot.lock().await; let c = slot.as_ref().ok_or("The worker is disconnected")?;
        if !c.rpc.alive.load(Ordering::SeqCst) { return Err("The worker is disconnected".into()); }
        if c.rpc.busy.load(Ordering::SeqCst) { return Err("This worker is already working".into()); }
        (c.rpc.clone(),c.wire_id.clone(),c.via_parent,c.capabilities.clone())
    };
    let (mut content, file_metadata, paths) = attachments::prepare(&state.data, &text, &files, &capabilities).await?;
    if rpc.busy.swap(true,Ordering::SeqCst) { return Err("This worker is already working".into()); }
    rpc.grant_attachment_reads(&paths).await;
    let prompt = if via_parent {
        if let Err(error) = state.update(&session_id,|s| s.status="working".into()) {
            rpc.busy.store(false,Ordering::SeqCst); return Err(error);
        }
        state.relay_targets.lock().unwrap().insert(session_id.clone(),(child_id.clone(),wire_id.clone()));
        let forwarded = if paths.is_empty() { text.clone() } else {
            format!("{}\n\nAttached files (forward these paths to the worker):\n{}", text, paths.iter().map(|p| p.display().to_string()).collect::<Vec<_>>().join("\n"))
        };
        subagents::relay_prompt(&child,&forwarded)
    } else { text.clone() };
    if via_parent {
        if !text.trim().is_empty() { content[0] = json!({"type":"text","text":prompt}); }
        else { content.insert(0, json!({"type":"text","text":prompt})); }
    }
    state.emit(&session_id,"user_message",json!({"text":text,"childId":child_id,"attachments":file_metadata}));
    state.emit(&session_id,"child_status",json!({"childId":child_id,"state":"working"}));
    let mut result = rpc.request("session/prompt",json!({"sessionId":wire_id,"prompt":content}),None).await;
    if via_parent && result.is_ok() {
        if let Err(error) = subagents::wait_for_children(&rpc,|| {
            Ok(state.db.list::<SubagentRecord>("subagent")?.iter().any(|c| subagents::same_worker(&c.session_id,&child_id) && subagents::is_working(&c.state)))
        }).await { result=Err(error); }
    }
    rpc.busy.store(false,Ordering::SeqCst);
    rpc.cancel_requests().await;
    let active = if via_parent { state.connections.lock().await.get(&session_id).is_some_and(|active| Arc::ptr_eq(active,&rpc)) }
        else { state.child_transports.lock().unwrap().get(&worker_key(&session_id,&child_id)).is_some_and(|active| Arc::ptr_eq(active,&rpc)) };
    if !active {
        return Err("The worker connection changed during this turn".into());
    }
    if via_parent {
        // Some adapters finish the prompt before delivering a worker's deferred
        // completion. Keep its destination until another user turn takes over.
        let _ = state.update(&session_id,|s| {if s.status == "working" || s.status == "needs_input" {s.status=previous.status.clone();}});
    }
    match result {
        Ok(response) => {
            // Prime's agent_message.send body is stored in a tool receipt, not
            // an assistant text chunk. Import completed sends as visible messages.
            if !via_parent && previous.provider_id == "prime" {
                let refresh_state = state.inner().clone();
                let refresh_session = previous.clone();
                let refresh_child = child.clone();
                let replay = tokio::task::spawn_blocking(move || {
                    let provider = refresh_state.provider("prime")?;
                    subagents::prime_child(&refresh_state.db, &refresh_state.data, &refresh_session, &refresh_child, provider)
                }).await;
                if let Ok(Ok((_, updates))) = replay {
                    for update in updates.into_iter().filter(|u| u["sessionUpdate"] == "agent_communication") {
                        state.emit(&session_id, "session/update", json!({"sessionId":child_id,"update":update}));
                    }
                }
            }
            state.emit(&session_id,"turn_complete",json!({"childId":child_id,"stopReason":response["stopReason"]}));
            state.emit(&session_id,"child_status",json!({"childId":child_id,"state":"idle"}));
            Ok(())
        },
        Err(error) => {
            state.emit(&session_id,"child_status",json!({"childId":child_id,"state":"error","error":error}));
            Err(error)
        }
    }
}

#[tauri::command]
async fn send_prompt(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    text: String,
    attachments: Option<Vec<PromptAttachment>>,
) -> Result<(), String> {
    let files = attachments.unwrap_or_default();
    let rpc = state.connection(&session_id).await?;
    let configuration_guard = rpc.configuration_lock.lock().await;
    let s: SessionRecord = state.db.get("session", &session_id)?;
    if s.mode != "gui" {
        rpc.busy.store(false, Ordering::SeqCst);
        return Err("Return to GUI mode first".into());
    }
    if rpc.busy.load(Ordering::SeqCst) { return Err("This agent is already working".into()); }
    let (content, file_metadata, paths) = attachments::prepare(&state.data, &text, &files, &s.capabilities.raw).await?;
    if rpc.busy.swap(true, Ordering::SeqCst) {
        return Err("This agent is already working".into());
    }
    rpc.grant_attachment_reads(&paths).await;
    rpc.turn_generation.fetch_add(1, Ordering::SeqCst);
    state.relay_targets.lock().unwrap().remove(&session_id);
    if let Err(e) = state.update(&session_id, |s| {
        s.status = "working".into();
        s.draft.clear();
        s.error = None;
    }) {
        rpc.busy.store(false, Ordering::SeqCst);
        return Err(e);
    }
    drop(configuration_guard);
    state.emit(&session_id, "user_message", json!({"text":text,"attachments":file_metadata}));
    let result = rpc
        .request(
            "session/prompt",
            json!({"sessionId":s.acp_session_id,"prompt":content}),
            None,
        )
        .await;
    rpc.busy.store(false, Ordering::SeqCst);
    rpc.cancel_requests().await;
    if !state
        .connections
        .lock()
        .await
        .get(&session_id)
        .is_some_and(|active| Arc::ptr_eq(active, &rpc))
    {
        return Err("The previous turn was interrupted by a session change".into());
    }
    match result {
        Ok(response) => {
            state.emit(&session_id, "turn_complete", response.clone());
            state.update(&session_id, |s| {
                s.status = if response["stopReason"] == "cancelled" {
                    "idle"
                } else {
                    "completed"
                }
                .into()
            })?;
            state.notify("Agent finished", &s.title);
            Ok(())
        }
        Err(e) => {
            state.update(&session_id, |s| {
                s.status = "error".into();
                s.error = Some(e.clone());
            })?;
            state.notify("Agent interrupted", &s.title);
            Err(e)
        }
    }
}
#[tauri::command]
async fn cancel_turn(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    child_id: Option<String>,
) -> Result<(), String> {
    let rpc = state.connection(&session_id).await?;
    let s: SessionRecord = state.db.get("session", &session_id)?;
    if let Some(child) = child_id {
        let slot = state.child_connections.lock().await.get(&worker_key(&session_id,&child)).cloned();
        if let Some(slot) = slot {
            let slot = slot.lock().await;
            if let Some(c) = slot.as_ref() {
                c.rpc.cancel_requests().await;
                return c.rpc.notify("session/cancel",json!({"sessionId":c.wire_id})).await;
            }
        }
        let record: SubagentRecord = state.db.get("subagent", &format!("{session_id}:{child}"))?;
        if record
            .capabilities
            .get("cancel")
            .is_none_or(|v| v == false || v.is_null())
        {
            return Err(
                "This provider does not advertise individual cancellation for this worker".into(),
            );
        }
        return rpc
            .notify("session/cancel", json!({"sessionId":child}))
            .await;
    }
    rpc.cancel_requests().await;
    rpc.notify("session/cancel", json!({"sessionId":s.acp_session_id}))
        .await?;
    let generation = rpc.turn_generation.load(Ordering::SeqCst);
    let weak = Arc::downgrade(state.inner());
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(8)).await;
        if rpc.busy.load(Ordering::SeqCst)
            && rpc.turn_generation.load(Ordering::SeqCst) == generation
        {
            if let Some(state) = weak.upgrade() {
                let _guard = state.operations.session(&session_id).await;
                let current = state
                    .connections
                    .lock()
                    .await
                    .get(&session_id)
                    .is_some_and(|r| Arc::ptr_eq(r, &rpc));
                if current
                    && rpc.busy.load(Ordering::SeqCst)
                    && rpc.turn_generation.load(Ordering::SeqCst) == generation
                {
                    state.stop(&session_id).await;
                    let _=state.update(&session_id,|s|{s.status="disconnected".into();s.error=Some("The agent did not acknowledge cancellation. Its process was stopped; reconnect to continue.".into())});
                }
            }
        }
    });
    Ok(())
}
#[tauri::command]
async fn answer_request(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    request_id: Value,
    result: Value,
) -> Result<(), String> {
    if let (Some(child), Some(id)) = (request_id["childId"].as_str(), request_id.get("requestId")) {
        let rpc = state.child_transports.lock().unwrap().get(&worker_key(&session_id,child)).cloned().ok_or("Worker is disconnected")?;
        return rpc.answer(id.clone(),result).await;
    }
    let rpc = state.connection(&session_id).await?;
    rpc.answer(request_id, result).await?;
    if rpc.inbound.lock().await.is_empty() {
        state.update(&session_id, |s| {
            s.status = if rpc.busy.load(Ordering::SeqCst) {
                "working"
            } else {
                "idle"
            }
            .into()
        })?;
    }
    Ok(())
}
#[tauri::command]
async fn export_transcript(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<String, String> {
    let dir = state.data.join("exports");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}-{}.jsonl", session_id, id()));
    state.db.export(&session_id, &path)?;
    tokio::process::Command::new("/usr/bin/open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into())
}
#[tauri::command]
fn get_events(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    after: f64,
) -> Result<Vec<SessionEvent>, String> {
    state.db.events(&session_id, after, 5000)
}
#[tauri::command]
fn save_session_ui(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    draft: String,
    scroll_top: f64,
    review_open: bool,
) -> Result<(), String> {
    state.update(&session_id, |s| {
        s.draft = draft;
        s.scroll_top = scroll_top;
        s.review_open = review_open;
    })?;
    Ok(())
}
#[tauri::command]
async fn delete_session(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    let _guard = state.operations.session(&session_id).await;
    let s: SessionRecord = state.db.get("session", &session_id)?;
    let _workspace_guard = state.operations.workspace(&s.cwd).await;
    let prefix = format!("shell:{session_id}:");
    state.tab_windows.close_session(&state.app, &session_id);
    let shells = {
        let mut terminals = state.terminals.lock().await;
        let ids: Vec<_> = terminals.keys().filter(|id| id.starts_with(&prefix)).cloned().collect();
        ids.into_iter().filter_map(|id| terminals.remove(&id)).collect::<Vec<_>>()
    };
    for terminal in shells { terminal.stop(); }
    state.stop(&session_id).await;
    if let Some(tree_id) = &s.worktree_id {
        let sessions: Vec<SessionRecord> = state.db.list("session")?;
        let shared = sessions.iter().any(|other| {
            other.id != s.id
                && !other.archived
                && (workspaces::same_folder(&other.cwd, &s.cwd)
                    || other.worktree_id.as_ref() == Some(tree_id))
        });
        if !shared {
            let mut tree: WorktreeRecord = state.db.get("worktree", tree_id)?;
            if tree.owned && tree.state != "archived" {
                state.update(&session_id, |s| s.status = "archiving".into())?;
                let tree_copy = tree.clone();
                let id_copy = session_id.clone();
                let dest = state.data.join("archives");
                let result = tokio::task::spawn_blocking(move || {
                    worktrees::archive(&tree_copy, &id_copy, &dest)
                })
                .await
                .map_err(|e| e.to_string())?;
                let archive = match result {
                    Ok(a) => a,
                    Err(e) => {
                        state.update(&session_id, |s| {
                            s.status = "cleanup_pending".into();
                            s.error = Some(e.clone())
                        })?;
                        return Err(e);
                    }
                };
                state.db.put("archive", &archive.id, &archive)?;
                let a = archive.clone();
                if let Err(e) = tokio::task::spawn_blocking(move || worktrees::remove_verified(&a))
                    .await
                    .map_err(|e| e.to_string())?
                {
                    state.update(&session_id, |s| {
                        s.status = "cleanup_pending".into();
                        s.error = Some(e.clone())
                    })?;
                    return Err(e);
                }
                tree.state = "archived".into();
                state.db.put("worktree", tree_id, &tree)?;
            }
        }
    }
    state.update(&session_id, |s| {
        s.archived = true;
        s.status = "archived".into();
        s.error = None;
    })?;
    Ok(())
}
#[tauri::command]
async fn restore_archive(
    state: tauri::State<'_, Arc<AppState>>,
    archive_id: String,
) -> Result<SessionRecord, String> {
    let session_id = state
        .db
        .get::<ArchiveRecord>("archive", &archive_id)?
        .session_id;
    let _guard = state.operations.session(&session_id).await;
    let mut a: ArchiveRecord = state.db.get("archive", &archive_id)?;
    let _workspace_guard = state.operations.workspace(&a.worktree.path).await;
    if a.restored {
        return Err("This archive has already been restored".into());
    }
    let copy = a.clone();
    let tree = tokio::task::spawn_blocking(move || worktrees::restore(&copy))
        .await
        .map_err(|e| e.to_string())??;
    state.db.put("worktree", &tree.id, &tree)?;
    a.restored = true;
    state.db.put("archive", &a.id, &a)?;
    state.update(&a.session_id, |s| {
        s.archived = false;
        s.status = "disconnected".into();
        s.cwd = tree.path.clone();
        s.worktree_id = Some(tree.id.clone());
        s.error = None;
    })
}
#[tauri::command]
async fn restore_chat(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<SessionRecord, String> {
    let _guard = state.operations.session(&session_id).await;
    let s: SessionRecord = state.db.get("session", &session_id)?;
    let _workspace_guard = state.operations.workspace(&s.cwd).await;
    if !Path::new(&s.cwd).is_dir() {
        return Err("Restore the worktree archive first".into());
    }
    state.update(&session_id, |s| {
        s.archived = false;
        s.status = "disconnected".into()
    })
}
#[tauri::command]
async fn list_branches(
    state: tauri::State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Vec<String>, String> {
    let workspace: Workspace = state.db.get("workspace", &workspace_id)?;
    tokio::task::spawn_blocking(move || worktrees::branches(&workspace.path))
        .await.map_err(|e| e.to_string())?
}
#[tauri::command]
async fn list_worktrees(
    state: tauri::State<'_, Arc<AppState>>,
    workspace_id: String,
) -> Result<Value, String> {
    let w: Workspace = state.db.get("workspace", &workspace_id)?;
    tokio::task::spawn_blocking(move || {
        if !workspaces::git_root(&w.path) {
            return Ok(json!([]));
        }
        worktrees::list(&w.path)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn get_review(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Value, String> {
    let s: SessionRecord = state.db.get("session", &session_id)?;
    if !workspaces::git_directory(&s.cwd) {
        return Ok(json!({"files":[],"status":"","diff":""}));
    }
    tokio::task::spawn_blocking(move || worktrees::review(&s.cwd))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn read_file(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    path: String,
) -> Result<String, String> {
    let s: SessionRecord = state.db.get("session", &session_id)?;
    let p = acp::workspace_path(
        Path::new(&s.cwd),
        &Path::new(&s.cwd).join(path).to_string_lossy(),
        false,
    )?;
    if tokio::fs::metadata(&p)
        .await
        .map_err(|e| e.to_string())?
        .len()
        > 2_097_152
    {
        return Err("Preview is limited to 2 MiB; open this file in your editor".into());
    }
    tokio::fs::read_to_string(p)
        .await
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn open_in_editor(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    path: String,
) -> Result<(), String> {
    let s: SessionRecord = state.db.get("session", &session_id)?;
    let p = acp::workspace_path(
        Path::new(&s.cwd),
        &Path::new(&s.cwd).join(path).to_string_lossy(),
        false,
    )?;
    let settings: Value = state.db.get("settings", "app").unwrap_or(json!({}));
    let editor = settings["editor"].as_str().unwrap_or("code").to_owned();
    tokio::task::spawn_blocking(move || editors::open(&editor, &p))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn list_editors(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<EditorChoice>, String> {
    let settings: Value = state.db.get("settings", "app").unwrap_or(json!({}));
    tokio::task::spawn_blocking(move || editors::discover(settings["editor"].as_str()))
        .await
        .map_err(|e| e.to_string())?
}
// Native handoff stays closed unless the installation has a matching verified compatibility receipt.
#[tauri::command]
async fn enter_terminal(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<(), String> {
    let _guard = state.operations.session(&session_id).await;
    let s: SessionRecord = state.db.get("session", &session_id)?;
    if !s.capabilities.native_handoff {
        return Err(s.capabilities.native_handoff_reason);
    }
    let rpc = state.connection(&session_id).await?;
    if rpc.busy.load(Ordering::SeqCst) || !rpc.inbound.lock().await.is_empty() {
        return Err("Finish or stop the current turn and answer pending requests first".into());
    }
    let native_id = s
        .native_session_id
        .ok_or("No verified native session identity")?;
    let provider = state.provider(&s.provider_id)?;
    if !providers::verified_handoff(&provider, &s.capabilities.raw).await {
        return Err("The installed provider version changed. Reconnect to check compatibility before switching.".into());
    }
    let args = match provider.id.as_str() {
        "codex" => vec!["resume".into(), native_id],
        "claude" => vec!["--resume".into(), native_id],
        "cursor" => vec!["--resume".into(), native_id],
        "opencode" => vec!["--session".into(), native_id],
        _ => return Err("Native resume adapter has not been verified".into()),
    };
    state.update(&session_id, |s| s.mode = "handoff".into())?;
    state.stop(&session_id).await;
    let sid = session_id.clone();
    let weak = Arc::downgrade(state.inner());
    let sink: Sink = Arc::new(move |kind, v| {
        if let Some(s) = weak.upgrade() {
            s.emit(&sid, kind, v);
        }
    });
    match terminal::NativeTerminal::start(&provider.native_command, &args, &s.cwd, sink) {
        Ok(term) => {
            state
                .terminals
                .lock()
                .await
                .insert(session_id.clone(), term);
            state.update(&session_id, |s| {
                s.mode = "terminal".into();
                s.status = "terminal".into()
            })?;
            Ok(())
        }
        Err(e) => {
            state.update(&session_id, |s| {
                s.mode = "gui".into();
                s.status = "error".into();
                s.error = Some(e.clone())
            })?;
            Err(e)
        }
    }
}
#[tauri::command]
async fn create_shell_terminal(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Value, String> {
    let _guard = state.operations.session(&session_id).await;
    if state.quitting.load(Ordering::SeqCst) { return Err("Harbor is quitting".into()); }
    let session: SessionRecord = state.db.get("session", &session_id)?;
    if session.archived { return Err("This conversation is archived".into()); }
    let id = format!("shell:{session_id}:{:020}:{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(), uuid::Uuid::new_v4());
    let sid = id.clone();
    let weak = Arc::downgrade(state.inner());
    let sink: Sink = Arc::new(move |kind, payload| {
        if kind == "terminal/data" {
            if let Some(state) = weak.upgrade() { state.emit(&sid, kind, payload); }
        }
    });
    let term = terminal::NativeTerminal::start_shell(&session.cwd, sink)?;
    let mut status = term.status();
    status["id"] = json!(id);
    state.terminals.lock().await.insert(id, term);
    Ok(status)
}
#[tauri::command]
async fn list_shell_terminals(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Vec<Value>, String> {
    let prefix = format!("shell:{session_id}:");
    let terminals = state.terminals.lock().await;
    let mut ids: Vec<_> = terminals.keys().filter(|id| id.starts_with(&prefix)).collect();
    ids.sort();
    Ok(ids.into_iter().map(|id| {
        let mut status = terminals[id].status();
        status["id"] = json!(id);
        status
    }).collect())
}
#[tauri::command]
async fn close_shell_terminal(
    state: tauri::State<'_, Arc<AppState>>,
    terminal_id: String,
) -> Result<(), String> {
    if !terminal_id.starts_with("shell:") { return Err("Not a shell terminal".into()); }
    let terminal = state.terminals.lock().await.remove(&terminal_id);
    if let Some(terminal) = terminal {
        tokio::task::spawn_blocking(move || terminal.stop()).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}
#[tauri::command]
async fn terminal_status(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Value, String> {
    Ok(state.terminals.lock().await.get(&session_id).ok_or("Terminal is not running")?.status())
}
#[tauri::command]
async fn terminal_snapshot(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Value, String> {
    Ok(state
        .terminals
        .lock()
        .await
        .get(&session_id)
        .map(|t| t.snapshot())
        .unwrap_or(json!({"bytes":[],"end":0})))
}
#[tauri::command]
async fn terminal_input(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    state
        .terminals
        .lock()
        .await
        .get(&session_id)
        .ok_or("Terminal is not running")?
        .write(&data)
}
#[tauri::command]
async fn terminal_resize(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state
        .terminals
        .lock()
        .await
        .get(&session_id)
        .ok_or("Terminal is not running")?
        .resize(rows, cols)
}
fn setup_path() {
    if let Ok(home) = std::env::var("HOME") {
        let mut paths = vec![
            PathBuf::from(format!("{home}/.local/bin")),
            PathBuf::from(format!("{home}/.grok/bin")),
            PathBuf::from(format!("{home}/.cargo/bin")),
            PathBuf::from("/opt/homebrew/bin"),
            PathBuf::from("/usr/local/bin"),
        ];
        if let Ok(entries) = std::fs::read_dir(format!("{home}/.nvm/versions/node")) {
            let mut versions: Vec<_> = entries.flatten().map(|e| e.path().join("bin")).collect();
            versions.sort();
            versions.reverse();
            paths.extend(versions);
        }
        paths.extend(std::env::split_paths(
            &std::env::var_os("PATH").unwrap_or_default(),
        ));
        if let Ok(path) = std::env::join_paths(paths) {
            std::env::set_var("PATH", path);
        }
    }
}
fn keep_in_background(settings: &Value) -> bool {
    settings["keepInBackground"].as_bool().unwrap_or(true)
}
pub fn run() {
    setup_path();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let data = app.path().app_data_dir()?;
            #[cfg(debug_assertions)]
            let data = std::env::var_os("HARBOR_TEST_DATA_DIR")
                .map(PathBuf::from)
                .unwrap_or(data);
            std::fs::create_dir_all(&data)?;
            let db =
                db::Database::open(&data.join("harbor.sqlite")).map_err(std::io::Error::other)?;
            for provider in types::providers() {
                if db
                    .get::<ProviderDefinition>("provider", &provider.id)
                    .is_err()
                {
                    db.put("provider", &provider.id, &provider)
                        .map_err(std::io::Error::other)?;
                }
            }
            for s in db
                .list::<SessionRecord>("session")
                .map_err(std::io::Error::other)?
            {
                if !s.archived && s.status != "cleanup_pending" {
                    // Requests belong to the previous process and cannot be answered
                    // after restart, even when the saved conversation can be loaded.
                    db.event(
                        &s.id,
                        "disconnected",
                        json!({"reason":"application_restart"}),
                    )
                    .map_err(std::io::Error::other)?;
                    db.update_session(&s.id, |s| {
                        s.status = "disconnected".into();
                        s.mode = "gui".into();
                    })
                    .map_err(std::io::Error::other)?;
                }
            }
            let state = Arc::new(AppState {
                db,
                data,
                app: app.handle().clone(),
                connections: Mutex::new(HashMap::new()),
                child_connections: Mutex::new(HashMap::new()),
                child_transports: StdMutex::new(HashMap::new()),
                relay_targets: StdMutex::new(HashMap::new()),
                terminals: Mutex::new(HashMap::new()),
                tab_windows: tab_windows::TabWindows::default(),
                discoveries: Mutex::new(HashMap::new()),
                command_catalogs: commands::Catalogs::default(),
                generations: StdMutex::new(HashMap::new()),
                operations: operations::Operations::default(),
                quitting: AtomicBool::new(false),
            });
            app.manage(state);
            let show =
                tauri::menu::MenuItem::with_id(app, "show", "Open Harbor", true, None::<&str>)?;
            let quit =
                tauri::menu::MenuItem::with_id(app, "quit", "Quit Harbor", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;
            let mut tray = tauri::tray::TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Harbor");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.on_menu_event(|app, event| match event.id.as_ref() {
                "show" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
                "quit" => {
                    let app = app.clone();
                    let state = app.state::<Arc<AppState>>().inner().clone();
                    state.quitting.store(true, Ordering::SeqCst);
                    tauri::async_runtime::spawn(async move {
                        state.shutdown().await;
                        app.exit(0);
                    });
                }
                _ => {}
            })
            .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(target_os = "macos")]
            if matches!(
                event,
                tauri::WindowEvent::ThemeChanged(_)
                    | tauri::WindowEvent::Focused(true)
                    | tauri::WindowEvent::ScaleFactorChanged { .. }
            ) {
                // AppKit can reset the traffic lights during appearance or
                // display changes. Tao's title setter reapplies the configured
                // trafficLightPosition on the main queue after AppKit layout.
                // Preserve the current title; don't duplicate native geometry.
                if let Ok(title) = window.title() {
                    let _ = window.set_title(&title);
                }
            }
            if window.label().starts_with("tab-") {
                let state = window.state::<Arc<AppState>>().inner().clone();
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Closing the view preserves its tab, shell, and unsent UI state.
                    // Task deletion removes the registry entry first; quitting sets
                    // the flag, so those paths still destroy their windows.
                    if !state.quitting.load(Ordering::SeqCst) && state.tab_windows.contains(window.label()) {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                if matches!(event, tauri::WindowEvent::Destroyed) {
                    tab_windows::destroyed(state, window.label());
                }
                return;
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let state = window.state::<Arc<AppState>>().inner().clone();
                if state.quitting.load(Ordering::SeqCst) {
                    return;
                }
                let settings = state
                    .db
                    .get::<Value>("settings", "app")
                    .unwrap_or(json!({}));
                if keep_in_background(&settings) {
                    let _ = window.hide();
                } else if !state.quitting.swap(true, Ordering::SeqCst) {
                    let app = window.app_handle().clone();
                    tauri::async_runtime::spawn(async move {
                        state.shutdown().await;
                        app.exit(0);
                    });
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            discover_provider_config,
            discover_commands,
            bootstrap,
            save_project,
            save_workspace,
            save_provider,
            save_settings,
            list_editors,
            probe_provider,
            create_session,
            reconnect,
            authenticate,
            set_config,
            send_prompt,
            open_subagent,
            send_subagent_prompt,
            cancel_turn,
            answer_request,
            get_events,
            save_session_ui,
            delete_session,
            restore_archive,
            restore_chat,
            list_branches,
            list_worktrees,
            get_review,
            read_file,
            open_in_editor,
            enter_terminal,
            tab_windows::list_detached_tabs,
            tab_windows::get_detached_tab,
            tab_windows::detach_task_tab,
            tab_windows::focus_task_tab,
            create_shell_terminal,
            list_shell_terminals,
            close_shell_terminal,
            terminal_status,
            terminal_input,
            terminal_resize,
            terminal_snapshot,
            export_transcript
        ])
        .build(tauri::generate_context!())
        .expect("Harbor could not start");
    app.run(|handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            let state = handle.state::<Arc<AppState>>().inner().clone();
            if !state.quitting.swap(true, Ordering::SeqCst) {
                api.prevent_exit();
                let app = handle.clone();
                tauri::async_runtime::spawn(async move {
                    state.shutdown().await;
                    app.exit(0);
                });
            }
        }
    });
}

#[cfg(test)]
mod freeform_tests {
    use super::*;
    #[test]
    fn background_setting_defaults_on_and_respects_explicit_off() {
        assert!(keep_in_background(&json!({})));
        assert!(keep_in_background(&json!({"keepInBackground":true})));
        assert!(!keep_in_background(&json!({"keepInBackground":false})));
    }
    #[tokio::test]
    async fn folder_chats_reuse_workspace_without_git_and_keep_saved_cwd_after_edits() {
        let data = tempfile::tempdir().unwrap();
        let db = db::Database::open(&data.path().join("db.sqlite")).unwrap();
        let folder = data.path().join("notes");
        std::fs::create_dir(&folder).unwrap();
        let project = db
            .save_project(None, "Notes", "book-open", "teal", folder.to_str().unwrap())
            .unwrap();
        let workspace = db.get::<Workspace>("workspace", &project.workspace_id).unwrap();
        let (cwd, tree) = task_workspace(
            &db,
            data.path(),
            "folder-chat",
            Some(&workspace),
            false,
            String::new(),
            String::new(),
        )
        .await
        .unwrap();
        assert_eq!(
            cwd,
            workspaces::canonical_folder(folder.to_str().unwrap()).unwrap()
        );
        assert!(tree.is_none());
        assert!(!workspaces::git_directory(&cwd));
        assert!(task_workspace(
            &db,
            data.path(),
            "bad-tree",
            Some(&workspace),
            true,
            "branch".into(),
            "HEAD".into()
        )
        .await
        .unwrap_err()
        .contains("Git checkout root"));
        let session = json!({"id":"folder-chat", "projectId":project.id, "workspaceId":project.workspace_id, "cwd":cwd});
        db.put("session", "folder-chat", &session).unwrap();
        let next = data.path().join("next");
        std::fs::create_dir(&next).unwrap();
        let edited = db
            .save_project(
                Some(&project.id),
                "Notes",
                "book-open",
                "teal",
                next.to_str().unwrap(),
            )
            .unwrap();
        assert_eq!(
            db.get::<Value>("session", "folder-chat").unwrap()["cwd"],
            session["cwd"]
        );
        let (new_cwd, _) = task_workspace(
            &db,
            data.path(),
            "new-chat",
            Some(&db.get::<Workspace>("workspace", &edited.workspace_id).unwrap()),
            false,
            String::new(),
            String::new(),
        )
        .await
        .unwrap();
        assert_eq!(
            new_cwd,
            workspaces::canonical_folder(next.to_str().unwrap()).unwrap()
        );
        std::fs::remove_dir(&folder).unwrap();
        assert!(task_workspace(
            &db,
            data.path(),
            "missing",
            Some(&workspace),
            false,
            String::new(),
            String::new()
        )
        .await
        .unwrap_err()
        .contains("unavailable"));
    }
    #[tokio::test]
    async fn standalone_workspace_launches_without_a_project() {
        let data = tempfile::tempdir().unwrap();
        let db = db::Database::open(&data.path().join("db.sqlite")).unwrap();
        let workspace = db.save_workspace(data.path().to_str().unwrap()).unwrap();
        let (cwd, tree) = task_workspace(&db, data.path(), "standalone", Some(&workspace),
            false, String::new(), String::new()).await.unwrap();
        assert_eq!(cwd, workspace.path);
        assert!(tree.is_none());
        assert!(db.list::<Project>("project").unwrap().is_empty());
    }
    #[tokio::test]
    async fn freeform_ignores_worktree_flags_and_retains_its_directory() {
        let data = tempfile::tempdir().unwrap();
        let db = db::Database::open(&data.path().join("test.sqlite")).unwrap();
        // Deliberately pass a worktree flag and invalid branch: no repository or
        // Worktrunk operation may be attempted for a projectless conversation.
        let (cwd, tree) = task_workspace(
            &db,
            data.path(),
            "chat-one",
            None,
            true,
            "invalid branch".into(),
            "missing-ref".into(),
        )
        .await
        .unwrap();
        assert!(tree.is_none());
        assert!(db.list::<WorktreeRecord>("worktree").unwrap().is_empty());
        assert!(!Path::new(&cwd).join(".git").exists());
        std::fs::write(Path::new(&cwd).join("notes.txt"), "keep me").unwrap();
        let (restored, _) = task_workspace(
            &db,
            data.path(),
            "chat-one",
            None,
            false,
            String::new(),
            String::new(),
        )
        .await
        .unwrap();
        assert_eq!(cwd, restored);
        assert_eq!(
            std::fs::read_to_string(Path::new(&restored).join("notes.txt")).unwrap(),
            "keep me"
        );
        let (other, _) = task_workspace(
            &db,
            data.path(),
            "chat-two",
            None,
            false,
            String::new(),
            String::new(),
        )
        .await
        .unwrap();
        assert_ne!(cwd, other);
    }
}
