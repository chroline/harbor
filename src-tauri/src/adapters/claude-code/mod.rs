use super::contract::*;
use crate::types::SupportedProviderId;
use serde_json::Value;
const HANDOFF_REASON:&str="Claude Code native handoff is unverified: the tested CLI did not complete the ACP-to-terminal-to-ACP acceptance check. Continue in Chat or use a separate shell tab.";
pub struct ClaudeCode;
impl Adapter for ClaudeCode {
    fn descriptor(&self) -> AdapterDescriptor {
        AdapterDescriptor {
            id: SupportedProviderId::Claude,
            name: "Claude Code".into(),
            command: "claude-agent-acp".into(),
            args: vec![],
            native_command: "claude".into(),
            install_hint: "npm install -g @agentclientprotocol/claude-agent-acp@0.97.0".into(),
            color: "peach".into(),
            transport: Transport::AcpV1,
            workers: WorkerStrategy::ParentRelay {
                instructions: "Use Claude SendMessage or Agent resume with the existing worker ID."
                    .into(),
            },
            plan_approval: PlanApprovalContract::Implemented {
                implement_option_id: "exit-plan-default".into(),
                revise_option_id: "reject".into(),
            },
            control_labels: vec![],
            native_plan_extension: FeatureSupport::Unsupported {
                reason:
                    "Uses advertised ACP modes and approvals; no native plan extension required"
                        .into(),
            },
            native_handoff: FeatureSupport::Unsupported {
                reason: HANDOFF_REASON.into(),
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
            terminal_output: false,
            native_worker_sessions: false,
        }
    }
    fn plan_protocol(&self) -> Capability<&'static dyn PlanProtocol> {
        Capability::Unsupported {
            reason: "Claude Code uses ACP mode/permission messages".into(),
        }
    }
    fn native_resume_args(&self, session: &str) -> Capability<Vec<String>> {
        Capability::Supported(vec!["--resume".into(), session.into()])
    }
    fn handoff(&self, _: &HandoffContext<'_>) -> HandoffAssessment {
        HandoffAssessment {
            available: false,
            reason: HANDOFF_REASON.into(),
        }
    }
    fn normalize_update(&self, payload: Value) -> Value {
        payload
    }
    fn forwarded_worker(&self, _: &str, _: &Value) -> Option<WorkerAnnouncement> {
        None
    }
    fn worker_announcements(&self, _: &str, _: &Value) -> Vec<WorkerAnnouncement> {
        vec![]
    }
}
