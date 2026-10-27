//! A connection check establishes a real ACP session without submitting a prompt.
use crate::{
    acp::{resolve_executable, Rpc},
    types::{ProbeStatus, ProviderDefinition, ProviderProbe},
};
use serde_json::{json, Value};
use std::time::Duration;

pub fn failure_status(message: &str) -> ProbeStatus {
    let lower = message.to_lowercase();
    if lower.contains("timed out") || lower.contains("timeout") {
        ProbeStatus::TimedOut
    } else if [
        "auth",
        "login",
        "log in",
        "sign in",
        "api key",
        "unauthorized",
        "credentials",
    ]
    .iter()
    .any(|s| lower.contains(s))
    {
        ProbeStatus::AuthenticationRequired
    } else {
        ProbeStatus::ConnectionFailed
    }
}

pub async fn inspect(rpc: &Rpc, cwd: &str, result: &mut ProviderProbe) {
    let mut session: Option<String> = None;
    let mut close = false;
    let check = async {
        let init = rpc.request("initialize", json!({"protocolVersion":1,"clientCapabilities":{"session":{"configOptions":{"boolean":{}}}},"clientInfo":{"name":"harbor","version":"0.1.0"}}), Some(Duration::from_secs(15))).await?;
        result.agent_info = init["agentInfo"].clone();
        result.auth_methods = init.get("authMethods").cloned().unwrap_or(json!([]));
        if init["protocolVersion"] != 1 {
            result.status = ProbeStatus::IncompatibleProtocol;
            return Err("Agent did not negotiate ACP v1. Check the configured executable and adapter version.".to_string());
        }
        close = init["agentCapabilities"]["sessionCapabilities"].get("close").is_some();
        let response = rpc.request("session/new", json!({"cwd":cwd,"mcpServers":[]}), Some(Duration::from_secs(30))).await?;
        session = Some(crate::sessions::identity(&response, None, false)?);
        Ok::<_,String>(())
    }.await;
    match check {
        Ok(()) => {
            result.status = ProbeStatus::Ready;
            result.message =
                "Connected and authenticated. A temporary ACP session opened successfully.".into();
        }
        Err(error) => {
            if result.status != ProbeStatus::IncompatibleProtocol {
                result.status = failure_status(&error);
            }
            result.message = error;
        }
    }
    if close {
        if let Some(id) = session {
            let _ = rpc
                .request(
                    "session/close",
                    json!({"sessionId":id}),
                    Some(Duration::from_secs(2)),
                )
                .await;
        }
    }
}

pub async fn installation(provider: &ProviderDefinition) -> ProviderProbe {
    let path = resolve_executable(&provider.command);
    let native_path = resolve_executable(&provider.native_command);
    let version = match crate::adapters::resolve(&provider.id) {
        Ok(adapter)=>crate::adapters::version(&provider.native_command,adapter.version_args()).await,
        Err(_)=>None,
    };
    ProviderProbe {
        status: if path.is_some() {
            ProbeStatus::ConnectionFailed
        } else {
            ProbeStatus::MissingExecutable
        },
        message: if path.is_some() {
            "Connection has not been checked".into()
        } else {
            format!(
                "Executable not found: {}. {}",
                provider.command, provider.install_hint
            )
        },
        path: path.map(|p| p.to_string_lossy().into_owned()),
        native_path: native_path.map(|p| p.to_string_lossy().into_owned()),
        version,
        worktrunk: resolve_executable("wt").is_some(),
        agent_info: Value::Null,
        auth_methods: json!([]),
    }
}
