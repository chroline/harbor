use super::contract::*;
use crate::types::SupportedProviderId;
use serde_json::Value;
pub(crate) mod plan;
pub(crate) mod questions;
mod workers;
pub struct GrokBuild;

// Grok sends shell command text in `command` with no ACP args.
pub(crate) fn terminal_command(command: &str) -> tokio::process::Command {
    #[cfg(unix)]
    let mut process = tokio::process::Command::new("/bin/sh");
    #[cfg(unix)]
    process.arg("-c").arg(command);
    #[cfg(windows)]
    let mut process = tokio::process::Command::new("cmd.exe");
    #[cfg(windows)]
    process.arg("/C").arg(command);
    process
}
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
            // Delegating ReadFile to ACP's text-only reader also intercepts PNGs.
            // Keep Grok's native reader so it can return image tool content.
            text_file_reads: false,
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

/// Grok 1.0.30 accepts ACP image blocks but advertises image:false.
/// Verified with a screenshot-only vision prompt against the installed CLI.
pub(crate) fn normalize_initialize(result: &mut Value) {
    if result["_meta"]["agentVersion"] == "1.0.30" {
        result["agentCapabilities"]["promptCapabilities"]["image"] = Value::Bool(true);
    }
}

#[cfg(test)]
mod image_tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn sends_screenshot_bytes_instead_of_a_generic_resource() {
        let mut response = json!({"_meta":{"agentVersion":"1.0.30"},"agentCapabilities":{"promptCapabilities":{"image":false,"embeddedContext":true}}});
        normalize_initialize(&mut response);
        let directory = tempfile::tempdir().unwrap();
        let file = crate::types::PromptAttachment { name: "screen.png".into(), mime_type: "image/png".into(), data: "iVBORw0KGgo=".into() };
        let (prompt, metadata, _) = crate::attachments::prepare(directory.path(), "Inspect", &[file], &response).await.unwrap();
        assert_eq!(prompt.len(), 2);
        assert_eq!(prompt[1], json!({"type":"image","mimeType":"image/png","data":"iVBORw0KGgo="}));
        assert!(metadata[0]["previewSource"].as_str().unwrap().starts_with("harbor-attachment:"));
    }

    #[test]
    fn corrects_only_the_verified_grok_image_capability() {
        let mut response = json!({"_meta":{"agentVersion":"1.0.30"},"agentCapabilities":{"promptCapabilities":{"image":false,"embeddedContext":true}}});
        normalize_initialize(&mut response);
        assert_eq!(response["agentCapabilities"]["promptCapabilities"]["image"], true);
        assert_eq!(response["agentCapabilities"]["promptCapabilities"]["embeddedContext"], true);
        response["_meta"]["agentVersion"] = json!("unknown");
        response["agentCapabilities"]["promptCapabilities"]["image"] = json!(false);
        normalize_initialize(&mut response);
        assert_eq!(response["agentCapabilities"]["promptCapabilities"]["image"], false);
    }
}
