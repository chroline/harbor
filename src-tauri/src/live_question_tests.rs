//! Opt-in question-tool acceptance using existing CLI login and a disposable repository.
use crate::{
    acp::{Rpc, Sink},
    adapters,
    types::providers,
};
use serde_json::{json, Value};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

#[tokio::test]
#[ignore = "Requires authenticated HARBOR_SMOKE_PROVIDER/COMMAND/ARGS; consumes provider usage"]
async fn live_question_tool() {
    let provider_id = std::env::var("HARBOR_SMOKE_PROVIDER").unwrap();
    let mut provider = providers()
        .into_iter()
        .find(|p| p.id == provider_id)
        .unwrap();
    provider.command = std::env::var("HARBOR_SMOKE_COMMAND").unwrap();
    if let Ok(args) = std::env::var("HARBOR_SMOKE_ARGS") {
        provider.args = serde_json::from_str(&args).unwrap();
    }
    let dir = tempfile::Builder::new()
        .prefix("harbor-question-")
        .tempdir()
        .unwrap();
    let cwd = dir.path().to_str().unwrap();
    assert!(std::process::Command::new("git")
        .args(["init", "-q", cwd])
        .status()
        .unwrap()
        .success());
    let events = Arc::new(Mutex::new(Vec::<(String, Value)>::new()));
    let copy = events.clone();
    let sink: Sink =
        Arc::new(move |kind, payload| copy.lock().unwrap().push((kind.into(), payload)));
    let rpc = Rpc::start(&provider, cwd, sink).await.unwrap();
    let result:Result<(),String>=async {
        let call=|method:&str,params:Value| { let method=method.to_owned(); let rpc=&rpc; async move {rpc.request(&method,params,Some(Duration::from_secs(120))).await} };
        let init=call("initialize",json!({"protocolVersion":1,"clientCapabilities":adapters::client_capabilities(adapters::require_provider(&provider_id)?)})).await?;
        let session=call("session/new",json!({"cwd":cwd,"mcpServers":[]})).await?;
        let sid=session["sessionId"].as_str().ok_or("Missing session")?;
        if provider_id=="codex" {call("session/set_config_option",json!({"sessionId":sid,"configId":"collaboration_mode","value":"plan"})).await?;}
        println!("Question test: {}",init["agentInfo"]);
        let turn=call("session/prompt",json!({"sessionId":sid,"prompt":[{"type":"text","text":"UI verification only. Do not read or write files, run commands, delegate, or make a plan. Call your question tool now to ask exactly one question: Which test color do you prefer? Give Blue and Green as choices with short descriptions and allow a custom answer. Wait for the tool response, then confirm the selected answer and any note verbatim."}]}));
        tokio::pin!(turn);
        let mut answered=false;
        loop {
            tokio::select! {
                done=&mut turn => {done?;break;},
                _=tokio::time::sleep(Duration::from_millis(50)) => {
                    let pending=rpc.inbound.lock().await.values().cloned().collect::<Vec<_>>();
                    for raw in pending {
                        let ui=if raw["method"]==adapters::grok_build::questions::METHOD {adapters::grok_build::questions::elicitation(&raw)?} else {raw.clone()};
                        if ui["method"]!="elicitation/create" {return Err(format!("Unexpected interaction: {}",ui["method"]));}
                        let props=ui["params"]["requestedSchema"]["properties"].as_object().ok_or("Missing schema")?;
                        let mut content=serde_json::Map::new();
                        for (id,field) in props {
                            if let Some(value)=field["oneOf"].as_array().and_then(|a|a.first()).map(|o|o["const"].clone()) {content.insert(id.clone(),value);}
                            else if field["type"]=="string" {content.insert(id.clone(),json!("HARBOR-QUESTION-NOTE"));}
                        }
                        println!("Received shared form: {}",ui["params"]["requestedSchema"]);
                        rpc.answer(raw["id"].clone(),json!({"action":"accept","content":content})).await?;
                        answered=true;
                    }
                }
            }
        }
        if !answered {return Err("Provider finished without asking a tool question".into());}
        let text=events.lock().unwrap().iter().filter(|(_,p)|p["update"]["sessionUpdate"]=="agent_message_chunk").map(|(_,p)|p["update"]["content"]["text"].as_str().unwrap_or("")).collect::<String>();
        println!("Agent confirmation: {text}");
        if !text.contains("HARBOR-QUESTION-NOTE") {return Err("Provider confirmation lost the submitted note".into());}
        Ok(())
    }.await;
    rpc.cancel_requests().await;
    rpc.stop().await;
    assert!(result.is_ok(), "{provider_id}: {result:?}");
}

