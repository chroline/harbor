//! Prime's persistent session identity is distinct from its connection-local ACP ID.
use crate::{
    db::Database,
    types::{AgentCapabilities, ProviderDefinition, SessionRecord},
    workspaces,
};
use serde_json::{json, Value};
use std::{
    fs::File,
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
};

pub struct Launch {
    pub provider: ProviderDefinition,
    // A new ACP session wraps this same persistent Prime conversation.
    pub resumed: bool,
    directory: Option<PathBuf>,
}

impl Launch {
    pub fn request(
        &self,
        session: &SessionRecord,
        caps: &AgentCapabilities,
        load: bool,
    ) -> Result<(&'static str, Value), String> {
        let base = json!({"cwd":session.cwd,"mcpServers":[]});
        if !load || self.resumed {
            return Ok(("session/new", base));
        }
        let id = session
            .acp_session_id
            .as_ref()
            .ok_or("No saved ACP session ID")?;
        let method = if caps.load_session {
            "session/load"
        } else if caps.resume_session {
            "session/resume"
        } else {
            return Err(
                "This provider cannot reopen saved sessions. The transcript is preserved.".into(),
            );
        };
        Ok((
            method,
            json!({"sessionId":id,"cwd":session.cwd,"mcpServers":[]}),
        ))
    }

    pub fn remember(&self, db: &Database, session: &SessionRecord) -> Result<(), String> {
        if let Some(directory) = &self.directory {
            let files = candidates(directory, &session.cwd, None)?;
            if files.len() > 1 {
                return Err("Multiple Prime conversations were created for this chat. The transcript is preserved.".into());
            }
            // In-process Prime may not flush its file until the first prompt.
            if let Some(path) = files.first() {
                db.put("prime_session", &session.id, path)?;
            }
        }
        Ok(())
    }
}

pub fn prepare(
    db: &Database,
    data: &Path,
    session: &SessionRecord,
    mut provider: ProviderDefinition,
    load: bool,
) -> Result<Launch, String> {
    if provider.id != "prime" {
        return Ok(Launch {
            provider,
            resumed: false,
            directory: None,
        });
    }
    if provider.args.iter().any(|arg| {
        matches!(
            arg.as_str(),
            "--no-session" | "--continue" | "-c" | "--resume" | "-r" | "--fork"
        ) || arg.starts_with("--resume=")
    }) {
        return Err("Remove session selection flags from Prime's provider arguments. Harbor selects the saved conversation for each chat.".into());
    }
    let directory = data.join("prime-sessions").join(&session.id);
    let path = match db.get::<PathBuf>("prime_session", &session.id) {
        Ok(path) => {
            // Prime opens missing or damaged paths as new sessions; never let that
            // behavior silently erase the agent's context.
            let header = read_header(&path)?;
            if header["type"] != "session"
                || !header["id"].is_string()
                || header["cwd"].as_str().is_none()
                || !header["parentSession"].is_null()
            {
                return Err(
                    "The saved Prime conversation is invalid. The Harbor transcript is preserved."
                        .into(),
                );
            }
            Some(path)
        }
        Err(_) => {
            let files = candidates(&directory, &session.cwd, None)?;
            if files.len() > 1 {
                return Err("Multiple saved Prime conversations match this chat. The transcript is preserved.".into());
            }
            if let Some(path) = files.into_iter().next() {
                Some(path)
            } else if load {
                let prompt = first_prompt(db, &session.id)?;
                Some(find_legacy_session(
                    &legacy_directory(&provider)?,
                    &session.cwd,
                    prompt.as_deref(),
                )?)
            } else {
                None
            }
        }
    };
    let resumed = path.is_some();
    if let Some(path) = path {
        // Persist the exact identity before spawning, including legacy recovery.
        db.put("prime_session", &session.id, &path)?;
        provider
            .args
            .push(format!("--resume={}", path.to_string_lossy()));
    } else {
        std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
        provider.args.extend([
            "--session-dir".into(),
            directory.to_string_lossy().into_owned(),
        ]);
    }
    // Restored archives can have a different working directory.
    provider.args.extend(["--cwd".into(), session.cwd.clone()]);
    Ok(Launch {
        provider,
        resumed,
        directory: (!resumed).then_some(directory),
    })
}

fn expand_home(path: &str) -> Result<PathBuf, String> {
    if path == "~" || path.starts_with("~/") {
        let home = std::env::var_os("HOME")
            .ok_or("Cannot locate Prime's saved conversations: HOME is unset")?;
        return Ok(PathBuf::from(home).join(path.strip_prefix("~/").unwrap_or("")));
    }
    Ok(PathBuf::from(path))
}

