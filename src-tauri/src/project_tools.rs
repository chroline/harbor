//! Project-only MCP tools. Questions use native MCP elicitation; no chat prompts.
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, Write},
};
fn tools() -> Value {
    tools_for_role(std::env::var("HARBOR_AGENT_ROLE").as_deref() == Ok("orchestrator"))
}
fn tools_for_role(orchestrator: bool) -> Value {
    let mut tools = vec![
        json!({"name":"send_message","description":"Send your actual message to an existing Harbor session in this project. Returns a queued delivery receipt immediately; never waits for the reply or cancels the recipient. Use the parent session ID to report progress, blockers and final results. Preserve literal text; do not add setup or pretend to be the user.","inputSchema":{"type":"object","properties":{"sessionId":{"type":"string"},"message":{"type":"string"},"attachments":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"mimeType":{"type":"string"},"data":{"type":"string"}},"required":["name","mimeType","data"],"additionalProperties":false}}},"required":["sessionId","message"],"additionalProperties":false}}),
        json!({"name":"list_agents","description":"List the existing ordinary Harbor chats in this project and their session IDs, models and current states. Use this to find an agent; do not poll while waiting for work.","inputSchema":{"type":"object","properties":{},"additionalProperties":false}}),
        json!({"name":"ask_user","description":"Ask the human a question in YOUR chat and wait for the actual tool response. Never ask the parent to relay it.","inputSchema":{"type":"object","properties":{"question":{"type":"string"},"options":{"type":"array","items":{"type":"string"},"maxItems":20}},"required":["question"],"additionalProperties":false}}),
    ];
    if orchestrator {
        tools.push(json!({"name":"create_agent","description":"Create an ordinary Harbor chat for a bounded assignment. It inherits your provider and model by default. Returns its Harbor session ID immediately; do not wait for its work. Give only the actual assignment, relevant context and acceptance criteria; setup is installed separately.","inputSchema":{"type":"object","properties":{"title":{"type":"string"},"assignment":{"type":"string"},"model":{"type":"object","additionalProperties":true},"attachments":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"mimeType":{"type":"string"},"data":{"type":"string"}},"required":["name","mimeType","data"],"additionalProperties":false}}},"required":["title","assignment"],"additionalProperties":false}}));
        tools.push(json!({"name":"stop_agent","description":"Request cancellation of a Harbor child chat's current turn. Its conversation remains available.","inputSchema":{"type":"object","properties":{"sessionId":{"type":"string"}},"required":["sessionId"],"additionalProperties":false}}));
    }
    for tool in &mut tools {
        if matches!(tool["name"].as_str(), Some("create_agent" | "send_message")) {
            tool["inputSchema"]["properties"]["attachments"] = json!({"type":"array","maxItems":10,"description":"Forward original received images/files by reference; no base64 transcription needed.","items":{"oneOf":[{"type":"object","properties":{"reference":{"type":"string","description":"A harbor-attachment reference received in this chat, or latest to forward its most recently received attachments."}},"required":["reference"],"additionalProperties":false},{"type":"object","properties":{"name":{"type":"string"},"mimeType":{"type":"string"},"data":{"type":"string"}},"required":["name","mimeType","data"],"additionalProperties":false}]}});
            let description = tool["description"].as_str().unwrap().to_owned();
            tool["description"]=json!(format!("{description} Forward relevant original images using attachments:[{{\"reference\":\"latest\"}}] or an exact harbor-attachment reference from this chat. Do not replace an image with a description."));
        }
    }
    json!(tools)
}
fn bridge(method: &str, args: &Value) -> Result<Value, String> {
    use std::net::TcpStream;
    let endpoint = std::env::var("HARBOR_AGENT_ENDPOINT")
        .map_err(|_| "Harbor agent connection is unavailable")?;
    let address: std::net::SocketAddr = endpoint
        .parse()
        .map_err(|_| "Invalid Harbor agent endpoint")?;
    if !address.ip().is_loopback() {
        return Err("Harbor agent endpoint must be local".into());
    }
    let token =
        std::env::var("HARBOR_AGENT_TOKEN").map_err(|_| "Missing Harbor agent credentials")?;
    let mut stream = TcpStream::connect_timeout(&address, std::time::Duration::from_secs(5))
        .map_err(|e| e.to_string())?;
    stream
        .set_read_timeout(Some(std::time::Duration::from_secs(15)))
        .map_err(|e| e.to_string())?;
    stream
        .set_write_timeout(Some(std::time::Duration::from_secs(10)))
        .map_err(|e| e.to_string())?;
    writeln!(stream,"{}",json!({"token":token,"requestId":uuid::Uuid::new_v4().to_string(),"method":method,"arguments":args})).map_err(|e|e.to_string())?;
    let mut line = String::new();
    std::io::BufReader::new(stream)
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    let response: Value = serde_json::from_str(&line).map_err(|e| e.to_string())?;
    if let Some(error) = response["error"].as_str() {
        Err(error.into())
    } else {
        Ok(response["result"].clone())
    }
}
fn form(args: &Value) -> Result<Value, String> {
    let question = args["question"]
        .as_str()
        .filter(|s| !s.trim().is_empty() && s.len() <= 16_384)
        .ok_or("Provide a nonempty question of at most 16 KiB")?;
    let mut answer = json!({"type":"string","title":question});
    if let Some(options) = args.get("options") {
        let options = options
            .as_array()
            .filter(|a| {
                !a.is_empty()
                    && a.len() <= 20
                    && a.iter().all(|s| {
                        s.as_str()
                            .is_some_and(|s| !s.trim().is_empty() && s.len() <= 1024)
                    })
            })
            .ok_or("Provide 1–20 nonempty options")?;
        answer["enum"] = json!(options);
    }
    Ok(
        json!({"mode":"form","message":question,"requestedSchema":{"type":"object","properties":{"answer":answer},"required":["answer"]}}),
    )
}
fn result(id: Value, value: Value) -> Value {
    json!({"jsonrpc":"2.0","id":id,"result":value})
}
fn tool_result(id: Value, value: Value, error: bool) -> Value {
    result(
        id,
        json!({"content":[{"type":"text","text":value.to_string()}],"isError":error}),
    )
}
fn send(out: &mut impl Write, value: Value) -> std::io::Result<()> {
    writeln!(out, "{value}")?;
    out.flush()
}
fn serve(input: impl BufRead, mut out: impl Write) -> std::io::Result<()> {
    let mut pending = HashMap::<String, Value>::new();
    for line in input.lines() {
        let line = line?;
        if line.len() > 16 * 1024 * 1024 {
            break;
        }
        let Ok(msg) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if msg.get("method").is_none() {
            if let Some(id) = msg["id"].as_str().and_then(|id| pending.remove(id)) {
                let failed = msg.get("error").is_some();
                send(
                    &mut out,
                    tool_result(
                        id,
                        msg.get("result")
                            .or(msg.get("error"))
                            .cloned()
                            .unwrap_or(Value::Null),
                        failed,
                    ),
                )?;
            }
            continue;
        }
        let Some(id) = msg.get("id").cloned() else {
            continue;
        };
        match msg["method"].as_str().unwrap_or("") {
            "initialize" => send(
                &mut out,
                result(
                    id,
                    json!({"protocolVersion":msg["params"]["protocolVersion"],"capabilities":{"tools":{}},"serverInfo":{"name":"harbor_project","version":"2.0.0"},"instructions":"All agents are ordinary Harbor chats. Use Harbor tools exclusively for project delegation and messaging. Dispatch then end your turn; real messages resume idle recipients. Send only actual content, not setup or fabricated user prompts. User questions belong in your own chat. Never use native subagents or record_parent_message."}),
                ),
            )?,
            "ping" => send(&mut out, result(id, json!({})))?,
            "tools/list" => send(&mut out, result(id, json!({"tools":tools()})))?,
            "tools/call" => {
                let args = &msg["params"]["arguments"];
                match msg["params"]["name"].as_str().unwrap_or("") {
                    name @ ("create_agent" | "send_message" | "list_agents" | "stop_agent") => {
                        let allowed = tools()
                            .as_array()
                            .unwrap()
                            .iter()
                            .any(|tool| tool["name"] == name);
                        let response = if allowed {
                            bridge(name, args)
                        } else {
                            Err("This role is not allowed to call that tool".into())
                        };
                        let (body, error) = match response {
                            Ok(body) => (body, false),
                            Err(error) => (json!({"error":error}), true),
                        };
                        send(&mut out, tool_result(id, body, error))?;
                    }
                    "ask_user" => match form(args) {
                        Ok(params) => {
                            let question_id = format!("harbor-question-{}", uuid::Uuid::new_v4());
                            pending.insert(question_id.clone(), id);
                            send(
                                &mut out,
                                json!({"jsonrpc":"2.0","id":question_id,"method":"elicitation/create","params":params}),
                            )?;
                        }
                        Err(error) => {
                            send(&mut out, tool_result(id, json!({"error":error}), true))?
                        }
                    },
                    _ => send(
                        &mut out,
                        tool_result(id, json!({"error":"Unknown project tool"}), true),
                    )?,
                }
            }
            _ => send(
                &mut out,
                json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Method not found"}}),
            )?,
        }
    }
    Ok(())
}
pub fn maybe_run() -> bool {
    if !std::env::args().any(|a| a == "--harbor-project-tools") {
        return false;
    }
    let _ = serve(std::io::stdin().lock(), std::io::stdout().lock());
    true
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn child_catalog_cannot_create_or_stop_agents_and_has_its_own_question_tool() {
        let names = |role| {
            tools_for_role(role)
                .as_array()
                .unwrap()
                .iter()
                .map(|v| v["name"].as_str().unwrap().to_owned())
                .collect::<Vec<_>>()
        };
        assert_eq!(
            names(false),
            vec!["send_message", "list_agents", "ask_user"]
        );
        let root = names(true);
        assert!(root.contains(&"create_agent".into()));
        assert!(root.contains(&"stop_agent".into()));
        assert!(!root.contains(&"record_parent_message".into()));
    }
    #[test]
    fn messaging_and_creation_accept_existing_image_references() {
        for role in [false, true] {
            for tool in tools_for_role(role).as_array().unwrap() {
                if matches!(tool["name"].as_str(), Some("create_agent" | "send_message")) {
                    assert!(tool["inputSchema"]["properties"]["attachments"]
                        .to_string()
                        .contains("reference"));
                }
            }
        }
    }
    #[test]
    fn validates_questions_without_changing_their_text() {
        assert!(form(&json!({"question":""})).is_err());
        assert!(form(&json!({"question":"Color?","options":[""]})).is_err());
        assert_eq!(
            form(&json!({"question":"Color?","options":["Blue","Green"]})).unwrap()
                ["requestedSchema"]["properties"]["answer"]["enum"],
            json!(["Blue", "Green"])
        );
    }
    #[test]
    fn question_waits_for_elicitation_instead_of_returning_a_prompt() {
        let input=json!({"id":9,"method":"tools/call","params":{"name":"ask_user","arguments":{"question":"Color?","options":["Blue","Green"]}}}).to_string();
        let mut out = Vec::new();
        serve(input.as_bytes(), &mut out).unwrap();
        let message: Value = serde_json::from_slice(&out).unwrap();
        assert_eq!(message["method"], "elicitation/create");
        assert_ne!(message["id"], 9);
        assert!(message.get("result").is_none());
        assert_eq!(
            message["params"]["requestedSchema"]["properties"]["answer"]["enum"],
            json!(["Blue", "Green"])
        );
    }
}
