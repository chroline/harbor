//! Bridge native async question receipts omitted by codex-acp 2.1.1/2.3.0.
//! Receipts are data, never instructions. Answers are ordinary user input in the
//! original ACP conversation, matching native asynchronous-question semantics.
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    io::{BufRead, Read, Seek, SeekFrom},
    path::Path,
};

const PREFIX: &str = "harbor:codex-question:";
const TAIL_BYTES: u64 = 8 * 1024 * 1024;
#[derive(Deserialize)]
struct Arguments {
    questions: Vec<Question>,
}
#[derive(Deserialize)]
struct Question {
    title: String,
    options: Option<Vec<String>>,
}

pub fn is_async(request: &Value) -> bool {
    request["method"] == "elicitation/create"
        && request["id"]
            .as_str()
            .is_some_and(|id| id.starts_with(PREFIX))
        && request["params"]["_meta"]["harborCodexAsyncQuestion"] == true
}
fn request(thread: &str, call: &str, arguments: &str) -> Option<Value> {
    let args: Arguments = serde_json::from_str(arguments).ok()?;
    if args.questions.is_empty()
        || args.questions.len() > 64
        || args.questions.iter().any(|q| {
            q.title.trim().is_empty()
                || q.options
                    .as_ref()
                    .is_some_and(|o| o.len() > 1000 || o.iter().any(|v| v.trim().is_empty()))
        })
    {
        return None;
    }
    let mut properties = serde_json::Map::new();
    let mut required = Vec::new();
    for (index, question) in args.questions.iter().enumerate() {
        let id = format!("question_{index}");
        let mut field = json!({"type":"string","title":question.title});
        if let Some(options) = question.options.as_ref().filter(|o| !o.is_empty()) {
            field["oneOf"] = json!(options
                .iter()
                .map(|label| json!({"const":label,"title":label}))
                .collect::<Vec<_>>());
            properties.insert(format!("{id}_custom"), json!({"type":"string","title":"Other","_meta":{"_askUserQuestionCustomAnswer":{"questionId":id}}}));
        }
        required.push(id.clone());
        properties.insert(id, field);
    }
    Some(
        json!({"id":format!("{PREFIX}{thread}:{call}"),"method":"elicitation/create","params":{
            "sessionId":thread,"toolCallId":call,"mode":"form","message":"Please answer the following questions.",
            "requestedSchema":{"type":"object","properties":properties,"required":required},
            "_meta":{"harborCodexAsyncQuestion":true,"_harborQuestionOrder":required}
        }}),
    )
}

/// Keep only successful question calls since the latest actual user message.
/// A final agent message deliberately does not dismiss unanswered questions.
pub fn receipts(
    lines: impl Iterator<Item = String>,
    thread: &str,
    answered: &HashSet<String>,
) -> Vec<Value> {
    let mut calls = HashMap::new();
    let mut pending = Vec::new();
    for line in lines {
        let Ok(event) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if event["type"] != "response_item" {
            continue;
        }
        let item = &event["payload"];
        if item["type"] == "message" && item["role"] == "user" {
            calls.clear();
            pending.clear();
        } else if item["type"] == "function_call" && item["name"] == "request_user_input_async" {
            if let (Some(call), Some(args)) = (item["call_id"].as_str(), item["arguments"].as_str())
            {
                if !call.is_empty() && call.len() <= 256 {
                    if let Some(request) = request(thread, call, args) {
                        calls.insert(call.to_owned(), request);
                    }
                }
            }
        } else if item["type"] == "function_call_output" {
            let Some(call) = item["call_id"].as_str() else {
                continue;
            };
            let Some(request) = calls.remove(call) else {
                continue;
            };
            let output = item["output"]
                .as_str()
                .and_then(|s| serde_json::from_str::<Value>(s).ok())
                .unwrap_or_else(|| item["output"].clone());
            if output["accepted"] == true && !answered.contains(request["id"].as_str().unwrap()) {
                pending.push(request);
            }
        }
    }
    pending
}

