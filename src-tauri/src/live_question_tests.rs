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
