//! Each fixture models provider-specific capabilities; live acceptance is separate.
use crate::{
    acp::{Rpc, Sink},
    diagnostics, model_config, adapters, sessions,
    types::*,
};
use serde_json::{json, Value};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
fn fixture(id: &str, scenario: &str) -> ProviderDefinition {
    let mut provider = providers().into_iter().find(|p| p.id == id).unwrap();
    provider.command = "node".into();
    provider.args = vec![
        format!("{}/../tests/providers/{id}.mjs", env!("CARGO_MANIFEST_DIR")),
        scenario.into(),
    ];
    if id == "grok" {
        provider.command = provider.args.remove(0);
    }
    provider.native_command = String::new();
    provider
}
#[tokio::test]
async fn all_three_diagnose_auth_protocol_and_success_without_prompts() {
    for id in ["codex", "claude", "grok"] {
        for (scenario, expected) in [
            ("normal", ProbeStatus::Ready),
            ("auth", ProbeStatus::AuthenticationRequired),
            ("protocol", ProbeStatus::IncompatibleProtocol),
        ] {
            let provider = fixture(id, scenario);
            let dir = tempfile::tempdir().unwrap();
            let cwd = dir.path().to_str().unwrap();
            let rpc = Rpc::start_discovery(&provider, cwd).await.unwrap();
            let mut result = diagnostics::installation(&provider).await;
            diagnostics::inspect(&rpc, cwd, &mut result).await;
            rpc.stop().await;
            assert_eq!(
                result.status, expected,
                "{id}/{scenario}: {}",
                result.message
            );
            assert_eq!(result.auth_methods[0]["id"], "cached");
            let log = std::fs::read_to_string(dir.path().join("protocol.log")).unwrap_or_default();
            assert!(!log.contains("session/prompt"));
            if expected == ProbeStatus::Ready {
                assert!(log.contains("session/close"));
            }
            assert!(!rpc.alive.load(std::sync::atomic::Ordering::SeqCst));
        }
    }
    assert_eq!(
        diagnostics::failure_status("session/new timed out"),
        ProbeStatus::TimedOut
    );
    assert_eq!(
        diagnostics::failure_status("server failed (-32000)"),
        ProbeStatus::ConnectionFailed
    );
}
#[tokio::test]
async fn all_three_roundtrip_configuration_questions_permissions_and_history() {
    for id in ["codex", "claude", "grok"] {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_str().unwrap();
        let events = Arc::new(Mutex::new(Vec::<(String, Value)>::new()));
        let copy = events.clone();
        let sink: Sink = Arc::new(move |kind, payload| {
            copy.lock()
                .unwrap()
                .push((kind.into(), adapters::resolve(id).unwrap().normalize_update(payload)))
        });
        let rpc = Rpc::start(&fixture(id, "normal"), cwd, sink.clone())
            .await
            .unwrap();
        rpc.request(
            "initialize",
            json!({"protocolVersion":1,"clientCapabilities":adapters::client_capabilities(crate::types::require_provider(id).unwrap())}),
            Some(Duration::from_secs(5)),
        )
        .await
        .unwrap();
        let response = rpc
            .request(
                "session/new",
                json!({"cwd":cwd,"mcpServers":[]}),
                Some(Duration::from_secs(5)),
            )
            .await
            .unwrap();
        let sid = response["sessionId"].as_str().unwrap();
        let mut config = model_config::from_response(&response);
        model_config::apply(
            &rpc,
            sid,
            &mut config,
            &if id == "grok" {
                json!({"model":"deep"})
            } else {
                json!({"model":"deep","fast-mode":true})
            },
            true,
        )
        .await
        .unwrap();
        assert_eq!(model_config::selections(&config)["model"], "deep");
        if id != "grok" {
            assert_eq!(model_config::selections(&config)["fast-mode"], true);
            assert_eq!(model_config::selections(&config)["effort"], "high");
        }
        for (prompt, answer) in [
            (
                "permission",
                json!({"outcome":{"outcome":"selected","optionId":"allow"}}),
            ),
            (
                "question",
                if id == "grok" { json!({"action":"accept","content":{"question_0":"backend"}}) } else { json!({"action":"accept","content":{"scope":"backend"}}) },
            ),
        ] {
            let prompt = rpc.request(
                "session/prompt",
                json!({"sessionId":sid,"prompt":[{"type":"text","text":prompt}]}),
                Some(Duration::from_secs(5)),
            );
            let respond = async {
                let request = tokio::time::timeout(Duration::from_secs(3), async {
                    loop {
                        if let Some(request) = rpc.inbound.lock().await.values().next().cloned() {
                            break request;
                        }
                        tokio::time::sleep(Duration::from_millis(5)).await;
                    }
                })
                .await
                .unwrap();
                assert!(rpc.answer(request["id"].clone(),json!({"action":"invalid","outcome":{"outcome":"selected","optionId":"invalid"}})).await.is_err());
                rpc.answer(request["id"].clone(), answer).await.unwrap();
            };
            let (result, ()) = tokio::join!(prompt, respond);
            result.unwrap();
        }
        for prompt in ["worker", "marker-713", "malformed"] {
            rpc.request(
                "session/prompt",
                json!({"sessionId":sid,"prompt":[{"type":"text","text":prompt}]}),
                Some(Duration::from_secs(5)),
            )
            .await
            .unwrap();
        }
        rpc.request("session/prompt",json!({"sessionId":sid,"prompt":[
            {"type":"text","text":"tools-and-attachments"},
            {"type":"image","mimeType":"image/png","data":"aGVsbG8="},
            {"type":"resource","resource":{"uri":"file:///note.txt","mimeType":"text/plain","text":"Context"}}
        ]}),Some(Duration::from_secs(5))).await.unwrap();
        rpc.stop().await;
        let reconnect = Rpc::start(&fixture(id, "normal"), cwd, sink).await.unwrap();
        reconnect
            .request(
                "initialize",
                json!({"protocolVersion":1}),
                Some(Duration::from_secs(5)),
            )
            .await
            .unwrap();
        let response = reconnect
            .request(
                "session/load",
                json!({"sessionId":sid,"cwd":cwd}),
                Some(Duration::from_secs(5)),
            )
            .await
            .unwrap();
        assert_eq!(sessions::identity(&response, Some(sid), true).unwrap(), sid);
        reconnect
            .request(
                "session/prompt",
                json!({"sessionId":sid,"prompt":[{"type":"text","text":"recall"}]}),
                Some(Duration::from_secs(5)),
            )
            .await
            .unwrap();
        reconnect.stop().await;
        let captured = events.lock().unwrap();
        assert!(captured
            .iter()
            .any(|(_, p)| p["update"]["sessionUpdate"] == "plan"
                && p["update"]["entries"][0]["status"] == "completed"));
        assert!(captured
            .iter()
            .any(|(_, p)| p["update"]["toolCallId"] == "read-attachment"
                && p["update"]["status"] == "completed"));
        assert!(captured.iter().any(|(_, p)| p["update"]["content"]["text"]
            .as_str()
            .is_some_and(|text| text.contains("marker-713"))));
        if id == "grok" {
            assert!(captured
                .iter()
                .any(|(kind, p)| !adapters::resolve(id).unwrap().worker_announcements(kind, p).is_empty()));
        } else {
            assert!(captured
                .iter()
                .any(|(_, p)| p["update"]["sessionUpdate"] == "subagent_update"
                    && p["update"]["sessionId"] == format!("{id}-child")));
        }
    }
}
#[tokio::test]
async fn all_three_cancel_pending_forms_and_reject_crashed_turns() {
    for id in ["codex", "claude", "grok"] {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_str().unwrap();
        let rpc = Rpc::start(&fixture(id, "normal"), cwd, Arc::new(|_, _| {}))
            .await
            .unwrap();
        rpc.request(
            "initialize",
            json!({"protocolVersion":1}),
            Some(Duration::from_secs(5)),
        )
        .await
        .unwrap();
        let response = rpc
            .request(
                "session/new",
                json!({"cwd":cwd,"mcpServers":[]}),
                Some(Duration::from_secs(5)),
            )
            .await
            .unwrap();
        let sid = response["sessionId"].as_str().unwrap();
        let prompt = rpc.request(
            "session/prompt",
            json!({"sessionId":sid,"prompt":[{"type":"text","text":"question"}]}),
            Some(Duration::from_secs(5)),
        );
        let cancel = async {
            tokio::time::timeout(Duration::from_secs(3), async {
                while rpc.inbound.lock().await.is_empty() {
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
            })
            .await
            .unwrap();
            rpc.cancel_requests().await;
            rpc.notify("session/cancel", json!({"sessionId":sid}))
                .await
                .unwrap();
        };
        let (result, ()) = tokio::join!(prompt, cancel);
        result.unwrap();
        assert!(rpc.inbound.lock().await.is_empty());
        assert!(!rpc.busy.load(std::sync::atomic::Ordering::SeqCst));
        let result = rpc
            .request(
                "session/prompt",
                json!({"sessionId":sid,"prompt":[{"type":"text","text":"crash"}]}),
                Some(Duration::from_secs(5)),
            )
            .await;
        assert!(result.is_err(), "{id} should reject a crashed turn");
        rpc.stop().await;
        assert!(!rpc.alive.load(std::sync::atomic::Ordering::SeqCst));
    }
}
#[tokio::test]
async fn grok_worker_attach_keeps_original_context_and_rejects_wrong_identity() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("child.json"), r#"["original-context"]"#).unwrap();
    let events = Arc::new(Mutex::new(Vec::new()));
    let copy = events.clone();
    let sink: Sink =
        Arc::new(move |kind, payload| copy.lock().unwrap().push((kind.to_owned(), payload)));
    let connection = crate::subagents::attach(
        &fixture("grok", "normal"),
        dir.path().to_str().unwrap(),
        "child",
        sink.clone(),
        |_| {},
    )
    .await
    .unwrap();
    connection
        .rpc
        .request(
            "session/prompt",
            json!({"sessionId":"child","prompt":[{"type":"text","text":"recall"}]}),
            Some(Duration::from_secs(5)),
        )
        .await
        .unwrap();
    connection.rpc.stop().await;
    assert!(events
        .lock()
        .unwrap()
        .iter()
        .any(|(_, p)| p["update"]["content"]["text"] == "original-context"));
    assert!(crate::subagents::attach(
        &fixture("grok", "wrong-id"),
        dir.path().to_str().unwrap(),
        "child",
        sink,
        |_| {}
    )
    .await
    .is_err());
}

