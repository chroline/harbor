//! OpenCode speaks ACP natively through `opencode acp`.
//!
//! Verified against OpenCode 2.3.0:
//! - Session modes are a `mode` config option (`build`/`plan`); there is no
//!   `switch_mode` permission, so plan approval is not a provider contract.
//! - Questions use standard `elicitation/create` forms.
//! - Subagent activity is multiplexed into the parent stream with
//!   `_meta["opencode/child-session"]`. Child sessions are real sessions that
//!   `session/load` replays, so workers attach directly.
use super::contract::*;
use crate::types::SupportedProviderId;
use serde_json::Value;
mod workers;
pub struct OpenCode;
pub(crate) const ACP_ARGS: &[&str] = &["acp"];
impl Adapter for OpenCode {
    fn project_orchestration(&self) -> ProjectOrchestration {
        crate::projects::communication(SupportedProviderId::OpenCode)
    }
    fn descriptor(&self) -> AdapterDescriptor {
        AdapterDescriptor {
            id: SupportedProviderId::OpenCode,
            name: "OpenCode".into(),
            command: "opencode".into(),
            args: ACP_ARGS.iter().map(|arg| (*arg).into()).collect(),
            native_command: "opencode".into(),
            install_hint: "Install OpenCode: curl -fsSL https://opencode.ai/install | bash; then run opencode auth login".into(),
            color: "mint".into(),
            transport: Transport::AcpV1,
            workers: WorkerStrategy::DirectAttachment,
            plan_approval: PlanApprovalContract::Unsupported {
                reason: "OpenCode leaves Plan by switching the advertised Session Mode to Build; it sends no plan approval request".into(),
            },
            control_labels: vec![],
            native_plan_extension: FeatureSupport::Unsupported {
                reason: "Uses advertised ACP config options for Build and Plan; no native plan extension required".into(),
            },
            native_handoff: FeatureSupport::Unverified {
                reason: "Only exact provider/version round trips in this adapter may enable handoff".into(),
            },
        }
    }
    fn extra_path_entries(&self, home: &std::path::Path) -> Vec<std::path::PathBuf> {
        vec![home.join(".opencode/bin")]
    }
    fn version_args(&self) -> &'static [&'static str] {
        &["--version"]
    }
    fn client_extensions(&self) -> ClientExtensions {
        ClientExtensions {
            text_file_reads: true,
            terminal_output: false,
            native_worker_sessions: false,
        }
    }
    fn plan_protocol(&self) -> Capability<&'static dyn PlanProtocol> {
        Capability::Unsupported {
            reason: "OpenCode uses ACP config options for Build and Plan".into(),
        }
    }
    fn native_resume_args(&self, session: &str) -> Capability<Vec<String>> {
        Capability::Supported(vec!["--session".into(), session.into()])
    }
    fn handoff(&self, c: &HandoffContext<'_>) -> HandoffAssessment {
        // Not yet verified with a live ACP-to-terminal-to-ACP round trip.
        super::handoff_result(c, false)
    }
    fn normalize_update(&self, payload: Value) -> Value {
        workers::route_child(payload)
    }
    fn forwarded_worker(&self, parent: &str, payload: &Value) -> Option<WorkerAnnouncement> {
        workers::forwarded(parent, payload)
    }
    fn worker_announcements(&self, kind: &str, payload: &Value) -> Vec<WorkerAnnouncement> {
        workers::announcements(kind, payload)
    }
}
