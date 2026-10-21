//! ACP v1 JSON-RPC transport. Unknown extension payloads are retained verbatim.
use crate::types::ProviderDefinition;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, Command},
    sync::{oneshot, Mutex},
};
type Reply = Result<Value, String>;
pub type Sink = Arc<dyn Fn(&str, Value) + Send + Sync>;
struct ToolTerminal {
    child: Mutex<Child>,
    output: Arc<Mutex<Vec<u8>>>,
    truncated: Arc<AtomicBool>,
    status: Arc<Mutex<Option<i32>>>,
}
impl ToolTerminal {
    async fn publish_output(&self, sink: &Sink, id: &str) -> Value {
        // Serialize snapshots with readers so a late event cannot replace newer output.
        let output = self.output.lock().await;
        let status = *self.status.lock().await;
        let mut result = json!({"output":String::from_utf8_lossy(&output),"truncated":self.truncated.load(Ordering::SeqCst)});
        if let Some(code) = status {
            result["exitStatus"] = json!({"exitCode":code});
        }
        let mut event = result.clone();
        event["terminalId"] = json!(id);
        sink("tool_terminal", event);
        result
    }
}
pub struct Rpc {
    input: Mutex<ChildStdin>,
    child: Mutex<Child>,
    pending: Mutex<HashMap<String, oneshot::Sender<Reply>>>,
    pub inbound: Mutex<HashMap<String, Value>>,
    tools: Mutex<HashMap<String, Arc<ToolTerminal>>>,
    attachment_reads: Mutex<HashSet<PathBuf>>,
    next: AtomicU64,
    pub alive: AtomicBool,
    pub busy: AtomicBool,
    pub configuration_lock: Mutex<()>,
    pub turn_generation: AtomicU64,
    cwd: PathBuf,
    sink: Sink,
    discovery: bool,
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn resolve_executable(command: &str) -> Option<PathBuf> {
    if command.contains('/') {
        let p = PathBuf::from(command);
        return executable(&p).then_some(p);
    }
    std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
        .map(|p| p.join(command))
        .find(|p| executable(p))
}
fn executable(path: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        path.metadata()
            .is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
    }
    #[cfg(not(unix))]
    {
        path.is_file()
    }
}
pub fn workspace_path(root: &Path, path: &str, write: bool) -> Result<PathBuf, String> {
    let p = Path::new(path);
    if !p.is_absolute() {
        return Err("ACP file paths must be absolute".into());
    }
    let root = root.canonicalize().map_err(err)?;
    let canonical = if p.exists() {
        p.canonicalize().map_err(err)?
    } else if write {
        p.parent()
            .ok_or("Missing parent")?
            .canonicalize()
            .map_err(err)?
            .join(p.file_name().ok_or("Missing filename")?)
    } else {
        return Err("File does not exist".into());
    };
    if !canonical.starts_with(&root) {
        return Err("Path is outside this session's workspace".into());
    }
    Ok(canonical)
}
impl Rpc {
    pub async fn grant_attachment_reads(&self, paths: &[PathBuf]) {
        let mut allowed = self.attachment_reads.lock().await;
        for path in paths {
            if let Ok(path) = path.canonicalize() { allowed.insert(path); }
        }
    }
    pub async fn start(
        provider: &ProviderDefinition,
        cwd: &str,
        sink: Sink,
    ) -> Result<Arc<Self>, String> {
        Self::start_with_policy(provider, cwd, sink, false).await
    }
    pub async fn start_discovery(
        provider: &ProviderDefinition,
        cwd: &str,
    ) -> Result<Arc<Self>, String> {
        Self::start_with_policy(provider, cwd, Arc::new(|_, _| {}), true).await
    }
    pub async fn start_catalog_discovery(
        provider: &ProviderDefinition,
        cwd: &str,
        sink: Sink,
    ) -> Result<Arc<Self>, String> {
        Self::start_with_policy(provider, cwd, sink, true).await
    }
    async fn start_with_policy(
        provider: &ProviderDefinition,
        cwd: &str,
        sink: Sink,
        discovery: bool,
    ) -> Result<Arc<Self>, String> {
        let exe = resolve_executable(&provider.command).ok_or_else(|| {
            format!(
                "{} is not installed or executable. {}",
                provider.command, provider.install_hint
            )
        })?;
        let mut cmd = Command::new(exe);
        cmd.args(&provider.args)
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true);
        #[cfg(unix)]
        cmd.process_group(0);
        let mut child = cmd.spawn().map_err(err)?;
        let input = child.stdin.take().ok_or("Missing stdin")?;
        let stdout = child.stdout.take().ok_or("Missing stdout")?;
        let stderr = child.stderr.take().ok_or("Missing stderr")?;
        let rpc = Arc::new(Self {
            discovery,
            input: Mutex::new(input),
            child: Mutex::new(child),
            pending: Mutex::new(HashMap::new()),
            inbound: Mutex::new(HashMap::new()),
            tools: Mutex::new(HashMap::new()),
            attachment_reads: Mutex::new(HashSet::new()),
            next: AtomicU64::new(1),
            alive: AtomicBool::new(true),
            busy: AtomicBool::new(false),
            configuration_lock: Mutex::new(()),
            turn_generation: AtomicU64::new(0),
            cwd: PathBuf::from(cwd),
            sink,
        });
        let reader_rpc = rpc.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut buf = Vec::new();
                let n = (&mut reader)
                    .take(16 * 1024 * 1024)
                    .read_until(b'\n', &mut buf)
                    .await;
                match n {
                    Ok(0) => break,
                    Ok(_) => {
                        if buf.last() != Some(&b'\n') {
                            (reader_rpc.sink)(
                                "diagnostic",
                                json!({"message":"ACP frame exceeded 16 MiB or was truncated"}),
                            );
                            break;
                        }
                        match serde_json::from_slice::<Value>(&buf) {
                            Ok(msg) => reader_rpc.receive(msg).await,
                            Err(e) => (reader_rpc.sink)(
                                "diagnostic",
                                json!({"message":format!("Invalid ACP JSON: {e}")}),
                            ),
                        }
                    }
                    Err(e) => {
                        (reader_rpc.sink)("diagnostic", json!({"message":e.to_string()}));
                        break;
                    }
                }
            }
            reader_rpc.disconnected("Agent connection closed").await;
            reader_rpc.stop().await;
        });
        let log_rpc = rpc.clone();
        tokio::spawn(async move {
            let mut r = stderr;
            let mut b = [0; 4096];
            while let Ok(n) = r.read(&mut b).await {
                if n == 0 {
                    break;
                }
                (log_rpc.sink)(
                    "diagnostic",
                    json!({"message":String::from_utf8_lossy(&b[..n])}),
                );
            }
        });
        Ok(rpc)
    }
    async fn send(&self, v: Value) -> Result<(), String> {
        if !self.alive.load(Ordering::SeqCst) {
            return Err("Agent is disconnected".into());
        }
        let mut data = serde_json::to_vec(&v).map_err(err)?;
        data.push(b'\n');
        let mut input = self.input.lock().await;
        input.write_all(&data).await.map_err(err)?;
        input.flush().await.map_err(err)
    }
    pub async fn notify(&self, method: &str, params: Value) -> Result<(), String> {
        self.send(json!({"jsonrpc":"2.0","method":method,"params":params}))
            .await
    }
    pub async fn request(&self, method: &str, params: Value, timeout: Option<Duration>) -> Reply {
        let id = self.next.fetch_add(1, Ordering::SeqCst);
        let key = id.to_string();
        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(key.clone(), tx);
        if let Err(e) = self
            .send(json!({"jsonrpc":"2.0","id":id,"method":method,"params":params}))
            .await
        {
            self.pending.lock().await.remove(&key);
            return Err(e);
        }
        let result = if let Some(d) = timeout {
            match tokio::time::timeout(d, rx).await {
                Ok(r) => r.map_err(err)?,
                Err(_) => {
                    self.pending.lock().await.remove(&key);
                    return Err(format!("{method} timed out"));
                }
            }
        } else {
            rx.await.map_err(err)?
        };
        result
    }
    pub async fn answer(&self, id: Value, result: Value) -> Result<(), String> {
        let request = self
            .inbound
            .lock()
            .await
            .remove(&id.to_string())
            .ok_or("This request has already been answered or cancelled")?;
        if request["method"] == "session/request_permission"
            && result["outcome"]["outcome"] == "selected"
        {
            let option = &result["outcome"]["optionId"];
            if !request["params"]["options"]
                .as_array()
                .is_some_and(|a| a.iter().any(|o| &o["optionId"] == option))
            {
                self.inbound.lock().await.insert(id.to_string(), request);
                return Err("Invalid permission option".into());
            }
        }
        self.send(json!({"jsonrpc":"2.0","id":id,"result":result}))
            .await?;
        (self.sink)("answered", json!({"id":id}));
        Ok(())
    }
    async fn receive(self: &Arc<Self>, msg: Value) {
        if msg.get("method").is_none() {
            if let Some(id) = msg.get("id") {
                if let Some(tx) = self.pending.lock().await.remove(&id.to_string()) {
                    let _ = tx.send(if let Some(e) = msg.get("error") {
                        Err(format!(
                            "{} ({})",
                            e["message"].as_str().unwrap_or("ACP error"),
                            e["code"]
                        ))
                    } else {
                        Ok(msg["result"].clone())
                    });
                }
            }
            return;
        }
        let wire_method = msg["method"].as_str().unwrap_or("");
        let method = if wire_method.starts_with("_cursor/") {
            &wire_method[1..]
        } else {
            wire_method
        };
        let params = msg["params"].clone();
        if let Some(id) = msg.get("id") {
            if self.discovery {
                let _ = self.send(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Client requests are unavailable during model discovery"}})).await;
                return;
            }
            if [
                "session/request_permission",
                "cursor/ask_question",
                "cursor/create_plan",
            ]
            .contains(&method)
            {
                let mut request = msg.clone();
                request["method"] = json!(method);
                self.inbound
                    .lock()
                    .await
                    .insert(id.to_string(), request.clone());
                (self.sink)("request", request);
                return;
            }
            let rpc = self.clone();
            let method = method.to_string();
            let id = id.clone();
            tokio::spawn(async move {
                let res = rpc.client_request(&method, params).await;
                let reply = match res {
                    Ok(result) => json!({"jsonrpc":"2.0","id":id,"result":result}),
                    Err(message) => {
                        json!({"jsonrpc":"2.0","id":id,"error":{"code":if method.starts_with("fs/")||method.starts_with("terminal/"){-32602}else{-32601},"message":message}})
                    }
                };
                let _ = rpc.send(reply).await;
            });
        } else {
            (self.sink)(method, params)
        }
    }
    async fn client_request(&self, method: &str, p: Value) -> Reply {
        match method {
            "cursor/task" | "cursor/update_todos" => {
                (self.sink)(method, p);
                Ok(json!({}))
            }
            "fs/read_text_file" => {
                let requested = p["path"].as_str().ok_or("Missing path")?;
                let canonical = Path::new(requested).canonicalize().map_err(err)?;
                let path = if self.attachment_reads.lock().await.contains(&canonical) {
                    canonical
                } else {
                    workspace_path(&self.cwd, requested, false)?
                };
                if tokio::fs::metadata(&path).await.map_err(err)?.len() > 10 * 1024 * 1024 {
                    return Err("File exceeds 10 MiB".into());
                }
                let text = tokio::fs::read_to_string(path).await.map_err(err)?;
                let content = if p.get("line").is_some() || p.get("limit").is_some() {
                    let start = p["line"].as_u64().unwrap_or(1).saturating_sub(1) as usize;
                    text.lines()
                        .skip(start)
                        .take(p["limit"].as_u64().unwrap_or(u64::MAX) as usize)
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    text
                };
                Ok(json!({"content":content}))
            }
            "fs/write_text_file" => {
                let path =
                    workspace_path(&self.cwd, p["path"].as_str().ok_or("Missing path")?, true)?;
                tokio::fs::write(path, p["content"].as_str().ok_or("Missing content")?)
                    .await
                    .map_err(err)?;
                Ok(json!({}))
            }
            "terminal/create" => {
                let command = p["command"].as_str().ok_or("Missing command")?;
                let cwd = if let Some(cwd) = p["cwd"].as_str() {
                    workspace_path(&self.cwd, cwd, false)?
                } else {
                    self.cwd.clone()
                };
                let mut cmd = Command::new(command);
                if let Some(args) = p["args"].as_array() {
                    for a in args {
                        cmd.arg(a.as_str().ok_or("Invalid argument")?);
                    }
                }
                if let Some(env) = p["env"].as_array() {
                    for e in env {
                        cmd.env(
                            e["name"].as_str().ok_or("Invalid environment name")?,
                            e["value"].as_str().ok_or("Invalid environment value")?,
                        );
                    }
                }
                cmd.current_dir(cwd)
                    .stdin(Stdio::null())
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .kill_on_drop(true);
                #[cfg(unix)]
                cmd.process_group(0);
                let mut child = cmd.spawn().map_err(err)?;
                let stdout = child.stdout.take().ok_or("Missing stdout")?;
                let stderr = child.stderr.take().ok_or("Missing stderr")?;
                let output = Arc::new(Mutex::new(Vec::new()));
                let truncated = Arc::new(AtomicBool::new(false));
                let limit = p["outputByteLimit"]
                    .as_u64()
                    .unwrap_or(1_048_576)
                    .min(4_194_304) as usize;
                let id = crate::types::id();
                let terminal = Arc::new(ToolTerminal {
                    child: Mutex::new(child),
                    output,
                    truncated,
                    status: Arc::new(Mutex::new(None)),
                });
                for mut stream in [
                    Box::new(stdout) as Box<dyn tokio::io::AsyncRead + Send + Unpin>,
                    Box::new(stderr),
                ] {
                    let terminal = terminal.clone();
                    let terminal_id = id.clone();
                    let sink = self.sink.clone();
                    tokio::spawn(async move {
                        let mut buf = [0; 4096];
                        while let Ok(n) = stream.read(&mut buf).await {
                            if n == 0 {
                                break;
                            }
                            let mut o = terminal.output.lock().await;
                            o.extend_from_slice(&buf[..n]);
                            if o.len() > limit {
                                let excess = o.len() - limit;
                                o.drain(..excess);
                                terminal.truncated.store(true, Ordering::SeqCst);
                            }
                        }
                        // Preserve the final bytes even when the agent immediately
                        // releases the terminal or never requests terminal/output.
                        terminal.publish_output(&sink, &terminal_id).await;
                    });
                }
                self.tools.lock().await.insert(id.clone(), terminal);
                Ok(json!({"terminalId":id}))
            }
            "terminal/output" | "terminal/wait_for_exit" | "terminal/kill" | "terminal/release" => {
                let id = p["terminalId"].as_str().ok_or("Missing terminal ID")?;
                let t = self
                    .tools
                    .lock()
                    .await
                    .get(id)
                    .cloned()
                    .ok_or("Unknown terminal")?;
                if method == "terminal/kill" || method == "terminal/release" {
                    let mut child = t.child.lock().await;
                    let exited = child.try_wait().map_err(err)?.map(|s| s.code().unwrap_or(1));
                    stop_child(&mut child).await;
                    let mut status = t.status.lock().await;
                    *status = status.or(exited).or(Some(137));
                    drop(status);
                    drop(child);
                    t.publish_output(&self.sink, id).await;
                    if method == "terminal/release" {
                        self.tools.lock().await.remove(id);
                    }
                    return Ok(json!({}));
                }
                loop {
                    if t.status.lock().await.is_some() {
                        break;
                    }
                    if let Some(status) = t.child.lock().await.try_wait().map_err(err)? {
                        *t.status.lock().await = Some(status.code().unwrap_or(1));
                        break;
                    }
                    if method == "terminal/output" {
                        break;
                    }
                    tokio::time::sleep(Duration::from_millis(25)).await;
                }
                let status = *t.status.lock().await;
                let output = t.publish_output(&self.sink, id).await;
                if method == "terminal/wait_for_exit" {
                    Ok(json!({"exitCode":status}))
                } else {
                    Ok(output)
                }
            }
            _ => Err(format!("Unsupported client method: {method}")),
        }
    }
    pub async fn cancel_requests(&self) {
        let pending = std::mem::take(&mut *self.inbound.lock().await);
        for (_, req) in pending {
            let _=self.send(json!({"jsonrpc":"2.0","id":req["id"],"result":{"outcome":{"outcome":"cancelled"}}})).await;
            (self.sink)("answered", json!({"id":req["id"]}));
        }
    }
    async fn disconnected(&self, reason: &str) {
        if self.alive.swap(false, Ordering::SeqCst) {
            for (_, tx) in self.pending.lock().await.drain() {
                let _ = tx.send(Err(reason.into()));
            }
            self.inbound.lock().await.clear();
            (self.sink)("disconnected", json!({"message":reason}));
        }
    }
    pub async fn stop(&self) {
        self.cancel_requests().await;
        let terminals = std::mem::take(&mut *self.tools.lock().await);
        for (_, t) in terminals {
            stop_child(&mut *t.child.lock().await).await;
        }
        stop_child(&mut *self.child.lock().await).await;
        self.disconnected("Agent stopped").await;
    }
}
pub async fn stop_child(child: &mut Child) {
    #[cfg(unix)]
    if let Some(pid) = child.id() {
        unsafe {
            libc::kill(-(pid as i32), libc::SIGTERM);
        }
    }
    if tokio::time::timeout(Duration::from_secs(2), child.wait())
        .await
        .is_ok()
    {
        return;
    }
    let _ = child.start_kill();
    let _ = child.wait().await;
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;
    async fn fixture() -> (
        Arc<Rpc>,
        tempfile::TempDir,
        Arc<StdMutex<Vec<(String, Value)>>>,
        String,
    ) {
        let temp = tempfile::tempdir().unwrap();
        let events = Arc::new(StdMutex::new(Vec::new()));
        let copy = events.clone();
        let provider = ProviderDefinition {
            id: "fixture".into(),
            name: "Fixture".into(),
            command: "node".into(),
            args: vec![format!(
                "{}/../tests/fixture-agent.mjs",
                env!("CARGO_MANIFEST_DIR")
            )],
            native_command: "node".into(),
            install_hint: "Install Node".into(),
            color: "mint".into(),
        };
        let rpc = Rpc::start(
            &provider,
            temp.path().to_str().unwrap(),
            Arc::new(move |kind, v| copy.lock().unwrap().push((kind.into(), v))),
        )
        .await
        .unwrap();
        let init = rpc
            .request(
                "initialize",
                json!({"protocolVersion":1}),
                Some(Duration::from_secs(5)),
            )
            .await
            .unwrap();
        assert_eq!(init["protocolVersion"], 1);
        let session = rpc
            .request(
                "session/new",
                json!({"cwd":temp.path()}),
                Some(Duration::from_secs(5)),
            )
            .await
            .unwrap();
        let id = session["sessionId"].as_str().unwrap().to_string();
        (rpc, temp, events, id)
    }
    async fn prompt(rpc: &Arc<Rpc>, id: &str, text: &str) -> Reply {
        rpc.request(
            "session/prompt",
            json!({"sessionId":id,"prompt":[{"type":"text","text":text}]}),
            Some(Duration::from_secs(10)),
        )
        .await
    }
    #[tokio::test]
    async fn attached_files_are_readable_outside_workspace_but_never_writable() {
        let (rpc, _workspace, _events, id) = fixture().await;
        let external = tempfile::tempdir().unwrap();
        let attached = external.path().join("attached.txt");
        let unrelated = external.path().join("private.txt");
        tokio::fs::write(&attached, "attached context").await.unwrap();
        tokio::fs::write(&unrelated, "unrelated").await.unwrap();
        let read = json!({"sessionId":id,"path":attached});
        assert!(rpc.client_request("fs/read_text_file", read.clone()).await.is_err());
        rpc.grant_attachment_reads(&[attached.clone()]).await;
        assert_eq!(rpc.client_request("fs/read_text_file", read).await.unwrap()["content"], "attached context");
        assert!(rpc.client_request("fs/read_text_file", json!({"sessionId":id,"path":unrelated})).await.is_err());
        assert!(rpc.client_request("fs/write_text_file", json!({"sessionId":id,"path":attached,"content":"changed"})).await.is_err());
        rpc.stop().await;
    }
    #[tokio::test]
    async fn terminal_errors_are_published_and_survive_release() {
        let (rpc, _temp, events, id) = fixture().await;
        let terminal = rpc.client_request("terminal/create", json!({
            "sessionId":id,"command":"node","args":["-e","process.stdout.write('command started\\n'); process.stderr.write('fatal: bad revision\\n'); process.exitCode = 42"]
        })).await.unwrap();
        let params = json!({"sessionId":id,"terminalId":terminal["terminalId"]});
        assert_eq!(rpc.client_request("terminal/wait_for_exit", params.clone()).await.unwrap()["exitCode"], 42);
        rpc.client_request("terminal/release", params).await.unwrap();
        tokio::time::timeout(Duration::from_secs(2), async {
            loop {
                if events.lock().unwrap().iter().any(|(kind,p)| {
                    kind == "tool_terminal" && p["terminalId"] == terminal["terminalId"]
                        && p["output"].as_str().is_some_and(|s| s.contains("fatal: bad revision") && s.contains("command started"))
                        && p["exitStatus"]["exitCode"] == 42
                }) { break; }
                tokio::task::yield_now().await;
            }
        }).await.expect("terminal stdout, stderr and exit code were not published");
        rpc.stop().await;
    }
    #[tokio::test]
    async fn file_and_terminal_client_requests() {
        let (rpc, _temp, events, id) = fixture().await;
        prompt(&rpc, &id, "files").await.unwrap();
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|(_, v)| v["update"]["content"]["text"] == "beta"));
        prompt(&rpc, &id, "terminal").await.unwrap();
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|(_, v)| v["update"]["content"]["text"] == "terminal fixture"));
        rpc.stop().await;
    }
    #[tokio::test]
    async fn cursor_extension_requests_are_acknowledged_and_forwarded() {
        let (rpc, _temp, events, sid) = fixture().await;
        prompt(&rpc, &sid, "telemetry").await.unwrap();
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|(kind, p)| kind == "cursor/task" && p["agentId"] == "cursor-worker"));
        assert!(events
            .lock()
            .unwrap()
            .iter()
            .any(|(kind, _)| kind == "cursor/update_todos"));
        rpc.stop().await;
    }
    #[tokio::test]
    async fn permission_is_correlated_and_single_use() {
        let (rpc, _temp, events, id) = fixture().await;
        let r = rpc.clone();
        let task = tokio::spawn(async move { prompt(&r, &id, "permission").await });
        let request = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                if let Some((_, v)) = events.lock().unwrap().iter().find(|(k, _)| k == "request") {
                    break v.clone();
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        assert!(rpc
            .answer(
                request["id"].clone(),
                json!({"outcome":{"outcome":"selected","optionId":"invalid"}})
            )
            .await
            .is_err());
        rpc.answer(
            request["id"].clone(),
            json!({"outcome":{"outcome":"selected","optionId":"allow-once"}}),
        )
        .await
        .unwrap();
        assert!(rpc.answer(request["id"].clone(), json!({})).await.is_err());
        task.await.unwrap().unwrap();
        rpc.stop().await;
    }
    #[tokio::test]
    async fn independent_connections_and_subagent_routing() {
        let (a, _ta, ea, ia) = fixture().await;
        let (b, _tb, eb, ib) = fixture().await;
        let (ra, rb) = tokio::join!(prompt(&a, &ia, "subagent"), prompt(&b, &ib, "hello"));
        ra.unwrap();
        rb.unwrap();
        assert!(ea
            .lock()
            .unwrap()
            .iter()
            .any(|(_, v)| v["sessionId"] == "child-1"));
        assert!(!eb
            .lock()
            .unwrap()
            .iter()
            .any(|(_, v)| v["sessionId"] == "child-1"));
        a.stop().await;
        b.stop().await;
    }
    #[tokio::test]
    async fn configuration_dependencies_and_malformed_frames() {
        let (rpc, _t, e, id) = fixture().await;
        let r = rpc
            .request(
                "session/set_config_option",
                json!({"sessionId":id,"configId":"model","value":"model-deep"}),
                Some(Duration::from_secs(5)),
            )
            .await
            .unwrap();
        assert_eq!(r["configOptions"][1]["currentValue"], "high");
        prompt(&rpc, &id, "malformed").await.unwrap();
        assert!(e.lock().unwrap().iter().any(|(k, _)| k == "diagnostic"));
        rpc.stop().await;
    }
    #[tokio::test]
    async fn crash_rejects_pending_request() {
        let (rpc, _t, _e, id) = fixture().await;
        assert!(prompt(&rpc, &id, "crash").await.is_err());
        assert!(!rpc.alive.load(Ordering::SeqCst));
        rpc.stop().await;
    }
    #[tokio::test]
    async fn cancellation_unblocks_pending_interaction() {
        let (rpc, _t, _e, id) = fixture().await;
        let r = rpc.clone();
        let sid = id.clone();
        let task = tokio::spawn(async move { prompt(&r, &sid, "permission").await });
        tokio::time::timeout(Duration::from_secs(5), async {
            while rpc.inbound.lock().await.is_empty() {
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        rpc.cancel_requests().await;
        rpc.notify("session/cancel", json!({"sessionId":id}))
            .await
            .unwrap();
        task.await.unwrap().unwrap();
        assert!(rpc.inbound.lock().await.is_empty());
        rpc.stop().await;
    }
}