async fn plan_prompt(rpc: &Rpc, sid: &str, text: &str, answer: Option<&str>) {
    let turn = rpc.request(
        "session/prompt",
        json!({"sessionId":sid,"prompt":[{"type":"text","text":text}]}),
        Some(Duration::from_secs(5)),
    );
    let reply = async {
        if let Some(answer) = answer {
            let request = tokio::time::timeout(Duration::from_secs(3), async {
                loop {
                    if let Some(request) = rpc.inbound.lock().await.values().next().cloned() {
                        break request;
                    }
                    tokio::time::sleep(Duration::from_millis(5)).await;
                }
            })
            .await
            .unwrap();
            let request = if request["method"] == "_x.ai/exit_plan_mode" {
                crate::adapters::grok_build::plan::permission(&request, None)
            } else {
                request
            };
            assert_eq!(request["params"]["sessionId"], sid);
            assert_eq!(request["params"]["toolCall"]["kind"], "switch_mode");
            if answer == "followup" {
                rpc.revise_pending_plan(sid).await.unwrap();
            } else if answer == "cancel" {
                rpc.cancel_requests().await;
                rpc.notify("session/cancel", json!({"sessionId":sid}))
                    .await
                    .unwrap();
            } else {
                let kind = if answer == "default" {
                    "allow_once"
                } else {
                    "reject_once"
                };
                let choice = request["params"]["options"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|o| o["kind"] == kind)
                    .unwrap();
                rpc.answer(
                    request["id"].clone(),
                    json!({"outcome":{"outcome":"selected","optionId":choice["optionId"]}}),
                )
                .await
                .unwrap();
            }
        }
    };
    let (result, ()) = tokio::join!(turn, reply);
    result.unwrap();
    assert!(rpc.inbound.lock().await.is_empty());
}

