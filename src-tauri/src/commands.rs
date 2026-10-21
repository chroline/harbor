//! Workspace-aware ACP command discovery. Never submits prompts or saves chats.
use crate::{
    acp::Rpc,
    types::{AvailableCommand, ProviderDefinition},
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, Mutex};

type Cached = Arc<Mutex<Option<(Instant, Vec<AvailableCommand>)>>>;
#[derive(Default)]
pub struct Catalogs {
    entries: Mutex<HashMap<String, Cached>>,
    active: Mutex<HashMap<String, Arc<Rpc>>>,
    stopped: AtomicBool,
}
impl Catalogs {
    pub async fn get(
        &self,
        provider: &ProviderDefinition,
        cwd: Option<&str>,
    ) -> Result<Vec<AvailableCommand>, String> {
        let canonical = cwd.map(crate::workspaces::canonical_folder).transpose()?;
        let key =
            serde_json::to_string(&(&provider.id, &provider.command, &provider.args, &canonical))
                .map_err(|e| e.to_string())?;
        let slot = {
            let mut entries = self.entries.lock().await;
            // Evict only unused slots; never duplicate an in-flight probe.
            if entries.len() >= 32 {
                entries.retain(|_, v| Arc::strong_count(v) > 1);
            }
            entries.entry(key.clone()).or_default().clone()
        };
        let mut cached = slot.lock().await;
        if let Some((at, commands)) = &*cached {
            if at.elapsed() < Duration::from_secs(60) {
                return Ok(commands.clone());
            }
        }
        // A freeform task has no project directory until creation. A scratch
        // folder gives it the agent's global catalog without another project's skills.
        let scratch = if canonical.is_none() {
            Some(tempfile::tempdir().map_err(|e| e.to_string())?)
        } else {
            None
        };
        let cwd = canonical.as_deref().map(str::to_owned).unwrap_or_else(|| {
            scratch
                .as_ref()
                .unwrap()
                .path()
                .to_string_lossy()
                .into_owned()
        });
        let (tx, mut updates) = mpsc::unbounded_channel();
        let mut active = self.active.lock().await;
        if self.stopped.load(Ordering::SeqCst) {
            return Err("Harbor is quitting".into());
        }
        let rpc = Rpc::start_catalog_discovery(
            provider,
            &cwd,
            Arc::new(move |kind, payload| {
                if kind == "session/update"
                    && payload["update"]["sessionUpdate"] == "available_commands_update"
                {
                    let _ = tx.send(payload);
                }
            }),
        )
        .await?;
        active.insert(key.clone(), rpc.clone());
        drop(active);
        let result = probe(&rpc, &cwd, &mut updates, Duration::from_secs(10)).await;
        rpc.stop().await;
        self.active.lock().await.remove(&key);
        if let Ok(commands) = &result {
            *cached = Some((Instant::now(), commands.clone()));
        }
        result
    }
    pub async fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        for (_, rpc) in std::mem::take(&mut *self.active.lock().await) {
            rpc.stop().await;
        }
    }
}

async fn probe(
    rpc: &Rpc,
    cwd: &str,
    updates: &mut mpsc::UnboundedReceiver<Value>,
    wait: Duration,
) -> Result<Vec<AvailableCommand>, String> {
    let init = rpc.request("initialize", json!({"protocolVersion":1,"clientCapabilities":{},"clientInfo":{"name":"harbor","version":"0.1.0"}}), Some(Duration::from_secs(30))).await?;
    if init["protocolVersion"] != 1 {
        return Err("Agent did not negotiate ACP v1".into());
    }
    let opened = rpc
        .request(
            "session/new",
            json!({"cwd":cwd,"mcpServers":[]}),
            Some(Duration::from_secs(60)),
        )
        .await?;
    let sid = opened["sessionId"]
        .as_str()
        .ok_or("Agent returned no session ID")?;
    let result = tokio::time::timeout(wait, async {
        while let Some(payload) = updates.recv().await {
            if payload["sessionId"] == sid {
                return parse(&payload["update"]["availableCommands"]);
            }
        }
        vec![]
    })
    .await
    .unwrap_or_default();
    if init["agentCapabilities"]["sessionCapabilities"]
        .get("close")
        .is_some()
    {
        let _ = rpc
            .request(
                "session/close",
                json!({"sessionId":sid}),
                Some(Duration::from_secs(2)),
            )
            .await;
    }
    Ok(result)
}

