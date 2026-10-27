use super::super::contract::{WorkerAnnouncement, WorkerState, WorkerUpdate, WorkerUpdateKind};
use serde::Deserialize;
use serde_json::Value;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Frame {
    session_id: String,
    update: Update,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Update {
    session_update: String,
    title: Option<String>,
    raw_output: Option<Receipt>,
}
#[derive(Deserialize)]
#[serde(tag = "type")]
enum Receipt {
    SubagentCompleted {
        subagent_id: String,
        resume_from_hint: Option<String>,
    },
    TaskOutput {
        #[serde(rename = "Result")]
        result: Option<TaskResult>,
        #[serde(rename = "MultiResult")]
        multi_result: Option<TaskResults>,
    },
}
#[derive(Deserialize)]
struct TaskResults {
    results: Vec<TaskResult>,
}
#[derive(Deserialize)]
struct TaskResult {
    task_id: String,
    command: String,
    status: String,
}
fn announcement(
    parent: &str,
    child: &str,
    title: &str,
    state: WorkerState,
) -> Option<WorkerAnnouncement> {
    if parent.is_empty() || child.is_empty() || parent == child {
        return None;
    }
    Some(WorkerAnnouncement {
        session_id: parent.into(),
        update: WorkerUpdate {
            session_update: WorkerUpdateKind::SubagentUpdate,
            session_id: child.into(),
            title: title.into(),
            description: None,
            state,
        },
    })
}
pub fn forwarded(parent: &str, payload: &Value) -> Option<WorkerAnnouncement> {
    // A forwarded message need not have a worker receipt yet.
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Forward {
        session_id: String,
        update: ForwardUpdate,
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ForwardUpdate {
        session_update: String,
    }
    let frame: Forward = serde_json::from_value(payload.clone()).ok()?;
    if !matches!(
        frame.update.session_update.as_str(),
        "user_message_chunk"
            | "agent_message_chunk"
            | "agent_thought_chunk"
            | "tool_call"
            | "tool_call_update"
    ) {
        return None;
    }
    announcement(
        parent,
        &frame.session_id,
        "Grok worker",
        WorkerState::Working,
    )
}
pub fn announcements(kind: &str, payload: &Value) -> Vec<WorkerAnnouncement> {
    if kind != "session/update" {
        return vec![];
    }
    let Ok(frame) = serde_json::from_value::<Frame>(payload.clone()) else {
        return vec![];
    };
    if frame.update.session_update != "tool_call_update" {
        return vec![];
    }
    match frame.update.raw_output {
        Some(Receipt::SubagentCompleted {
            subagent_id,
            resume_from_hint,
        }) if resume_from_hint
            .as_ref()
            .is_none_or(|id| id == &subagent_id) =>
        {
            announcement(
                &frame.session_id,
                &subagent_id,
                frame
                    .update
                    .title
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Grok worker"),
                WorkerState::Idle,
            )
            .into_iter()
            .collect()
        }
        Some(Receipt::TaskOutput {
            result,
            multi_result,
        }) => {
            let mut out = Vec::new();
            for result in result
                .into_iter()
                .chain(multi_result.into_iter().flat_map(|r| r.results))
            {
                let Some((_, title)) = result
                    .command
                    .strip_prefix("[subagent:")
                    .and_then(|s| s.split_once("] "))
                else {
                    continue;
                };
                let state = match result.status.as_str() {
                    "initializing" | "running" => WorkerState::Working,
                    "completed" | "cancelled" => WorkerState::Idle,
                    "failed" | "timed_out" => WorkerState::Error,
                    _ => WorkerState::Unknown,
                };
                if out
                    .iter()
                    .any(|a: &WorkerAnnouncement| a.update.session_id == result.task_id)
                {
                    continue;
                }
                if let Some(item) = announcement(
                    &frame.session_id,
                    &result.task_id,
                    if title.is_empty() {
                        "Grok worker"
                    } else {
                        title
                    },
                    state,
                ) {
                    out.push(item);
                }
            }
            out
        }
        _ => vec![],
    }
}
