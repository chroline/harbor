pub(crate) mod questions;
use super::contract::*;
use crate::types::SupportedProviderId;
use serde_json::Value;
mod updates;
pub struct Codex;
impl Adapter for Codex {
    fn descriptor(&self) -> AdapterDescriptor {
        AdapterDescriptor {
            id: SupportedProviderId::Codex,
            name: "OpenAI Codex".into(),
            command: "codex-acp".into(),
            args: vec![],
            native_command: "codex".into(),
            install_hint: "npm install -g @agentclientprotocol/codex-acp@2.3.0".into(),
            color: "mint".into(),
            transport: Transport::AcpV1,
            workers: WorkerStrategy::ParentRelay {
                instructions: "Use Codex send_message/followup_task with the existing worker ID."
                    .into(),
            },
            plan_approval: PlanApprovalContract::Implemented {
                implement_option_id: "implement_plan".into(),
                revise_option_id: "revise_plan".into(),
            },
            control_labels: vec![ControlLabel {
                id: "mode".into(),
                label: "Permissions".into(),
            }],
            native_plan_extension: FeatureSupport::Unsupported {
                reason:
                    "Uses advertised ACP modes and approvals; no native plan extension required"
                        .into(),
            },
            native_handoff: FeatureSupport::Unverified {
                reason:
                    "Only exact provider/version round trips in this adapter may enable handoff"
                        .into(),
            },
        }
    }
    fn extra_path_entries(&self, _: &std::path::Path) -> Vec<std::path::PathBuf> {
        vec![]
    }
    fn version_args(&self) -> &'static [&'static str] {
        &["--version"]
    }
    fn client_extensions(&self) -> ClientExtensions {
        ClientExtensions {
            text_file_reads: true,
            terminal_output: true,
            native_worker_sessions: true,
        }
    }
    fn plan_protocol(&self) -> Capability<&'static dyn PlanProtocol> {
        Capability::Unsupported {
            reason: "Codex uses ACP collaboration mode and permission messages".into(),
        }
    }
    fn native_resume_args(&self, session: &str) -> Capability<Vec<String>> {
        Capability::Supported(vec!["resume".into(), session.into()])
    }
    fn handoff(&self, c: &HandoffContext<'_>) -> HandoffAssessment {
        if c.adapter_version == Some("@agentclientprotocol/codex-acp 2.3.0")
            && c.native_version == Some("codex-cli 0.164.0")
        {
            return HandoffAssessment{available:false,reason:"Codex ACP 2.3.0 / CLI 0.164.0 refused ACP reconnection with a session ownership lock after native exit in the round-trip test. Handoff is disabled for this pair; continue in Chat or use a separate shell tab.".into()};
        }
        super::handoff_result(
            c,
            c.provider.args.is_empty()
                && c.agent_name == Some("@agentclientprotocol/codex-acp")
                && c.agent_version == Some("2.1.1")
                && c.adapter_version == Some("@agentclientprotocol/codex-acp 2.1.1")
                && c.native_version == Some("codex-cli 0.154.0"),
        )
    }
    fn normalize_update(&self, payload: Value) -> Value {
        updates::normalize_update(payload)
    }
    fn forwarded_worker(&self, _: &str, _: &Value) -> Option<WorkerAnnouncement> {
        None
    }
    fn worker_announcements(&self, _: &str, _: &Value) -> Vec<WorkerAnnouncement> {
        vec![]
    }
}