#[tokio::test]
#[ignore = "Requires authenticated Codex CLI; consumes provider usage"]
async fn live_default_async_question_tool() {
    let mut provider = providers().into_iter().find(|p| p.id == "codex").unwrap();
    provider.command = std::env::var("HARBOR_SMOKE_COMMAND").unwrap();
    let dir = tempfile::Builder::new().prefix("harbor-default-question-").tempdir().unwrap();
    let cwd = dir.path().to_str().unwrap();
    let events = Arc::new(Mutex::new(Vec::<(String, Value)>::new()));
    let copy = events.clone();
    let sink: Sink = Arc::new(move |kind, payload| copy.lock().unwrap().push((kind.into(), payload)));
    let rpc = Rpc::start(&provider, cwd, sink).await.unwrap();
    let result: Result<(), String> = async {
        let init = rpc.request("initialize", json!({"protocolVersion":1,"clientCapabilities":adapters::client_capabilities(adapters::SupportedProviderId::Codex)}), Some(Duration::from_secs(30))).await?;
        println!("Default-mode async question test: {}", init["agentInfo"]);
        let session = rpc.request("session/new", json!({"cwd":cwd,"mcpServers":[]}), Some(Duration::from_secs(60))).await?;
        let sid = session["sessionId"].as_str().ok_or("Missing native session")?;
        rpc.request("session/set_config_option", json!({"sessionId":sid,"configId":"model","value":"gpt-6.1-terra"}), Some(Duration::from_secs(30))).await?;
        rpc.request("session/set_config_option", json!({"sessionId":sid,"configId":"collaboration_mode","value":"default"}), Some(Duration::from_secs(30))).await?;
        rpc.request("session/prompt", json!({"sessionId":sid,"prompt":[{"type":"text","text":"UI verification only. Do not read or write files, run commands, delegate, or make a plan. Use request_user_input_async to ask exactly one question: Which test color do you prefer? Offer Blue and Green. After I answer, confirm my answer and any note verbatim. Send the question now, then finish your turn immediately so I can answer in the next turn."}]}), Some(Duration::from_secs(120))).await?;
        rpc.cancel_blocking_requests().await;
        let request = rpc.inbound.lock().await.values().find(|r| adapters::codex::questions::is_async(r)).cloned().ok_or("Default mode completed but the async question was lost")?;
        println!("Pending question after turn completion: {}", request["params"]["requestedSchema"]);
        let content = json!({"question_0":"Blue","question_0_custom":"HARBOR-DEFAULT-QUESTION-NOTE"});
        let answer = json!({"action":"accept","content":content});
        let text = rpc.async_question_answer(&request["id"], &answer).await?.ok_or("Missing async answer text")?;
        rpc.record_async_answer(request["id"].clone(), answer).await?;
        rpc.request("session/prompt", json!({"sessionId":sid,"prompt":[{"type":"text","text":text}]}), Some(Duration::from_secs(120))).await?;
        let text = events.lock().unwrap().iter().filter(|(_,p)| p["update"]["sessionUpdate"]=="agent_message_chunk").map(|(_,p)|p["update"]["content"]["text"].as_str().unwrap_or("")).collect::<String>();
        println!("Default-mode answer confirmation: {text}");
        if !text.contains("HARBOR-DEFAULT-QUESTION-NOTE") || !text.contains("Blue") { return Err("Default-mode answer or note was lost".into()); }
        Ok(())
    }.await;
    rpc.stop().await;
    assert!(result.is_ok(), "{result:?}");
}

