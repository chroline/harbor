//! Project-independent configuration discovery. Never submits a prompt.
use crate::{acp::Rpc, types::ProviderConfiguration};
use serde_json::{json, Value};
use std::time::Duration;

fn model_option(o: &Value) -> bool {
    o["category"] == "model" || o["id"] == "model"
}

/// Use the dedicated mode API only when it advertises the same control.
pub fn has_matching_modes(config_options: &Value, modes: &Value, config_id: &str) -> bool {
    let Some(option) = config_options.as_array().and_then(|a| a.iter().find(|o| o["id"] == config_id && o["category"] == "mode" && o["type"] == "select")) else { return false; };
    let Some(legacy) = modes["availableModes"].as_array() else { return false; };
    let Some(opts) = option["options"].as_array() else { return false; };
    let choices: Vec<&Value> = opts.iter().flat_map(|v| v["options"].as_array().map(|a| a.iter().collect()).unwrap_or_else(|| vec![v])).collect();
    !legacy.is_empty() && choices.len() == legacy.len() && choices.iter().all(|v| v["value"].is_string() && legacy.iter().any(|m| m["id"] == v["value"]))
}

fn update_mode(config: &mut ProviderConfiguration, value: &Value) {
    if let Some(modes) = &mut config.modes { modes["currentModeId"] = value.clone(); }
    let ids: Vec<String> = config.config_options.as_array().into_iter().flatten().filter_map(|o| o["id"].as_str()).filter(|id| has_matching_modes(&config.config_options, config.modes.as_ref().unwrap_or(&Value::Null), id)).map(str::to_owned).collect();
    for option in config.config_options.as_array_mut().into_iter().flatten() {
        if option["id"].as_str().is_some_and(|id| ids.iter().any(|v| v == id)) { option["currentValue"] = value.clone(); }
    }
}

pub fn selections(config: &ProviderConfiguration) -> Value {
    let mut result = serde_json::Map::new();
    for option in config.config_options.as_array().into_iter().flatten() {
        if let Some(id) = option["id"].as_str() {
            result.insert(id.into(), option["currentValue"].clone());
        }
    }
    if !config.models["currentModelId"].is_null()
        && !config
            .config_options
            .as_array()
            .is_some_and(|a| a.iter().any(model_option))
    {
        result.insert(
            "__legacy_model".into(),
            config.models["currentModelId"].clone(),
        );
    }
    if let Some(modes) = &config.modes {
        if modes["currentModeId"].is_string() && !config.config_options.as_array().is_some_and(|a| a.iter().any(|o| o["category"] == "mode" || o["id"] == "mode")) {
            result.insert("__legacy_mode".into(), modes["currentModeId"].clone());
        }
    }
    Value::Object(result)
}

pub fn from_response(response: &Value) -> ProviderConfiguration {
    ProviderConfiguration {
        agent_info: None,
        config_options: response.get("configOptions").cloned().unwrap_or(json!([])),
        models: response["models"].clone(),
        modes: response.get("modes").cloned(),
    }
}

/// Retain the discovery session so configuration changes do not reconnect.
pub struct Discovery {
    pub signature: String,
    pub rpc: std::sync::Arc<Rpc>,
    scratch: tempfile::TempDir,
    session: Option<(String, ProviderConfiguration)>,
    can_close: bool,
}
impl Discovery {
    pub fn new(signature: String, rpc: std::sync::Arc<Rpc>, scratch: tempfile::TempDir) -> Self {
        Self { signature, rpc, scratch, session: None, can_close: false }
    }
    pub async fn configure(&mut self, selected: &Value) -> Result<ProviderConfiguration, String> {
        if self.session.is_none() {
            let (sid, config, can_close) = open(&self.rpc, &self.scratch.path().to_string_lossy()).await?;
            self.can_close = can_close;
            self.session = Some((sid, config));
        }
        let (sid, config) = self.session.as_mut().unwrap();
        apply(&self.rpc, sid, config, selected, false).await?;
        Ok(config.clone())
    }
    pub async fn stop(&self) {
        if self.can_close && self.rpc.alive.load(std::sync::atomic::Ordering::SeqCst) {
            if let Some((sid, _)) = &self.session {
                let _ = self.rpc.request("session/close", json!({"sessionId":sid}), Some(Duration::from_secs(2))).await;
            }
        }
        self.rpc.stop().await;
    }
}

