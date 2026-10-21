use crate::types::PromptAttachment;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const MAX_BYTES: usize = 20 * 1024 * 1024;

/// Persist attachments before a turn; transcripts retain metadata rather than base64 payloads.
pub async fn prepare(
    data: &Path,
    text: &str,
    files: &[PromptAttachment],
    capabilities: &Value,
) -> Result<(Vec<Value>, Vec<Value>, Vec<PathBuf>), String> {
    let capabilities = capabilities
        .get("agentCapabilities")
        .unwrap_or(capabilities);
    if text.trim().is_empty() && files.is_empty() {
        return Err("Write a message or attach a file first".into());
    }
    if files.len() > 10 {
        return Err("Attach up to 10 files per message".into());
    }
    let mut total = 0;
    let mut decoded = Vec::new();
    for file in files {
        if file.data.len() > MAX_BYTES.div_ceil(3) * 4 {
            return Err("Attachments must total 20 MB or less per message".into());
        }
        let bytes = STANDARD
            .decode(&file.data)
            .map_err(|_| format!("Could not decode {}", file.name))?;
        total += bytes.len();
        if total > MAX_BYTES {
            return Err("Attachments must total 20 MB or less per message".into());
        }
        decoded.push(bytes);
    }
    let mut prompt = Vec::new();
    let mut metadata = Vec::new();
    let mut paths = Vec::new();
    if !text.trim().is_empty() {
        prompt.push(json!({"type":"text","text":text}));
    }
    let folder = data
        .join("attachments")
        .join(uuid::Uuid::new_v4().to_string());
    if !files.is_empty() {
        tokio::fs::create_dir_all(&folder)
            .await
            .map_err(|e| e.to_string())?;
    }
    for (index, (file, bytes)) in files.iter().zip(decoded).enumerate() {
        // No supplied path components are used as storage locations.
        let name = file
            .name
            .rsplit(['/', '\\'])
            .next()
            .filter(|s| !s.is_empty() && *s != "." && *s != "..")
            .unwrap_or("attachment");
        let path = folder.join(format!("{index}-{name}"));
        if let Err(error) = tokio::fs::write(&path, &bytes).await {
            let _ = tokio::fs::remove_dir_all(&folder).await;
            return Err(error.to_string());
        }
        let mime = if file.mime_type.is_empty() {
            "application/octet-stream"
        } else {
            &file.mime_type
        };
        let uri = tauri::Url::from_file_path(&path)
            .map_err(|_| "Invalid attachment path")?
            .to_string();
        paths.push(path.clone());
        metadata.push(json!({"name":name,"mimeType":mime,"size":bytes.len()}));
        if mime.starts_with("image/") && capabilities["promptCapabilities"]["image"] == true {
            prompt.push(json!({"type":"image","mimeType":mime,"data":file.data}));
        } else if capabilities["promptCapabilities"]["embeddedContext"] == true {
            let resource = match std::str::from_utf8(&bytes) {
                Ok(text) => json!({"uri":uri,"mimeType":mime,"text":text}),
                Err(_) => json!({"uri":uri,"mimeType":mime,"blob":file.data}),
            };
            prompt.push(json!({"type":"resource","resource":resource}));
        } else {
            // Resource links are baseline ACP content. Include the absolute local
            // path for adapters whose agent tools open files directly.
            prompt.push(json!({"type":"resource_link","uri":uri,"name":name,"mimeType":mime,"size":bytes.len()}));
            prompt.push(
                json!({"type":"text","text":format!("Attached file {name}: {}", path.display())}),
            );
        }
    }
    Ok((prompt, metadata, paths))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn stores_files_and_uses_baseline_links_without_image_capability() {
        let dir = tempfile::tempdir().unwrap();
        let file = PromptAttachment {
            name: "../notes #1.txt".into(),
            mime_type: "text/plain".into(),
            data: STANDARD.encode("hello"),
        };
        let (prompt, metadata, _) = prepare(dir.path(), "", &[file], &json!({})).await.unwrap();
        assert_eq!(prompt[0]["type"], "resource_link");
        let path = tauri::Url::parse(prompt[0]["uri"].as_str().unwrap())
            .unwrap()
            .to_file_path()
            .unwrap();
        assert!(path.starts_with(dir.path().join("attachments")));
        assert_eq!(tokio::fs::read_to_string(path).await.unwrap(), "hello");
        assert_eq!(metadata[0]["name"], "notes #1.txt");
        assert!(metadata[0].get("data").is_none());
    }

    #[tokio::test]
    async fn respects_image_and_embedded_context_capabilities() {
        let dir = tempfile::tempdir().unwrap();
        let image = PromptAttachment {
            name: "image.png".into(),
            mime_type: "image/png".into(),
            data: STANDARD.encode([137, 80, 78, 71]),
        };
        let text = PromptAttachment {
            name: "notes.txt".into(),
            mime_type: "text/plain".into(),
            data: STANDARD.encode("hello"),
        };
        let (prompt, _, _) = prepare(
            dir.path(),
            "Inspect",
            &[image, text],
            &json!({"promptCapabilities":{"image":true,"embeddedContext":true}}),
        )
        .await
        .unwrap();
        assert_eq!(prompt[0]["text"], "Inspect");
        assert_eq!(prompt[1]["type"], "image");
        assert_eq!(prompt[2]["resource"]["text"], "hello");
    }

    #[tokio::test]
    async fn rejects_empty_messages_and_invalid_payloads_before_writing() {
        let dir = tempfile::tempdir().unwrap();
        assert!(prepare(dir.path(), " ", &[], &json!({})).await.is_err());
        let file = PromptAttachment {
            name: "bad".into(),
            mime_type: "".into(),
            data: "!".into(),
        };
        assert!(prepare(dir.path(), "Inspect", &[file], &json!({}))
            .await
            .is_err());
        assert!(!dir.path().join("attachments").exists());
    }
}
