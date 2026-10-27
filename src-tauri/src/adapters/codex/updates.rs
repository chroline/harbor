//! Codex legacy worker notifications normalized at the untrusted wire boundary.
use serde_json::{json, Value};
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