fn parse(value: &Value) -> Vec<AvailableCommand> {
    value
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|v| serde_json::from_value::<AvailableCommand>(v.clone()).ok())
        .filter(|c| !c.name.is_empty() && !c.name.chars().any(char::is_whitespace))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalog_keeps_native_names_and_hints_and_skips_invalid_rows() {
        let commands = parse(&json!([
            {"name":"review","description":"Review", "input":{"hint":"branch"}},
            {"name":"$skill","description":"A skill"},
            {"name":"skill:build","description":"Build"},
            {"name":"bad name","description":"Bad"}, {"name":12}
        ]));
        assert_eq!(commands.len(), 3);
        assert_eq!(commands[0].input.as_ref().unwrap().hint, "branch");
        assert_eq!(commands[1].name, "$skill");
        assert_eq!(commands[2].name, "skill:build");
    }
    fn fixture(log: &std::path::Path, behavior: &str) -> ProviderDefinition {
        ProviderDefinition {
            id: "fixture".into(),
            name: "Catalog fixture".into(),
            command: "node".into(),
            args: vec![
                format!(
                    "{}/../tests/fixture-command-agent.mjs",
                    env!("CARGO_MANIFEST_DIR")
                ),
                log.to_string_lossy().into_owned(),
                behavior.into(),
            ],
            native_command: "node".into(),
            install_hint: "Install Node".into(),
            color: "mint".into(),
        }
    }
    #[tokio::test]
    async fn deduplicates_caches_expires_and_scopes_workspace_probes_without_prompts() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("calls.jsonl");
        let provider = fixture(&log, "immediate");
        let catalogs = Catalogs::default();
        let cwd = dir.path().to_str().unwrap();
        let (one, two) = tokio::join!(
            catalogs.get(&provider, Some(cwd)),
            catalogs.get(&provider, Some(cwd))
        );
        assert_eq!(one.unwrap()[1].name, "$build");
        assert_eq!(two.unwrap().len(), 2);
        catalogs.get(&provider, Some(cwd)).await.unwrap();
        let calls = std::fs::read_to_string(&log).unwrap();
        assert_eq!(calls.matches("session/new").count(), 1);
        assert_eq!(calls.matches("session/close").count(), 1);
        assert!(!calls.contains("session/prompt"));
        for slot in catalogs.entries.lock().await.values() {
            slot.lock().await.as_mut().unwrap().0 = Instant::now() - Duration::from_secs(61);
        }
        catalogs.get(&provider, Some(cwd)).await.unwrap();
        let other = dir.path().join("other");
        std::fs::create_dir(&other).unwrap();
        catalogs
            .get(&provider, Some(other.to_str().unwrap()))
            .await
            .unwrap();
        assert_eq!(
            std::fs::read_to_string(&log)
                .unwrap()
                .matches("session/new")
                .count(),
            3
        );
        assert!(std::fs::read_dir(&other).unwrap().next().is_none());
        assert!(catalogs.active.lock().await.is_empty());
    }
    #[tokio::test]
    async fn accepts_delayed_catalogs_and_cleans_up_failed_probes() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("calls.jsonl");
        let catalogs = Catalogs::default();
        assert_eq!(
            catalogs
                .get(
                    &fixture(&log, "delayed"),
                    Some(dir.path().to_str().unwrap())
                )
                .await
                .unwrap()
                .len(),
            2
        );
        for _ in 0..2 {
            assert!(catalogs
                .get(&fixture(&log, "fail"), Some(dir.path().to_str().unwrap()))
                .await
                .is_err());
        }
        assert_eq!(
            std::fs::read_to_string(&log)
                .unwrap()
                .matches("session/new")
                .count(),
            3
        );
        assert!(catalogs.active.lock().await.is_empty());
        catalogs.stop().await;
        assert!(catalogs.get(&fixture(&log, "delayed"), None).await.is_err());
    }
    #[tokio::test]
    async fn missing_catalog_times_out_and_closes_the_session() {
        let dir = tempfile::tempdir().unwrap();
        let log = dir.path().join("calls.jsonl");
        let (tx, mut rx) = mpsc::unbounded_channel();
        let rpc = Rpc::start_catalog_discovery(
            &fixture(&log, "empty"),
            dir.path().to_str().unwrap(),
            Arc::new(move |kind, payload| {
                if kind == "session/update" {
                    let _ = tx.send(payload);
                }
            }),
        )
        .await
        .unwrap();
        let commands = probe(
            &rpc,
            dir.path().to_str().unwrap(),
            &mut rx,
            Duration::from_millis(20),
        )
        .await
        .unwrap();
        rpc.stop().await;
        assert!(commands.is_empty());
        assert!(!rpc.alive.load(Ordering::SeqCst));
        assert!(std::fs::read_to_string(&log)
            .unwrap()
            .contains("session/close"));
    }
    #[tokio::test]
    #[ignore = "Requires an authenticated local adapter; no prompts are submitted"]
    async fn live_command_catalog() {
        let mut provider = fixture(std::path::Path::new("unused"), "immediate");
        provider.command = std::env::var("HARBOR_CATALOG_COMMAND").unwrap();
        provider.args =
            serde_json::from_str(&std::env::var("HARBOR_CATALOG_ARGS").unwrap_or("[]".into()))
                .unwrap();
        let cwd = std::env::var("HARBOR_CATALOG_CWD").ok();
        let catalogs = Catalogs::default();
        let commands = catalogs.get(&provider, cwd.as_deref()).await.unwrap();
        println!(
            "Advertised {} commands; names: {:?}",
            commands.len(),
            commands.iter().map(|c| &c.name).collect::<Vec<_>>()
        );
        assert!(
            !commands.is_empty(),
            "The adapter did not advertise a command catalog"
        );
        catalogs.stop().await;
    }
}
