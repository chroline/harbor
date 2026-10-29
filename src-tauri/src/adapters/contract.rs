//! All adapter hooks are required. Optional behavior uses an explicit support state.
use super::SupportedProviderId;
pub use crate::types::ProviderDefinition;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "status", rename_all = "snake_case")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub enum FeatureSupport {
    Implemented,
    Unsupported { reason: String },
    Unverified { reason: String },
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub enum WorkerStrategy {
    ParentRelay { instructions: String },
    DirectAttachment,
    Unsupported { reason: String },
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(tag = "status", rename_all = "snake_case")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub enum PlanApprovalContract {
    Implemented {
        #[serde(rename = "implementOptionId")]
        implement_option_id: String,
        #[serde(rename = "reviseOptionId")]
        revise_option_id: String,
    },
    Unsupported {
        reason: String,
    },
    Unverified {
        reason: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct ControlLabel {
    pub id: String,
    pub label: String,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct AdapterDescriptor {
    pub id: SupportedProviderId,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub native_command: String,
    pub install_hint: String,
    pub color: String,
    pub transport: Transport,
    pub workers: WorkerStrategy,
    pub plan_approval: PlanApprovalContract,
    pub control_labels: Vec<ControlLabel>,
    pub native_plan_extension: FeatureSupport,
    pub native_handoff: FeatureSupport,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub enum Transport {
    #[serde(rename = "acp_v1")]
    AcpV1,
}
impl AdapterDescriptor {
    pub fn provider(&self) -> ProviderDefinition {
        ProviderDefinition {
            id: self.id.as_str().into(),
            name: self.name.clone(),
            command: self.command.clone(),
            args: self.args.clone(),
            native_command: self.native_command.clone(),
            install_hint: self.install_hint.clone(),
            color: self.color.clone(),
        }
    }
}
#[derive(Debug, Clone, Copy)]
pub struct ClientExtensions {
    pub text_file_reads: bool,
    pub terminal_output: bool,
    pub native_worker_sessions: bool,
}
#[derive(Debug)]
pub enum Capability<T> {
    Supported(T),
    Unsupported { reason: String },
}
impl<T> Capability<T> {
    pub fn supported(&self) -> Option<&T> {
        match self {
            Self::Supported(value) => Some(value),
            Self::Unsupported { .. } => None,
        }
    }
    pub fn is_supported(&self) -> bool {
        self.supported().is_some()
    }
}
pub struct HandoffContext<'a> {
    pub provider: &'a ProviderDefinition,
    pub agent_name: Option<&'a str>,
    pub agent_version: Option<&'a str>,
    pub adapter_version: Option<&'a str>,
    pub native_version: Option<&'a str>,
    pub same_executable: bool,
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HandoffAssessment {
    pub available: bool,
    pub reason: String,
}

/// JSON is accepted only at the untrusted ACP extension boundary. Implementations
/// validate their native schemas and return typed, shared approval structures.
pub trait PlanProtocol: Send + Sync + std::fmt::Debug {
    fn enabled(&self, version: Option<&str>, args: &[String]) -> bool;
    fn method(&self) -> &'static str;
    fn modes(&self, current: Option<&str>) -> ModeCatalog;
    fn permission(
        &self,
        request: &Value,
        fallback: Option<String>,
    ) -> Result<PlanPermission, String>;
    fn response(&self, decision: &PermissionResponse) -> Result<NativePlanResponse, String>;
    fn plan_path(
        &self,
        home: &Path,
        cwd: &Path,
        session: &str,
        requested: Option<&Path>,
        write: bool,
    ) -> Option<PathBuf>;
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RequestId {
    Number(i64),
    String(String),
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Mode {
    pub id: String,
    pub name: String,
    pub description: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModeCatalog {
    pub current_mode_id: Option<String>,
    pub available_modes: Vec<Mode>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionKind {
    AllowOnce,
    AllowAlways,
    RejectOnce,
    RejectAlways,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionOption {
    pub option_id: String,
    pub name: String,
    pub kind: PermissionKind,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum PermissionOutcome {
    Selected {
        #[serde(rename = "optionId")]
        option_id: String,
    },
    Cancelled,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionResponse {
    pub outcome: PermissionOutcome,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NativePlanOutcome {
    Approved,
    Cancelled,
    Abandoned,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativePlanResponse {
    pub outcome: NativePlanOutcome,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanPermission {
    pub jsonrpc: JsonRpcVersion,
    pub id: RequestId,
    pub method: PermissionMethod,
    pub params: PlanPermissionParams,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum JsonRpcVersion {
    #[serde(rename = "2.0")]
    V2,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PermissionMethod {
    #[serde(rename = "session/request_permission")]
    RequestPermission,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanPermissionParams {
    pub session_id: String,
    pub tool_call: PlanToolCall,
    pub options: Vec<PermissionOption>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum PlanToolCall {
    SwitchMode {
        #[serde(rename = "toolCallId")]
        tool_call_id: Option<String>,
        title: String,
        content: Vec<PlanContent>,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PlanContent {
    Content { content: TextContent },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum TextContent {
    Text { text: String },
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerAnnouncement {
    pub session_id: String,
    pub update: WorkerUpdate,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerUpdate {
    pub session_update: WorkerUpdateKind,
    pub session_id: String,
    pub title: String,
    pub description: Option<String>,
    pub state: WorkerState,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum WorkerUpdateKind {
    #[serde(rename = "subagent_update")]
    SubagentUpdate,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WorkerState {
    Working,
    Idle,
    Error,
    Unknown,
}

/// No default methods: every integration must make each policy decision explicit.
///
/// ```compile_fail
/// use harbor_lib::adapters::contract::Adapter;
/// struct Incomplete;
/// impl Adapter for Incomplete {}
/// ```
pub trait Adapter: Send + Sync {
    fn descriptor(&self) -> AdapterDescriptor;
    fn extra_path_entries(&self, home: &Path) -> Vec<PathBuf>;
    fn version_args(&self) -> &'static [&'static str];
    fn client_extensions(&self) -> ClientExtensions;
    fn plan_protocol(&self) -> Capability<&'static dyn PlanProtocol>;
    fn native_resume_args(&self, session: &str) -> Capability<Vec<String>>;
    fn handoff(&self, context: &HandoffContext<'_>) -> HandoffAssessment;
    fn normalize_update(&self, payload: Value) -> Value;
    fn forwarded_worker(&self, parent: &str, payload: &Value) -> Option<WorkerAnnouncement>;
    fn worker_announcements(&self, kind: &str, payload: &Value) -> Vec<WorkerAnnouncement>;
}

impl<T> std::fmt::Display for Capability<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Supported(_) => f.write_str("Implemented"),
            Self::Unsupported { reason } => write!(f, "Unsupported: {reason}"),
        }
    }
}
