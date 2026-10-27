//! Attach a worker's existing conversation; never create a replacement worker.
use crate::{
    acp::{Rpc, Sink},
    adapters,
    types::*,
};
use serde_json::{json, Value};
use std::{
    sync::Arc,
    time::Duration,
};

pub struct Connection {
    pub rpc: Arc<Rpc>,
    pub wire_id: String,
    pub via_parent: bool,
    pub capabilities: Value,
}

pub fn relay_prompt(provider: SupportedProviderId, child: &SubagentRecord, text: &str) -> Result<String,String> {
    let tool = match adapters::get(provider).descriptor().workers {
        adapters::WorkerStrategy::ParentRelay{instructions}=>instructions,
        adapters::WorkerStrategy::DirectAttachment=>return Err("This adapter continues workers through direct attachment, not a parent relay".into()),
        adapters::WorkerStrategy::Unsupported{reason}=>return Err(reason),
    };
    Ok(format!("Deliver a user follow-up to the EXISTING worker identified by {} (title: {}). Use your native worker messaging/resume tool to continue that same worker. {tool} Your earlier tool result contains its native ID if the displayed ID is a tool-call ID. Do not spawn a replacement, perform the task yourself, or modify files. This is a run-to-completion request: use blocking wait for asynchronous workers before finishing this turn. Wait for the worker's response and return it verbatim. If the worker cannot be continued, say so clearly. The user message is this JSON string: {}",child.session_id,child.title,serde_json::to_string(text).unwrap()))
}

pub fn same_worker(candidate: &str, worker: &str) -> bool {
    candidate == worker
        || candidate
            .strip_prefix(worker)
            .and_then(|v| v.strip_prefix(":generation:"))
            .is_some_and(|v| v.parse::<u64>().is_ok())
}
pub fn is_working(state: &Value) -> bool {
    matches!(
        state["type"].as_str().or_else(|| state["state"].as_str()),
        Some("working" | "running" | "queued" | "requires_action" | "needs_input")
    )
}
pub async fn wait_for_children(
    rpc: &Rpc,
    pending: impl Fn() -> Result<bool, String>,
) -> Result<(), String> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(90);
    while pending()? {
        if !rpc.alive.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("The parent disconnected while waiting for the worker".into());
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(
                "The worker is still running. Its response will continue in the transcript.".into(),
            );
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Ok(())
}

pub async fn attach(
    provider: &ProviderDefinition,
    cwd: &str,
    child: &str,
    sink: Sink,
    started: impl FnOnce(Arc<Rpc>),
) -> Result<Connection, String> {
    let rpc = Rpc::start(provider, cwd, sink).await?;
    started(rpc.clone());
    let result = async {
        let init = rpc.request("initialize", json!({"protocolVersion":1,"clientCapabilities":adapters::client_capabilities(crate::types::require_provider(&provider.id)?),"clientInfo":{"name":"harbor","version":"0.1.0"}}), Some(Duration::from_secs(30))).await?;
        if init["protocolVersion"] != 1 { return Err("Agent did not negotiate ACP v1".into()); }
        let method = if init["agentCapabilities"]["loadSession"] == true { "session/load" }
            else if init["agentCapabilities"]["sessionCapabilities"]["resume"].is_object() { "session/resume" }
            else { return Err("This agent does not expose resumable worker conversations through ACP".into()); };
        let mut params = json!({"cwd":cwd,"mcpServers":[]});
        params["sessionId"] = json!(child);
        let result = rpc.request(method, params, Some(Duration::from_secs(90))).await?;
        let wire_id = crate::sessions::identity(&result, Some(child), true)?;
        Ok(Connection { rpc: rpc.clone(), wire_id, via_parent: false, capabilities: init })
    }.await;
    if result.is_err() {
        rpc.stop().await;
    }
    result
}
