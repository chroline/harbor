use crate::{acp, types::EditorChoice};
use std::path::Path;

pub fn discover(configured: Option<&str>) -> Result<Vec<EditorChoice>, String> {
    #[cfg(target_os = "macos")]
    let mut editors: Vec<EditorChoice> = {
        let output = std::process::Command::new("/usr/bin/osascript")
            .args(["-l", "JavaScript", "-e", include_str!("list-editors.js")])
            .output()
            .map_err(|e| format!("Could not detect text editors: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Could not detect text editors: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        serde_json::from_slice(&output.stdout)
            .map_err(|e| format!("Could not read installed text editors: {e}"))?
    };
    #[cfg(not(target_os = "macos"))]
    let mut editors: Vec<EditorChoice> = Vec::new();

    // Preserve a working legacy executable setting. Resolve symlinks so a CLI
    // inside an already discovered app keeps that app's display name.
    if let Some(configured) = configured.filter(|value| !value.is_empty()) {
        if !editors.iter().any(|editor| editor.value == configured) {
            if let Some(executable) = acp::resolve_executable(configured) {
                let executable = executable.canonicalize().unwrap_or(executable);
                if let Some(editor) = editors
                    .iter_mut()
                    .find(|editor| executable.starts_with(&editor.value))
                {
                    editor.value = configured.to_owned();
                } else {
                    editors.push(EditorChoice {
                        value: configured.to_owned(),
                        label: Path::new(configured)
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into_owned(),
                    });
                }
            }
        }
    }
    editors.sort_by_key(|editor| editor.label.to_lowercase());
    editors.dedup_by(|a, b| a.value == b.value);
    Ok(editors)
}

pub fn open(editor: &str, path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    if Path::new(editor)
        .extension()
        .is_some_and(|ext| ext == "app")
    {
        let output = std::process::Command::new("/usr/bin/open")
            .arg("-a")
            .arg(editor)
            .arg(path)
            .output()
            .map_err(|e| e.to_string())?;
        return if output.status.success() {
            Ok(())
        } else {
            Err(String::from_utf8_lossy(&output.stderr).trim().to_owned())
        };
    }
    let executable = match acp::resolve_executable(editor) {
        Some(executable) => executable,
        None => {
            if let Some(application) = discover(None)?
                .into_iter()
                .find(|application| application.label.eq_ignore_ascii_case(editor))
            {
                return open(&application.value, path);
            }
            return Err("Editor not found. Choose an installed editor in Settings.".into());
        }
    };
    std::process::Command::new(executable)
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;

    #[test]
    fn discovers_existing_applications_without_inventing_missing_editors() {
        let missing = "/nonexistent/harbor-test-editor";
        let editors = discover(Some(missing)).unwrap();
        assert!(!editors.is_empty(), "macOS should register its text editor");
        for editor in editors {
            assert_ne!(editor.value, missing);
            assert!(Path::new(&editor.value).is_dir());
            assert!(editor.value.ends_with(".app"));
            assert!(!editor.label.is_empty());
        }
    }

    #[test]
    fn preserves_an_available_custom_executable() {
        let executable = "/usr/bin/true";
        let editors = discover(Some(executable)).unwrap();
        assert_eq!(
            editors
                .iter()
                .filter(|editor| editor.value == executable)
                .count(),
            1
        );
    }
}