async fn open(rpc: &Rpc, cwd: &str) -> Result<(String, ProviderConfiguration, bool), String> {
    let init = rpc.request("initialize", json!({"protocolVersion":1,"clientCapabilities":{"session":{"configOptions":{"boolean":{}}}},"clientInfo":{"name":"harbor","version":"0.1.0"}}), Some(Duration::from_secs(30))).await?;
    if init["protocolVersion"] != 1 {
        return Err("Agent did not negotiate ACP v1".into());
    }
    let response = rpc.request("session/new", json!({"cwd":cwd,"mcpServers":[]}), Some(Duration::from_secs(60))).await?;
    let sid = response["sessionId"].as_str().ok_or("Agent returned no session ID")?.to_owned();
    let mut config = from_response(&response);
    config.agent_info = Some(init["agentInfo"].clone());
    let can_close = init["agentCapabilities"]["sessionCapabilities"].get("close").is_some();
    Ok((sid, config, can_close))
}

#[cfg(test)]
pub async fn discover(
    rpc: &Rpc,
    cwd: &str,
    selected: &Value,
) -> Result<ProviderConfiguration, String> {
    let (sid, mut config, can_close) = open(rpc, cwd).await?;
    let result = apply(rpc, &sid, &mut config, selected, false).await;
    if can_close {
        let _ = rpc.request("session/close", json!({"sessionId":sid}), Some(Duration::from_secs(5))).await;
    }
    result?;
    Ok(config)
}

