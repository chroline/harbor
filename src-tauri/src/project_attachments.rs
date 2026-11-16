//! Forward already-delivered attachments without asking an agent to reproduce base64.
use crate::{db::Database, types::PromptAttachment};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
use std::{
    io::Read,
    path::{Component, Path},
};

pub fn resolve(
    db: &Database,
    data: &Path,
    session: &str,
    args: &Value,
) -> Result<Vec<PromptAttachment>, String> {
    let Some(items) = args.get("attachments") else {
        return Ok(vec![]);
    };
    let items = items
        .as_array()
        .filter(|a| a.len() <= 10)
        .ok_or("Attach up to 10 files per message")?;
    let mut files = Vec::new();
    for item in items {
        if let Some(reference) = item.get("reference") {
            let reference = reference
                .as_str()
                .ok_or("Attachment reference must be a string")?;
            let saved: Vec<Value> = {
                let c = db.0.lock().map_err(|e| e.to_string())?;
                if reference == "latest" {
                    let payload: String = c.query_row("SELECT payload FROM events WHERE session_id=?1 AND kind IN ('user_message','agent_message') AND json_array_length(payload,'$.attachments')>0 ORDER BY sequence DESC LIMIT 1", [session], |r|r.get(0)).map_err(|_|"This chat has no received attachments to forward")?;
                    serde_json::from_str::<Value>(&payload).map_err(|e| e.to_string())?
                        ["attachments"]
                        .as_array()
                        .cloned()
                        .ok_or("Invalid saved attachments")?
                } else {
                    let saved: String = c.query_row("SELECT a.value FROM events e, json_each(e.payload,'$.attachments') a WHERE e.session_id=?1 AND e.kind IN ('user_message','agent_message') AND (json_extract(a.value,'$.reference')=?2 OR json_extract(a.value,'$.previewSource')=?2) ORDER BY e.sequence DESC LIMIT 1", rusqlite::params![session,reference], |r|r.get(0)).map_err(|_|"Attachment reference was not received by this chat")?;
                    vec![serde_json::from_str(&saved).map_err(|e| e.to_string())?]
                }
            };
            for file in saved {
                files.push(read(data, &file)?);
            }
        } else {
            files.push(serde_json::from_value(item.clone()).map_err(|e| e.to_string())?);
        }
        crate::attachments::validate(&files)?;
    }
    Ok(files)
}
fn read(data: &Path, saved: &Value) -> Result<PromptAttachment, String> {
    let source = saved["reference"]
        .as_str()
        .or_else(|| saved["previewSource"].as_str())
        .ok_or("This older attachment has no reusable reference; attach it again")?;
    let relative = source
        .strip_prefix("harbor-attachment:")
        .ok_or("Invalid attachment reference")?;
    let components = Path::new(relative).components().collect::<Vec<_>>();
    if components.len() != 2
        || components
            .iter()
            .any(|v| !matches!(v, Component::Normal(_)))
    {
        return Err("Invalid attachment reference path".into());
    }
    let root = data
        .join("attachments")
        .canonicalize()
        .map_err(|e| e.to_string())?;
    let mut path = root.clone();
    for component in components {
        path.push(component.as_os_str());
        if std::fs::symlink_metadata(&path)
            .map_err(|e| e.to_string())?
            .file_type()
            .is_symlink()
        {
            return Err("Attachment references cannot follow symlinks".into());
        }
    }
    let path = path.canonicalize().map_err(|e| e.to_string())?;
    if !path.starts_with(root) {
        return Err("Attachment is outside Harbor storage".into());
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)
        .map_err(|e| e.to_string())?
        .take(20 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("Attachments must total 20 MB or less per message".into());
    }
    Ok(PromptAttachment {
        name: saved["name"]
            .as_str()
            .ok_or("Missing attachment name")?
            .into(),
        mime_type: saved["mimeType"]
            .as_str()
            .unwrap_or("application/octet-stream")
            .into(),
        data: STANDARD.encode(bytes),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[tokio::test]
    async fn forwards_original_image_pixels_to_another_chat_with_preview_and_provider_content() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("db.sqlite")).unwrap();
        let original = PromptAttachment {
            name: "Screenshot.png".into(),
            mime_type: "image/png".into(),
            data: STANDARD.encode(b"\x89PNG\r\n\x1a\noriginal pixels"),
        };
        let (_, metadata, _) = crate::attachments::prepare(
            dir.path(),
            "Fix this",
            &[original.clone()],
            &json!({"promptCapabilities":{"image":true}}),
        )
        .await
        .unwrap();
        db.event(
            "parent",
            "user_message",
            json!({"text":"Fix this","attachments":metadata}),
        )
        .unwrap();
        let files = resolve(
            &db,
            dir.path(),
            "parent",
            &json!({"attachments":[{"reference":"latest"}]}),
        )
        .unwrap();
        assert_eq!(files[0].data, original.data);
        assert_eq!(files[0].name, original.name);
        let (prompt, preview, _) = crate::attachments::prepare(
            dir.path(),
            "Assignment",
            &files,
            &json!({"promptCapabilities":{"image":true}}),
        )
        .await
        .unwrap();
        assert_eq!(prompt[1]["type"], "image");
        assert_eq!(prompt[1]["data"], original.data);
        assert!(preview[0]["previewSource"].is_string());
        db.event(
            "parent",
            "user_message",
            json!({"text":"Now forward that image"}),
        )
        .unwrap();
        assert_eq!(
            resolve(
                &db,
                dir.path(),
                "parent",
                &json!({"attachments":[{"reference":"latest"}]})
            )
            .unwrap()[0]
                .data,
            original.data
        );
        let mut legacy = metadata[0].clone();
        legacy.as_object_mut().unwrap().remove("reference");
        db.event("legacy", "user_message", json!({"attachments":[legacy]}))
            .unwrap();
        assert_eq!(
            resolve(
                &db,
                dir.path(),
                "legacy",
                &json!({"attachments":[{"reference":"latest"}]})
            )
            .unwrap()[0]
                .data,
            original.data
        );
        let linked = resolve(
            &db,
            dir.path(),
            "parent",
            &json!({"attachments":[{"reference":metadata[0]["reference"]}]}),
        )
        .unwrap();
        assert_eq!(linked[0].data, original.data);
        assert!(resolve(
            &db,
            dir.path(),
            "unrelated",
            &json!({"attachments":[{"reference":metadata[0]["reference"]}]})
        )
        .is_err());
        assert!(resolve(
            &db,
            dir.path(),
            "unrelated",
            &json!({"attachments":[{"reference":"latest"}]})
        )
        .is_err());
        db.event(
            "child",
            "agent_message",
            json!({"text":"Assignment","attachments":preview}),
        )
        .unwrap();
        assert_eq!(
            resolve(
                &db,
                dir.path(),
                "child",
                &json!({"attachments":[{"reference":"latest"}]})
            )
            .unwrap()[0]
                .data,
            original.data
        );
        let (fallback, _, _) =
            crate::attachments::prepare(dir.path(), "Assignment", &files, &json!({}))
                .await
                .unwrap();
        assert_eq!(fallback[1]["type"], "resource_link");
    }
    #[tokio::test]
    async fn rejects_traversal_and_symlink_references_even_when_recorded_and_supports_legacy_payloads(
    ) {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join("db.sqlite")).unwrap();
        std::fs::create_dir_all(dir.path().join("attachments/group")).unwrap();
        let malicious = json!({"name":"secret","mimeType":"text/plain","reference":"harbor-attachment:../secret"});
        db.event("caller", "user_message", json!({"attachments":[malicious]}))
            .unwrap();
        assert!(resolve(
            &db,
            dir.path(),
            "caller",
            &json!({"attachments":[{"reference":"latest"}]})
        )
        .is_err());
        #[cfg(unix)]
        {
            std::fs::write(dir.path().join("secret"), "secret").unwrap();
            std::os::unix::fs::symlink(
                dir.path().join("secret"),
                dir.path().join("attachments/group/link"),
            )
            .unwrap();
            db.event("caller","user_message",json!({"attachments":[{"name":"secret","mimeType":"text/plain","reference":"harbor-attachment:group/link"}]})).unwrap();
            assert!(resolve(
                &db,
                dir.path(),
                "caller",
                &json!({"attachments":[{"reference":"latest"}]})
            )
            .is_err());
        }
        assert_eq!(resolve(&db,dir.path(),"caller",&json!({"attachments":[{"name":"inline.txt","mimeType":"text/plain","data":"aGk="}]})).unwrap()[0].data,"aGk=");
    }
}
