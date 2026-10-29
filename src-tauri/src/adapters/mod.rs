//! Central adapter registry. Exhaustive enum matching makes additions a compile-time task.
pub mod contract;
use crate::{acp::resolve_executable, types::ProviderDefinition};
use contract::*;
pub use contract::{Adapter, Capability, WorkerStrategy};
use serde_json::{json, Value};
macro_rules! register_adapters {
    ($( $variant:ident => ($id:literal, $module:ident, $path:literal, $adapter:ident) ),+ $(,)?) => {
        $(#[path=$path] pub(crate) mod $module;)+
        #[derive(Clone,Copy,Debug,serde::Serialize,serde::Deserialize,ts_rs::TS,PartialEq,Eq)]
        #[ts(export, export_to="../../src/lib/bindings/")]
        pub enum SupportedProviderId { $(#[serde(rename=$id)] $variant),+ }
        impl SupportedProviderId {
            pub const fn as_str(self)->&'static str {match self {$(Self::$variant=>$id),+}}
        }
        pub const IDS:&[SupportedProviderId]=&[$(SupportedProviderId::$variant),+];
        pub fn get(id:SupportedProviderId)->&'static dyn Adapter {
            match id {$(SupportedProviderId::$variant=>&$module::$adapter),+}
        }
    }
}
// Adding a provider here extends the ID union, exhaustive dispatch, and exported
// frontend registry together. Missing adapter trait methods fail compilation.
register_adapters! {
    Codex => ("codex",codex,"codex/mod.rs",Codex),
    Claude => ("claude",claude_code,"claude-code/mod.rs",ClaudeCode),
    Grok => ("grok",grok_build,"grok-build/mod.rs",GrokBuild),
}
pub fn require_provider(id: &str) -> Result<SupportedProviderId, String> {
    serde_json::from_value(Value::String(id.into()))
        .map_err(|_| format!("Unsupported provider: {id}. Choose a registered adapter."))
}
pub fn resolve(id: &str) -> Result<&'static dyn Adapter, String> {
    Ok(get(require_provider(id)?))
}
pub fn descriptors() -> Vec<AdapterDescriptor> {
    IDS.iter().copied().map(|id| get(id).descriptor()).collect()
}
pub fn providers() -> Vec<ProviderDefinition> {
    descriptors()
        .iter()
        .map(AdapterDescriptor::provider)
        .collect()
}
pub fn client_capabilities(id: SupportedProviderId) -> Value {
    let extensions = get(id).client_extensions();
    let mut caps = json!({"fs":{"readTextFile":extensions.text_file_reads,"writeTextFile":true},"terminal":true,"elicitation":{"form":{}},"subagents":{},"session":{"configOptions":{"boolean":{}}}});
    if extensions.terminal_output || extensions.native_worker_sessions {
        let mut meta = json!({});
        if extensions.terminal_output {
            meta["terminal_output"] = json!(true);
        }
        if extensions.native_worker_sessions {
            meta["jetbrains"] =
                json!({"air":{"version":1,"capabilities":["nativeSubagentSessions"]}});
        }
        caps["_meta"] = meta;
    }
    caps
}
pub async fn version(command: &str, args: &[&str]) -> Option<String> {
    let exe = resolve_executable(command)?;
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        tokio::process::Command::new(exe)
            .args(args)
            .kill_on_drop(true)
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_owned())
}
pub fn handoff_result(c: &HandoffContext<'_>, available: bool) -> HandoffAssessment {
    let installed = format!(
        "{} / {}",
        c.adapter_version
            .unwrap_or("ACP executable version unavailable"),
        c.native_version
            .unwrap_or("native CLI missing or version unavailable")
    );
    HandoffAssessment {
        available,
        reason: if available {
            format!("Same-conversation terminal round trip verified for {installed}.")
        } else {
            format!("Native handoff is unverified for {installed} and the configured arguments. Continue in Chat or use a separate shell tab.")
        },
    }
}
pub async fn handoff_compatibility(
    provider: &ProviderDefinition,
    init: &Value,
) -> Result<HandoffAssessment, String> {
    let adapter = resolve(&provider.id)?;
    if let FeatureSupport::Unsupported { reason } = adapter.descriptor().native_handoff {
        return Ok(HandoffAssessment {
            available: false,
            reason,
        });
    }
    let (acp, native) = tokio::join!(
        version(&provider.command, adapter.version_args()),
        version(&provider.native_command, adapter.version_args())
    );
    let same_executable = resolve_executable(&provider.command)
        .and_then(|p| p.canonicalize().ok())
        .zip(resolve_executable(&provider.native_command).and_then(|p| p.canonicalize().ok()))
        .is_some_and(|(a, b)| a == b);
    Ok(adapter.handoff(&HandoffContext {
        provider,
        agent_name: init["agentInfo"]["name"].as_str(),
        agent_version: init["agentInfo"]["version"].as_str(),
        adapter_version: acp.as_deref(),
        native_version: native.as_deref(),
        same_executable,
    }))
}
pub fn native_resume_args(id: SupportedProviderId, session: &str) -> Result<Vec<String>, String> {
    if session.is_empty() {
        return Err("No verified native session identity".into());
    }
    match get(id).native_resume_args(session) {
        Capability::Supported(args) => Ok(args),
        Capability::Unsupported { reason } => Err(reason),
    }
}
#[cfg(test)]
mod tests;
