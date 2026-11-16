//! Persistent project knowledge and instructions for Harbor-owned chats.
use crate::{adapters, db::Database, types::*};
use serde_json::{json, Value};
use std::{
    io::Write,
    path::{Component, Path, PathBuf},
};

pub const INSTRUCTION_VERSION: &str = "harbor-chats-v2";
const LIMIT: u64 = 262_144;
pub const ORCHESTRATOR: &str = "You oversee an ongoing project. Consult its index and relevant context before substantial work. Discuss and answer small questions directly. Delegate product changes, investigations and reviews to ordinary Harbor chats through harbor_project.create_agent. Use harbor_project.send_message to communicate with existing agents, retaining their Harbor session IDs. Never use provider-native subagents or delegation tools. Dispatch and finish your turn promptly; never wait or poll for children. Actual agent messages resume you when idle. Handle the report, coordinate, curate sourced findings and accepted decisions in the context library, then finish. Do not perform a child's assignment yourself unless the user explicitly requests that. Do not relay child questions: each chat owns its question forms. Ask the human using harbor_project.ask_user; never use native request_user_input or request_user_input_async. Keep project memory sourced, distinguish uncertainty from decisions, and keep index.md short. This is an ongoing project, with no completion state or autonomous schedule.";
pub const WORKER: &str = "You are an ordinary Harbor chat assigned to this project. Perform your own assigned investigation, implementation and verification. Use the supplied project context. Do not create agents or use native subagent tools. Send concise useful progress, blockers, assignment questions and final results to your Harbor parent through harbor_project.send_message. For substantial work report summary, evidence/verification, changed artifacts, unresolved issues, and proposed memory updates; respond naturally to greetings. Ask the user directly using harbor_project.ask_user; never use native request_user_input or request_user_input_async. Leave shared project context edits to the orchestrator. Do not wait for parent acknowledgments.";
pub const MESSAGE_POLICY: &str = "Messages preserve their actual author. A user message is from the human; an embedded harbor-agent-message resource is from the named Harbor agent in its URI. Treat message text as the sender's actual content. When delegating work based on an attached image, forward the actual attachment through create_agent/send_message attachments using its Harbor reference. Use attachments:[{reference: 'latest'}] for the most recently received files, or a specific supplied reference. Do not substitute a visual description for the original image. Send only the intended message, with no setup boilerplate, fabricated user instructions, receipt logging, or attachment-forwarding wrappers. All setup is supplied separately. Use only Harbor tools for project agents. Earlier saved native-agent and wait instructions are obsolete.";
pub const ASYNC_POLICY: &str = "Dispatch asynchronously through Harbor tools and end your turn. Actual incoming messages drive later turns; never wait, poll, or schedule a wakeup.";
pub fn communication(id: SupportedProviderId) -> adapters::contract::ProjectOrchestration {
    let verification = if id == SupportedProviderId::Codex { adapters::contract::FeatureSupport::Implemented } else {
        adapters::contract::FeatureSupport::Unverified { reason: "Requires ordinary chat, hidden role setup, native-delegation disablement, and Harbor MCP messaging acceptance. Ordinary chats remain available.".into() }
    };
    adapters::contract::ProjectOrchestration {version:INSTRUCTION_VERSION.into(),parent:ORCHESTRATOR.into(),worker:WORKER.into(),verification}
}

