//! Provider extensions are deliberately isolated from the ACP v1 transport.
use crate::{acp::resolve_executable, types::ProviderDefinition};
use serde_json::{json, Value};

pub fn apply_configuration_update(session: &mut crate::types::SessionRecord, update: &Value) {
    if update["sessionUpdate"] == "config_option_update" && update["configOptions"].is_array() {
        session.config_options = update["configOptions"].clone();
        if let Some(option) = session.config_options.as_array().and_then(|a| {
            a.iter()
                .find(|o| o["id"] == "mode" || o["category"] == "mode")
        }) {
            if session.modes.is_object() {
                session.modes["currentModeId"] = option["currentValue"].clone();
            }
        }
    } else if update["sessionUpdate"] == "current_mode_update"
        && update["currentModeId"].is_string()
    {
        if !session.modes.is_object() {
            session.modes = json!({});
        }
        session.modes["currentModeId"] = update["currentModeId"].clone();
        if let Some(opts) = session.config_options.as_array_mut() {
            for option in opts {
                if option["id"] == "mode" || option["category"] == "mode" {
                    option["currentValue"] = update["currentModeId"].clone();
                }
            }
        }
    }
}

async fn version(command: &str) -> Option<String> {
    let exe = resolve_executable(command)?;
    let mut cmd = tokio::process::Command::new(exe);
    cmd.arg("--version").kill_on_drop(true);
    let output = tokio::time::timeout(std::time::Duration::from_secs(5), cmd.output())
        .await
        .ok()?
        .ok()?;
    output
        .status
        .success()
        .then(|| String::from_utf8_lossy(&output.stdout).trim().to_string())
}
/// Matrix entry backed by the opt-in live ACP -> PTY -> ACP acceptance test.
pub async fn verified_handoff(provider: &ProviderDefinition, init: &Value) -> bool {
    if provider.id != "codex"
        || !provider.args.is_empty()
        || init["agentInfo"]["name"] != "@agentclientprotocol/codex-acp"
        || init["agentInfo"]["version"] != "2.1.1"
    {
        return false;
    }
    let (adapter, native) = tokio::join!(
        version(&provider.command),
        version(&provider.native_command)
    );
    adapter.as_deref() == Some("@agentclientprotocol/codex-acp 2.1.1")
        && native.as_deref() == Some("codex-cli 0.154.0")
}
pub fn client_capabilities(provider: &str) -> Value {
    let mut caps = json!({"fs":{"readTextFile":true,"writeTextFile":true},"terminal":true,"subagents":{},"session":{"configOptions":{"boolean":{}}}});
    // Released Codex adapter 2.1.1's schema strips the draft top-level field.
    if provider == "codex" {
        caps["_meta"] =
            json!({"terminal_output":true,"jetbrains":{"air":{"version":1,"capabilities":["nativeSubagentSessions"]}}});
    }
    caps
}
pub fn normalize_update(mut payload: Value) -> Value {
    if !payload.is_object() || !payload["update"].is_object() {
        return payload;
    }
    let original = payload["update"].clone();
    let update = &mut payload["update"];
    match original["sessionUpdate"].as_str() {
        Some("subagent_spawned") => {
            *update = json!({"sessionUpdate":"subagent_update","sessionId":original["subagentSessionId"],"title":original["name"],"description":original["task"],"state":{"type":"working"},"capabilities":original["capabilities"],"_legacy":original});
        }
        Some("subagent_state_update") => {
            *update = json!({"sessionUpdate":"subagent_update","sessionId":original["subagentSessionId"],"state":{"type":original["state"]},"_legacy":original});
        }
        _ => {}
    }
    payload
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn codex_negotiates_terminal_output_alongside_native_workers() {
        let caps = client_capabilities("codex");
        assert_eq!(caps["_meta"]["terminal_output"], true);
        assert_eq!(caps["_meta"]["jetbrains"]["air"]["capabilities"][0], "nativeSubagentSessions");
    }
    #[test]
    fn mode_updates_synchronize_configuration_without_changing_collaboration_or_reasoning() {
        let mut session: crate::types::SessionRecord = serde_json::from_value(json!({
            "id":"chat", "title":"Chat", "providerId":"cursor", "cwd":"/tmp",
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
    }
}

/// Grok forwards child messages before its typed worker receipt arrives.
/// The owning connection supplies the parent; the notification supplies the child.
pub fn forwarded_grok_worker(parent: &str, payload: &Value) -> Option<Value> {
    let child = payload["sessionId"].as_str()?;
    if parent.is_empty()
        || child.is_empty()
        || child == parent
        || !matches!(
            payload["update"]["sessionUpdate"].as_str(),
            Some(
                "user_message_chunk"
                    | "agent_message_chunk"
                    | "agent_thought_chunk"
                    | "tool_call"
                    | "tool_call_update"
            )
        )
    {
        return None;
    }
    Some(
        json!({"sessionId":parent,"update":{"sessionUpdate":"subagent_update","sessionId":child,"title":"Grok worker","state":{"type":"working"}}}),
    )
}

/// Worker identities exposed in released provider extensions/tool receipts.
/// This deliberately never guesses a worker ID from assistant prose.
pub fn worker_announcements(provider: &str, kind: &str, payload: &Value) -> Vec<Value> {
    let mut workers = vec![];
    let parent = payload["sessionId"].clone();
    let mut add = |id: &str, title: &str, description: Value, state: &str| {
        if !id.is_empty() && parent.as_str() != Some(id) {
            workers.push(json!({"sessionId":parent,"update":{"sessionUpdate":"subagent_update","sessionId":id,"title":title,"description":description,"state":{"type":state}}}));
        }
    };
    if kind == "cursor/task" {
        let id = payload["agentId"]
            .as_str()
            .filter(|id| !id.is_empty())
            .or_else(|| payload["toolCallId"].as_str());
        if let Some(id) = id {
            add(
                id,
                payload["description"]
                    .as_str()
                    .filter(|v| !v.is_empty())
                    .unwrap_or("Cursor worker"),
                payload["prompt"].clone(),
                if payload["durationMs"].is_number() {
                    "idle"
                } else {
                    "working"
                },
            );
        }
    }
    let update = &payload["update"];
    if kind == "session/update" && update["sessionUpdate"] == "tool_call_update" {
        // Grok's lifecycle events are local-log-only in 1.0.30. Its typed
        // completion and poll receipts carry authoritative child session IDs.
        if provider == "grok" && parent.as_str().is_some_and(|id| !id.is_empty()) {
            let output = &update["rawOutput"];
            if output["type"] == "SubagentCompleted" {
                if let Some(child) = output["subagent_id"].as_str() {
                    if output["resume_from_hint"]
                        .as_str()
                        .is_none_or(|id| id == child)
                    {
                        add(
                            child,
                            update["title"]
                                .as_str()
                                .filter(|s| !s.is_empty())
                                .unwrap_or("Grok worker"),
                            Value::Null,
                            "idle",
                        );
                    }
                }
            } else if output["type"] == "TaskOutput" {
                let results = std::iter::once(&output["Result"]).chain(
                    output["MultiResult"]["results"]
                        .as_array()
                        .into_iter()
                        .flatten(),
                );
                for result in results {
                    let Some((_, title)) = result["command"]
                        .as_str()
                        .and_then(|s| s.strip_prefix("[subagent:"))
                        .and_then(|s| s.split_once("] "))
                    else {
                        continue;
                    };
                    let Some(child) = result["task_id"].as_str() else {
                        continue;
                    };
                    let state = match result["status"].as_str() {
                        Some("initializing" | "running") => "working",
                        Some("completed" | "cancelled") => "idle",
                        Some("failed" | "timed_out") => "error",
                        _ => "unknown",
                    };
                    add(
                        child,
                        if title.is_empty() {
                            "Grok worker"
                        } else {
                            title
                        },
                        Value::Null,
                        state,
                    );
                }
            }
        }
        if provider == "opencode" {
            let metadata = &update["rawOutput"]["metadata"];
            if let Some(id) = metadata["sessionId"].as_str() {
                if metadata["parentSessionId"] == parent {
                    add(
                        id,
                        update["title"].as_str().unwrap_or("OpenCode worker"),
                        update["rawInput"]["prompt"].clone(),
                        "idle",
                    );
                }
            }
        }
        if provider == "pi" {
            fn results<'a>(value: &'a Value, depth: usize, out: &mut Vec<&'a Value>) {
                if depth > 8 {
                    return;
                }
                if value["artifactPaths"]["outputPath"].is_string() {
                    out.push(value);
                }
                match value {
                    Value::Array(items) => {
                        for item in items {
                            results(item, depth + 1, out);
                        }
                    }
                    Value::Object(fields) => {
                        for value in fields.values() {
                            results(value, depth + 1, out);
                        }
                    }
                    _ => {}
                }
            }
            let mut entries = vec![];
            results(&update["rawOutput"]["details"], 0, &mut entries);
            for entry in entries {
                let path =
                    std::path::Path::new(entry["artifactPaths"]["outputPath"].as_str().unwrap());
                let id = entry["runId"].as_str().or_else(|| {
                    path.file_stem()
                        .and_then(|v| v.to_str())
                        .and_then(|v| v.rsplit('_').next())
                });
                if let Some(id) = id.filter(|id| uuid::Uuid::parse_str(id).is_ok()) {
                    add(
                        id,
                        entry["agent"].as_str().unwrap_or("Pi worker"),
                        Value::Null,
                        "idle",
                    );
                }
            }
        }
    }
    workers
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
    #[test]
    fn open_code_task_receipts_announce_only_the_matching_parent() {
        let p = json!({"sessionId":"root","update":{"sessionUpdate":"tool_call_update","title":"Scout","rawInput":{"prompt":"Investigate"},"rawOutput":{"metadata":{"parentSessionId":"root","sessionId":"child"}}}});
        let announcements = worker_announcements("opencode", "session/update", &p);
        assert_eq!(announcements[0]["update"]["sessionId"], "child");
        let mut p = p;
        p["update"]["rawOutput"]["metadata"]["parentSessionId"] = json!("other");
        assert!(worker_announcements("opencode", "session/update", &p).is_empty());
    }
    #[test]
    fn cursor_requests_and_nested_pi_completion_receipts_keep_real_worker_ids() {
        let cursor = worker_announcements(
            "cursor",
            "cursor/task",
            &json!({"sessionId":"root","agentId":"child","description":"Scout","durationMs":0}),
        );
        assert_eq!(cursor[0]["update"]["sessionId"], "child");
        assert_eq!(cursor[0]["update"]["state"]["type"], "idle");
        let id = "01a13b63-e72e-79c0-b819-61f7e8c51888";
        let pi = worker_announcements(
            "pi",
            "session/update",
            &json!({"sessionId":"root","update":{"sessionUpdate":"tool_call_update","rawOutput":{"details":{"completions":[{"results":[{"agent":"worker","artifactPaths":{"outputPath":format!("/sessions/2026-10-14_{id}.jsonl")}}]}]}}}}),
        );
        assert_eq!(pi[0]["update"]["sessionId"], id);
        assert!(worker_announcements("custom","session/update",&json!({"update":{"sessionUpdate":"agent_message_chunk","content":{"text":"worker id: fabricated"}}})).is_empty());
    }
}