fn legacy_directory(provider: &ProviderDefinition) -> Result<PathBuf, String> {
    if let Some(pair) = provider
        .args
        .windows(2)
        .rev()
        .find(|a| a[0] == "--session-dir")
    {
        return expand_home(&pair[1]);
    }
    for name in [
        "PRIME_AGENT_SESSION_DIR",
        "PRIME_AGENT_CODING_AGENT_SESSION_DIR",
    ] {
        if let Ok(path) = std::env::var(name) {
            if !path.is_empty() {
                return expand_home(&path);
            }
        }
    }
    if let Ok(path) = std::env::var("PRIME_AGENT_CODING_AGENT_DIR") {
        if !path.is_empty() {
            return Ok(expand_home(&path)?.join("sessions"));
        }
    }
    expand_home("~/.prime/agent/sessions")
}

fn first_prompt(db: &Database, id: &str) -> Result<Option<String>, String> {
    let mut after = 0.;
    loop {
        let events = db.events(id, after, 5000)?;
        if events.is_empty() {
            return Ok(None);
        }
        for event in &events {
            if event.kind == "user_message" {
                if let Some(text) = event.payload["text"].as_str() {
                    return Ok(Some(text.into()));
                }
            }
        }
        after = events.last().unwrap().sequence;
    }
}

pub(crate) fn read_json_line(reader: &mut BufReader<File>) -> Result<Option<Value>, String> {
    let mut line = Vec::new();
    reader
        .take(16 * 1024 * 1024)
        .read_until(b'\n', &mut line)
        .map_err(|e| e.to_string())?;
    if line.is_empty() {
        return Ok(None);
    }
    if line.len() >= 16 * 1024 * 1024 && line.last() != Some(&b'\n') {
        return Err("Prime session entry is too large".into());
    }
    serde_json::from_slice(&line)
        .map(Some)
        .map_err(|e| format!("Cannot read saved Prime conversation: {e}"))
}

pub(crate) fn read_header(path: &Path) -> Result<Value, String> {
    let file = File::open(path).map_err(|e| {
        format!(
            "Cannot open saved Prime conversation {}: {e}. The Harbor transcript is preserved.",
            path.display()
        )
    })?;
    read_json_line(&mut BufReader::new(file))?
        .ok_or("The saved Prime conversation is empty. The Harbor transcript is preserved.".into())
}

fn candidates(
    directory: &Path,
    cwd: &str,
    first_prompt: Option<&str>,
) -> Result<Vec<PathBuf>, String> {
    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
        Err(e) => return Err(e.to_string()),
    };
    let mut matches = vec![];
    for entry in entries {
        let path = entry.map_err(|e| e.to_string())?.path();
        if path.extension().and_then(|v| v.to_str()) != Some("jsonl") {
            continue;
        }
        let Ok(file) = File::open(&path) else {
            continue;
        };
        let mut reader = BufReader::new(file);
        let Ok(Some(header)) = read_json_line(&mut reader) else {
            continue;
        };
        if header["type"] != "session"
            || !header["id"].is_string()
            || !header["parentSession"].is_null()
            || !header["cwd"]
                .as_str()
                .is_some_and(|v| workspaces::same_folder(v, cwd))
        {
            continue;
        }
        if let Some(expected) = first_prompt {
            let mut found = false;
            while let Ok(Some(entry)) = read_json_line(&mut reader) {
                if entry["type"] == "message" && entry["message"]["role"] == "user" {
                    let content = &entry["message"]["content"];
                    let text = content.as_str().map(str::to_owned).or_else(|| {
                        content.as_array().map(|a| {
                            a.iter()
                                .filter_map(|v| v["text"].as_str())
                                .collect::<Vec<_>>()
                                .join("\n")
                        })
                    });
                    found = text.as_deref() == Some(expected);
                    break;
                }
            }
            if !found {
                continue;
            }
        }
        matches.push(path);
    }
    Ok(matches)
}

