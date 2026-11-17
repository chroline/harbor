//! OpenCode forwards subagent activity on the parent's ACP stream. Each forwarded
//! frame carries `_meta["opencode/child-session"]` naming the child session, and the
//! parent's `subagent` tool returns the child session ID in `rawOutput.metadata`.
use super::super::contract::{WorkerAnnouncement, WorkerState, WorkerUpdate, WorkerUpdateKind};
use serde::Deserialize;
use serde_json::Value;

const CHILD_META: &str = "opencode/child-session";
const FORWARDED: &[&str] = &[
    "user_message_chunk",
    "agent_message_chunk",
    "agent_thought_chunk",
    "tool_call",
    "tool_call_update",
    "plan",
];

#[derive(Deserialize)]
struct ChildSession {
    id: String,
    #[serde(rename = "parentID")]
    parent_id: String,
    title: Option<String>,
}

fn child_session(update: &Value) -> Option<ChildSession> {
    serde_json::from_value(update.get("_meta")?.get(CHILD_META)?.clone()).ok()
}

fn announcement(parent: &str, child: &str, title: Option<&str>, state: WorkerState) -> Option<WorkerAnnouncement> {
    if parent.is_empty() || child.is_empty() || parent == child {
        return None;
    }
    Some(WorkerAnnouncement {
        session_id: parent.into(),
        update: WorkerUpdate {
            session_update: WorkerUpdateKind::SubagentUpdate,
            session_id: child.into(),
            // A receipt that does not name the worker must not rename it.
            title: title.filter(|t| !t.is_empty()).map(str::to_owned),
            description: None,
            state,
        },
    })
}

/// Re-address forwarded child frames to the child session so Harbor files them
/// under that worker instead of interleaving them with the parent transcript.
/// Only frames that name the receiving session as their direct parent move.
pub fn route_child(mut payload: Value) -> Value {
    let Some(parent) = payload["sessionId"].as_str().map(str::to_owned) else {
        return payload;
    };
    let Some(child) = child_session(&payload["update"]) else {
        return payload;
    };
    if child.id.is_empty() || child.id == parent || child.parent_id != parent {
        return payload;
    }
    if let Some(title) = child.title.as_deref().filter(|t| !t.is_empty()) {
        // OpenCode prefixes forwarded tool titles with the worker title.
        let prefix = format!("{title}: ");
        if let Some(stripped) = payload["update"]["title"].as_str().and_then(|t| t.strip_prefix(&prefix)) {
            payload["update"]["title"] = Value::String(stripped.to_owned());
        }
    }
    payload["sessionId"] = Value::String(child.id);
    payload
}

/// Announce a worker the first time one of its forwarded frames arrives.
pub fn forwarded(parent: &str, payload: &Value) -> Option<WorkerAnnouncement> {
    let update = &payload["update"];
    if !FORWARDED.contains(&update["sessionUpdate"].as_str()?) {
        return None;
    }
    let child = payload["sessionId"].as_str()?;
    let meta = child_session(update)?;
    if meta.id != child || meta.parent_id != parent {
        return None;
    }
    announcement(parent, child, meta.title.as_deref(), WorkerState::Working)
}

