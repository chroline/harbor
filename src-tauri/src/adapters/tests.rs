use super::*;
use crate::providers::apply_configuration_update;
fn normalize_update(payload: Value) -> Value {
    get(SupportedProviderId::Codex).normalize_update(payload)
}
use crate::types::require_provider;
fn client_capabilities(id: &str) -> Value {
    super::client_capabilities(require_provider(id).unwrap())
}
fn native_resume_args(id: &str, session: &str) -> Result<Vec<String>, String> {
    super::native_resume_args(require_provider(id)?, session)
}
fn verified_versions(
    provider: &ProviderDefinition,
    init: &Value,
    adapter: &str,
    native: &str,
    same_executable: bool,
) -> bool {
    resolve(&provider.id)
        .unwrap()
        .handoff(&HandoffContext {
            provider,
            agent_name: init["agentInfo"]["name"].as_str(),
            agent_version: init["agentInfo"]["version"].as_str(),
            adapter_version: Some(adapter),
            native_version: Some(native),
            same_executable,
        })
        .available
}
fn forwarded_grok_worker(parent: &str, payload: &Value) -> Option<Value> {
    get(SupportedProviderId::Grok)
        .forwarded_worker(parent, payload)
        .map(|v| serde_json::to_value(v).unwrap())
}
fn worker_announcements(id: &str, kind: &str, payload: &Value) -> Vec<Value> {
    resolve(id)
        .unwrap()
        .worker_announcements(kind, payload)
        .into_iter()
        .map(|v| serde_json::to_value(v).unwrap())
        .collect()
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_handoff_requires_exact_versions_arguments_and_grok_executable() {
        let mut grok = crate::types::providers()
            .into_iter()
            .find(|p| p.id == "grok")
            .unwrap();
        let version = "grok 1.0.30 (04b7ffed98c6) [stable]";
        assert!(verified_versions(&grok, &json!({}), version, version, true));
        assert!(!verified_versions(
            &grok,
            &json!({}),
            version,
            version,
            false
        ));
        assert!(!verified_versions(
            &grok,
            &json!({}),
            version,
            "grok 1.0.31",
            true
        ));
        grok.args.push("--other-session-store".into());
        assert!(!verified_versions(
            &grok,
            &json!({}),
            version,
            version,
            true
        ));
        let codex = crate::types::providers()
            .into_iter()
            .find(|p| p.id == "codex")
            .unwrap();
        let init = json!({"agentInfo":{"name":"@agentclientprotocol/codex-acp","version":"2.1.1"}});
        assert!(verified_versions(
            &codex,
            &init,
            "@agentclientprotocol/codex-acp 2.1.1",
            "codex-cli 0.154.0",
            false
        ));
        assert!(!verified_versions(
            &codex,
            &init,
            "@agentclientprotocol/codex-acp 2.1.1",
            "codex-cli 0.155.0",
            false
        ));
        assert!(!verified_versions(
            &codex,
            &json!({}),
            "@agentclientprotocol/codex-acp 2.1.1",
            "codex-cli 0.154.0",
            false
        ));
        assert_eq!(
            native_resume_args("grok", "same").unwrap(),
            ["--no-auto-update", "--resume", "same"]
        );
        assert_eq!(
            native_resume_args("claude", "same").unwrap(),
            ["--resume", "same"]
        );
        assert_eq!(
            native_resume_args("codex", "same").unwrap(),
            ["resume", "same"]
        );
        assert!(native_resume_args("custom", "same").is_err());
    }
    #[test]
    fn grok_keeps_native_image_reads_instead_of_delegating_to_a_text_reader() {
        let caps = client_capabilities("grok");
        assert_eq!(caps["fs"]["readTextFile"], false);
        assert_eq!(caps["fs"]["writeTextFile"], true);
        for provider in ["claude", "codex"] {
            assert_eq!(client_capabilities(provider)["fs"]["readTextFile"], true);
        }
    }
    #[test]
    fn codex_negotiates_terminal_output_alongside_native_workers() {
        let caps = client_capabilities("codex");
        assert_eq!(caps["_meta"]["terminal_output"], true);
        assert_eq!(
            caps["_meta"]["jetbrains"]["air"]["capabilities"][0],
            "nativeSubagentSessions"
        );
    }
    #[test]
    fn mode_updates_synchronize_configuration_without_changing_collaboration_or_reasoning() {
        let mut session: crate::types::SessionRecord = serde_json::from_value(json!({
            "id":"chat", "title":"Chat", "providerId":"claude", "cwd":"/tmp",
            "status":"idle", "mode":"gui", "createdAt":0, "updatedAt":0,
            "configOptions":[{"id":"mode","currentValue":"agent"},{"id":"collaboration_mode","currentValue":"default"},{"id":"effort","currentValue":"high"}],
            "modes":{"currentModeId":"agent","availableModes":[{"id":"agent"},{"id":"plan"}]}, "models":null,
            "capabilities":{"loadSession":true,"resumeSession":false,"configOptions":true,"nativeHandoff":false,"nativeHandoffReason":"","raw":{}},
            "draft":"", "scrollTop":0, "reviewOpen":false, "archived":false
        })).unwrap();
        apply_configuration_update(
            &mut session,
            &json!({"sessionUpdate":"current_mode_update","currentModeId":"plan"}),
        );
        assert_eq!(session.modes["currentModeId"], "plan");
        assert_eq!(session.config_options[0]["currentValue"], "plan");
        assert_eq!(session.config_options[1]["currentValue"], "default");
        assert_eq!(session.config_options[2]["currentValue"], "high");
        apply_configuration_update(
            &mut session,
            &json!({"sessionUpdate":"config_option_update","configOptions":[{"id":"mode","currentValue":"ask"}]}),
        );
        assert_eq!(session.modes["currentModeId"], "ask");
        apply_configuration_update(
            &mut session,
            &json!({"sessionUpdate":"current_mode_update","currentModeId":null}),
        );
        assert_eq!(session.modes["currentModeId"], "ask");
    }
    #[test]
    fn malformed_update_shapes_remain_inert() {
        for value in [
            json!(null),
            json!(42),
            json!([]),
            json!({"update":"unknown"}),
        ] {
            assert_eq!(normalize_update(value.clone()), value);
        }
    }
    #[test]
    fn old_subagents_keep_identity_and_raw_data() {
        let p = json!({"sessionId":"parent","update":{"sessionUpdate":"subagent_spawned","subagentSessionId":"child","name":"Worker","task":"Review","capabilities":{}}});
        let v = normalize_update(p.clone());
        assert_eq!(v["sessionId"], "parent");
        assert_eq!(v["update"]["sessionId"], "child");
        assert_eq!(v["update"]["_legacy"], p["update"]);
        for id in [SupportedProviderId::Claude, SupportedProviderId::Grok] {
            assert_eq!(get(id).normalize_update(p.clone()), p);
        }
    }
}