/// Locate only the exact native thread, verify its identity and workspace, and
/// read a bounded tail. Missing native storage leaves ordinary ACP unaffected.
pub fn load(thread: &str, cwd: &Path, answered: &HashSet<String>) -> Result<Vec<Value>, String> {
    let Some(path) = find_receipt(thread)? else {
        return Ok(vec![]);
    };
    load_file(&path, thread, cwd, answered)
}
/// Observe the exact native turn when ACP steering starts a background turn.
pub fn latest_turn(thread: &str, cwd: &Path) -> Result<Option<(String, Option<String>)>, String> {
    let Some(path) = find_receipt(thread)? else {
        return Ok(None);
    };
    latest_turn_file(&path, thread, cwd)
}
fn latest_turn_file(
    path: &Path,
    thread: &str,
    cwd: &Path,
) -> Result<Option<(String, Option<String>)>, String> {
    for line in read_lines(path, thread, cwd)?.into_iter().rev() {
        let Ok(event) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if event["type"] != "event_msg" {
            continue;
        }
        let payload = &event["payload"];
        let reason = match payload["type"].as_str() {
            Some("task_started") => None,
            Some("task_complete") => Some("end_turn".to_owned()),
            Some("turn_aborted") => Some("cancelled".to_owned()),
            _ => continue,
        };
        if let Some(id) = payload["turn_id"].as_str() {
            return Ok(Some((id.into(), reason)));
        }
    }
    Ok(None)
}
fn find_receipt(thread: &str) -> Result<Option<std::path::PathBuf>, String> {
    if uuid::Uuid::parse_str(thread).is_err() {
        return Ok(None);
    }
    let home = std::env::var_os("CODEX_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|p| std::path::PathBuf::from(p).join(".codex")));
    let Some(home) = home else {
        return Ok(None);
    };
    let suffix = format!("-{thread}.jsonl");
    let path = walkdir::WalkDir::new(home.join("sessions"))
        .max_depth(6)
        .into_iter()
        .filter_map(Result::ok)
        .find(|entry| {
            entry.file_type().is_file() && entry.file_name().to_string_lossy().ends_with(&suffix)
        })
        .map(|e| e.into_path());
    let Some(path) = path else {
        return Ok(None);
    };
    Ok(Some(path))
}
fn load_file(
    path: &Path,
    thread: &str,
    cwd: &Path,
    answered: &HashSet<String>,
) -> Result<Vec<Value>, String> {
    Ok(receipts(
        read_lines(path, thread, cwd)?.into_iter(),
        thread,
        answered,
    ))
}
fn read_lines(path: &Path, thread: &str, cwd: &Path) -> Result<Vec<String>, String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut header = String::new();
    std::io::BufReader::new((&mut file).take(1024 * 1024))
        .read_line(&mut header)
        .map_err(|e| e.to_string())?;
    let metadata: Value = serde_json::from_str(&header).map_err(|e| e.to_string())?;
    let native_cwd = metadata["payload"]["cwd"]
        .as_str()
        .ok_or("Native question receipt has no workspace")?;
    if metadata["type"] != "session_meta"
        || metadata["payload"]["id"] != thread
        || Path::new(native_cwd).canonicalize().ok() != cwd.canonicalize().ok()
        || cwd.canonicalize().is_err()
    {
        return Err("Native question receipt does not match this conversation".into());
    }
    let start = file
        .metadata()
        .map_err(|e| e.to_string())?
        .len()
        .saturating_sub(TAIL_BYTES);
    file.seek(SeekFrom::Start(start))
        .map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take(TAIL_BYTES)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let mut lines = bytes.split(|b| *b == b'\n');
    if start > 0 {
        lines.next();
    }
    // A writer may still be appending the last UTF-8/JSON record. The parser
    // ignores incomplete JSON and retries on the next observation.
    Ok(lines
        .map(|line| String::from_utf8_lossy(line).into_owned())
        .collect())
}