/// Read the parent's `subagent` tool receipt, which names the child session.
pub fn announcements(kind: &str, payload: &Value) -> Vec<WorkerAnnouncement> {
    if kind != "session/update" {
        return vec![];
    }
    let update = &payload["update"];
    if update["sessionUpdate"] != "tool_call_update" || child_session(update).is_some() {
        return vec![];
    }
    let Some(parent) = payload["sessionId"].as_str() else {
        return vec![];
    };
    let metadata = &update["rawOutput"]["metadata"];
    let Some(child) = metadata["sessionID"].as_str() else {
        return vec![];
    };
    let state = match metadata["status"].as_str() {
        Some("running" | "pending" | "queued") => WorkerState::Working,
        Some("completed" | "idle" | "cancelled") => WorkerState::Idle,
        Some("error" | "failed") => WorkerState::Error,
        _ if update["status"] == "failed" => WorkerState::Error,
        _ => WorkerState::Unknown,
    };
    let title = update["rawInput"]["description"]
        .as_str()
        .filter(|t| !t.is_empty());
    announcement(parent, child, title, state).into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn child_frame(session: &str, update: Value) -> Value {
        json!({"sessionId":session,"update":update})
    }
    fn meta(parent: &str) -> Value {
        json!({"opencode/child-session":{"id":"ses_child","parentID":parent,"depth":1,"title":"List cwd files"}})
    }

    #[test]
    fn routes_forwarded_child_frames_to_the_child_session() {
        let frame = child_frame("ses_root", json!({"sessionUpdate":"tool_call","toolCallId":"ses_child:call","title":"List cwd files: read","kind":"read","_meta":meta("ses_root")}));
        let routed = route_child(frame);
        assert_eq!(routed["sessionId"], "ses_child");
        assert_eq!(routed["update"]["title"], "read");
        assert_eq!(routed["update"]["toolCallId"], "ses_child:call");
        let worker = forwarded("ses_root", &routed).unwrap();
        assert_eq!(worker.session_id, "ses_root");
        assert_eq!(worker.update.session_id, "ses_child");
        assert_eq!(worker.update.title.as_deref(), Some("List cwd files"));
        assert!(matches!(worker.update.state, WorkerState::Working));

        let chunk = route_child(child_frame("ses_root", json!({"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"done"},"_meta":meta("ses_root")})));
        assert_eq!(chunk["sessionId"], "ses_child");
        assert_eq!(chunk["update"]["content"]["text"], "done");
    }

    #[test]
    fn leaves_parent_frames_and_foreign_children_untouched() {
        let parent = child_frame("ses_root", json!({"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"hi"}}));
        assert_eq!(route_child(parent.clone()), parent);
        assert!(forwarded("ses_root", &parent).is_none());
        // A grandchild names its own parent, not the receiving session.
        let foreign = child_frame("ses_root", json!({"sessionUpdate":"tool_call","toolCallId":"x","_meta":meta("ses_other")}));
        assert_eq!(route_child(foreign.clone()), foreign);
        assert!(forwarded("ses_root", &route_child(foreign)).is_none());
        let looped = child_frame("ses_child", json!({"sessionUpdate":"tool_call","toolCallId":"x","_meta":meta("ses_child")}));
        assert_eq!(route_child(looped.clone()), looped);
        let usage = route_child(child_frame("ses_root", json!({"sessionUpdate":"usage_update","_meta":meta("ses_root")})));
        assert!(forwarded("ses_root", &usage).is_none());
    }

    #[test]
    fn announces_workers_from_subagent_tool_receipts() {
        let receipt = |status: &str| child_frame("ses_root", json!({"sessionUpdate":"tool_call_update","toolCallId":"call","status":"completed","rawInput":{"agent":"explore","description":"List files"},"rawOutput":{"metadata":{"sessionID":"ses_child","status":status}}}));
        let running = announcements("session/update", &receipt("running"));
        assert_eq!(running.len(), 1);
        assert_eq!(running[0].update.session_id, "ses_child");
        assert_eq!(running[0].update.title.as_deref(), Some("List files"));
        assert!(matches!(running[0].update.state, WorkerState::Working));
        assert!(matches!(announcements("session/update", &receipt("completed"))[0].update.state, WorkerState::Idle));
        // A completion receipt without the description must not rename the worker.
        let bare = child_frame("ses_root", json!({"sessionUpdate":"tool_call_update","toolCallId":"call","status":"completed","rawOutput":{"metadata":{"sessionID":"ses_child","status":"completed"}}}));
        let bare = announcements("session/update", &bare);
        assert!(bare[0].update.title.is_none());
        assert!(serde_json::to_value(&bare[0]).unwrap()["update"].get("title").is_none());
        assert!(matches!(announcements("session/update", &receipt("error"))[0].update.state, WorkerState::Error));
        assert!(announcements("request", &receipt("running")).is_empty());
        let shell = child_frame("ses_root", json!({"sessionUpdate":"tool_call_update","toolCallId":"call","status":"completed","rawOutput":{"metadata":{"status":"completed","exit":0}}}));
        assert!(announcements("session/update", &shell).is_empty());
        let selfish = child_frame("ses_child", json!({"sessionUpdate":"tool_call_update","rawOutput":{"metadata":{"sessionID":"ses_child","status":"running"}}}));
        assert!(announcements("session/update", &selfish).is_empty());
    }
}
