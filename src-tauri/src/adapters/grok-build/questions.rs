//! Grok's native AskUserQuestion contract, bridged to the shared ACP form UI.
//! Source: xai-org/grok-build, grok_build/ask_user_question/{mod,types}.rs.
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::HashSet;

pub const METHOD: &str = "_x.ai/ask_user_question";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    session_id: String,
    tool_call_id: String,
    questions: Vec<Question>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Question {
    question: String,
    options: Vec<OptionChoice>,
    #[serde(default, alias = "multi_select")]
    multi_select: Option<bool>,
}
#[derive(Deserialize)]
struct OptionChoice {
    label: String,
    #[serde(default)]
    description: String,
    preview: Option<String>,
}
fn parse(request: &Value) -> Result<Request, String> {
    let parsed: Request =
        serde_json::from_value(request["params"].clone()).map_err(|e| e.to_string())?;
    let mut seen = HashSet::new();
    if parsed.questions.is_empty()
        || parsed
            .questions
            .iter()
            .any(|q| q.question.trim().is_empty() || !seen.insert(&q.question))
    {
        return Err("Question text must be nonempty and unique".into());
    }
    Ok(parsed)
}

pub fn elicitation(request: &Value) -> Result<Value, String> {
    let parsed = parse(request)?;
    let mut properties = Map::new();
    for (index, question) in parsed.questions.iter().enumerate() {
        let id = format!("question_{index}");
        let options: Vec<Value> = question
            .options
            .iter()
            .map(|o| {
                json!({
                    "const":o.label,"title":o.label,"description":o.description,
                    "_meta":{"_harbor/questionOption":{"preview":o.preview}}
                })
            })
            .collect();
        let field = if options.is_empty() {
            json!({"type":"string","title":question.question})
        } else if question.multi_select == Some(true) {
            json!({"type":"array","title":question.question,"items":{"anyOf":options}})
        } else {
            json!({"type":"string","title":question.question,"oneOf":options})
        };
        properties.insert(id.clone(), field);
        if !question.options.is_empty() {
            properties.insert(
                format!("{id}_custom"),
                json!({"type":"string","title":"Other","_meta":{
                    "_askUserQuestionCustomAnswer":{"questionId":id,"isCustomAnswer":true}
                }}),
            );
        }
    }
    let mut ui = request.clone();
    ui["method"] = json!("elicitation/create");
    ui["params"] = json!({
        "mode":"form","sessionId":parsed.session_id,"toolCallId":parsed.tool_call_id,
        "message":if parsed.questions.len()==1 {parsed.questions[0].question.as_str()} else {"Please answer the following questions."},
        "requestedSchema":{"type":"object","properties":properties},
        "_meta":{"_harborQuestionOrder":(0..parsed.questions.len()).map(|i|format!("question_{i}")).collect::<Vec<_>>()}
    });
    Ok(ui)
}

