use super::contract::*;
use crate::types::SupportedProviderId;
use serde_json::Value;
pub(crate) mod plan;
pub(crate) mod questions;
mod workers;
pub struct GrokBuild;
impl Adapter for GrokBuild {
    fn descriptor(&self) -> AdapterDescriptor {
        AdapterDescriptor {
            id: SupportedProviderId::Grok,
            name: "Grok Build".into(),
            command: "grok".into(),
            args: vec!["--no-auto-update".into(), "agent".into(), "stdio".into()],
            native_command: "grok".into(),
            install_hint: "Install Grok Build: curl -fsSL https://x.ai/cli/install.sh | bash; then run grok login".into(),
            color: "sand".into(),
            transport: Transport::AcpV1,
            workers: WorkerStrategy::DirectAttachment,
            plan_approval: PlanApprovalContract::Implemented {
                implement_option_id: "approved".into(),
                revise_option_id: "cancelled".into(),
            },
            control_labels: vec![],
            native_plan_extension: FeatureSupport::Implemented,
            native_handoff: FeatureSupport::Unverified {
                reason: "Only exact provider/version round trips in this adapter may enable handoff".into(),
            },
        }
    }
    fn extra_path_entries(&self, home: &std::path::Path) -> Vec<std::path::PathBuf> {
        vec![home.join(".grok/bin")]
    }
    fn version_args(&self) -> &'static [&'static str] {
        &["--no-auto-update", "--version"]
    }
    fn client_extensions(&self) -> ClientExtensions {
        ClientExtensions {
            terminal_output: false,
            native_worker_sessions: false,
        }
    }
    fn plan_protocol(&self) -> Capability<&'static dyn PlanProtocol> {
        Capability::Supported(&plan::GrokPlan)
    }
    fn native_resume_args(&self, session: &str) -> Capability<Vec<String>> {
        Capability::Supported(vec![
            "--no-auto-update".into(),
            "--resume".into(),
            session.into(),
        ])
    }
    fn handoff(&self, c: &HandoffContext<'_>) -> HandoffAssessment {
        super::handoff_result(
            c,
            c.provider.args == ["--no-auto-update", "agent", "stdio"]
                && c.same_executable
                && c.adapter_version == Some("grok 1.0.30 (04b7ffed98c6) [stable]")
                && c.adapter_version == c.native_version,
        )
    }
    fn normalize_update(&self, payload: Value) -> Value {
        payload
    }
    fn forwarded_worker(&self, parent: &str, payload: &Value) -> Option<WorkerAnnouncement> {
        workers::forwarded(parent, payload)
    }
    fn worker_announcements(&self, kind: &str, payload: &Value) -> Vec<WorkerAnnouncement> {
        workers::announcements(kind, payload)
    }
}