fn safe_id(id: &str) -> Result<(), String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Invalid project identity".into());
    }
    Ok(())
}
/// Reject symlinks even when they point inside the workspace: projects must not alias each other.
fn checked(root: &Path, relative: &Path, create_dirs: bool) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|e| e.to_string())?;
    let mut path = root.clone();
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err("Invalid project document path".into());
        };
        path.push(name);
        match std::fs::symlink_metadata(&path) {
            Ok(meta) if meta.file_type().is_symlink() => {
                return Err("Project context cannot contain symlinks".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound && create_dirs => {
                std::fs::create_dir(&path).map_err(|e| e.to_string())?;
            }
            Err(e) => return Err(e.to_string()),
        }
        if !path
            .canonicalize()
            .map_err(|e| e.to_string())?
            .starts_with(&root)
        {
            return Err("Project document is outside its context directory".into());
        }
    }
    Ok(path)
}
pub fn directory(workspace: &str, project: &str, create: bool) -> Result<PathBuf, String> {
    safe_id(project)?;
    checked(
        Path::new(workspace),
        &Path::new(".harbor").join("projects").join(project),
        create,
    )
}
pub fn initialize(workspace: &str, project: &Project) -> Result<PathBuf, String> {
    let dir = directory(workspace, &project.id, true)?;
    let index = format!("# {}\n\n{}\n\n- [Decisions](decisions.md)\n- [Current understanding and open questions](current-state.md)\n", project.name, project.instructions.as_deref().filter(|s| !s.trim().is_empty()).unwrap_or("An ongoing area of work. Add the project's purpose and useful references here."));
    for (name, content) in [
        ("index.md", index.as_str()),
        (
            "decisions.md",
            "# Decisions\n\nRecord accepted decisions, rationale, dates, and sources.\n",
        ),
        (
            "current-state.md",
            "# Current understanding\n\n## Findings\n\n## Open questions\n",
        ),
        ("orchestrator.md", ORCHESTRATOR),
        ("worker.md", WORKER),
    ] {
        let path = dir.join(name);
        if std::fs::symlink_metadata(&path).is_ok() {
            document(&dir, name)?;
            continue;
        }
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(path)
        {
            Ok(mut file) => {
                file.write_all(content.as_bytes())
                    .map_err(|e| e.to_string())?;
                file.sync_all().map_err(|e| e.to_string())?;
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                document(&dir, name)?;
            }
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(dir)
}
pub fn document(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if !name.ends_with(".md") {
        return Err("Project context documents must be Markdown files".into());
    }
    let path = checked(dir, Path::new(name), false)?;
    let meta = path.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > LIMIT {
        return Err("Project document must be a file no larger than 256 KiB".into());
    }
    Ok(path)
}
pub fn read(dir: &Path, name: &str) -> Result<String, String> {
    std::fs::read_to_string(document(dir, name)?).map_err(|e| e.to_string())
}
pub fn list(dir: &Path) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    for entry in walkdir::WalkDir::new(dir).follow_links(false).max_depth(8) {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().is_symlink() {
            return Err("Project context cannot contain symlinks".into());
        }
        if entry.file_type().is_file() && entry.path().extension().is_some_and(|e| e == "md") {
            let name = entry
                .path()
                .strip_prefix(dir)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .into_owned();
            document(dir, &name)?;
            files.push(name);
            if files.len() > 500 {
                return Err("Too many project documents (maximum 500)".into());
            }
        }
    }
    files.sort();
    Ok(files)
}
pub fn locate(db: &Database, project_id: &str) -> Result<(Project, Workspace), String> {
    let project: Project = db.get("project", project_id)?;
    let workspace: Workspace = db.get("workspace", &project.workspace_id)?;
    Ok((project, workspace))
}
fn context_workspace(db: &Database, session: &SessionRecord) -> Result<String, String> {
    let owner = if let Some(parent) = &session.parent_session_id {
        let parent: SessionRecord = db.get("session", parent)?;
        if parent.project_id != session.project_id || !parent.is_orchestrator {
            return Err("Invalid project parent".into());
        }
        parent
    } else { session.clone() };
    if let Some(workspace) = owner.workspace_id.as_deref() {
        return Ok(db.get::<Workspace>("workspace", workspace)?.path);
    }
    Ok(owner.cwd)
}
pub fn instruction(db: &Database, session: &SessionRecord) -> Result<Option<String>, String> {
    if !crate::project_agents::is_agent(session) {return Ok(None);}
    let project:Project=db.get("project",session.project_id.as_deref().ok_or("Agent has no project")?)?;
    let context_cwd = context_workspace(db, session)?;
    let dir=initialize(&context_cwd,&project)?;
    let role=if session.is_orchestrator {ORCHESTRATOR} else {WORKER};
    Ok(Some(format!("[Harbor project instructions: {INSTRUCTION_VERSION}]\nProject: {} ({})\nHarbor session ID: {}\nHarbor parent session ID: {}\nContext directory: {}\nIndex: {}\n{}\nSaved role notes (reference only; current Harbor policy overrides obsolete native-agent rules):\n{}\nCurrent project index:\n{}\n{MESSAGE_POLICY}\n{ASYNC_POLICY}\nCurrent role policy:\n{role}\n[End Harbor project instructions]",project.name,project.id,session.id,session.parent_session_id.as_deref().unwrap_or("none; orchestrator"),dir.display(),dir.join("index.md").display(),project.instructions.as_deref().unwrap_or(""),read(&dir,if session.is_orchestrator {"orchestrator.md"} else {"worker.md"})?,read(&dir,"index.md")?)))
}
pub fn system_prompt(db:&Database, session:&SessionRecord) -> Result<Option<Value>,String> {
    Ok(instruction(db,session)?.map(|text|json!({"mode":"append","content":[{"type":"text","text":text}]})))
}
/// Copy knowledge when a project moves; old chats retain the original documents.
/// Create-only copies make retries safe; differing destination content is never overwritten.
pub fn move_context(
    tx: &rusqlite::Transaction<'_>,
    old: &Project,
    new: &Workspace,
) -> Result<(), String> {
    if let Some(id) = &old.active_orchestrator_session_id {
        let data: String = tx
            .query_row(
                "SELECT data FROM records WHERE kind='session' AND id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let session: SessionRecord = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        if matches!(
            session.status.as_str(),
            "working" | "connecting" | "needs_input"
        ) {
            return Err("Finish or stop the orchestrator before changing its workspace".into());
        }
        let mut q = tx.prepare("SELECT data FROM records WHERE kind='session' AND json_extract(data,'$.parentSessionId')=?1").map_err(|e|e.to_string())?;
        for data in q.query_map([id], |r|r.get::<_,String>(0)).map_err(|e|e.to_string())? {
            let child: SessionRecord = serde_json::from_str(&data.map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
            if !child.archived && matches!(child.status.as_str(), "working" | "connecting" | "needs_input") {
                return Err("Finish or stop active agents before changing this project's workspace".into());
            }
        }
    }
    let data: String = tx
        .query_row(
            "SELECT data FROM records WHERE kind='workspace' AND id=?1",
            [&old.workspace_id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    let workspace: Workspace = serde_json::from_str(&data).map_err(|e| e.to_string())?;
    let relative = Path::new(".harbor").join("projects").join(&old.id);
    if !Path::new(&workspace.path)
        .join(&relative)
        .try_exists()
        .map_err(|e| e.to_string())?
    {
        return Ok(());
    }
    let source = directory(&workspace.path, &old.id, false)?;
    let destination = directory(&new.path, &old.id, true)?;
    for name in list(&source)? {
        let content = read(&source, &name)?;
        let path = Path::new(&name);
        if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
            checked(&destination, parent, true)?;
        }
        let target = destination.join(path);
        if std::fs::symlink_metadata(&target).is_ok() {
            if read(&destination, &name)? != content {
                return Err(format!("Destination context already differs: {name}"));
            }
        } else {
            let mut file = std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(target)
                .map_err(|e| e.to_string())?;
            file.write_all(content.as_bytes())
                .map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Resolve the runtime bundled with the ACP adapter, rather than the unrelated global CLI.
/// Mirrors Node module resolution for the package paths used by the verified adapters.
async fn runtime_version(provider: &ProviderDefinition) -> Option<String> {
    let id = require_provider(&provider.id).ok()?;
    // These CLIs serve ACP from the same binary as the native runtime.
    if matches!(id, SupportedProviderId::Grok | SupportedProviderId::OpenCode) {
        return adapters::version(&provider.command, &["--version"]).await;
    }
    let override_key = if id == SupportedProviderId::Codex {
        "CODEX_PATH"
    } else {
        "CLAUDE_CODE_EXECUTABLE"
    };
    if std::env::var_os(override_key).is_some() {
        return None;
    }
    let executable = crate::acp::resolve_executable(&provider.command)?
        .canonicalize()
        .ok()?;
    let package = if id == SupportedProviderId::Codex {
        "@openai/codex/bin/codex.js"
    } else {
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        {
            "@anthropic-ai/claude-agent-sdk-darwin-arm64/claude"
        }
        #[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
        {
            return None;
        }
    };
    for parent in executable.ancestors().skip(1) {
        let candidate = parent.join("node_modules").join(package);
        if candidate.is_file() {
            return adapters::version(&candidate.to_string_lossy(), &["--version"]).await;
        }
    }
    None
}
pub async fn support(provider: &ProviderDefinition) -> Result<Value, String> {
    let adapter = adapters::resolve(&provider.id)?;
    let (acp, native) = tokio::join!(
        adapters::version(&provider.command, adapter.version_args()),
        runtime_version(provider)
    );
    let verified = provider.id == "codex" && acp.is_some() && native.is_some();
    let reason=if verified {"Ordinary Codex chats and Harbor MCP messaging are available.".to_owned()} else {"Harbor-owned agent messaging has not passed live acceptance for this provider installation. Ordinary chats remain available.".to_owned()};
    Ok(json!({"verified":verified,"instructionVersion":INSTRUCTION_VERSION,"adapterVersion":acp,"nativeVersion":native,"reason":reason}))
}

#[tauri::command]
pub async fn initialize_project_context(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    project_id: String,
) -> Result<(), String> {
    let _guard = state.operations.project(&project_id).await;
    let (project, workspace) = locate(&state.db, &project_id)?;
    tokio::task::spawn_blocking(move || initialize(&workspace.path, &project).map(|_| ()))
        .await
        .map_err(|e| e.to_string())?
}
fn context_for(
    db: &Database,
    project_id: &str,
    session_id: Option<&str>,
) -> Result<PathBuf, String> {
    if let Some(session_id) = session_id {
        let session: SessionRecord = db.get("session", session_id)?;
        if !crate::project_agents::is_agent(&session) || session.project_id.as_deref() != Some(project_id) {
            return Err("Conversation does not belong to this project".into());
        }
        directory(&context_workspace(db, &session)?, project_id, false)
    } else {
        let (project, workspace) = locate(db, project_id)?;
        directory(&workspace.path, &project.id, false)
    }
}
#[tauri::command]
pub async fn project_documents(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    project_id: String,
    session_id: Option<String>,
) -> Result<Vec<String>, String> {
    let dir = context_for(&state.db, &project_id, session_id.as_deref())?;
    tokio::task::spawn_blocking(move || list(&dir))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn read_project_document(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    project_id: String,
    path: String,
    session_id: Option<String>,
) -> Result<String, String> {
    let dir = context_for(&state.db, &project_id, session_id.as_deref())?;
    tokio::task::spawn_blocking(move || read(&dir, &path))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn open_project_document(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    project_id: String,
    path: String,
    session_id: Option<String>,
) -> Result<(), String> {
    let dir = context_for(&state.db, &project_id, session_id.as_deref())?;
    let settings: Value = state.db.get("settings", "app").unwrap_or(json!({}));
    let editor = settings["editor"].as_str().unwrap_or("code").to_owned();
    tokio::task::spawn_blocking(move || {
        let file = document(&dir, &path)?;
        crate::editors::open(&editor, &file)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn open_project_orchestrator(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    project_id: String,
) -> Result<Option<SessionRecord>, String> {
    let (project, _) = locate(&state.db, &project_id)?;
    project
        .active_orchestrator_session_id
        .as_deref()
        .map(|id| state.db.get::<SessionRecord>("session", id))
        .transpose()
        .map(|s| s.filter(|s| !s.archived))
}
#[tauri::command]
pub async fn project_provider_support(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    provider_id: String,
) -> Result<Value, String> {
    support(&state.provider(&provider_id)?).await
}
#[tauri::command]
pub async fn create_project_orchestrator(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    project_id: String,
    provider_id: String,
    title: String,
    initial_config: Option<Value>,
    fresh: bool,
    expected_session_id: Option<String>,
) -> Result<SessionRecord, String> {
    use tauri::Emitter;
    let _guard = state.operations.project(&project_id).await;
    let (mut project, workspace) = locate(&state.db, &project_id)?;
    let previous = project
        .active_orchestrator_session_id
        .as_deref()
        .map(|id| state.db.get::<SessionRecord>("session", id))
        .transpose()?;
    if fresh {
        ensure_expected(previous.as_ref(), expected_session_id.as_deref())?;
    }
    if !fresh {
        if let Some(session) = &previous {
            if !session.archived {
                return Ok(session.clone());
            }
        }
    }
    let _previous_guard = if let Some(session) = &previous {
        Some(state.operations.session(&session.id).await)
    } else {
        None
    };
    if let Some(session) = &previous {
        ensure_idle(&state.db, session)?;
    }
    let _provider_guard = state.operations.provider(&provider_id).await;
    let provider = state.provider(&provider_id)?;
    let status = support(&provider).await?;
    if status["verified"] != true {
        return Err(status["reason"]
            .as_str()
            .unwrap_or("Provider project support is unverified")
            .into());
    }
    let copy = project.clone();
    let path = workspace.path.clone();
    tokio::task::spawn_blocking(move || initialize(&path, &copy))
        .await
        .map_err(|e| e.to_string())??;
    let session = crate::create_session_impl(
        state.inner(),
        Some(workspace.id),
        provider_id,
        title,
        false,
        String::new(),
        String::new(),
        initial_config,
        Some(project_id),
        true,
    )
    .await?;
    if session.error.is_some() || session.acp_session_id.is_none() {
        return Err(session.error.unwrap_or("Could not establish the project conversation. Retry to keep the previous orchestrator.".into()));
    }
    // Re-read after connection; the project lock prevents edits and competing creates.
    project.active_orchestrator_session_id = Some(session.id.clone());
    state.db.put("project", &project.id, &project)?;
    let _ = state.app.emit("project-changed", &project);
    Ok(session)
}
fn ensure_expected(previous: Option<&SessionRecord>, expected: Option<&str>) -> Result<(), String> {
    if previous.filter(|s| !s.archived).map(|s| s.id.as_str()) != expected {
        return Err("The project's active conversation changed. Reopen the project before starting fresh; your draft is preserved.".into());
    }
    Ok(())
}
pub fn ensure_idle(db: &Database, session: &SessionRecord) -> Result<(), String> {
    if matches!(
        session.status.as_str(),
        "working" | "connecting" | "needs_input"
    ) || db.list::<SessionRecord>("session")?.iter().any(|s|s.parent_session_id.as_deref()==Some(&session.id) && !s.archived && matches!(s.status.as_str(),"working"|"connecting"|"needs_input"))
    {
        return Err(
            "Finish or stop the orchestrator and its active workers before starting fresh".into(),
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn setup() -> (tempfile::TempDir, Database, Project) {
        let folder = tempfile::tempdir().unwrap();
        let db = Database::open(&folder.path().join("test.sqlite")).unwrap();
        let project = db
            .save_project(
                None,
                "Billing",
                "folder",
                "gray",
                folder.path().to_str().unwrap(),
            )
            .unwrap();
        (folder, db, project)
    }
    #[test]
    fn projects_share_workspace_but_never_knowledge_and_initialization_preserves_edits() {
        let (folder, db, project) = setup();
        let cwd = folder.path().to_str().unwrap();
        let other = db
            .save_project(None, "Onboarding", "folder", "gray", cwd)
            .unwrap();
        assert_eq!(project.workspace_id, other.workspace_id);
        let first = initialize(cwd, &project).unwrap();
        let second = initialize(cwd, &other).unwrap();
        std::fs::write(
            first.join("decisions.md"),
            "Accepted billing decision\nsource: user",
        )
        .unwrap();
        initialize(cwd, &project).unwrap();
        assert!(read(&first, "decisions.md")
            .unwrap()
            .contains("Accepted billing"));
        assert!(!read(&second, "decisions.md")
            .unwrap()
            .contains("Accepted billing"));
        assert!(document(&first, "../index.md").is_err());
        assert!(document(&first, second.join("index.md").to_str().unwrap()).is_err());
        assert!(directory(cwd, "../escape", true).is_err());
    }
    #[test]
    fn document_limits_and_nested_references() {
        let (folder, _, project) = setup();
        let dir = initialize(folder.path().to_str().unwrap(), &project).unwrap();
        std::fs::create_dir(dir.join("references")).unwrap();
        std::fs::write(dir.join("references/design.md"), "# Design").unwrap();
        assert!(list(&dir).unwrap().contains(&"references/design.md".into()));
        std::fs::write(dir.join("large.md"), vec![b'x'; LIMIT as usize + 1]).unwrap();
        assert!(read(&dir, "large.md").is_err());
        assert!(document(&dir, "references").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_alias_another_project_or_escape_at_any_level() {
        use std::os::unix::fs::symlink;
        let (folder, _, project) = setup();
        let cwd = folder.path().to_str().unwrap();
        let external = tempfile::tempdir().unwrap();
        symlink(external.path(), folder.path().join(".harbor")).unwrap();
        assert!(initialize(cwd, &project).is_err());
        std::fs::remove_file(folder.path().join(".harbor")).unwrap();
        let dir = initialize(cwd, &project).unwrap();
        symlink(dir.join("index.md"), dir.join("alias.md")).unwrap();
        assert!(read(&dir, "alias.md").is_err());
        assert!(list(&dir).is_err());
        std::fs::remove_file(dir.join("worker.md")).unwrap();
        symlink(dir.join("index.md"), dir.join("worker.md")).unwrap();
        assert!(initialize(cwd, &project).is_err());
    }
    fn session(project: &Project, cwd: &str) -> SessionRecord {
        serde_json::from_value(json!({"id":"orchestrator","isOrchestrator":true,"projectId":project.id,"workspaceId":project.workspace_id,"providerId":"codex","cwd":cwd,"title":"Billing","status":"idle","mode":"gui","createdAt":0,"updatedAt":0,"configOptions":[],"modes":null,"models":null,"capabilities":AgentCapabilities::default(),"error":null,"draft":"","scrollTop":0,"reviewOpen":false,"archived":false})).unwrap()
    }
    #[test]
    fn prompts_refresh_index_without_affecting_ordinary_chats_or_visible_input() {
        let (folder, db, project) = setup();
        let cwd = folder.path().to_str().unwrap();
        let mut session = session(&project, cwd);
        let initial = instruction(&db, &session).unwrap().unwrap();
        assert!(
            initial.contains(INSTRUCTION_VERSION)
                && !initial.contains(WORKER)
                && initial.contains("harbor_project.create_agent")
        );
        let dir = directory(cwd, &project.id, false).unwrap();
        std::fs::write(dir.join("index.md"), "Fresh discovery with source: user").unwrap();
        assert!(instruction(&db, &session)
            .unwrap()
            .unwrap()
            .contains("Fresh discovery"));
        std::fs::write(dir.join("orchestrator.md"), "Legacy rule: Every delegation includes FULL worker instructions.").unwrap();
        let refreshed=instruction(&db,&session).unwrap().unwrap();
        assert!(refreshed.rfind(MESSAGE_POLICY).unwrap() > refreshed.find("Legacy rule").unwrap());
        let hidden=system_prompt(&db,&session).unwrap().unwrap();
        assert!(hidden.to_string().contains("Harbor project instructions"));
        assert!(hidden.to_string().contains(ORCHESTRATOR));
        assert!(!hidden.to_string().contains(WORKER));
        let mut root = session.clone(); root.id = "root".into(); db.put("session", "root", &root).unwrap();
        session.is_orchestrator=false;session.parent_session_id=Some("root".into());
        let worker=instruction(&db,&session).unwrap().unwrap();
        assert!(worker.contains(WORKER));assert!(worker.contains("Harbor parent session ID: root"));
        session.parent_session_id=None;
        session.is_orchestrator = false;
        assert!(instruction(&db, &session).unwrap().is_none());
        assert!(system_prompt(&db,&session).unwrap().is_none());
    }
    #[test]
    fn moving_project_preserves_original_context_and_requires_fresh_orchestrator() {
        let (folder, db, mut project) = setup();
        let cwd = folder.path().to_str().unwrap();
        let mut session = session(&project, cwd);
        db.put("session", &session.id, &session).unwrap();
        project.active_orchestrator_session_id = Some(session.id.clone());
        db.put("project", &project.id, &project).unwrap();
        let source = initialize(cwd, &project).unwrap();
        std::fs::write(source.join("decisions.md"), "Remember this decision").unwrap();
        let other = tempfile::tempdir().unwrap();
        let path = other.path().to_str().unwrap();
        session.status = "working".into();
        db.put("session", &session.id, &session).unwrap();
        assert!(db
            .save_project(Some(&project.id), "Billing", "folder", "gray", path)
            .is_err());
        session.status = "idle".into();
        db.put("session", &session.id, &session).unwrap();
        let moved = db
            .save_project(Some(&project.id), "Billing", "folder", "gray", path)
            .unwrap();
        assert!(moved.active_orchestrator_session_id.is_none());
        assert_eq!(
            read(
                &directory(path, &project.id, false).unwrap(),
                "decisions.md"
            )
            .unwrap(),
            "Remember this decision"
        );
        assert_eq!(
            read(&source, "decisions.md").unwrap(),
            "Remember this decision"
        );
        let old: SessionRecord = db.get("session", &session.id).unwrap();
        assert_eq!(old.cwd, cwd);
        assert!(instruction(&db, &old)
            .unwrap()
            .unwrap()
            .contains(source.to_str().unwrap()));
    }
    #[test]
    fn child_context_uses_the_saved_workspace_identity_even_in_an_explicit_worktree() {
        let (folder, db, project) = setup();
        let worktree = tempfile::tempdir().unwrap();
        let root = session(&project, worktree.path().to_str().unwrap());
        db.put("session", &root.id, &root).unwrap();
        let mut child = root.clone(); child.id="child".into(); child.is_orchestrator=false; child.parent_session_id=Some(root.id.clone());
        let instructions = instruction(&db, &child).unwrap().unwrap();
        let shared = directory(folder.path().to_str().unwrap(), &project.id, false).unwrap();
        assert!(instructions.contains(shared.to_str().unwrap()));
        db.put("session", &child.id, &child).unwrap();
        assert_eq!(context_for(&db, &project.id, Some(&child.id)).unwrap(), shared);
        assert!(!worktree.path().join(".harbor").exists());
    }
    #[test]
    fn active_worker_prevents_fresh_conversation_and_moving_workspace() {
        let (folder, db, project) = setup();
        let session = session(&project, folder.path().to_str().unwrap());
        db.put("session", &session.id, &session).unwrap();
        let mut child = session.clone();
        child.id = "child".into(); child.is_orchestrator = false;
        child.parent_session_id = Some(session.id.clone()); child.status = "working".into();
        db.put("session", &child.id, &child).unwrap();
        assert!(ensure_idle(&db, &session).is_err());
        let mut project=project;project.active_orchestrator_session_id=Some(session.id.clone());db.put("project",&project.id,&project).unwrap();
        let destination=tempfile::tempdir().unwrap();
        assert!(db.save_project(Some(&project.id), "Billing", "folder", "gray", destination.path().to_str().unwrap()).is_err());
    }
    #[test]
    fn migration_preserves_history_and_is_repeatable() {
        let (folder, db, project) = setup();
        let s = session(&project, folder.path().to_str().unwrap());
        let mut record = serde_json::to_value(&s).unwrap();
        record.as_object_mut().unwrap().remove("isOrchestrator");
        db.put("session", &s.id, &record).unwrap();
        let mut p = serde_json::to_value(&project).unwrap();
        p.as_object_mut()
            .unwrap()
            .remove("activeOrchestratorSessionId");
        db.put("project", &project.id, &p).unwrap();
        db.0.lock()
            .unwrap()
            .pragma_update(None, "user_version", 3)
            .unwrap();
        drop(db);
        for _ in 0..2 {
            let db = Database::open(&folder.path().join("test.sqlite")).unwrap();
            assert!(
                !db.get::<SessionRecord>("session", &s.id)
                    .unwrap()
                    .is_orchestrator
            );
            assert!(db
                .get::<Project>("project", &project.id)
                .unwrap()
                .active_orchestrator_session_id
                .is_none());
        }
    }
}

#[cfg(test)]
mod project_title_tests {
    use super::*;
    #[test]
    fn native_project_titles_cannot_replace_the_user_facing_title() {
        let temp = tempfile::tempdir().unwrap();
        let db = Database::open(&temp.path().join("test.sqlite")).unwrap();
        db.put("session","chat",&json!({"id":"chat","isOrchestrator":true,"projectId":"project","providerId":"codex","cwd":"/tmp","title":"Original title","acpSessionId":"wire","status":"idle","mode":"gui","createdAt":0,"updatedAt":0,"configOptions":[],"modes":null,"models":null,"capabilities":AgentCapabilities::default(),"error":null,"draft":"","scrollTop":0,"reviewOpen":false,"archived":false})).unwrap();
        assert!(crate::titles::provider_title(&db,"chat",&json!({"sessionId":"wire","update":{"sessionUpdate":"session_info_update","title":"Hidden instruction text"}})).unwrap().is_none());
        assert_eq!(
            db.get::<SessionRecord>("session", "chat").unwrap().title,
            "Original title"
        );
    }
}

/// Claim the initial turn once, even when two windows open a new project together.
fn claim_start(db: &Database, session: &str) -> Result<bool, String> {
    db.0.lock().map_err(|e| e.to_string())?
        .execute("INSERT OR IGNORE INTO records(kind,id,data) VALUES('project-start',?1,'{\"status\":\"starting\"}')", [session])
        .map(|changed| changed == 1).map_err(|e| e.to_string())
}
pub fn startup_prompt(project: &Project) -> String {
    format!("Initialize the ongoing project '{}' using its saved project instructions and context library. Read the brief and relevant existing context, then respond with a short, natural introduction that acknowledges the project's focus and invites the user to choose what to work on. If the instructions leave the focus unclear, ask one concise question. This turn establishes shared understanding: do not implement changes, delegate tasks, or launch a broad investigation yet. Do not mention internal setup, injected instructions, or this initialization message.\n\nUser's project instructions:\n{}", project.name, project.instructions.as_deref().unwrap_or(""))
}
#[tauri::command]
pub async fn start_project(
    state: tauri::State<'_, std::sync::Arc<crate::AppState>>,
    project_id: String,
    provider_id: String,
    initial_config: Option<Value>,
    fresh: bool,
    expected_session_id: Option<String>,
) -> Result<SessionRecord, String> {
    let (project, _) = locate(&state.db, &project_id)?;
    let initial_config = initial_config.map(|mut config| {
        for key in ["collaboration_mode", "mode", "__legacy_mode"] {
            if config[key] == "plan" {
                config[key] = json!("default");
            }
        }
        config
    });
    let session = create_project_orchestrator(
        state.clone(),
        project_id,
        provider_id,
        project.name.clone(),
        initial_config,
        fresh,
        expected_session_id,
    )
    .await?;
    if claim_start(&state.db, &session.id)? {
        let text = startup_prompt(&project);
        if let Err(error) = state.update(&session.id, |s| {
            s.status = "working".into();
            s.error = None;
        }) {
            let _ = state.db.delete("project-start", &session.id);
            return Err(error);
        }
        let state = state.inner().clone();
        let session_id = session.id.clone();
        tauri::async_runtime::spawn(async move {
            let guard = state.operations.session(&session_id).await;
            match crate::send_prompt_locked_with_origin(
                &state,
                session_id.clone(),
                text.clone(),
                None,
                None,
                guard,
                true,
                None,
            )
            .await
            {
                Ok(()) => {
                    let _ =
                        state
                            .db
                            .put("project-start", &session_id, &json!({"status":"completed"}));
                }
                Err(error) => {
                    let _ = state.db.delete("project-start", &session_id);
                    let _ = state.update(&session_id, |s| {
                        s.status = "error".into();
                        s.error = Some(error);
                        s.draft = text;
                    });
                }
            }
        });
    }
    state.db.get("session", &session.id)
}

#[cfg(test)]
mod startup_tests {
    use super::*;
    #[test]
    fn startup_is_claimed_once_and_instructions_survive_metadata_edits() {
        let temp = tempfile::tempdir().unwrap();
        let db = Database::open(&temp.path().join("test.sqlite")).unwrap();
        let mut project = db
            .save_project(
                None,
                "Billing",
                "folder",
                "gray",
                temp.path().to_str().unwrap(),
            )
            .unwrap();
        project.instructions = Some("Oversee organization billing and remember decisions.".into());
        db.put("project", &project.id, &project).unwrap();
        let edited = db
            .save_project(
                Some(&project.id),
                "Billing team",
                "folder",
                "blue",
                temp.path().to_str().unwrap(),
            )
            .unwrap();
        assert_eq!(edited.instructions, project.instructions);
        let dir = initialize(temp.path().to_str().unwrap(), &edited).unwrap();
        assert!(read(&dir, "index.md")
            .unwrap()
            .contains("Oversee organization billing"));
        assert!(claim_start(&db, "new-session").unwrap());
        assert!(!claim_start(&db, "new-session").unwrap());
    }

}