#[tokio::test]
async fn provider_plans_keep_files_and_identity_until_explicit_execution() {
    for id in ["codex", "claude", "grok"] {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_str().unwrap();
        let file = dir.path().join("greeting.txt");
        std::fs::write(&file, "hello\n").unwrap();
        let events = Arc::new(Mutex::new(Vec::<(String, Value)>::new()));
        let copy = events.clone();
        let sink: Sink =
            Arc::new(move |kind, payload| copy.lock().unwrap().push((kind.into(), payload)));
        let mut rpc = Rpc::start(&fixture(id, "normal"), cwd, sink.clone())
            .await
            .unwrap();
        rpc.request("initialize", json!({"protocolVersion":1}), None)
            .await
            .unwrap();
        let response = rpc
            .request("session/new", json!({"cwd":cwd}), None)
            .await
            .unwrap();
        let sid = response["sessionId"].as_str().unwrap();
        let mut config = model_config::from_response(&response);
        let key = if id == "codex" {
            "collaboration_mode"
        } else if id == "grok" {
            "__legacy_mode"
        } else {
            "mode"
        };
        model_config::apply(&rpc, sid, &mut config, &json!({key:"plan"}), true)
            .await
            .unwrap();
        assert_eq!(model_config::selections(&config)[key], "plan");
        if id == "codex" {
            assert_eq!(model_config::selections(&config)["mode"], "agent");
        }
        plan_prompt(
            &rpc,
            sid,
            "plan-change",
            if id == "codex" { Some("reject") } else { None },
        )
        .await;
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "hello\n");
        rpc.stop().await;
        rpc = Rpc::start(&fixture(id, "normal"), cwd, sink).await.unwrap();
        rpc.request("initialize", json!({"protocolVersion":1}), None)
            .await
            .unwrap();
        let loaded = rpc
            .request("session/load", json!({"sessionId":sid,"cwd":cwd}), None)
            .await
            .unwrap();
        assert_eq!(sessions::identity(&loaded, Some(sid), true).unwrap(), sid);
        assert_eq!(
            model_config::selections(&model_config::from_response(&loaded))[key],
            "plan"
        );
        for outcome in ["reject", "cancel", "followup"] {
            plan_prompt(&rpc, sid, "execute-plan", Some(outcome)).await;
            assert_eq!(std::fs::read_to_string(&file).unwrap(), "hello\n");
        }
        plan_prompt(&rpc, sid, "execute-plan", Some("default")).await;
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "ahoy\n");
        let captured = events.lock().unwrap().clone();
        assert!(captured.iter().any(|(_, p)| if id != "codex" {
            p["update"]["sessionUpdate"] == "current_mode_update"
                && p["update"]["currentModeId"] == "default"
        } else {
            p["update"]["sessionUpdate"] == "config_option_update"
                && p["update"]["configOptions"].as_array().is_some_and(|a| {
                    a.iter()
                        .any(|o| o["id"] == "collaboration_mode" && o["currentValue"] == "default")
                })
        }));
        rpc.stop().await;
    }
}

