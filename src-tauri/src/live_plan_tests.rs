//! Opt-in behavioral acceptance; uses existing CLI authentication in a disposable repository.
use crate::{
    acp::{Rpc, Sink},
    model_config, providers, adapters, sessions,
    types::*,
};
use serde_json::{json, Value};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

async fn call(rpc: &Rpc, method: &str, params: Value) -> Result<Value, String> {
    rpc.request(method, params, Some(Duration::from_secs(120)))
        .await
}

async fn prompt(rpc: &Rpc, sid: &str, text: &str, execute: bool) -> Result<(), String> {
    let future = call(
        rpc,
        "session/prompt",
        json!({"sessionId":sid,"prompt":[{"type":"text","text":text}]}),
    );
    tokio::pin!(future);
    loop {
        tokio::select! {
            result = &mut future => { result?; return Ok(()); }
            _ = tokio::time::sleep(Duration::from_millis(50)) => {
                let pending: Vec<_> = rpc.inbound.lock().await.values().cloned().collect();
                for wire_request in pending {
                    let request=if wire_request["method"]=="_x.ai/exit_plan_mode" { crate::adapters::grok_build::plan::permission(&wire_request,None) } else { wire_request };
                    println!("Approval: {}", request);
                    if request["params"]["sessionId"] != sid { return Err("Approval belongs to another conversation".into()); }
                    if request["method"] != "session/request_permission" { return Err("Unexpected interactive request".into()); }
                    let options = request["params"]["options"].as_array().ok_or("Missing permission options")?;
                    // Planning never authorizes execution. Execution selects one-shot manual approval,
                    // preserving conversation context rather than choosing a clear-context option.
                    let choice = options.iter().find(|o| o["kind"] == if execute {"allow_once"} else {"reject_once"}).ok_or("No safe permission option")?;
                    call_answer(rpc, &request, choice).await?;
                }
            }
        }
    }
}
async fn call_answer(rpc: &Rpc, request: &Value, choice: &Value) -> Result<(), String> {
    rpc.answer(
        request["id"].clone(),
        json!({"outcome":{"outcome":"selected","optionId":choice["optionId"]}}),
    )
    .await
}
fn snapshot(root: &std::path::Path) -> Result<std::collections::BTreeMap<String, Vec<u8>>, String> {
    fn visit(
        root: &std::path::Path,
        dir: &std::path::Path,
        out: &mut std::collections::BTreeMap<String, Vec<u8>>,
    ) -> std::io::Result<()> {
        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            if entry.file_name() == ".git" {
                continue;
            }
            if entry.file_type()?.is_dir() {
                visit(root, &entry.path(), out)?;
            } else {
                out.insert(
                    entry
                        .path()
                        .strip_prefix(root)
                        .unwrap()
                        .to_string_lossy()
                        .to_string(),
                    std::fs::read(entry.path())?,
                );
            }
        }
        Ok(())
    }
    let mut out = std::collections::BTreeMap::new();
    visit(root, root, &mut out).map_err(|e| e.to_string())?;
    Ok(out)
}

