//! Shared ACP updates; integration policies live in adapters/.
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