#[cfg(test)]
mod worker_tests {
    use super::*;
    #[test]
    fn grok_forwarded_messages_identify_the_child_before_its_receipt() {
        let payload = json!({"sessionId":"child","update":{"sessionUpdate":"user_message_chunk","content":{"type":"text","text":"Original worker task"}}});
        let worker = forwarded_grok_worker("parent", &payload).unwrap();
        assert_eq!(worker["sessionId"], "parent");
        assert_eq!(worker["update"]["sessionId"], "child");
        assert_eq!(worker["update"]["state"]["type"], "working");
        assert!(forwarded_grok_worker("child", &payload).is_none());
        assert!(forwarded_grok_worker("", &payload).is_none());
        assert!(forwarded_grok_worker(
            "parent",
            &json!({"update":{"sessionUpdate":"agent_message_chunk"}})
        )
        .is_none());
    }
    #[test]
    fn grok_typed_worker_receipts_announce_real_sessions_and_states() {
        let mut payload = json!({"sessionId":"parent","update":{"sessionUpdate":"tool_call_update","rawOutput":{"type":"TaskOutput","Result":{"task_id":"child","command":"[subagent:general-purpose] Scout","status":"completed","output":"lighthouse"}}}});
        for (status, expected) in [
            ("running", "working"),
            ("initializing", "working"),
            ("completed", "idle"),
            ("cancelled", "idle"),
            ("failed", "error"),
        ] {
            payload["update"]["rawOutput"]["Result"]["status"] = json!(status);
            let updates = worker_announcements("grok", "session/update", &payload);
            assert_eq!(updates.len(), 1);
            assert_eq!(updates[0]["sessionId"], "parent");
            assert_eq!(updates[0]["update"]["sessionId"], "child");
            assert_eq!(updates[0]["update"]["title"], "Scout");
            assert_eq!(updates[0]["update"]["state"]["type"], expected);
            assert!(updates[0]["update"].get("content").is_none());
        }
        let foreground = json!({"sessionId":"parent","update":{"sessionUpdate":"tool_call_update","rawOutput":{"type":"SubagentCompleted","subagent_id":"child","resume_from_hint":"child","subagent_type":"explore","output":"Answer"}}});
        let updates = worker_announcements("grok", "session/update", &foreground);
        assert_eq!(updates[0]["update"]["sessionId"], "child");
        assert_eq!(updates[0]["update"]["state"]["type"], "idle");
        let batch = json!({"sessionId":"parent","update":{"sessionUpdate":"tool_call_update","rawOutput":{"type":"TaskOutput","MultiResult":{"results":[{"task_id":"child","command":"[subagent:explore] Scout","status":"completed"},{"task_id":"shell","command":"ls","status":"completed"}]}}}});
        assert_eq!(
            worker_announcements("grok", "session/update", &batch).len(),
            1
        );
    }
    #[test]
    fn grok_receipts_ignore_shell_tasks_start_acknowledgments_and_assistant_prose() {
        for raw in [
            json!({"type":"Text","text":"Subagent started in background.\nsubagent_id: child"}),
            json!({"type":"TaskOutput","Result":{"task_id":"shell","command":"echo subagent_id: fabricated","status":"completed"}}),
            json!({"type":"SubagentCompleted","subagent_id":"parent"}),
            json!({"type":"SubagentCompleted","subagent_id":"child","resume_from_hint":"different"}),
        ] {
            let payload = json!({"sessionId":"parent","update":{"sessionUpdate":"tool_call_update","rawOutput":raw}});
            assert!(worker_announcements("grok", "session/update", &payload).is_empty());
        }
        let payload = json!({"sessionId":"parent","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"subagent_id: child"}}});
        assert!(worker_announcements("grok", "session/update", &payload).is_empty());
        let no_parent = json!({"update":{"sessionUpdate":"tool_call_update","rawOutput":{"type":"SubagentCompleted","subagent_id":"child"}}});
        assert!(worker_announcements("grok", "session/update", &no_parent).is_empty());
    }
}

#[test]
fn registry_exports_the_typed_frontend_adapter_catalogue() {
    let mut catalogue = serde_json::Map::new();
    for id in IDS {
        let descriptor = get(*id).descriptor();
        assert_eq!(&descriptor.id, id);
        assert_eq!(descriptor.provider().id, id.as_str());
        assert!(catalogue
            .insert(
                id.as_str().into(),
                serde_json::to_value(descriptor).unwrap()
            )
            .is_none());
    }
    let source=format!("// Generated from Rust adapters::descriptors(); do not edit.\nimport type {{ AdapterDescriptor }} from './AdapterDescriptor';\nimport type {{ SupportedProviderId }} from './SupportedProviderId';\nexport const adapterDescriptors = {} satisfies {{ [Id in SupportedProviderId]: AdapterDescriptor & {{ id: Id }} }};\n",serde_json::to_string_pretty(&catalogue).unwrap());
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../src/lib/bindings/adapter-descriptors.ts"
    );
    if std::fs::read_to_string(path).ok().as_deref() != Some(&source) {
        std::fs::write(path, source).unwrap();
    }
}
#[test]
fn unsupported_hooks_are_explicit_and_invalid_wire_data_is_rejected() {
    for id in IDS {
        let adapter = get(*id);
        let descriptor = adapter.descriptor();
        assert_eq!(descriptor.id, *id);
        assert!(!adapter.version_args().is_empty());
        match adapter.plan_protocol() {
            Capability::Unsupported { reason } => assert!(!reason.is_empty()),
            Capability::Supported(protocol) => {
                assert!(!protocol.enabled(None, &[]));
                assert!(protocol
                    .permission(
                        &json!({"id":0,"method":protocol.method(),"params":{"sessionId":42}}),
                        None
                    )
                    .is_err());
                assert!(protocol
                    .response(&PermissionResponse {
                        outcome: PermissionOutcome::Selected {
                            option_id: "invented".into()
                        }
                    })
                    .is_err());
            }
        }
    }
    assert!(resolve("custom").is_err());
}
