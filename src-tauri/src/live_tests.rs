//! Opt-in tests use existing provider authentication and can consume model usage.
use crate::{
    acp::{Rpc, Sink},
    terminal::NativeTerminal,
    types::*,
};
use serde_json::{json, Value};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

#[tokio::test]
#[ignore = "Requires a logged-in local provider; run with HARBOR_SMOKE_COMMAND"]
async fn live_provider_smoke() {
    let command = std::env::var("HARBOR_SMOKE_COMMAND").expect("HARBOR_SMOKE_COMMAND required");
    let args: Vec<String> =
        serde_json::from_str(&std::env::var("HARBOR_SMOKE_ARGS").unwrap_or("[]".into())).unwrap();
    let provider_id = std::env::var("HARBOR_SMOKE_PROVIDER").unwrap_or("codex".into());
    let work = std::env::var("HARBOR_SMOKE_WORKDIR").expect("HARBOR_SMOKE_WORKDIR required");
    let provider = ProviderDefinition {
        id: provider_id.clone(),
        name: provider_id.clone(),
        command,
        args,
        native_command: provider_id.clone(),
        install_hint: String::new(),
        color: String::new(),
    };
    let events = Arc::new(Mutex::new(Vec::<(String, Value)>::new()));
    let output = events.clone();
    let parent_wire = Arc::new(Mutex::new(None::<String>));
    let parent_wire_cb = parent_wire.clone();
    let provider_cb = provider_id.clone();
    let sink: Sink = Arc::new(move |kind, mut value| {
        if kind == "cursor/task" && !value["sessionId"].is_string() {
            value["sessionId"] = json!(*parent_wire_cb.lock().unwrap());
        }
        let announcements = crate::providers::worker_announcements(&provider_cb, kind, &value);
        let mut output = output.lock().unwrap();
        for announcement in announcements {
            output.push(("session/update".into(), announcement));
        }
        output.push((
            kind.into(),
            if kind == "session/update" {
                crate::providers::normalize_update(value)
            } else {
                value
            },
        ))
    });
    let rpc = Rpc::start(&provider, &work, sink.clone()).await.unwrap();
    let init=rpc.request("initialize",json!({"protocolVersion":1,"clientCapabilities":crate::providers::client_capabilities(&provider_id),"clientInfo":{"name":"harbor-smoke","version":"0.1.0"}}),Some(Duration::from_secs(30))).await.unwrap();
    println!("Agent: {}", init["agentInfo"]);
    let session = rpc
        .request(
            "session/new",
            json!({"cwd":work,"mcpServers":[]}),
            Some(Duration::from_secs(90)),
        )
        .await
        .unwrap();
    let sid = session["sessionId"].as_str().unwrap().to_string();
    *parent_wire.lock().unwrap() = Some(sid.clone());
    println!(
        "Session established; configuration: {}",
        session["configOptions"].as_array().map(|opts|opts.iter().map(|o|json!({"id":o["id"],"currentValue":o["currentValue"],"options":o["options"].as_array().map(Vec::len)})).collect::<Vec<_>>()).map(|v|json!(v)).unwrap_or(Value::Null)
    );
    if std::env::var("HARBOR_SMOKE_CONNECT_ONLY").is_ok() {
        let mut config = crate::model_config::from_response(&session);
        let original = crate::model_config::selections(&config);
        let check = async {
            if std::env::var("HARBOR_SMOKE_CONFIG_ROUNDTRIP").is_ok() {
                let option = config
                    .config_options
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|o| o["category"] == "model")
                    .expect("No model control");
                let model = option["options"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|o| o["value"] != option["currentValue"])
                    .expect("No alternative model")["value"]
                    .clone();
                let key = option["id"].as_str().unwrap().to_owned();
                crate::model_config::apply(
                    &rpc,
                    &sid,
                    &mut config,
                    &json!({key.clone():model}),
                    true,
                )
                .await?;
                if crate::model_config::selections(&config)[&key] != model {
                    return Err("Model selection did not round-trip".to_string());
                }
                // Return to the original model before checking its reasoning choices.
                crate::model_config::apply(&rpc, &sid, &mut config, &original, true).await?;
                let option = config
                    .config_options
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|o| o["category"] == "thought_level")
                    .expect("No reasoning control");
                let effort = option["options"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|o| o["value"] != option["currentValue"])
                    .expect("No alternative reasoning effort")["value"]
                    .clone();
                let key = option["id"].as_str().unwrap().to_owned();
                crate::model_config::apply(
                    &rpc,
                    &sid,
                    &mut config,
                    &json!({key.clone():effort}),
                    true,
                )
                .await?;
                if crate::model_config::selections(&config)[&key] != effort {
                    return Err("Reasoning selection did not round-trip".to_string());
                }
                println!("Model and reasoning changes round-tripped through ACP");
            }
            Ok::<(), String>(())
        }
        .await;
        // Restore preferences even if a configuration request failed.
        let restore = crate::model_config::apply(&rpc, &sid, &mut config, &original, true).await;
        if init["agentCapabilities"]["sessionCapabilities"]
            .get("close")
            .is_some()
        {
            let _ = rpc
                .request(
                    "session/close",
                    json!({"sessionId":sid}),
                    Some(Duration::from_secs(5)),
                )
                .await;
        }
        rpc.stop().await;
        restore.expect("Could not restore original configuration");
        check.unwrap();
        return;
    }
    // Select a valid advertised model rather than relying on hardcoded model names.
    if let Ok(model) = std::env::var("HARBOR_SMOKE_MODEL") {
        let config = session["configOptions"]
            .as_array()
            .and_then(|a| a.iter().find(|o| o["category"] == "model"))
            .map(|o| o["id"].clone());
        let r = if let Some(config) = config {
            rpc.request(
                "session/set_config_option",
                json!({"sessionId":sid,"configId":config,"value":model}),
                Some(Duration::from_secs(30)),
            )
            .await
        } else {
            rpc.request(
                "session/set_model",
                json!({"sessionId":sid,"modelId":model}),
                Some(Duration::from_secs(30)),
            )
            .await
        };
        r.unwrap();
    }
    let token = format!("HARBOR-{}", id());
    let worker_roundtrip = std::env::var("HARBOR_SMOKE_WORKER_ROUNDTRIP").is_ok();
    let child_memory = format!("CHILD-MEMORY-{}", id());
    let prompt = if worker_roundtrip {
        format!("Harbor worker integration test. {} Spawn exactly one subagent. Its task: remember the marker {child_memory}, reply lighthouse, then remain available for a user follow-up. It must not modify files or use tools. Wait for it, then reply with {token} and the worker's identity. Do not do any other work.",if provider_id == "pi" {"Use the builtin delegate agent."} else {""})
    } else if provider_id == "codex" {
        format!("This is a Harbor client integration test. Remember the exact marker {token}. Spawn exactly one subagent to reply with the word lighthouse; it must not modify files or use tools. Wait for its response. Reply with the marker and the subagent's answer. Do not use other tools.")
    } else {
        format!("This is a Harbor client integration test. Remember {token}. Reply with the marker only. Do not use tools or change files.")
    };
    let result = rpc
        .request(
            "session/prompt",
            json!({"sessionId":sid,"prompt":[{"type":"text","text":prompt}]}),
            Some(Duration::from_secs(180)),
        )
        .await;
    if let Err(e) = &result {
        let requests: Vec<_> = events
            .lock()
            .unwrap()
            .iter()
            .filter(|(k, _)| k == "request" || k == "diagnostic")
            .cloned()
            .collect();
        println!("Diagnostics: {}", serde_json::to_string(&requests).unwrap());
        println!("Prompt error: {e}");
    }
    result.unwrap();
    let first = events.lock().unwrap().clone();
    let text = first
        .iter()
        .filter(|(k, v)| {
            k == "session/update" && v["update"]["sessionUpdate"] == "agent_message_chunk"
        })
        .map(|(_, v)| v["update"]["content"]["text"].as_str().unwrap_or(""))
        .collect::<String>();
    assert!(
        text.contains(&token),
        "Agent response did not contain the marker: {text}"
    );
    let children = first
        .iter()
        .filter(|(k, v)| k == "session/update" && v["update"]["sessionUpdate"] == "subagent_update")
        .count();
    println!("Prompt succeeded; {children} subagent updates received. Response: {text}");
    if provider_id == "codex" && children == 0 {
        println!(
            "Update variants: {:?}",
            first
                .iter()
                .map(|(k, v)| (
                    k,
                    v["update"]["sessionUpdate"].clone(),
                    v["update"]["title"].clone()
                ))
                .collect::<Vec<_>>()
        );
    }
    if provider_id == "codex" && std::env::var("HARBOR_SMOKE_REQUIRE_SUBAGENT").is_ok() {
        assert!(children > 0, "Codex did not expose its spawned worker");
        let child = first
            .iter()
            .find(|(_, v)| {
                v["sessionId"] == sid && v["update"]["sessionUpdate"] == "subagent_update"
            })
            .expect("Worker was not attached to the correct parent")
            .1["update"]["sessionId"]
            .clone();
        assert!(
            first.iter().any(|(_, v)| v["sessionId"] == child
                && v["update"]["sessionUpdate"] == "agent_message_chunk"),
            "No live worker transcript received"
        );
    }
    if worker_roundtrip {
        let child_update = first
            .iter()
            .find_map(|(_, v)| {
                (v["sessionId"] == sid && v["update"]["sessionUpdate"] == "subagent_update")
                    .then_some(v["update"].clone())
            })
            .expect(
                "Provider did not expose a worker identity through its protocol or tool receipts",
            );
        let child = child_update["sessionId"].as_str().unwrap().to_owned();
        let worker_record = SubagentRecord {
            session_id: child.clone(),
            parent_id: sid.clone(),
            title: child_update["title"].as_str().unwrap_or("Worker").into(),
            description: None,
            state: json!({"type":"idle"}),
            capabilities: json!({}),
        };
        println!("Opening existing worker {child}");
        let worker_events = Arc::new(Mutex::new(Vec::<(String, Value)>::new()));
        let captured = worker_events.clone();
        let attached = if matches!(provider_id.as_str(), "codex" | "claude" | "pi") {
            None
        } else {
            match crate::subagents::attach(
                &provider,
                &work,
                &child,
                false,
                Arc::new(move |kind, payload| {
                    captured.lock().unwrap().push((kind.into(), payload))
                }),
                |_| {},
            )
            .await
            {
                Ok(worker) => Some(worker),
                Err(error) => {
                    println!(
                        "Standalone worker attachment unavailable, using parent relay: {error}"
                    );
                    None
                }
            }
        };
        let nonce = format!("WORKER-FOLLOWUP-{}", id());
        let followup = format!("Do not use tools. Recall the marker from your original task and reply with that marker plus {nonce}.");
        let start = events.lock().unwrap().len();
        let (target, wire_id, prompt) = if let Some(worker) = &attached {
            (worker.rpc.clone(), worker.wire_id.clone(), followup)
        } else {
            (
                rpc.clone(),
                sid.clone(),
                crate::subagents::relay_prompt(&worker_record, &followup),
            )
        };
        let result = target
            .request(
                "session/prompt",
                json!({"sessionId":wire_id,"prompt":[{"type":"text","text":prompt}]}),
                Some(Duration::from_secs(120)),
            )
            .await;
        if attached.is_none() && result.is_ok() {
            crate::subagents::wait_for_children(&rpc, || {
                let mut states = std::collections::HashMap::new();
                for (_, p) in events.lock().unwrap()[start..].iter() {
                    if p["update"]["sessionUpdate"] == "subagent_update" {
                        if let Some(id) = p["update"]["sessionId"].as_str() {
                            if crate::subagents::same_worker(id, &child) {
                                states.insert(id.to_owned(), p["update"]["state"].clone());
                            }
                        }
                    }
                }
                Ok(states.values().any(crate::subagents::is_working))
            })
            .await
            .unwrap();
        }
        if let Some(worker) = &attached {
            worker.rpc.stop().await;
        }
        rpc.stop().await;
        result.expect("Worker follow-up failed");
        let updates = if attached.is_some() {
            worker_events.lock().unwrap().clone()
        } else {
            events.lock().unwrap()[start..].to_vec()
        };
        let response = updates
            .iter()
            .filter(|(_, v)| {
                (v["sessionId"] == wire_id
                    || v["sessionId"]
                        .as_str()
                        .is_some_and(|id| crate::subagents::same_worker(id, &child)))
                    && v["update"]["sessionUpdate"] == "agent_message_chunk"
            })
            .map(|(_, v)| v["update"]["content"]["text"].as_str().unwrap_or(""))
            .collect::<String>();
        assert!(
            response.contains(&child_memory) && response.contains(&nonce),
            "{provider_id} worker failed original-context recall: {response}"
        );
        if attached.is_none() {
            let continuation = if provider_id == "codex" {
                let home = std::env::var_os("CODEX_HOME")
                    .map(std::path::PathBuf::from)
                    .unwrap_or_else(|| {
                        std::path::PathBuf::from(std::env::var_os("HOME").unwrap()).join(".codex")
                    });
                walkdir::WalkDir::new(home.join("sessions"))
                    .max_depth(6)
                    .into_iter()
                    .filter_map(Result::ok)
                    .filter(|entry| {
                        entry
                            .file_name()
                            .to_string_lossy()
                            .ends_with(&format!("{child}.jsonl"))
                    })
                    .any(|entry| {
                        std::fs::read_to_string(entry.path())
                            .unwrap_or_default()
                            .lines()
                            .filter_map(|line| serde_json::from_str::<Value>(line).ok())
                            .any(|entry| {
                                entry["type"] == "response_item"
                                    && entry["payload"]["role"] == "assistant"
                                    && entry["payload"].to_string().contains(&nonce)
                                    && entry["payload"].to_string().contains(&child_memory)
                            })
                    })
            } else if provider_id == "cursor" {
                updates.iter().any(|(kind, v)| {
                    kind == "cursor/task"
                        && v["prompt"]
                            .as_str()
                            .is_some_and(|prompt| prompt.contains(&nonce))
                        && v["agentId"].as_str().is_some_and(|id| text.contains(id))
                })
            } else {
                updates.iter().any(|(_, v)| {
                    let input = v["update"]["rawInput"].to_string();
                    input.contains(&nonce)
                        && [
                            "target",
                            "recipient",
                            "\"to\"",
                            "resume",
                            "agentId",
                            "agent_id",
                            "task_id",
                            "session_id",
                            "\"id\"",
                        ]
                        .iter()
                        .any(|key| input.contains(key))
                })
            };
            assert!(
                continuation,
                "Parent answered without exposing a native worker continuation call"
            );
        }
        println!(
            "Live {provider_id} worker round-trip passed ({}): {response}",
            if attached.is_some() {
                "direct"
            } else {
                "parent relay"
            }
        );
        return;
    }
    rpc.stop().await;
    if std::env::var("HARBOR_SMOKE_HANDOFF").is_err() {
        return;
    }
    let native = std::env::var("HARBOR_SMOKE_NATIVE").unwrap_or(provider_id.clone());
    let second = format!("KELP-{}", id());
    let prompt=format!("What marker did I ask you to remember earlier? Reply with that original marker only, and remember a second marker {second} for the next turn. Do not use tools.");
    let args = match provider_id.as_str() {
        "codex" => vec!["resume".into(), sid.clone(), prompt],
        "claude" => vec!["--resume".into(), sid.clone(), prompt],
        _ => panic!("Add a verified native resume adapter first"),
    };
    let native_output = Arc::new(Mutex::new(String::new()));
    let buffer = native_output.clone();
    let terminal_slot = Arc::new(Mutex::new(None::<Arc<NativeTerminal>>));
    let slot = terminal_slot.clone();
    let native_sink: Sink = Arc::new(move |kind, v| {
        if kind == "terminal/data" {
            let bytes: Vec<u8> = v["bytes"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|v| v.as_u64().map(|n| n as u8))
                .collect();
            let text = String::from_utf8_lossy(&bytes);
            buffer.lock().unwrap().push_str(&text);
            if let Some(t) = slot.lock().unwrap().as_ref() {
                if text.contains("\u{1b}[6n") {
                    let _ = t.write("\u{1b}[1;1R");
                }
                if text.contains("\u{1b}[c") {
                    let _ = t.write("\u{1b}[?1;2c");
                }
                if text.contains("\u{1b}]11;?") {
                    let _ = t.write("\u{1b}]11;rgb:1616/1818/1919\u{1b}\\");
                }
            }
        }
    });
    let terminal = NativeTerminal::start(&native, &args, &work, native_sink).unwrap();
    *terminal_slot.lock().unwrap() = Some(terminal.clone());
    let result = tokio::time::timeout(Duration::from_secs(120), async {
        let mut trusted = false;
        loop {
            let out = native_output.lock().unwrap().clone();
            if out
                .rfind(&second)
                .is_some_and(|i| out[i + second.len()..].contains(&token))
            {
                break;
            }
            if !trusted && out.contains("Yes, continue") {
                assert!(
                    work.ends_with("/work/live-repo"),
                    "Only trust the generated integration fixture"
                );
                terminal.write("\r").unwrap();
                trusted = true;
            }
            if !terminal.alive.load(std::sync::atomic::Ordering::SeqCst) {
                panic!("Native CLI exited: {out}")
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    })
    .await;
    if result.is_err() {
        println!("Native output: {}", native_output.lock().unwrap());
        terminal.stop();
        panic!("Native CLI did not recall the ACP marker")
    }
    tokio::time::sleep(Duration::from_secs(2)).await;
    terminal.write("/exit\r").unwrap();
    tokio::time::sleep(Duration::from_secs(2)).await;
    terminal.stop();
    terminal_slot.lock().unwrap().take();
    events.lock().unwrap().clear();
    let rpc = Rpc::start(&provider, &work, sink).await.unwrap();
    rpc.request("initialize",json!({"protocolVersion":1,"clientCapabilities":{"subagents":{}},"clientInfo":{"name":"harbor-smoke","version":"0.1.0"}}),Some(Duration::from_secs(30))).await.unwrap();
    rpc.request(
        "session/load",
        json!({"sessionId":sid,"cwd":work,"mcpServers":[]}),
        Some(Duration::from_secs(90)),
    )
    .await
    .unwrap();
    assert!(
        events
            .lock()
            .unwrap()
            .iter()
            .any(|(_, v)| v["update"]["content"]["text"]
                .as_str()
                .is_some_and(|text| text.contains(&second))),
        "Replayed history is missing the native CLI message"
    );
    events.lock().unwrap().clear();
    rpc.request("session/prompt",json!({"sessionId":sid,"prompt":[{"type":"text","text":"Reply with the second marker from my most recent request. Do not use tools."}]}),Some(Duration::from_secs(120))).await.unwrap();
    let text = events
        .lock()
        .unwrap()
        .iter()
        .filter(|(k, v)| {
            k == "session/update" && v["update"]["sessionUpdate"] == "agent_message_chunk"
        })
        .map(|(_, v)| v["update"]["content"]["text"].as_str().unwrap_or(""))
        .collect::<String>();
    rpc.stop().await;
    assert!(
        text.contains(&second),
        "GUI did not recall native CLI turn: {text}"
    );
    println!("VERIFIED: same conversation survived ACP -> native PTY CLI -> ACP");
}