pub async fn apply(
    rpc: &Rpc,
    sid: &str,
    config: &mut ProviderConfiguration,
    selected: &Value,
    strict: bool,
) -> Result<(), String> {
    let Some(selected) = selected.as_object() else {
        return Ok(());
    };
    let mut ids: Vec<_> = selected.keys().cloned().collect();
    ids.sort_by_key(|id| {
        if id == "__legacy_model"
            || config
                .config_options
                .as_array()
                .is_some_and(|a| a.iter().any(|o| o["id"] == *id && model_option(o)))
        {
            0
        } else {
            1
        }
    });
    for id in ids {
        let value = &selected[&id];
        if id == "__legacy_mode" || has_matching_modes(&config.config_options, config.modes.as_ref().unwrap_or(&Value::Null), &id) {
            let valid = config.modes.as_ref().is_some_and(|m| m["availableModes"].as_array().is_some_and(|a| a.iter().any(|m| m["id"] == *value)));
            if !valid {
                if strict { return Err("The selected mode is unavailable in this project".into()); }
                continue;
            }
            let current = config.config_options.as_array().and_then(|a| a.iter().find(|o| o["id"] == id)).map(|o| &o["currentValue"]).or_else(|| config.modes.as_ref().map(|m| &m["currentModeId"]));
            if current != Some(value) {
                rpc.request("session/set_mode", json!({"sessionId":sid,"modeId":value}), Some(Duration::from_secs(30))).await?;
            }
            update_mode(config, value);
            continue;
        }
        if id == "__legacy_model" {
            if !config.models["availableModels"]
                .as_array()
                .is_some_and(|a| a.iter().any(|m| m["modelId"] == *value))
            {
                if strict {
                    return Err("The selected model is unavailable in this project".into());
                }
                continue;
            }
            if config.models["currentModelId"] != *value {
                rpc.request(
                    "session/set_model",
                    json!({"sessionId":sid,"modelId":value}),
                    Some(Duration::from_secs(30)),
                )
                .await?;
                config.models["currentModelId"] = value.clone();
            }
            continue;
        }
        let option = config
            .config_options
            .as_array()
            .and_then(|a| a.iter().find(|o| o["id"] == id));
        let valid = option.is_some_and(|o| {
            if o["type"] == "boolean" {
                value.is_boolean()
            } else {
                o["options"].as_array().is_some_and(|a| {
                    a.iter().any(|v| {
                        v["value"] == *value
                            || v["options"]
                                .as_array()
                                .is_some_and(|g| g.iter().any(|v| v["value"] == *value))
                    })
                })
            }
        });
        if !valid {
            if strict {
                return Err(format!(
                    "The selected {id} is unavailable in this project. Choose a supported value."
                ));
            }
            continue;
        }
        if option.unwrap()["currentValue"] == *value {
            continue;
        }
        let mut params = json!({"sessionId":sid,"configId":id,"value":value});
        if value.is_boolean() {
            params["type"] = json!("boolean");
        }
        let response = rpc
            .request(
                "session/set_config_option",
                params,
                Some(Duration::from_secs(30)),
            )
            .await?;
        config.config_options = response
            .get("configOptions")
            .filter(|v| v.is_array())
            .cloned()
            .ok_or("Agent did not return updated configuration")?;
        if !config.config_options.as_array().is_some_and(|options| options.iter().any(|o| o["id"] == id && o["currentValue"] == *value)) {
            return Err(format!("The provider did not confirm the selected {id}. Retry or choose another value."));
        }
        let mode = config.config_options.as_array().into_iter().flatten().find(|o| o["id"].as_str().is_some_and(|id| has_matching_modes(&config.config_options, config.modes.as_ref().unwrap_or(&Value::Null), id))).map(|o| o["currentValue"].clone());
        if let Some(mode) = mode { update_mode(config, &mode); }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::ProviderDefinition;
    use std::sync::atomic::Ordering;

    fn fixture() -> ProviderDefinition {
        ProviderDefinition {
            id: "codex".into(),
            name: "Fixture".into(),
            command: "node".into(),
            args: vec![format!(
                "{}/../tests/fixture-agent.mjs",
                env!("CARGO_MANIFEST_DIR")
            )],
            native_command: String::new(),
            install_hint: String::new(),
            color: String::new(),
        }
    }

    #[tokio::test]
    async fn mirrored_modern_modes_use_the_dedicated_api_and_stay_synchronized() {
        let scratch = tempfile::tempdir().unwrap();
        let rpc = Rpc::start_discovery(&fixture(), scratch.path().to_str().unwrap()).await.unwrap();
        let mut config = discover(&rpc, scratch.path().to_str().unwrap(), &json!({})).await.unwrap();
        // The fixture implements this control through set_mode only. A config
        // request for it would fail, detecting an unnecessary catalogue refresh.
        config.config_options.as_array_mut().unwrap().push(json!({"id":"workflow", "category":"mode", "type":"select", "currentValue":"agent", "options":[{"value":"agent"},{"value":"plan"},{"value":"ask"}]}));
        assert!(has_matching_modes(&config.config_options, config.modes.as_ref().unwrap(), "workflow"));
        apply(&rpc, "session-1", &mut config, &json!({"workflow":"plan"}), true).await.unwrap();
        assert_eq!(selections(&config)["workflow"], "plan");
        assert_eq!(config.modes.as_ref().unwrap()["currentModeId"], "plan");
        let mut different = config.modes.clone().unwrap();
        different["availableModes"][0]["id"] = json!("unrelated");
        assert!(!has_matching_modes(&config.config_options, &different, "workflow"));
        assert!(!has_matching_modes(&config.config_options, config.modes.as_ref().unwrap(), "model"));
        rpc.stop().await;
    }

    #[tokio::test]
    #[ignore = "Requires a logged-in provider via HARBOR_CONFIG_COMMAND; configuration only, no prompts"]
    async fn live_reused_discovery_latency() {
        let mut provider = fixture();
        provider.command = std::env::var("HARBOR_CONFIG_COMMAND").unwrap();
        provider.args = serde_json::from_str(&std::env::var("HARBOR_CONFIG_ARGS").unwrap_or("[]".into())).unwrap();
        let scratch = tempfile::tempdir().unwrap();
        let rpc = Rpc::start_discovery(&provider, scratch.path().to_str().unwrap()).await.unwrap();
        let mut discovery = Discovery::new("live".into(), rpc.clone(), scratch);
        let start = std::time::Instant::now();
        let config = discovery.configure(&json!({})).await.unwrap();
        println!("Initial discovery: {:?}", start.elapsed());
        let original = selections(&config);
        let sid = discovery.session.as_ref().unwrap().0.clone();
        let result: Result<(), String> = async {
            for category in ["mode", "model"] {
                let option = config.config_options.as_array().unwrap().iter().find(|o| o["category"] == category).unwrap();
                let value = option["options"].as_array().unwrap().iter().find(|v| v["value"].is_string() && v["value"] != option["currentValue"]).unwrap()["value"].clone();
                let key = option["id"].as_str().unwrap();
                let start = std::time::Instant::now();
                let updated = discovery.configure(&json!({key:value})).await?;
                println!("Reused {category} change: {:?}", start.elapsed());
                assert_eq!(selections(&updated)[key], value);
                assert_eq!(discovery.session.as_ref().unwrap().0, sid);
            }
            discovery.configure(&original).await?;
            Ok(())
        }.await;
        rpc.stop().await;
        result.unwrap();
    }

    #[tokio::test]
    async fn repeated_discovery_changes_reuse_one_session_and_keep_dependent_controls() {
        let scratch = tempfile::tempdir().unwrap();
        let rpc = Rpc::start_discovery(&fixture(), scratch.path().to_str().unwrap()).await.unwrap();
        let mut discovery = Discovery::new("fixture".into(), rpc.clone(), scratch);
        discovery.configure(&json!({})).await.unwrap();
        let config = discovery.configure(&json!({"model":"model-deep", "reasoning":"low", "__legacy_mode":"plan"})).await.unwrap();
        assert_eq!(config.config_options[0]["currentValue"], "model-deep");
        assert_eq!(config.config_options[1]["currentValue"], "high");
        assert_eq!(config.modes.as_ref().unwrap()["currentModeId"], "plan");
        let config = discovery.configure(&json!({"__legacy_mode":"ask"})).await.unwrap();
        assert_eq!(config.modes.as_ref().unwrap()["currentModeId"], "ask");
        assert_eq!(discovery.session.as_ref().unwrap().0, "session-1");
        let next = rpc.request("session/new", json!({"cwd":discovery.scratch.path(),"mcpServers":[]}), Some(Duration::from_secs(5))).await.unwrap();
        assert_eq!(next["sessionId"], "session-2");
        rpc.stop().await;
    }

    #[tokio::test]
    async fn legacy_mode_survives_discovery_and_launch_and_rejects_unavailable_values() {
        let temp = tempfile::tempdir().unwrap();
        let rpc = Rpc::start_discovery(&fixture(), temp.path().to_str().unwrap()).await.unwrap();
        let mut config = discover(&rpc, temp.path().to_str().unwrap(), &json!({"__legacy_mode":"plan"})).await.unwrap();
        assert_eq!(selections(&config)["__legacy_mode"], "plan");
        apply(&rpc, "session-1", &mut config, &json!({"__legacy_mode":"ask"}), true).await.unwrap();
        assert_eq!(config.modes.as_ref().unwrap()["currentModeId"], "ask");
        assert!(apply(&rpc, "session-1", &mut config, &json!({"__legacy_mode":"missing"}), true).await.is_err());
        assert_eq!(config.modes.as_ref().unwrap()["currentModeId"], "ask");
        rpc.stop().await;
    }

    #[tokio::test]
    async fn models_without_a_project_refresh_effort_and_leave_no_working_files() {
        let temp = tempfile::tempdir().unwrap();
        let cwd = temp.path().to_str().unwrap();
        let rpc = Rpc::start_discovery(&fixture(), cwd).await.unwrap();
        let config = discover(&rpc, cwd, &json!({"model":"model-deep","reasoning":"low"}))
            .await
            .unwrap();
        assert_eq!(config.config_options[0]["currentValue"], "model-deep");
        assert_eq!(config.config_options[1]["currentValue"], "high");
        assert_eq!(std::fs::read_dir(temp.path()).unwrap().count(), 0);
        rpc.stop().await;
        assert!(!rpc.alive.load(Ordering::SeqCst));
        assert!(rpc.inbound.lock().await.is_empty());
    }

    #[tokio::test]
    async fn explicit_launch_settings_apply_model_before_dependent_effort() {
        let temp = tempfile::tempdir().unwrap();
        let cwd = temp.path().to_str().unwrap();
        let rpc = Rpc::start_discovery(&fixture(), cwd).await.unwrap();
        // Fixture ids increment once per new session.
        let mut config = discover(&rpc, cwd, &json!({})).await.unwrap();
        apply(
            &rpc,
            "session-1",
            &mut config,
            &json!({"model":"model-deep","reasoning":"max"}),
            true,
        )
        .await
        .unwrap();
        assert_eq!(config.config_options[0]["currentValue"], "model-deep");
        assert_eq!(config.config_options[1]["currentValue"], "max");
        assert!(apply(
            &rpc,
            "session-1",
            &mut config,
            &json!({"model":"missing"}),
            true
        )
        .await
        .is_err());
        rpc.stop().await;
    }

    #[tokio::test]
    async fn discovery_and_launch_use_the_same_boolean_configuration_format() {
        let temp = tempfile::tempdir().unwrap();
        let cwd = temp.path().to_str().unwrap();
        let rpc = Rpc::start_discovery(&fixture(), cwd).await.unwrap();
        let mut config = discover(&rpc, cwd, &json!({})).await.unwrap();
        let selected = selections(&config);
        assert_eq!(selected["fast-mode"], false);
        apply(&rpc, "session-1", &mut config, &selected, true).await.unwrap();
        apply(&rpc, "session-1", &mut config, &json!({"fast-mode":true}), true).await.unwrap();
        assert_eq!(selections(&config)["fast-mode"], true);
        rpc.stop().await;
    }

    #[tokio::test]
    #[ignore = "Requires logged-in Codex ACP; configuration only, no prompt"]
    async fn live_codex_models_without_a_project() {
        let provider = crate::types::providers()
            .into_iter()
            .find(|p| p.id == "codex")
            .unwrap();
        let temp = tempfile::tempdir().unwrap();
        let cwd = temp.path().to_str().unwrap();
        let rpc = Rpc::start_discovery(&provider, cwd).await.unwrap();
        let result = discover(&rpc, cwd, &json!({})).await;
        rpc.stop().await;
        let config = result.unwrap();
        println!("Discovered configuration: {}", selections(&config));
        assert!(
            config
                .config_options
                .as_array()
                .is_some_and(|a| a.iter().any(model_option))
                || config.models["availableModels"].is_array()
        );
    }
}
