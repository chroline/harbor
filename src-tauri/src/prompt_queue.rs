//! App-session queues. Only this coordinator advances accepted follow-ups.
use crate::{types::*, AppState};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    sync::atomic::Ordering,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::Emitter;
use ts_rs::TS;

#[derive(Clone, Debug, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub enum SubmissionIntent {
    Send,
    Steer,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct QueuedPrompt {
    pub id: String,
    pub text: String,
    pub attachments: Vec<String>,
    pub intent: SubmissionIntent,
    #[serde(default)]
    pub editing: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct QueuedEdit {
    pub text: String,
    pub attachments: Vec<PromptAttachment>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../src/lib/bindings/")]
pub struct QueueSnapshot {
    pub session_id: String,
    pub child_id: Option<String>,
    pub revision: u32,
    pub items: Vec<QueuedPrompt>,
    pub paused: bool,
    pub error: Option<String>,
    pub steering: bool,
}
#[derive(Clone)]
struct Pending {
    view: QueuedPrompt,
    files: Vec<PromptAttachment>,
    edit_owner: Option<String>,
}
#[derive(Default)]
struct Queue {
    snapshot: QueueSnapshot,
    pending: Vec<Pending>,
    running: bool,
    cancelling: bool,
    shared_parent: bool,
}
impl Queue {
    fn enqueue(&mut self, item: Pending) {
        self.snapshot.paused = false;
        self.snapshot.error = None;
        if item.view.intent == SubmissionIntent::Steer {
            self.cancelling = true;
            self.snapshot.steering = true;
            self.pending.insert(0, item);
        } else {
            self.pending.push(item);
        }
    }
    fn take(&mut self, expected: &str) -> Option<Pending> {
        if self.cancelling
            || self.snapshot.paused
            || self.pending.first().is_none_or(|p| p.view.id != expected)
            || self.pending.first().is_some_and(|p| p.edit_owner.is_some())
        {
            return None;
        }
        Some(self.pending.remove(0))
    }
    fn clear(&mut self) {
        self.pending.clear();
        self.cancelling = false;
        self.snapshot.paused = true;
        self.snapshot.error = None;
        self.snapshot.steering = false;
    }
    fn failed(&mut self, item: Pending, error: String) {
        self.pending.insert(0, item);
        self.snapshot.paused = true;
        self.snapshot.error = Some(error);
    }
}
#[derive(Default)]
struct State {
    queues: HashMap<(String, Option<String>), Queue>,
    configuration: HashMap<String, HashSet<String>>,
    revision: u32,
}
impl State {
    fn take(&mut self, session: &str, child: &Option<String>, expected: &str) -> Option<Pending> {
        if self
            .configuration
            .get(session)
            .is_some_and(|owners| !owners.is_empty())
        {
            return None;
        }
        let key = (session.to_owned(), child.clone());
        let queue = self.queues.get(&key)?;
        if queue.shared_parent
            && queue
                .pending
                .first()
                .is_some_and(|p| p.view.intent != SubmissionIntent::Steer)
            && self.queues.iter().any(|((id, other), q)| {
                id == session
                    && other != child
                    && q.shared_parent
                    && !q.snapshot.paused
                    && q.pending
                        .first()
                        .is_some_and(|p| p.view.intent == SubmissionIntent::Steer)
            })
        {
            return None;
        }
        self.queues.get_mut(&key)?.take(expected)
    }
}
#[derive(Default)]
pub struct Coordinator(Mutex<State>);
impl Coordinator {
    fn change(
        &self,
        session: &str,
        child: &Option<String>,
        f: impl FnOnce(&mut Queue),
    ) -> QueueSnapshot {
        let mut state = self.0.lock().unwrap();
        state.revision += 1;
        let revision = state.revision;
        let queue = state
            .queues
            .entry((session.into(), child.clone()))
            .or_default();
        f(queue);
        queue.snapshot.session_id = session.into();
        queue.snapshot.child_id = child.clone();
        queue.snapshot.revision = revision;
        queue.snapshot.items = queue.pending.iter().map(|p| p.view.clone()).collect();
        queue.snapshot.clone()
    }
    pub fn snapshot(&self, session: &str, child: &Option<String>) -> QueueSnapshot {
        self.0
            .lock()
            .unwrap()
            .queues
            .get(&(session.into(), child.clone()))
            .map(|q| q.snapshot.clone())
            .unwrap_or(QueueSnapshot {
                session_id: session.into(),
                child_id: child.clone(),
                ..Default::default()
            })
    }
    pub fn configuration(&self, session: &str, owner: &str, blocked: bool) {
        let mut inner = self.0.lock().unwrap();
        let owners = inner.configuration.entry(session.into()).or_default();
        if blocked {
            owners.insert(owner.into());
        } else {
            owners.remove(owner);
        }
    }
    pub fn release_owner(&self, state: &AppState, owner: &str) {
        let affected: Vec<_> = {
            let mut inner = self.0.lock().unwrap();
            inner
                .configuration
                .iter_mut()
                .filter_map(|(id, owners)| owners.remove(owner).then(|| id.clone()))
                .collect()
        };
        for session in affected {
            self.pause_session(state, &session);
        }
        let targets: Vec<_> = {
            let inner = self.0.lock().unwrap();
            inner.queues.iter().filter(|(_, q)| q.pending.iter().any(|p| p.edit_owner.as_deref() == Some(owner))).map(|(key, _)| key.clone()).collect()
        };
        for (session, child) in targets {
            let snapshot = self.change(&session, &child, |q| {
                for p in &mut q.pending { if p.edit_owner.as_deref() == Some(owner) { p.edit_owner = None; p.view.editing = false; } }
                q.snapshot.paused = true;
            });
            self.publish(state, snapshot);
        }
    }
    pub fn clear(&self, state: &AppState, session: &str) {
        let children: Vec<_> = self
            .0
            .lock()
            .unwrap()
            .queues
            .keys()
            .filter(|(id, _)| id == session)
            .map(|(_, child)| child.clone())
            .collect();
        for child in children {
            self.publish(
                state,
                self.change(session, &child, |q| {
                    q.clear();
                }),
            );
        }
    }
    pub fn pause_session(&self, state: &AppState, session: &str) {
        let children: Vec<_> = self
            .0
            .lock()
            .unwrap()
            .queues
            .keys()
            .filter(|(id, _)| id == session)
            .map(|(_, child)| child.clone())
            .collect();
        for child in children {
            self.pause(state, session, &child, None);
        }
    }
    pub fn pause(
        &self,
        state: &AppState,
        session: &str,
        child: &Option<String>,
        error: Option<String>,
    ) -> QueueSnapshot {
        let snapshot = self.change(session, child, |q| {
            q.snapshot.paused = true;
            q.snapshot.error = error;
            q.snapshot.steering = false;
        });
        self.publish(state, snapshot.clone());
        snapshot
    }
    fn publish(&self, state: &AppState, snapshot: QueueSnapshot) {
        let _ = state.app.emit("prompt-queue-changed", snapshot);
    }
    pub fn remove(
        &self,
        state: &AppState,
        session: &str,
        child: &Option<String>,
        id: &str,
    ) -> QueueSnapshot {
        let snapshot = self.change(session, child, |q| q.pending.retain(|p| p.view.id != id || p.edit_owner.is_some()));
        self.publish(state, snapshot.clone());
        snapshot
    }
    pub fn begin_edit(&self, state: &AppState, session: &str, child: &Option<String>, id: &str, owner: &str) -> Result<QueuedEdit, String> {
        let mut result = Err("This queued message is no longer available".to_owned());
        let snapshot = self.change(session, child, |q| {
            if let Some(item) = q.pending.iter_mut().find(|p| p.view.id == id) {
                if item.edit_owner.is_some() { result = Err("This message is already being edited".into()); return; }
                item.edit_owner = Some(owner.into());
                item.view.editing = true;
                result = Ok(QueuedEdit { text: item.view.text.clone(), attachments: item.files.clone() });
            }
        });
        self.publish(state, snapshot);
        result
    }
    pub fn end_edit(&self, state: &Arc<AppState>, session: &str, child: &Option<String>, id: &str, owner: &str, update: Option<(String, Vec<PromptAttachment>)>, steer: Option<bool>) -> Result<QueueSnapshot, String> {
        let mut found = false;
        let snapshot = self.change(session, child, |q| {
            if let Some(item) = q.pending.iter_mut().find(|p| p.view.id == id && p.edit_owner.as_deref() == Some(owner)) {
                found = true;
                if let Some((text, files)) = update { item.view.text = text; item.view.attachments = files.iter().map(|f| f.name.clone()).collect(); item.files = files; }
                item.edit_owner = None;
                item.view.editing = false;
            }
            if found {
                if let Some(shared_parent) = steer {
                    let index = q.pending.iter().position(|p| p.view.id == id).unwrap();
                    let mut item = q.pending.remove(index);
                    item.view.intent = SubmissionIntent::Steer;
                    q.shared_parent = shared_parent;
                    q.enqueue(item);
                }
            }
        });
        self.publish(state, snapshot.clone());
        if !found { return Err("This queued edit is no longer available".into()); }
        self.start(state, session, child);
        Ok(snapshot)
    }
    pub fn steer_queued(&self, state: &Arc<AppState>, session: &str, child: &Option<String>, id: &str, shared_parent: bool) -> Result<QueueSnapshot, String> {
        let mut found = false;
        let snapshot = self.change(session, child, |q| {
            if let Some(index) = q.pending.iter().position(|p| p.view.id == id && p.edit_owner.is_none()) {
                let mut item = q.pending.remove(index);
                item.view.intent = SubmissionIntent::Steer;
                q.shared_parent = shared_parent;
                q.enqueue(item);
                found = true;
            }
        });
        self.publish(state, snapshot.clone());
        if !found { return Err("This queued message is unavailable or being edited".into()); }
        self.start(state, session, child);
        Ok(snapshot)
    }
    pub fn resume(
        &self,
        state: &Arc<AppState>,
        session: &str,
        child: &Option<String>,
    ) -> QueueSnapshot {
        let snapshot = self.change(session, child, |q| {
            q.snapshot.paused = false;
            q.snapshot.error = None;
        });
        self.publish(state, snapshot.clone());
        self.start(state, session, child);
        snapshot
    }
    pub fn submit(
        &self,
        state: &Arc<AppState>,
        session: &str,
        child: &Option<String>,
        text: String,
        files: Vec<PromptAttachment>,
        intent: SubmissionIntent,
        shared_parent: bool,
    ) -> QueueSnapshot {
        let item = Pending {
            view: QueuedPrompt {
                id: crate::types::id(),
                text,
                attachments: files.iter().map(|f| f.name.clone()).collect(),
                intent: intent.clone(),
                editing: false,
            },
            files,
            edit_owner: None,
        };
        let snapshot = self.change(session, child, |q| {
            q.shared_parent = shared_parent;
            q.enqueue(item);
        });
        self.publish(state, snapshot.clone());
        self.start(state, session, child);
        snapshot
    }
    pub async fn steer(&self, state: &Arc<AppState>, session: &str, child: &Option<String>) {
        let result=async {
            let (rpc,wire,_)=target(state,session,child).await?;
            let was_busy=rpc.busy.load(Ordering::SeqCst) || child.as_ref().and_then(|id| state.db.get::<SubagentRecord>("subagent",&crate::worker_key(session,id)).ok()).is_some_and(|w| crate::subagents::is_working(&w.state));
            rpc.cancel_requests().await;
            if was_busy {
                rpc.notify("session/cancel",serde_json::json!({"sessionId":wire})).await?;
                let weak=Arc::downgrade(state); let session=session.to_owned(); let child=child.clone();
                let generation=rpc.turn_generation.load(Ordering::SeqCst);
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(8)).await;
                    if let Some(state)=weak.upgrade() {
                        let worker_busy=child.as_ref().and_then(|id| state.db.get::<SubagentRecord>("subagent",&crate::worker_key(&session,id)).ok()).is_some_and(|w| crate::subagents::is_working(&w.state));
                        if cancellation_stalled(rpc.busy.load(Ordering::SeqCst),worker_busy,rpc.turn_generation.load(Ordering::SeqCst),generation) {
                            state.prompt_queues.pause(&state,&session,&child,Some("The agent did not acknowledge cancellation. Stop or reconnect before resuming.".into()));
                        }
                    }
                });
            }
            Ok::<(),String>(())
        }.await;
        let snapshot = self.change(session, child, |q| {
            q.cancelling = false;
            if let Err(e) = result {
                q.snapshot.paused = true;
                q.snapshot.error = Some(e);
                q.snapshot.steering = false;
            }
        });
        self.publish(state, snapshot);
    }
    fn start(&self, state: &Arc<AppState>, session: &str, child: &Option<String>) {
        let mut inner = self.0.lock().unwrap();
        let queue = inner
            .queues
            .get_mut(&(session.into(), child.clone()))
            .unwrap();
        if queue.running {
            return;
        }
        queue.running = true;
        drop(inner);
        let state = state.clone();
        let session = session.to_owned();
        let child = child.clone();
        tauri::async_runtime::spawn(async move {
            run(state, session, child).await;
        });
    }
}