fn find_legacy_session(
    directory: &Path,
    cwd: &str,
    first_prompt: Option<&str>,
) -> Result<PathBuf, String> {
    let mut files = candidates(directory, cwd, first_prompt)?;
    match files.len() {
        1 => Ok(files.remove(0)),
        0 => Err("Cannot find the original saved Prime conversation. The Harbor transcript is preserved.".into()),
        _ => Err("Multiple saved Prime conversations match this chat. The Harbor transcript is preserved.".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn session() -> SessionRecord {
        serde_json::from_value(json!({
            "id":"chat", "title":"Chat", "providerId":"prime", "cwd":"/workspace",
            "status":"disconnected", "mode":"gui", "createdAt":0, "updatedAt":0,
            "configOptions":[], "modes":null, "models":null,
            "capabilities":{"loadSession":false,"resumeSession":false,"configOptions":true,"nativeHandoff":false,"nativeHandoffReason":"","raw":{}},
            "draft":"keep this draft", "scrollTop":10, "reviewOpen":false, "archived":false
        })).unwrap()
    }

    fn provider() -> ProviderDefinition {
        ProviderDefinition {
            id: "prime".into(),
            name: "Prime".into(),
            command: "node".into(),
            args: vec![format!(
                "{}/../tests/fixture-prime-agent.mjs",
                env!("CARGO_MANIFEST_DIR")
            )],
            native_command: "prime-agent".into(),
            install_hint: String::new(),
            color: String::new(),
        }
    }

    fn saved(
        directory: &Path,
        name: &str,
        cwd: &str,
        prompt: Option<&str>,
        child: bool,
    ) -> PathBuf {
        let path = directory.join(format!("{name}.jsonl"));
        let mut header = json!({"type":"session","version":3,"id":name,"cwd":cwd});
        if child {
            header["parentSession"] = json!("parent.jsonl");
        }
        let mut contents = format!("{header}\n");
        if let Some(prompt) = prompt {
            contents.push_str(&format!("{}\n", json!({"type":"message","message":{"role":"user","content":[{"type":"text","text":prompt}]}})));
        }
        std::fs::write(&path, contents).unwrap();
        path
    }

    #[test]
    fn recovers_original_conversation_instead_of_blank_retry_sessions() {
        let dir = tempfile::tempdir().unwrap();
        let original = saved(
            dir.path(),
            "original",
            "/workspace",
            Some("remember this fact"),
            false,
        );
        saved(dir.path(), "retry", "/workspace", None, false);
        saved(
            dir.path(),
            "other-chat",
            "/workspace",
            Some("another task"),
            false,
        );
        saved(
            dir.path(),
            "child",
            "/workspace",
            Some("remember this fact"),
            true,
        );
        assert_eq!(
            find_legacy_session(dir.path(), "/workspace", Some("remember this fact")).unwrap(),
            original
        );
    }

    #[test]
    fn refuses_ambiguous_or_missing_history_instead_of_starting_over() {
        let dir = tempfile::tempdir().unwrap();
        saved(dir.path(), "one", "/workspace", Some("same prompt"), false);
        saved(dir.path(), "two", "/workspace", Some("same prompt"), false);
        assert!(
            find_legacy_session(dir.path(), "/workspace", Some("same prompt"))
                .unwrap_err()
                .contains("Multiple")
        );
        assert!(find_legacy_session(dir.path(), "/different", Some("same prompt")).is_err());
    }

    #[test]
    fn missing_or_damaged_recorded_file_never_creates_a_replacement() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("db.sqlite")).unwrap();
        let session = session();
        let path = dir.path().join("missing.jsonl");
        db.put("prime_session", &session.id, &path).unwrap();
        assert!(prepare(&db, dir.path(), &session, provider(), true).is_err());
        std::fs::write(&path, "not json\n").unwrap();
        assert!(prepare(&db, dir.path(), &session, provider(), true).is_err());
        std::fs::write(&path, "").unwrap();
        assert!(prepare(&db, dir.path(), &session, provider(), true).is_err());
    }

    #[test]
    fn other_providers_keep_their_advertised_acp_recovery_methods() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("db.sqlite")).unwrap();
        let mut session = session();
        session.acp_session_id = Some("saved-acp-id".into());
        let mut provider = provider();
        provider.id = "custom".into();
        let launch = prepare(&db, dir.path(), &session, provider.clone(), true).unwrap();
        assert_eq!(launch.provider.args, provider.args);
        assert!(launch
            .request(&session, &AgentCapabilities::default(), true)
            .is_err());
        let mut caps = AgentCapabilities::default();
        caps.resume_session = true;
        assert_eq!(
            launch.request(&session, &caps, true).unwrap().0,
            "session/resume"
        );
        caps.load_session = true;
        let (method, params) = launch.request(&session, &caps, true).unwrap();
        assert_eq!(method, "session/load");
        assert_eq!(params["sessionId"], "saved-acp-id");
    }

    #[test]
    fn legacy_recovery_records_the_matching_file_and_keeps_provider_arguments() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("db.sqlite")).unwrap();
        let session = session();
        let original = saved(
            dir.path(),
            "original",
            &session.cwd,
            Some("original task"),
            false,
        );
        saved(dir.path(), "retry", &session.cwd, None, false);
        db.event(&session.id, "user_message", json!({"text":"original task"}))
            .unwrap();
        let mut provider = provider();
        provider.args.extend([
            "--daemon-socket".into(),
            "/custom/prime.sock".into(),
            "--session-dir".into(),
            dir.path().to_string_lossy().into_owned(),
        ]);
        let args = provider.args.clone();
        let launch = prepare(&db, dir.path(), &session, provider, true).unwrap();
        assert!(launch.resumed);
        assert!(launch.provider.args.starts_with(&args));
        assert_eq!(
            db.get::<PathBuf>("prime_session", &session.id).unwrap(),
            original
        );
        assert_eq!(
            launch
                .request(&session, &AgentCapabilities::default(), true)
                .unwrap()
                .0,
            "session/new"
        );
        assert_eq!(db.events(&session.id, 0., 100).unwrap().len(), 1);
    }

    #[tokio::test]
    async fn reconnect_keeps_native_context_across_fresh_acp_ids() {
        use crate::acp::Rpc;
        use std::{
            sync::{Arc, Mutex},
            time::Duration,
        };
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("db.sqlite")).unwrap();
        let mut session = session();
        session.cwd = dir.path().to_string_lossy().into_owned();
        let events = Arc::new(Mutex::new(Vec::<Value>::new()));
        let launch = prepare(&db, dir.path(), &session, provider(), false).unwrap();
        let rpc = Rpc::start(&launch.provider, &session.cwd, Arc::new(|_, _| {}))
            .await
            .unwrap();
        let init = rpc
            .request("initialize", json!({}), Some(Duration::from_secs(5)))
            .await
            .unwrap();
        let caps = crate::capability(&init);
        assert!(!caps.load_session && !caps.resume_session);
        let (method, params) = launch.request(&session, &caps, false).unwrap();
        let response = rpc
            .request(method, params, Some(Duration::from_secs(5)))
            .await
            .unwrap();
        session.acp_session_id = response["sessionId"].as_str().map(str::to_owned);
        launch.remember(&db, &session).unwrap();
        let native = db.get::<PathBuf>("prime_session", &session.id).unwrap();
        let original_id = session.acp_session_id.clone();
        rpc.request("session/prompt",json!({"sessionId":session.acp_session_id,"prompt":[{"type":"text","text":"remember a blue lighthouse"}]}),Some(Duration::from_secs(5))).await.unwrap();
        db.event(
            &session.id,
            "user_message",
            json!({"text":"remember a blue lighthouse"}),
        )
        .unwrap();
        rpc.stop().await;
        for _ in 0..2 {
            let launch = prepare(&db, dir.path(), &session, provider(), true).unwrap();
            let output = events.clone();
            let rpc = Rpc::start(
                &launch.provider,
                &session.cwd,
                Arc::new(move |kind, value| {
                    if kind == "session/update" {
                        output.lock().unwrap().push(value);
                    }
                }),
            )
            .await
            .unwrap();
            rpc.request("initialize", json!({}), Some(Duration::from_secs(5)))
                .await
                .unwrap();
            let (method, params) = launch.request(&session, &caps, true).unwrap();
            assert_eq!(method, "session/new");
            let response = rpc
                .request(method, params, Some(Duration::from_secs(5)))
                .await
                .unwrap();
            session.acp_session_id = response["sessionId"].as_str().map(str::to_owned);
            assert_ne!(session.acp_session_id, original_id);
            rpc.request("session/prompt",json!({"sessionId":session.acp_session_id,"prompt":[{"type":"text","text":"what did I ask you to remember?"}]}),Some(Duration::from_secs(5))).await.unwrap();
            rpc.stop().await;
            assert_eq!(
                db.get::<PathBuf>("prime_session", &session.id).unwrap(),
                native
            );
        }
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .all(|v| v["update"]["content"]["text"]
                .as_str()
                .unwrap()
                .contains("blue lighthouse")));
        assert_eq!(
            std::fs::read_dir(dir.path().join("prime-sessions/chat"))
                .unwrap()
                .count(),
            1
        );
        assert_eq!(session.draft, "keep this draft");
        assert_eq!(db.events(&session.id, 0., 100).unwrap().len(), 1);
    }
}
