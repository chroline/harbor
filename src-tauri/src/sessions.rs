//! ACP session identity must survive reconnects without creating replacement chats.
use crate::types::{AgentCapabilities, SessionRecord};
use serde_json::{json, Value};
pub fn request(
    session: &SessionRecord,
    caps: &AgentCapabilities,
    load: bool,
) -> Result<(&'static str, Value), String> {
    if !load {
        return Ok(("session/new", json!({"cwd":session.cwd,"mcpServers":[]})));
    }
    let id = session
        .acp_session_id
        .as_ref()
        .filter(|id| !id.is_empty())
        .ok_or("No saved ACP session ID")?;
    let method = if caps.load_session {
        "session/load"
    } else if caps.resume_session {
        "session/resume"
    } else {
        return Err(
            "This provider cannot reopen saved sessions. The transcript is preserved.".into(),
        );
    };
    Ok((
        method,
        json!({"sessionId":id,"cwd":session.cwd,"mcpServers":[]}),
    ))
}
pub fn identity(response: &Value, saved: Option<&str>, load: bool) -> Result<String, String> {
    let returned = response
        .get("sessionId")
        .map(|value| {
            value
                .as_str()
                .filter(|id| !id.is_empty())
                .ok_or_else(|| "Agent returned an invalid conversation identity".to_string())
        })
        .transpose()?;
    if load {
        let saved = saved
            .filter(|id| !id.is_empty())
            .ok_or("No saved ACP session ID")?;
        if returned.is_some_and(|id| id != saved) {
            return Err("Agent returned a different conversation; reconnect was refused.".into());
        }
        Ok(saved.into())
    } else {
        returned
            .map(str::to_owned)
            .ok_or("Agent returned no session ID".into())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn resume_never_replaces_identity() {
        assert_eq!(identity(&json!({}), Some("saved"), true).unwrap(), "saved");
        assert_eq!(
            identity(&json!({"sessionId":"saved"}), Some("saved"), true).unwrap(),
            "saved"
        );
        assert!(identity(&json!({"sessionId":"other"}), Some("saved"), true).is_err());
        assert!(identity(&json!({}), None, false).is_err());
        assert!(identity(&json!({}), None, true).is_err());
        for value in [json!(null), json!(42), json!("")] {
            assert!(identity(&json!({"sessionId":value}), Some("saved"), true).is_err());
        }
    }
    #[test]
    fn new_load_and_resume_use_advertised_methods_without_replacement() {
        let mut session: SessionRecord = serde_json::from_value(json!({
            "id":"chat","title":"Saved","providerId":"claude","cwd":"/tmp",
            "status":"disconnected","mode":"gui","createdAt":0,"updatedAt":0,
            "configOptions":[],"models":null,"modes":null,"capabilities":AgentCapabilities::default(),
            "draft":"Keep","scrollTop":0,"reviewOpen":false,"archived":false,"acpSessionId":"saved"
        })).unwrap();
        let mut caps = AgentCapabilities::default();
        assert_eq!(request(&session, &caps, false).unwrap().0, "session/new");
        assert!(request(&session, &caps, true).is_err());
        caps.resume_session = true;
        let (method, params) = request(&session, &caps, true).unwrap();
        assert_eq!(method, "session/resume");
        assert_eq!(params["sessionId"], "saved");
        caps.load_session = true;
        assert_eq!(request(&session, &caps, true).unwrap().0, "session/load");
        session.acp_session_id = Some(String::new());
        assert!(request(&session, &caps, true).is_err());
    }
}
