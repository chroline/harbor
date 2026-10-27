//! Compatibility for Grok 1.0.30's omitted mode catalogue and native plan approval.
//! Wire schema: xai-org/grok-build, grok_build/exit_plan_mode/types.rs.
#[cfg(test)]
use serde_json::json;
use serde_json::Value;
use std::path::{Path, PathBuf};

pub fn supported_version(version: &str) -> bool {
    version.trim() == "grok 1.0.30 (04b7ffed98c6) [stable]"
}
#[cfg(test)]
pub fn permission(request: &Value, fallback: Option<String>) -> Value {
    serde_json::to_value(GrokPlan.permission(request, fallback).unwrap()).unwrap()
}
#[cfg(test)]
pub fn response(result: &Value) -> Result<Value, String> {
    let decision: PermissionResponse =
        serde_json::from_value(result.clone()).map_err(|e| e.to_string())?;
    serde_json::to_value(GrokPlan.response(&decision)?).map_err(|e| e.to_string())
}
/// Only this connected session's plan.md is allowed outside the workspace.
/// Canonical equality prevents symlink escapes; never create provider history directories.
pub fn plan_path(home: &Path, cwd: &Path, sid: &str) -> Option<PathBuf> {
    if sid.is_empty() || !sid.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        return None;
    }
    let encoded: String = cwd
        .to_str()?
        .bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect();
    Some(
        home.join(".grok/sessions")
            .join(encoded)
            .join(sid)
            .join("plan.md"),
    )
}
pub fn checked_plan_path(expected: &Path, requested: &Path, write: bool) -> Option<PathBuf> {
    if requested != expected {
        return None;
    }
    let parent = expected.parent()?;
    if parent.canonicalize().ok()? != parent {
        return None;
    }
    if expected.exists() {
        (expected.canonicalize().ok()? == expected).then(|| expected.to_path_buf())
    } else if write {
        Some(expected.to_path_buf())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn typed_verdicts_and_original_request_identity() {
        let request = json!({"id":17,"method":"_x.ai/exit_plan_mode","params":{"sessionId":"saved","toolCallId":"tool","planContent":"Plan text"}});
        let ui = permission(&request, None);
        assert_eq!(ui["id"], 17);
        assert_eq!(ui["params"]["sessionId"], "saved");
        assert_eq!(
            ui["params"]["toolCall"]["content"][0]["content"]["text"],
            "Plan text"
        );
        for verdict in ["approved", "cancelled", "abandoned"] {
            assert_eq!(
                response(&json!({"outcome":{"outcome":"selected","optionId":verdict}})).unwrap(),
                json!({"outcome":verdict})
            );
        }
        assert!(response(&json!({"outcome":{"outcome":"selected","optionId":"yes"}})).is_err());
        assert_eq!(
            response(&json!({"outcome":{"outcome":"cancelled"}})).unwrap(),
            json!({"outcome":"cancelled"})
        );
        assert!(!supported_version("grok 1.0.31"));
    }
    #[test]
    fn session_plan_access_is_exact_and_cannot_escape_through_symlinks() {
        let root = tempfile::tempdir().unwrap();
        let home = root.path().canonicalize().unwrap();
        let expected = plan_path(&home, Path::new("/test/repo"), "saved-1").unwrap();
        std::fs::create_dir_all(expected.parent().unwrap()).unwrap();
        assert_eq!(
            checked_plan_path(&expected, &expected, true),
            Some(expected.clone())
        );
        assert!(
            checked_plan_path(&expected, &expected.with_file_name("history.json"), true).is_none()
        );
        assert!(plan_path(&home, Path::new("/test"), "../other").is_none());
        #[cfg(unix)]
        {
            let outside = home.join("outside");
            std::fs::write(&outside, "keep").unwrap();
            std::os::unix::fs::symlink(&outside, &expected).unwrap();
            assert!(checked_plan_path(&expected, &expected, true).is_none());
            assert!(checked_plan_path(&expected, &expected, false).is_none());
        }
    }
}

use super::super::contract::*;
use serde::Deserialize;
#[derive(Debug)]
pub struct GrokPlan;
#[derive(Deserialize)]
struct NativeRequest {
    id: RequestId,
    method: String,
    params: NativeParams,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeParams {
    session_id: String,
    tool_call_id: Option<String>,
    plan_content: Option<String>,
}
impl PlanProtocol for GrokPlan {
    fn enabled(&self, version: Option<&str>, args: &[String]) -> bool {
        !args.iter().any(|a| a == "--no-plan") && version.is_some_and(supported_version)
    }
    fn method(&self) -> &'static str {
        "_x.ai/exit_plan_mode"
    }
    fn modes(&self, current: Option<&str>) -> ModeCatalog {
        ModeCatalog {
            current_mode_id: current.map(str::to_owned),
            available_modes: vec![
                Mode {
                    id: "default".into(),
                    name: "Default".into(),
                    description: "Implement changes with the current permission policy".into(),
                },
                Mode {
                    id: "plan".into(),
                    name: "Plan".into(),
                    description: "Prepare a plan before implementation".into(),
                },
            ],
        }
    }
    fn permission(
        &self,
        request: &Value,
        fallback: Option<String>,
    ) -> Result<PlanPermission, String> {
        let request: NativeRequest = serde_json::from_value(request.clone())
            .map_err(|e| format!("Invalid Grok plan request: {e}"))?;
        if request.method != self.method() || request.params.session_id.is_empty() {
            return Err("Invalid Grok plan request identity".into());
        }
        let text = request.params.plan_content.or(fallback).unwrap_or_else(|| {
            "No plan text was supplied. Keep planning to request a written plan.".into()
        });
        Ok(PlanPermission {
            jsonrpc: JsonRpcVersion::V2,
            id: request.id,
            method: PermissionMethod::RequestPermission,
            params: PlanPermissionParams {
                session_id: request.params.session_id,
                tool_call: PlanToolCall::SwitchMode {
                    tool_call_id: request.params.tool_call_id,
                    title: "Approve Grok plan".into(),
                    content: vec![PlanContent::Content {
                        content: TextContent::Text { text },
                    }],
                },
                options: vec![
                    PermissionOption {
                        option_id: "approved".into(),
                        name: "Approve and implement".into(),
                        kind: PermissionKind::AllowOnce,
                    },
                    PermissionOption {
                        option_id: "cancelled".into(),
                        name: "Keep planning".into(),
                        kind: PermissionKind::RejectOnce,
                    },
                    PermissionOption {
                        option_id: "abandoned".into(),
                        name: "Leave Plan without executing".into(),
                        kind: PermissionKind::RejectOnce,
                    },
                ],
            },
        })
    }
    fn response(&self, decision: &PermissionResponse) -> Result<NativePlanResponse, String> {
        let outcome = match &decision.outcome {
            PermissionOutcome::Cancelled => NativePlanOutcome::Cancelled,
            PermissionOutcome::Selected { option_id } => match option_id.as_str() {
                "approved" => NativePlanOutcome::Approved,
                "cancelled" => NativePlanOutcome::Cancelled,
                "abandoned" => NativePlanOutcome::Abandoned,
                _ => return Err("Invalid Grok plan approval".into()),
            },
        };
        Ok(NativePlanResponse { outcome })
    }
    fn plan_path(
        &self,
        home: &Path,
        cwd: &Path,
        session: &str,
        requested: Option<&Path>,
        write: bool,
    ) -> Option<PathBuf> {
        let expected = plan_path(home, cwd, session)?;
        checked_plan_path(&expected, requested.unwrap_or(&expected), write)
    }
}
