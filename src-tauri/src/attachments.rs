use crate::types::PromptAttachment;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const MAX_BYTES: usize = 20 * 1024 * 1024;
/// Image types every supported model accepts and the preview reader displays.
const MODEL_IMAGE_TYPES: [&str; 4] = ["image/png", "image/jpeg", "image/gif", "image/webp"];
/// Longest edge for converted images, within every provider's per-image limits.
const CONVERTED_MAX_EDGE: &str = "2048";

/// Convert an image models cannot read, such as an iPhone HEIC photo, with macOS `sips`.
/// Photos become JPEG; other formats become PNG to keep transparency. `None` keeps the original.
async fn convert_image(source: &Path, mime: &str) -> Option<(PathBuf, &'static str)> {
    if !cfg!(target_os = "macos") || !mime.starts_with("image/") || MODEL_IMAGE_TYPES.contains(&mime) {
        return None;
    }
    let photo = matches!(mime, "image/heic" | "image/heif" | "image/heic-sequence" | "image/heif-sequence" | "image/avif");
    let (format, extension, converted) = if photo { ("jpeg", "jpg", "image/jpeg") } else { ("png", "png", "image/png") };
    let target = source.with_extension(format!("converted.{extension}"));
    let status = tokio::process::Command::new("/usr/bin/sips")
        .args(["-s", "format", format, "-Z", CONVERTED_MAX_EDGE])
        .arg(source)
        .arg("--out")
        .arg(&target)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .status()
        .await
        .ok()?;
    if status.success() && tokio::fs::metadata(&target).await.is_ok_and(|m| m.len() > 0) {
        Some((target, converted))
    } else {
        let _ = tokio::fs::remove_file(&target).await;
        None
    }
}

/// Validate before accepting a queued message, without writing any files.
pub fn validate(files: &[PromptAttachment]) -> Result<(), String> {
    if files.len() > 10 {return Err("Attach up to 10 files per message".into());}
    let mut total=0;
    for file in files {
        if file.data.len()>MAX_BYTES.div_ceil(3)*4 {return Err("Attachments must total 20 MB or less per message".into());}
        total+=STANDARD.decode(&file.data).map_err(|_| format!("Could not decode {}",file.name))?.len();
        if total>MAX_BYTES {return Err("Attachments must total 20 MB or less per message".into());}
    }
    Ok(())
}

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
        let original_mime = if file.mime_type.is_empty() {
            "application/octet-stream"
        } else {
            file.mime_type.as_str()
        };
        // The original stays on disk; the converted copy is what the model and preview see.
        let (path, mime, bytes, data) = match convert_image(&path, original_mime).await {
            Some((converted, mime)) => match tokio::fs::read(&converted).await {
                Ok(bytes) => {
                    let data = STANDARD.encode(&bytes);
                    (converted, mime, bytes, data)
                }
                Err(_) => (path, original_mime, bytes, file.data.clone()),
            },
            None => (path, original_mime, bytes, file.data.clone()),
        };
        let uri = tauri::Url::from_file_path(&path)
            .map_err(|_| "Invalid attachment path")?
            .to_string();
        paths.push(path.clone());
        let reference = format!("harbor-attachment:{}/{}", folder.file_name().unwrap().to_string_lossy(), path.file_name().unwrap().to_string_lossy());
        let mut saved = json!({"name":name,"mimeType":mime,"size":bytes.len(),"reference":reference});
        if mime.starts_with("image/") {
            saved["previewSource"] = json!(reference);
        }
        metadata.push(saved);
        if mime.starts_with("image/") && capabilities["promptCapabilities"]["image"] == true {
            prompt.push(json!({"type":"image","mimeType":mime,"data":data}));
        } else if capabilities["promptCapabilities"]["embeddedContext"] == true {
            let resource = match std::str::from_utf8(&bytes) {
                Ok(text) => json!({"uri":uri,"mimeType":mime,"text":text}),
                Err(_) => json!({"uri":uri,"mimeType":mime,"blob":data}),
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
        let (prompt, metadata, _) = prepare(
            dir.path(),
            "Inspect",
            &[image, text],
            &json!({"promptCapabilities":{"image":true,"embeddedContext":true}}),
        )
        .await
        .unwrap();
        assert_eq!(prompt[0]["text"], "Inspect");
        assert_eq!(prompt[1]["type"], "image");
        assert!(metadata[0]["previewSource"].as_str().unwrap().starts_with("harbor-attachment:"));
        assert!(metadata[0].get("data").is_none());
        assert_eq!(metadata[0]["reference"], metadata[0]["previewSource"]);
        assert!(metadata[1]["reference"].as_str().unwrap().starts_with("harbor-attachment:"));
        assert_eq!(prompt[2]["resource"]["text"], "hello");
    }

    #[cfg(target_os = "macos")]
    #[tokio::test]
    async fn converts_images_models_cannot_read_and_keeps_the_original() {
        let dir = tempfile::tempdir().unwrap();
        // Make a real HEIC with the same tool, from a 1x1 PNG.
        let png = dir.path().join("pixel.png");
        std::fs::write(&png, STANDARD.decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==").unwrap()).unwrap();
        let heic = dir.path().join("pixel.heic");
        let made = std::process::Command::new("/usr/bin/sips").args(["-s", "format", "heic"]).arg(&png).arg("--out").arg(&heic).output().unwrap();
        assert!(made.status.success());
        let photo = PromptAttachment { name: "IMG_0001.HEIC".into(), mime_type: "image/heic".into(), data: STANDARD.encode(std::fs::read(&heic).unwrap()) };
        let data = dir.path().join("data");
        let (prompt, metadata, paths) = prepare(&data, "What is this?", &[photo], &json!({"promptCapabilities":{"image":true}})).await.unwrap();
        assert_eq!(prompt[1]["type"], "image");
        assert_eq!(prompt[1]["mimeType"], "image/jpeg");
        let sent = STANDARD.decode(prompt[1]["data"].as_str().unwrap()).unwrap();
        assert!(sent.starts_with(b"\xff\xd8\xff"));
        assert_eq!(metadata[0]["mimeType"], "image/jpeg");
        assert_eq!(metadata[0]["name"], "IMG_0001.HEIC");
        assert!(metadata[0]["previewSource"].as_str().unwrap().ends_with(".converted.jpg"));
        // Agents and workers get the readable copy; the original stays beside it.
        assert_eq!(paths.len(), 1);
        assert!(paths[0].to_string_lossy().ends_with(".converted.jpg"));
        assert!(paths[0].with_extension("").with_extension("HEIC").exists());
    }

    #[tokio::test]
    async fn sends_supported_and_unconvertible_images_unchanged() {
        let dir = tempfile::tempdir().unwrap();
        let png = PromptAttachment { name: "shot.png".into(), mime_type: "image/png".into(), data: STANDARD.encode([137, 80, 78, 71]) };
        let broken = PromptAttachment { name: "broken.heic".into(), mime_type: "image/heic".into(), data: STANDARD.encode("not an image") };
        let (prompt, metadata, paths) = prepare(dir.path(), "", &[png.clone(), broken.clone()], &json!({"promptCapabilities":{"image":true}})).await.unwrap();
        assert_eq!(prompt[0]["data"], png.data);
        assert_eq!(prompt[1]["mimeType"], "image/heic");
        assert_eq!(prompt[1]["data"], broken.data);
        assert_eq!(metadata[1]["mimeType"], "image/heic");
        assert_eq!(paths.len(), 2);
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
