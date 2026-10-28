use base64::{engine::general_purpose::STANDARD, Engine};
use std::{
    io::Read,
    path::{Path, PathBuf},
};

const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

/// Resolve only inside the workspace or this provider session's image directory.
pub fn resolve(
    workspace: &Path,
    session_images: Option<&Path>,
    source: &str,
) -> Result<PathBuf, String> {
    let requested = Path::new(source);
    let workspace = workspace.canonicalize().map_err(|e| e.to_string())?;
    if let Ok(path) = workspace.join(requested).canonicalize() {
        if path.starts_with(&workspace) {
            return Ok(path);
        }
    }
    if let Some(images) = session_images {
        // Relative provider references are explicitly namespaced as images/.
        let relative = requested.strip_prefix("images").ok();
        let candidate = if requested.is_absolute() {
            requested.to_path_buf()
        } else {
            images.join(relative.ok_or("Image is outside this conversation")?)
        };
        let root = images.canonicalize().map_err(|e| e.to_string())?;
        // Do not follow a provider's images-directory symlink outside its session.
        if root != images {
            return Err("Image directory is outside this conversation".into());
        }
        let path = candidate.canonicalize().map_err(|e| e.to_string())?;
        if path.starts_with(root) {
            return Ok(path);
        }
    }
    Err("Image is missing or outside this conversation".into())
}

pub fn read(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut bytes = Vec::new();
    file.take(MAX_IMAGE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_IMAGE_BYTES {
        return Err("Image preview is limited to 10 MiB".into());
    }
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else {
        return Err("Unsupported image format".into());
    };
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn loads_workspace_and_session_images_without_path_escapes() {
        let temp = tempfile::tempdir().unwrap();
        let root = temp.path().canonicalize().unwrap();
        let workspace = root.join("workspace");
        let images = root.join("session/images");
        std::fs::create_dir_all(&workspace).unwrap();
        std::fs::create_dir_all(&images).unwrap();
        std::fs::write(workspace.join("local.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        std::fs::write(images.join("shot.png"), b"\x89PNG\r\n\x1a\n").unwrap();
        std::fs::write(root.join("secret.png"), b"secret").unwrap();
        assert_eq!(
            resolve(&workspace, Some(&images), "images/shot.png").unwrap(),
            images.join("shot.png")
        );
        assert!(read(&resolve(&workspace, None, "local.png").unwrap())
            .unwrap()
            .starts_with("data:image/png;base64,"));
        assert!(resolve(&workspace, Some(&images), "images/../../secret.png").is_err());
        assert!(resolve(&workspace, None, "../secret.png").is_err());
        assert!(read(&root.join("secret.png")).is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(root.join("secret.png"), images.join("escape.png")).unwrap();
            assert!(resolve(&workspace, Some(&images), "images/escape.png").is_err());
        }
    }
}