// Resolve the transport on every pass: reconnects must never reuse a stale RPC.
async fn target(
    state: &AppState,
    session: &str,
    child: &Option<String>,
) -> Result<(Arc<crate::Rpc>, String, bool), String> {
    let root = state.connection(session).await?;
    if let Some(child) = child {
        let slot = state
            .child_connections
            .lock()
            .await
            .get(&crate::worker_key(session, child))
            .cloned()
            .ok_or("Open this worker before messaging it")?;
        let slot = slot.lock().await;
        let c = slot.as_ref().ok_or("The worker is disconnected")?;
        if !c.rpc.alive.load(Ordering::SeqCst) {
            return Err("The worker is disconnected".into());
        }
        Ok((c.rpc.clone(), c.wire_id.clone(), c.via_parent))
    } else {
        let s: SessionRecord = state.db.get("session", session)?;
        Ok((
            root,
            s.acp_session_id.ok_or("No connected conversation")?,
            false,
        ))
    }
}

pub async fn validate(
    state: &AppState,
    session: &str,
    child: &Option<String>,
    intent: &SubmissionIntent,
) -> Result<bool, String> {
    let s: SessionRecord = state.db.get("session", session)?;
    if s.archived || s.mode != "gui" {
        return Err("Return to the active chat before sending messages".into());
    }
    let (rpc, _, via_parent) = target(state, session, child).await?;
    if *intent == SubmissionIntent::Steer {
        let relay = state.relay_targets.lock().unwrap().get(session).cloned();
        let worker_running = if via_parent {
            let worker: SubagentRecord = state.db.get(
                "subagent",
                &crate::worker_key(session, child.as_deref().unwrap()),
            )?;
            crate::subagents::is_working(&worker.state)
        } else {
            false
        };
        cancellation_allowed(
            child,
            via_parent,
            rpc.busy.load(Ordering::SeqCst),
            relay.as_ref().map(|(id, _)| id),
            worker_running,
        )?;
    }
    Ok(child.is_none() || via_parent)
}