/// Validate against the captured question and encode a plain user reply. No
/// native RPC response is invented for a tool that already returned accepted.
pub fn answer_text(request: &Value, result: &Value) -> Result<String, String> {
    if !is_async(request) || result["action"] != "accept" {
        return Err("Invalid async question answer".into());
    }
    let content = result["content"]
        .as_object()
        .ok_or("Missing question answers")?;
    let schema = &request["params"]["requestedSchema"];
    let properties = schema["properties"]
        .as_object()
        .ok_or("Missing question fields")?;
    if content.keys().any(|key| !properties.contains_key(key)) {
        return Err("Unknown question answer field".into());
    }
    let mut answers = Vec::new();
    for id in schema["required"]
        .as_array()
        .ok_or("Missing question order")?
    {
        let id = id.as_str().ok_or("Invalid question ID")?;
        let field = &properties[id];
        let selected = content
            .get(id)
            .map(|v| v.as_str().ok_or("Question answers must be text"))
            .transpose()?;
        if let Some(value) = selected {
            if let Some(options) = field["oneOf"].as_array() {
                if !options.iter().any(|o| o["const"] == value) {
                    return Err("Choose a listed answer".into());
                }
            }
        }
        let note_id = format!("{id}_custom");
        let note = content
            .get(&note_id)
            .map(|v| v.as_str().ok_or("Question notes must be text"))
            .transpose()?;
        if selected.unwrap_or("").trim().is_empty() && note.unwrap_or("").trim().is_empty() {
            return Err("Answer each question before submitting".into());
        }
        answers.push(json!({"question":field["title"],"answer":selected,"note":note}));
    }
    Ok(format!(
        "Answers to your questions:\n{}",
        serde_json::to_string_pretty(&answers).map_err(|e| e.to_string())?
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn message(text: &str) -> Value {
        json!({"type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":text}]}})
    }
    fn call() -> Value {
        json!({"type":"response_item","payload":{"type":"function_call","name":"request_user_input_async","call_id":"call_test","arguments":"{\"questions\":[{\"title\":\"Which color?\",\"options\":[\"Blue\",\"Green\"]}]}"}})
    }
    fn output(accepted: bool) -> Value {
        json!({"type":"response_item","payload":{"type":"function_call_output","call_id":"call_test","output":json!({"accepted":accepted}).to_string()}})
    }
    fn parse(events: Vec<Value>, answered: HashSet<String>) -> Vec<Value> {
        receipts(
            events.into_iter().map(|e| e.to_string()),
            "thread",
            &answered,
        )
    }
    #[test]
    fn accepted_async_question_survives_final_message_and_keeps_source_identity() {
        let pending = parse(
            vec![
                message("ask a question"),
                call(),
                output(true),
                json!({"type":"response_item","payload":{"type":"message","role":"assistant","content":[{"text":"I've sent a question."}]}}),
            ],
            HashSet::new(),
        );
        assert_eq!(pending.len(), 1);
        assert!(is_async(&pending[0]));
        assert_eq!(pending[0]["id"], "harbor:codex-question:thread:call_test");
        assert_eq!(
            pending[0]["params"]["requestedSchema"]["properties"]["question_0"]["title"],
            "Which color?"
        );
    }
    #[test]
    fn unsuccessful_or_unmatched_calls_and_later_user_input_do_not_create_questions() {
        for events in [
            vec![call()],
            vec![output(true)],
            vec![call(), output(false)],
            vec![call(), output(true), message("continue")],
        ] {
            assert!(parse(events, HashSet::new()).is_empty());
        }
        assert!(parse(
            vec![call(), output(true)],
            HashSet::from(["harbor:codex-question:thread:call_test".into()])
        )
        .is_empty());
        let mut invalid = call();
        invalid["payload"]["arguments"] = json!("{\"questions\":[{\"title\":\"\"}]}");
        assert!(parse(vec![invalid, output(true)], HashSet::new()).is_empty());
    }
    #[test]
    fn answers_validate_the_captured_schema_and_preserve_notes() {
        let r = parse(vec![call(), output(true)], HashSet::new()).remove(0);
        let text=answer_text(&r,&json!({"action":"accept","content":{"question_0":"Blue","question_0_custom":"Navy\nwith green"}})).unwrap();
        assert!(text.contains("Blue"));
        assert!(text.contains("Navy\\nwith green"));
        for content in [
            json!({}),
            json!({"question_0":"Fake"}),
            json!({"question_0":false}),
            json!({"question_0_custom":9}),
            json!({"unknown":"x"}),
        ] {
            assert!(answer_text(&r, &json!({"action":"accept","content":content})).is_err());
        }
    }
    #[test]
    fn native_turn_completion_and_partial_writes_are_observed_without_guessing() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("receipt.jsonl");
        let header = json!({"type":"session_meta","payload":{"id":"thread","cwd":dir.path()}});
        let started =
            json!({"type":"event_msg","payload":{"type":"task_started","turn_id":"turn-1"}});
        std::fs::write(
            &path,
            format!(
                "{header}\n{started}\n{}\n{}\n{{\"partial",
                call(),
                output(true)
            ),
        )
        .unwrap();
        assert_eq!(
            load_file(&path, "thread", dir.path(), &HashSet::new())
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            latest_turn_file(&path, "thread", dir.path()).unwrap(),
            Some(("turn-1".into(), None))
        );
        let complete =
            json!({"type":"event_msg","payload":{"type":"task_complete","turn_id":"turn-1"}});
        std::fs::write(&path, format!("{header}\n{started}\n{complete}\n")).unwrap();
        assert_eq!(
            latest_turn_file(&path, "thread", dir.path()).unwrap(),
            Some(("turn-1".into(), Some("end_turn".into())))
        );
    }
    #[test]
    fn native_receipt_identity_and_workspace_are_checked() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("receipt.jsonl");
        let header = json!({"type":"session_meta","payload":{"id":"thread","cwd":dir.path()}});
        std::fs::write(&path, format!("{header}\n{}\n{}\n", call(), output(true))).unwrap();
        assert_eq!(
            load_file(&path, "thread", dir.path(), &HashSet::new())
                .unwrap()
                .len(),
            1
        );
        assert!(load_file(&path, "other", dir.path(), &HashSet::new()).is_err());
        assert!(load_file(&path, "thread", &dir.path().join("other"), &HashSet::new()).is_err());
    }
}