#[tokio::test]
#[ignore = "Live Plan mode acceptance; requires HARBOR_SMOKE_PROVIDER/COMMAND/ARGS and authenticated CLI"]
async fn live_plan_mode() {
    let provider_id = std::env::var("HARBOR_SMOKE_PROVIDER").unwrap();
    let mut provider = providers()
        .into_iter()
        .find(|p| p.id == provider_id)
        .unwrap();
    provider.command = std::env::var("HARBOR_SMOKE_COMMAND").unwrap();
    provider.args =
        serde_json::from_str(&std::env::var("HARBOR_SMOKE_ARGS").unwrap_or("[]".into())).unwrap();
    let dir = tempfile::Builder::new()
        .prefix(&format!("harbor-plan-{provider_id}-"))
        .tempdir()
        .unwrap();
    let cwd = dir.path().to_str().unwrap();
    std::process::Command::new("git")
        .args(["init", "-q", cwd])
        .status()
        .unwrap();
    std::fs::write(dir.path().join("greeting.txt"), "hello\n").unwrap();
    let before = snapshot(dir.path()).unwrap();
    let events = Arc::new(Mutex::new(Vec::<(String, Value)>::new()));
    let copy = events.clone();
    let sink: Sink = Arc::new(move |kind, payload| {
        copy.lock().unwrap().push((kind.into(), payload));
    });
    let mut rpc = Rpc::start(&provider, cwd, sink.clone()).await.unwrap();
    let result: Result<(), String> = async {
        let init = call(&rpc, "initialize", json!({"protocolVersion":1,"clientCapabilities":adapters::client_capabilities(crate::types::require_provider(&provider_id).unwrap())})).await?;
        let response = call(&rpc, "session/new", json!({"cwd":cwd,"mcpServers":[]})).await?;
        let sid = sessions::identity(&response, None, false)?;
        let mut config = model_config::from_response(&response);
        println!("Provider {provider_id}; agent {}; modes {}; controls {}", init["agentInfo"], response["modes"], config.config_options);
        let key = if provider_id == "codex" { "collaboration_mode" } else if provider_id == "grok" { "__legacy_mode" } else { "mode" };
        let option = config.config_options.as_array().into_iter().flatten().find(|o| o["id"] == key);
        let advertised = option.is_some_and(|o| o["options"].as_array().is_some_and(|a| a.iter().any(|v| v["value"] == "plan")))
            || config.modes.as_ref().is_some_and(|m| m["availableModes"].as_array().is_some_and(|a| a.iter().any(|m|m["id"]=="plan")));
        if !advertised { return Err("No supported Plan mode contract for this provider/version".into()); }
        if std::env::var_os("HARBOR_PLAN_DISCOVER_ONLY").is_some() { return Ok(()); }
        model_config::apply(&rpc, &sid, &mut config, &json!({key:"plan"}), true).await?;
        if model_config::selections(&config)[key] != "plan" { return Err("Plan selection was not acknowledged".into()); }
        let marker = format!("PLAN-{}", id());
        prompt(&rpc, &sid, &format!("Remember {marker}. Inspect greeting.txt and plan changing its contents from hello to ahoy. Explain the concrete file change. Remain in Plan mode; do not implement or exit Plan mode yet. This is a tiny task; do not delegate."), false).await?;
        if snapshot(dir.path())? != before { return Err("Planning modified the project".into()); }
        let text = events.lock().unwrap().iter().map(|(kind, p)| if kind=="request" { p["params"]["toolCall"]["content"][0]["content"]["text"].as_str().unwrap_or("") } else if p["update"]["sessionUpdate"] == "agent_message_chunk" {p["update"]["content"]["text"].as_str().unwrap_or("")} else {""}).collect::<String>();
        println!("Plan response: {text}");
        if !text.contains("greeting.txt") || !text.contains("ahoy") { return Err("No concrete plan was returned".into()); }
        rpc.stop().await;
        rpc = Rpc::start(&provider, cwd, sink.clone()).await?;
        let init = call(&rpc, "initialize", json!({"protocolVersion":1,"clientCapabilities":adapters::client_capabilities(crate::types::require_provider(&provider_id).unwrap())})).await?;
        let method = if init["agentCapabilities"]["loadSession"] == true {"session/load"} else {"session/resume"};
        let loaded = call(&rpc, method, json!({"sessionId":sid,"cwd":cwd,"mcpServers":[]})).await?;
        sessions::identity(&loaded, Some(&sid), true)?;
        config = model_config::from_response(&loaded);
        println!("After restart: {}", model_config::selections(&config));
        if provider_id == "grok" && !config.modes.as_ref().is_some_and(|m| m["currentModeId"].is_string()) {
            // Harbor reasserts its saved confirmed mode when this version omits it on load.
            model_config::apply(&rpc,&sid,&mut config,&json!({"__legacy_mode":"plan"}),true).await?;
        }
        if model_config::selections(&config)[key] != "plan" { return Err("Plan mode did not survive restart".into()); }
        events.lock().unwrap().clear();
        prompt(&rpc, &sid, "Before doing anything else, repeat the PLAN- marker I gave you and the planned file change. Remain in Plan mode and do not edit or exit yet.", false).await?;
        let recalled = events.lock().unwrap().iter().filter(|(_, p)| p["update"]["sessionUpdate"] == "agent_message_chunk").map(|(_, p)| p["update"]["content"]["text"].as_str().unwrap_or("")).collect::<String>();
        if !recalled.contains(&marker) { return Err(format!("Conversation context lost: {recalled}")); }
        if snapshot(dir.path())? != before { return Err("Reconnected planning modified project".into()); }
        if provider_id == "codex" {
            model_config::apply(&rpc, &sid, &mut config, &json!({key:"default"}), true).await?;
        }
        prompt(&rpc, &sid, "The plan is approved. Implement the previously planned change to greeting.txt now. If still in Plan mode, use ExitPlanMode and request approval first. Keep this conversation's context. Do not delegate.", true).await?;
        let content = std::fs::read_to_string(dir.path().join("greeting.txt")).map_err(|e| e.to_string())?;
        if content.trim() != "ahoy" { return Err(format!("Execution did not implement plan: {content}")); }
        let mut expected = before.clone();
        expected.insert("greeting.txt".into(), content.into_bytes());
        if snapshot(dir.path())? != expected { return Err("Execution changed unrelated project files".into()); }
        if provider_id == "claude" && !events.lock().unwrap().iter().any(|(_, p)| p["update"]["sessionUpdate"] == "current_mode_update" && p["update"]["currentModeId"] != "plan") { return Err("Claude did not publish its plan-exit mode".into()); }
        println!("PASS: Plan acknowledged; project unchanged during planning; process restart kept identity/context; execution changed greeting.txt to ahoy.");
        Ok(())
    }.await;
    if let Ok(path) = std::env::var("HARBOR_PLAN_TRACE") {
        std::fs::write(
            path,
            serde_json::to_vec_pretty(&*events.lock().unwrap()).unwrap(),
        )
        .unwrap();
    }
    rpc.cancel_requests().await;
    rpc.stop().await;
    result.unwrap();
}