#[tokio::test]
#[ignore = "Requires authenticated Codex CLI; consumes provider usage"]
async fn live_active_async_question_tool() {
    let mut provider = providers().into_iter().find(|p| p.id == "codex").unwrap();
    provider.command = std::env::var("HARBOR_SMOKE_COMMAND").unwrap();
    let dir = tempfile::Builder::new().prefix("harbor-active-question-").tempdir().unwrap();
    let cwd = dir.path().to_str().unwrap();
    let events = Arc::new(Mutex::new(Vec::<(String, Value)>::new()));
    let copy = events.clone();
    let rpc = Rpc::start(&provider, cwd, Arc::new(move |kind, payload| copy.lock().unwrap().push((kind.into(), payload)))).await.unwrap();
    let result: Result<(), String> = async {
        rpc.request("initialize", json!({"protocolVersion":1,"clientCapabilities":adapters::client_capabilities(adapters::SupportedProviderId::Codex)}), Some(Duration::from_secs(30))).await?;
        let session = rpc.request("session/new", json!({"cwd":cwd,"mcpServers":[]}), Some(Duration::from_secs(60))).await?;
        let sid = session["sessionId"].as_str().ok_or("Missing native session")?;
        rpc.request("session/set_config_option", json!({"sessionId":sid,"configId":"model","value":"gpt-6.1-terra"}), Some(Duration::from_secs(30))).await?;
        let turn = rpc.request("session/prompt", json!({"sessionId":sid,"prompt":[{"type":"text","text":"UI verification only. Do not read or write files, run commands, delegate, or make a plan. Use request_user_input_async now to ask: Which test color do you prefer? Offer Blue and Green. Then use the sleep tool to wait up to 60 seconds for my answer; keep this turn running. After I answer, confirm my answer and note verbatim, and finish."}]}), Some(Duration::from_secs(120)));
        tokio::pin!(turn);
        let request = loop {
            tokio::select! {
                done = &mut turn => { done?; return Err("Agent finished before the active question could be answered".into()); },
                _ = tokio::time::sleep(Duration::from_millis(100)) => {
                    if let Some(request) = rpc.inbound.lock().await.values().find(|r| adapters::codex::questions::is_async(r)).cloned() { break request; }
                }
            }
        };
        println!("Received question while native turn is active");
        let answer = json!({"action":"accept","content":{"question_0":"Blue","question_0_custom":"HARBOR-ACTIVE-QUESTION-NOTE"}});
        let text = rpc.async_question_answer(&request["id"], &answer).await?.ok_or("Missing answer text")?;
        let steered = rpc.request("_session/steering", json!({"sessionId":sid,"prompt":[{"type":"text","text":text}]}), Some(Duration::from_secs(30))).await?;
        println!("Steering response: {steered}");
        if steered["outcome"] != "injected" { return Err("Answer did not reach the existing active turn".into()); }
        rpc.record_async_answer(request["id"].clone(), answer).await?;
        turn.await?;
        let text = events.lock().unwrap().iter().filter(|(_,p)|p["update"]["sessionUpdate"]=="agent_message_chunk").map(|(_,p)|p["update"]["content"]["text"].as_str().unwrap_or("")).collect::<String>();
        println!("Active answer confirmation: {text}");
        if !text.contains("HARBOR-ACTIVE-QUESTION-NOTE") || !text.contains("Blue") { return Err("Active question answer or note was lost".into()); }
        Ok(())
    }.await;
    rpc.stop().await;
    assert!(result.is_ok(), "{result:?}");
}
