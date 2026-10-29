use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;

/// Public command payloads generated together with the record/event boundary.
#[allow(dead_code)]
#[derive(TS)]
#[ts(
    export,
    export_to = "../../src/lib/bindings/",
    tag = "command",
    content = "args",
    rename_all = "snake_case"
)]
pub enum CommandRequest {
    Bootstrap,
    SaveProject {
        #[ts(rename = "projectId")]
        project_id: Option<String>,
        name: String,
        icon: String,
        color: String,
        #[ts(rename = "workspacePath")]
        workspace_path: String,
    },
    SaveWorkspace {
        path: String,
    },
    SaveProvider {
        provider: ProviderDefinition,
    },
    SaveSettings {
        settings: Value,
    },
    ListEditors,
    ProbeProvider {
        #[ts(rename = "providerId")]
        provider_id: SupportedProviderId,
    },
    DiscoverProviderConfig {
        #[ts(rename = "providerId")]
        provider_id: SupportedProviderId,
        selections: Value,
    },
    DiscoverCommands {
        #[ts(rename = "providerId")]
        provider_id: SupportedProviderId,
        cwd: Option<String>,
    },
    CreateSession {
        #[ts(rename = "workspaceId")]
        workspace_id: Option<String>,
        #[ts(rename = "providerId")]
        provider_id: SupportedProviderId,
        title: String,
        #[ts(rename = "newWorktree")]
        new_worktree: bool,
        branch: String,
        base: String,
        #[ts(rename = "initialConfig")]
        initial_config: Option<Value>,
    },
    Reconnect {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    Authenticate {
        #[ts(rename = "sessionId")]
        session_id: String,
        #[ts(rename = "methodId")]
        method_id: String,
    },
    SetConfig {
        #[ts(rename = "sessionId")]
        session_id: String,
        #[ts(rename = "configId")]
        config_id: String,
        value: Value,
    },
    SubmitPrompt {
        #[ts(rename = "sessionId")] session_id: String,
        #[ts(rename = "childId")] child_id: Option<String>,
        text: String,
        #[ts(optional)] attachments: Option<Vec<PromptAttachment>>,
        intent: crate::prompt_queue::SubmissionIntent,
    },
    GetPromptQueue {
        #[ts(rename = "sessionId")] session_id: String,
        #[ts(rename = "childId")] child_id: Option<String>,
    },
    RemoveQueuedPrompt {
        #[ts(rename = "sessionId")] session_id: String,
        #[ts(rename = "childId")] child_id: Option<String>,
        id: String,
    },
    BeginQueuedEdit {
        #[ts(rename = "sessionId")] session_id: String,
        #[ts(rename = "childId")] child_id: Option<String>,
        id: String,
    },
    EndQueuedEdit {
        #[ts(rename = "sessionId")] session_id: String,
        #[ts(rename = "childId")] child_id: Option<String>,
        id: String,
        text: Option<String>,
        attachments: Option<Vec<PromptAttachment>>,
        steer: bool,
    },
    SteerQueuedPrompt {
        #[ts(rename = "sessionId")] session_id: String,
        #[ts(rename = "childId")] child_id: Option<String>,
        id: String,
    },
    ResumePromptQueue {
        #[ts(rename = "sessionId")] session_id: String,
        #[ts(rename = "childId")] child_id: Option<String>,
    },
    HoldPromptQueue {
        #[ts(rename = "sessionId")] session_id: String,
        blocked: bool,
    },
    SendPrompt {
        #[ts(rename = "sessionId")]
        session_id: String,
        text: String,
        #[ts(optional)]
        attachments: Option<Vec<PromptAttachment>>,
    },
    OpenSubagent {
        #[ts(rename = "sessionId")]
        session_id: String,
        #[ts(rename = "childId")]
        child_id: String,
    },
    SendSubagentPrompt {
        #[ts(rename = "sessionId")]
        session_id: String,
        #[ts(rename = "childId")]
        child_id: String,
        text: String,
        #[ts(optional)]
        attachments: Option<Vec<PromptAttachment>>,
    },
    CancelTurn {
        #[ts(rename = "sessionId")]
        session_id: String,
        #[ts(rename = "childId")]
        child_id: Option<String>,
    },
    AnswerRequest {
        #[ts(rename = "sessionId")]
        session_id: String,
        #[ts(rename = "requestId")]
        request_id: Value,
        result: Value,
    },
    GetEvents {
        #[ts(rename = "sessionId")]
        session_id: String,
        after: f64,
        #[ts(optional)]
        limit: Option<u32>,
    },
    GetRecentEvents {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    ExportTranscript {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    SaveSessionUi {
        #[ts(rename = "sessionId")]
        session_id: String,
        draft: String,
        #[ts(rename = "scrollTop")]
        scroll_top: f64,
        #[ts(rename = "reviewOpen")]
        review_open: bool,
    },
    DeleteSession {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    SessionHasUncommittedChanges {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    RestoreArchive {
        #[ts(rename = "archiveId")]
        archive_id: String,
    },
    RestoreChat {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    ListBranches {
        #[ts(rename = "workspaceId")]
        workspace_id: String,
    },
    ListWorktrees {
        #[ts(rename = "workspaceId")]
        workspace_id: String,
    },
    GetReview {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    ReadFile {
        #[ts(rename = "sessionId")]
        session_id: String,
        path: String,
    },
    ReadMessageImage {
        #[ts(rename = "sessionId")]
        session_id: String,
        #[ts(rename = "childId")]
        child_id: Option<String>,
        source: String,
    },
    OpenInEditor {
        #[ts(rename = "sessionId")]
        session_id: String,
        path: String,
    },
    EnterTerminal {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    CreateShellTerminal {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    ListDetachedTabs {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    GetDetachedTab,
    FocusTaskTab {
        #[ts(rename = "sessionId")]
        session_id: String,
        #[ts(rename = "tabId")]
        tab_id: String,
    },
    DetachTaskTab {
        #[ts(rename = "sessionId")]
        session_id: String,
        #[ts(rename = "tabId")]
        tab_id: String,
        draft: Option<String>,
        attachments: Vec<PromptAttachment>,
        x: f64,
        y: f64,
    },
    ListToolProcesses {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    StopToolProcess {
        #[ts(rename = "sessionId")]
        session_id: String,
        #[ts(rename = "processId")]
        process_id: String,
    },
    ListShellTerminals {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    CloseShellTerminal {
        #[ts(rename = "terminalId")]
        terminal_id: String,
    },
    TerminalStatus {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    TerminalSnapshot {
        #[ts(rename = "sessionId")]
        session_id: String,
    },
    TerminalInput {
        #[ts(rename = "sessionId")]
        session_id: String,
        data: String,
    },
    TerminalResize {
        #[ts(rename = "sessionId")]
        session_id: String,
        rows: u16,
        cols: u16,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct PromptAttachment {
    pub name: String,
    pub mime_type: String,
    pub data: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct ProviderDefinition {
    pub id: String,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub native_command: String,
    pub install_hint: String,
    pub color: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub workspace_id: String,
    pub icon: String,
    pub color: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct Workspace {
    pub id: String,
    pub path: String,
    pub name: String,
    pub last_used_at: f64,
    #[serde(default)]
    pub available: bool,
    #[serde(default)]
    pub is_git_root: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct AgentCapabilities {
    pub load_session: bool,
    pub resume_session: bool,
    pub config_options: bool,
    pub native_handoff: bool,
    pub native_handoff_reason: String,
    pub raw: Value,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct SessionRecord {
    pub id: String,
    pub title: String,
    pub project_id: Option<String>,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[serde(default)]
    pub is_git: bool,
    pub provider_id: String,
    pub cwd: String,
    pub acp_session_id: Option<String>,
    pub native_session_id: Option<String>,
    pub worktree_id: Option<String>,
    pub status: String,
    pub mode: String,
    pub created_at: f64,
    pub updated_at: f64,
    pub config_options: Value,
    pub modes: Value,
    pub models: Value,
    pub capabilities: AgentCapabilities,
    pub error: Option<String>,
    pub draft: String,
    pub scroll_top: f64,
    pub review_open: bool,
    pub archived: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct SessionEvent {
    pub sequence: f64,
    pub session_id: String,
    pub kind: String,
    pub payload: Value,
    pub timestamp: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct RecentEvents {
    pub events: Vec<SessionEvent>,
    pub has_earlier: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct SubagentRecord {
    pub session_id: String,
    pub parent_id: String,
    pub title: String,
    pub description: Option<String>,
    pub state: Value,
    pub capabilities: Value,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct WorktreeRecord {
    pub id: String,
    pub project_id: Option<String>,
    pub repo: String,
    pub path: String,
    pub branch: String,
    pub owned: bool,
    pub state: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct ArchiveRecord {
    pub id: String,
    pub session_id: String,
    pub worktree: WorktreeRecord,
    pub bundle: String,
    pub snapshot: String,
    pub index: String,
    pub head: String,
    pub created_at: f64,
    pub restored: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct Bootstrap {
    pub projects: Vec<Project>,
    pub workspaces: Vec<Workspace>,
    pub providers: Vec<ProviderDefinition>,
    pub sessions: Vec<SessionRecord>,
    pub worktrees: Vec<WorktreeRecord>,
    pub archives: Vec<ArchiveRecord>,
    pub settings: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct EditorChoice {
    pub value: String,
    pub label: String,
}
pub fn now() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as f64
}
pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
pub fn providers() -> Vec<ProviderDefinition> { crate::adapters::providers() }

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct ProviderConfiguration {
    #[ts(optional)]
    pub agent_info: Option<Value>,
    pub config_options: Value,
    pub models: Value,
    #[serde(default)]
    #[ts(optional)]
    pub modes: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct AvailableCommand {
    pub name: String,
    pub description: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub input: Option<AvailableCommandInput>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct AvailableCommandInput {
    pub hint: String,
}

pub use crate::adapters::{SupportedProviderId,require_provider};

#[cfg(test)]
mod provider_registry_tests {
    use super::*;
    #[test]
    fn registry_is_closed_and_exports_browser_defaults() {
        let providers = providers();
        assert_eq!(providers.len(), crate::adapters::IDS.len());
        for provider in &providers { require_provider(&provider.id).unwrap(); }
        for id in ["", "custom", "cursor", "pi", "prime", "opencode"] {
            assert!(require_provider(id).is_err());
        }
        let source = format!("// Generated from Rust adapters::providers(); do not edit.\nimport type {{ ProviderDefinition }} from './ProviderDefinition';\nimport type {{ SupportedProviderId }} from './SupportedProviderId';\nexport const supportedProviders = {} satisfies (ProviderDefinition & {{ id: SupportedProviderId }})[];\n", serde_json::to_string_pretty(&providers).unwrap());
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/bindings/supported-providers.ts");
        if std::fs::read_to_string(path).ok().as_deref() != Some(&source) { std::fs::write(path, source).unwrap(); }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub enum ProbeStatus { Ready, MissingExecutable, IncompatibleProtocol, AuthenticationRequired, TimedOut, ConnectionFailed }

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct ProviderProbe {
    pub status: ProbeStatus,
    pub message: String,
    pub path: Option<String>,
    pub native_path: Option<String>,
    pub version: Option<String>,
    pub worktrunk: bool,
    pub agent_info: Value,
    pub auth_methods: Value,
}