#[tokio::test]
async fn mode_configuration_requires_confirmation_and_handles_delay_or_rejection() {
    for scenario in ["unconfirmed-mode", "reject-mode", "delay-mode"] {
        let dir = tempfile::tempdir().unwrap();
        let cwd = dir.path().to_str().unwrap();
        let rpc = Rpc::start(&fixture("codex", scenario), cwd, Arc::new(|_, _| {}))
            .await
            .unwrap();
        rpc.request("initialize", json!({"protocolVersion":1}), None)
            .await
            .unwrap();
        let response = rpc
            .request("session/new", json!({"cwd":cwd}), None)
            .await
            .unwrap();
        let sid = response["sessionId"].as_str().unwrap();
        let mut config = model_config::from_response(&response);
        let result = model_config::apply(
            &rpc,
            sid,
            &mut config,
            &json!({"collaboration_mode":"plan"}),
            true,
        )
        .await;
        rpc.stop().await;
        if scenario == "delay-mode" {
            result.unwrap();
            assert_eq!(
                model_config::selections(&config)["collaboration_mode"],
                "plan"
            );
            assert_eq!(model_config::selections(&config)["mode"], "agent");
        } else {
            assert!(result.is_err(), "{scenario} must not acknowledge Plan");
        }
    }
}

#[tokio::test]
async fn unverified_grok_version_does_not_invent_a_mode_catalogue() {
    let dir = tempfile::tempdir().unwrap();
    let mut provider = fixture("grok", "normal");
    // Wrapper's --version reports Node rather than the verified Grok build.
    provider.args.insert(0, provider.command.clone());
    provider.command = "node".into();
    let rpc = Rpc::start(&provider, dir.path().to_str().unwrap(), Arc::new(|_, _| {}))
        .await
        .unwrap();
    let response = rpc
        .request("session/new", json!({"cwd":dir.path()}), None)
        .await
        .unwrap();
    assert!(!rpc.plan_protocol.is_supported());
    assert!(response["modes"].is_null());
    let mut config = model_config::from_response(&response);
    assert!(model_config::apply(
        &rpc,
        response["sessionId"].as_str().unwrap(),
        &mut config,
        &json!({"__legacy_mode":"plan"}),
        true
    )
    .await
    .is_err());
    rpc.stop().await;
}