pub fn response(request: &Value, result: &Value) -> Result<Value, String> {
    match result["action"].as_str() {
        Some("cancel" | "decline") => return Ok(json!({"outcome":"cancelled"})),
        Some("accept") => {}
        _ => return Err("Invalid question response action".into()),
    }
    let parsed = parse(request)?;
    let content = result["content"]
        .as_object()
        .ok_or("Missing question answers")?;
    let mut answers = Map::new();
    let mut annotations = Map::new();
    for (index, question) in parsed.questions.iter().enumerate() {
        let id = format!("question_{index}");
        let mut selected = match content.get(&id) {
            None => vec![],
            Some(Value::String(value))
                if question.multi_select != Some(true) || question.options.is_empty() =>
            {
                if question.options.is_empty() {
                    if !value.trim().is_empty() {
                        answers.insert(question.question.clone(), json!(["Other"]));
                        annotations.insert(question.question.clone(), json!({"notes":value}));
                    }
                    continue;
                }
                vec![value.clone()]
            }
            Some(Value::Array(values)) if question.multi_select == Some(true) => values
                .iter()
                .map(|v| {
                    v.as_str()
                        .map(str::to_owned)
                        .ok_or("Invalid selected answer")
                })
                .collect::<Result<Vec<_>, _>>()?,
            _ => return Err("Invalid question answer type".into()),
        };
        let mut unique = HashSet::new();
        if selected.iter().any(|label| {
            !question.options.iter().any(|o| &o.label == label) || !unique.insert(label.clone())
        }) {
            return Err("Invalid selected question option".into());
        }
        let note = match content.get(&format!("{id}_custom")) {
            None => None,
            Some(Value::String(value)) => Some(value.trim()).filter(|s| !s.is_empty()),
            _ => return Err("Invalid custom question answer".into()),
        };
        let mut annotation = Map::new();
        if question.multi_select != Some(true) {
            if let Some(preview) = selected
                .first()
                .and_then(|label| question.options.iter().find(|o| &o.label == label))
                .and_then(|o| o.preview.as_ref())
            {
                annotation.insert("preview".into(), json!(preview));
            }
        }
        if let Some(note) = note {
            annotation.insert("notes".into(), json!(note));
            if selected.is_empty() {
                selected.push("Other".into());
            }
        }
        if !selected.is_empty() {
            answers.insert(question.question.clone(), json!(selected));
        }
        if !annotation.is_empty() {
            annotations.insert(question.question.clone(), Value::Object(annotation));
        }
    }
    let mut wire = json!({"outcome":"accepted","answers":answers});
    if !annotations.is_empty() {
        wire["annotations"] = Value::Object(annotations);
    }
    Ok(wire)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> Value {
        json!({"id":0,"method":METHOD,"params":{"sessionId":"saved","toolCallId":"question-tool","mode":"default","questions":[
            {"question":"Which color?","multiSelect":null,"options":[{"label":"Blue","description":"Calm","preview":"Blue preview"},{"label":"Red","description":"Bold"}]},
            {"question":"Which checks?","multiSelect":true,"options":[{"label":"Unit"},{"label":"Browser"}]}
        ]}})
    }
    #[test]
    fn normalized_questions_keep_identity_descriptions_and_companions() {
        let ui = elicitation(&request()).unwrap();
        assert_eq!(ui["id"], 0);
        assert_eq!(ui["method"], "elicitation/create");
        assert_eq!(ui["params"]["sessionId"], "saved");
        assert_eq!(ui["params"]["toolCallId"], "question-tool");
        let properties = &ui["params"]["requestedSchema"]["properties"];
        assert_eq!(properties["question_0"]["oneOf"][0]["description"], "Calm");
        assert_eq!(
            properties["question_0_custom"]["_meta"]["_askUserQuestionCustomAnswer"]["questionId"],
            "question_0"
        );
        assert_eq!(properties["question_1"]["type"], "array");
    }
    #[test]
    fn replies_use_question_text_labels_arrays_notes_and_selected_preview() {
        let result = response(&request(),&json!({"action":"accept","content":{"question_0":"Blue","question_0_custom":"Navy","question_1":["Unit","Browser"]}})).unwrap();
        assert_eq!(
            result,
            json!({"outcome":"accepted","answers":{"Which color?":["Blue"],"Which checks?":["Unit","Browser"]},"annotations":{"Which color?":{"notes":"Navy","preview":"Blue preview"}}})
        );
        assert_eq!(
            response(
                &request(),
                &json!({"action":"accept","content":{"question_0_custom":"Purple"}})
            )
            .unwrap(),
            json!({"outcome":"accepted","answers":{"Which color?":["Other"]},"annotations":{"Which color?":{"notes":"Purple"}}})
        );
        for action in ["decline", "cancel"] {
            assert_eq!(
                response(&request(), &json!({"action":action})).unwrap(),
                json!({"outcome":"cancelled"})
            );
        }
        for invalid in [
            json!({"question_0":"invented"}),
            json!({"question_1":"Unit"}),
            json!({"question_0_custom":false}),
        ] {
            assert!(response(&request(), &json!({"action":"accept","content":invalid})).is_err());
        }
    }
}