fn cancellation_allowed(
    child: &Option<String>,
    via_parent: bool,
    busy: bool,
    relay_owner: Option<&String>,
    worker_running: bool,
) -> Result<(), String> {
    if busy && (child.is_none() || via_parent) && relay_owner != child.as_ref() {
        return Err(
            "Another conversation is using this agent. Wait for it to finish before steering."
                .into(),
        );
    }
    if via_parent && worker_running {
        return Err(
            "This provider cannot safely steer this worker. Queue a message instead.".into(),
        );
    }
    Ok(())
}
fn cancellation_stalled(busy: bool, worker_busy: bool, generation: u64, expected: u64) -> bool {
    (busy || worker_busy) && generation == expected
}

async fn run(state: Arc<AppState>, session: String, child: Option<String>) {
    loop {
        if state.quitting.load(Ordering::SeqCst) {
            break;
        }
        let next = {
            let mut inner = state.prompt_queues.0.lock().unwrap();
            let q = inner
                .queues
                .get_mut(&(session.clone(), child.clone()))
                .unwrap();
            if q.snapshot.paused || q.pending.is_empty() {
                q.running = false;
                return;
            }
            q.pending[0].clone()
        };
        let session_record = match state.db.get::<SessionRecord>("session", &session) {
            Ok(s) => s,
            Err(_) => {
                state.prompt_queues.clear(&state, &session);
                break;
            }
        };
        if session_record.archived {
            state.prompt_queues.clear(&state, &session);
            break;
        }
        if session_record.mode != "gui" {
            state.prompt_queues.pause(&state, &session, &child, None);
            break;
        }
        let (rpc, _wire, via_parent) = match target(&state, &session, &child).await {
            Ok(t) => t,
            Err(e) => {
                state.prompt_queues.pause(&state, &session, &child, Some(e));
                break;
            }
        };
        let worker = child.as_ref().and_then(|id| {
            state
                .db
                .get::<SubagentRecord>("subagent", &crate::worker_key(&session, id))
                .ok()
        });
        let worker_busy = worker
            .as_ref()
            .is_some_and(|w| crate::subagents::is_working(&w.state));
        if worker.as_ref().is_some_and(|w| {
            matches!(
                w.state["type"]
                    .as_str()
                    .or_else(|| w.state["state"].as_str()),
                Some("error" | "failed" | "disconnected")
            )
        }) {
            state.prompt_queues.pause(
                &state,
                &session,
                &child,
                Some("Reconnect the worker before resuming its queue.".into()),
            );
            break;
        }
        let busy = rpc.busy.load(Ordering::SeqCst)
            || worker_busy
            || ((child.is_none() || via_parent) && session_record.status == "working");
        if busy {
            if next.view.intent != SubmissionIntent::Steer && !rpc.inbound.lock().await.is_empty() {
                state.prompt_queues.pause(
                    &state,
                    &session,
                    &child,
                    Some("Answer the pending request, then resume the queue.".into()),
                );
                break;
            }
            tokio::time::sleep(Duration::from_millis(80)).await;
            continue;
        }
        if !rpc.inbound.lock().await.is_empty() {
            state.prompt_queues.pause(
                &state,
                &session,
                &child,
                Some("Answer the pending request, then resume the queue.".into()),
            );
            break;
        }
        if matches!(session_record.status.as_str(), "error" | "disconnected") {
            state.prompt_queues.pause(
                &state,
                &session,
                &child,
                Some("Reconnect or resolve the agent error before resuming.".into()),
            );
            break;
        }
        if state
            .prompt_queues
            .0
            .lock()
            .unwrap()
            .configuration
            .get(&session)
            .is_some_and(|owners| !owners.is_empty())
        {
            tokio::time::sleep(Duration::from_millis(80)).await;
            continue;
        }
        let guard = state.operations.session(&session).await;
        // Recheck after acquiring the same lock used by submit/Stop/handoff.
        let current = state.db.get::<SessionRecord>("session", &session).ok();
        if rpc.busy.load(Ordering::SeqCst)
            || current.as_ref().is_none_or(|s| {
                s.archived
                    || s.mode != "gui"
                    || ((child.is_none() || via_parent) && s.status == "working")
            })
        {
            drop(guard);
            tokio::time::sleep(Duration::from_millis(80)).await;
            continue;
        }
        // Reserve the exact head. A concurrent steer/remove/Stop invalidates this choice.
        let taken = state
            .prompt_queues
            .0
            .lock()
            .unwrap()
            .take(&session, &child, &next.view.id);
        let Some(item) = taken else {
            drop(guard);
            tokio::time::sleep(Duration::from_millis(20)).await;
            continue;
        };
        state.prompt_queues.publish(
            &state,
            state
                .prompt_queues
                .change(&session, &child, |q| q.snapshot.steering = false),
        );
        let result = {
            let request = async {
                if let Some(id) = &child {
                    crate::send_subagent_prompt_locked(
                        &state,
                        session.clone(),
                        id.clone(),
                        item.view.text.clone(),
                        Some(item.files.clone()),
                        guard,
                    )
                    .await
                } else {
                    crate::send_prompt_locked(
                        &state,
                        session.clone(),
                        item.view.text.clone(),
                        Some(item.files.clone()),
                        None,
                        guard,
                    )
                    .await
                }
            };
            tokio::pin!(request);
            loop {
                tokio::select! {
                    result=&mut request => break result,
                    _=tokio::time::sleep(Duration::from_millis(80)) => {
                        if !state.prompt_queues.snapshot(&session,&child).paused && !rpc.inbound.lock().await.is_empty() {
                            state.prompt_queues.pause(&state,&session,&child,Some("Answer the pending request, then resume the queue.".into()));
                        }
                    }
                }
            }
        };
        if let Err(error) = result {
            // Never retry a possibly delivered prompt automatically.
            if state
                .db
                .get::<SessionRecord>("session", &session)
                .is_ok_and(|s| !s.archived)
            {
                let snapshot = state
                    .prompt_queues
                    .change(&session, &child, |q| q.failed(item, error));
                state.prompt_queues.publish(&state, snapshot);
            }
            break;
        }
    }
    // A submit can arrive between deciding to exit and releasing the runner.
    let restart = {
        let mut inner = state.prompt_queues.0.lock().unwrap();
        let q = inner
            .queues
            .get_mut(&(session.clone(), child.clone()))
            .unwrap();
        q.running = false;
        !q.snapshot.paused && !q.pending.is_empty() && !state.quitting.load(Ordering::SeqCst)
    };
    if restart {
        state.prompt_queues.start(&state, &session, &child);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn item(id: &str, intent: SubmissionIntent) -> Pending {
        Pending {
            view: QueuedPrompt {
                id: id.into(),
                text: id.into(),
                attachments: vec!["notes.md".into()],
                intent,
                editing: false,
            },
            files: vec![PromptAttachment {
                name: "notes.md".into(),
                mime_type: "text/plain".into(),
                data: "aGVsbG8=".into(),
            }],
            edit_owner: None,
        }
    }
    #[test]
    fn fifo_one_at_a_time_and_removed_head_cannot_dispatch() {
        let mut q = Queue::default();
        q.enqueue(item("a", SubmissionIntent::Send));
        q.enqueue(item("b", SubmissionIntent::Send));
        assert!(q.take("b").is_none());
        assert_eq!(q.take("a").unwrap().view.id, "a");
        assert!(q.take("a").is_none());
        assert_eq!(q.take("b").unwrap().view.id, "b");
    }
    #[test]
    fn editing_reserves_the_head_without_losing_attachments_or_fifo_position() {
        let mut q = Queue::default();
        q.enqueue(item("a", SubmissionIntent::Send));
        q.enqueue(item("b", SubmissionIntent::Send));
        q.pending[0].edit_owner = Some("main".into());
        q.pending[0].view.editing = true;
        assert!(q.take("a").is_none());
        assert_eq!(q.pending[0].files[0].data, "aGVsbG8=");
        q.pending[0].view.text = "revised".into();
        q.pending[0].edit_owner = None;
        q.pending[0].view.editing = false;
        let sent = q.take("a").unwrap();
        assert_eq!(sent.view.text, "revised");
        assert_eq!(sent.files[0].data, "aGVsbG8=");
        assert_eq!(q.pending[0].view.id, "b");
    }
    #[test]
    fn steering_preempts_without_discarding_and_waits_for_cancellation() {
        let mut q = Queue::default();
        q.enqueue(item("a", SubmissionIntent::Send));
        q.enqueue(item("b", SubmissionIntent::Send));
        q.enqueue(item("steer", SubmissionIntent::Steer));
        assert!(q.take("a").is_none());
        assert!(q.take("steer").is_none());
        q.cancelling = false;
        assert_eq!(q.take("steer").unwrap().view.id, "steer");
        assert_eq!(q.take("a").unwrap().view.id, "a");
        assert_eq!(q.take("b").unwrap().view.id, "b");
    }
    #[test]
    fn stop_pauses_even_a_previously_selected_head() {
        let mut q = Queue::default();
        q.enqueue(item("a", SubmissionIntent::Send));
        q.snapshot.paused = true;
        assert!(q.take("a").is_none());
        q.snapshot.paused = false;
        assert!(q.take("a").is_some());
    }
    #[test]
    fn submission_resumes_paused_queue_without_reordering() {
        let mut q = Queue::default();
        q.enqueue(item("a", SubmissionIntent::Send));
        q.snapshot.paused = true;
        q.snapshot.error = Some("offline".into());
        q.enqueue(item("b", SubmissionIntent::Send));
        assert!(!q.snapshot.paused);
        assert!(q.snapshot.error.is_none());
        assert!(q.take("b").is_none());
        assert!(q.take("a").is_some());
    }
    #[test]
    fn errors_retain_full_attachments_and_do_not_retry() {
        let mut q = Queue::default();
        q.enqueue(item("a", SubmissionIntent::Send));
        let message = q.take("a").unwrap();
        q.failed(message, "connection changed".into());
        assert!(q.take("a").is_none());
        assert_eq!(q.pending[0].files[0].data, "aGVsbG8=");
        assert_eq!(q.snapshot.error.as_deref(), Some("connection changed"));
    }
    #[test]
    fn concurrent_windows_share_revisioned_state_and_payloads_stay_private() {
        let coordinator = Arc::new(Coordinator::default());
        let handles: Vec<_> = (0..12)
            .map(|i| {
                let c = coordinator.clone();
                std::thread::spawn(move || {
                    c.change("chat", &None, |q| {
                        q.enqueue(item(&i.to_string(), SubmissionIntent::Send))
                    })
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        let snapshot = coordinator.snapshot("chat", &None);
        assert_eq!(snapshot.items.len(), 12);
        assert_eq!(snapshot.revision, 12);
        let payload = serde_json::to_string(&snapshot).unwrap();
        assert!(!payload.contains("aGVsbG8="));
        assert!(coordinator
            .snapshot("chat", &Some("worker".into()))
            .items
            .is_empty());
    }
    #[test]
    fn configuration_holds_are_isolated_by_window_and_session() {
        let c = Coordinator::default();
        c.configuration("chat", "main", true);
        c.configuration("chat", "detached", true);
        c.configuration("chat", "main", false);
        assert_eq!(c.0.lock().unwrap().configuration["chat"].len(), 1);
        c.configuration("other", "main", true);
        c.configuration("chat", "detached", false);
        assert!(c.0.lock().unwrap().configuration["chat"].is_empty());
        assert_eq!(c.0.lock().unwrap().configuration["other"].len(), 1);
    }
    #[test]
    fn cancellation_never_targets_another_conversation_on_a_shared_transport() {
        let owner = "worker".to_owned();
        assert!(cancellation_allowed(&None, false, true, Some(&owner), false).is_err());
        assert!(
            cancellation_allowed(&Some("other".into()), true, true, Some(&owner), false).is_err()
        );
        assert!(
            cancellation_allowed(&Some(owner.clone()), false, true, Some(&owner), true).is_ok()
        );
        assert!(cancellation_allowed(&None, false, true, None, false).is_ok());
    }
    #[test]
    fn parent_relay_workers_require_individual_cancellation_support() {
        let worker = Some("worker".into());
        assert!(cancellation_allowed(&worker, true, false, None, true).is_err());
        assert!(cancellation_allowed(&worker, true, false, None, false).is_ok());
    }
    #[test]
    fn cancellation_watchdog_ignores_new_turns_and_detects_external_workers() {
        assert!(cancellation_stalled(true, false, 4, 4));
        assert!(cancellation_stalled(false, true, 4, 4));
        assert!(!cancellation_stalled(false, false, 4, 4));
        assert!(!cancellation_stalled(true, true, 5, 4));
    }
    #[test]
    fn shared_transport_gives_steering_priority_but_independent_workers_continue() {
        let mut state = State::default();
        let mut root = Queue::default();
        root.shared_parent = true;
        root.enqueue(item("root", SubmissionIntent::Send));
        let mut relay = Queue::default();
        relay.shared_parent = true;
        relay.enqueue(item("steer", SubmissionIntent::Steer));
        relay.cancelling = false;
        let mut independent = Queue::default();
        independent.enqueue(item("direct", SubmissionIntent::Send));
        state.queues.insert(("chat".into(), None), root);
        state
            .queues
            .insert(("chat".into(), Some("relay".into())), relay);
        state
            .queues
            .insert(("chat".into(), Some("direct".into())), independent);
        assert!(state.take("chat", &None, "root").is_none());
        assert!(state
            .take("chat", &Some("direct".into()), "direct")
            .is_some());
        assert!(state.take("chat", &Some("relay".into()), "steer").is_some());
        assert!(state.take("chat", &None, "root").is_some());
    }
    #[test]
    fn configuration_prevents_reservation_until_every_window_releases() {
        let mut state = State::default();
        let mut q = Queue::default();
        q.enqueue(item("a", SubmissionIntent::Send));
        state.queues.insert(("chat".into(), None), q);
        state.configuration.insert(
            "chat".into(),
            HashSet::from(["main".into(), "detached".into()]),
        );
        assert!(state.take("chat", &None, "a").is_none());
        state.configuration.get_mut("chat").unwrap().remove("main");
        assert!(state.take("chat", &None, "a").is_none());
        state.configuration.get_mut("chat").unwrap().clear();
        assert!(state.take("chat", &None, "a").is_some());
    }
    #[test]
    fn discarding_a_chat_removes_attachments_and_steering_state() {
        let mut q = Queue::default();
        q.enqueue(item("steer", SubmissionIntent::Steer));
        q.snapshot.error = Some("offline".into());
        q.clear();
        assert!(q.pending.is_empty());
        assert!(!q.cancelling);
        assert!(!q.snapshot.steering);
        assert!(q.snapshot.error.is_none());
        assert!(q.snapshot.paused);
    }
}
