use crate::{types::*, worktrees};
use std::path::Path;

pub const ICONS: &[&str] = &[
    "folder",
    "code",
    "terminal",
    "rocket",
    "globe",
    "book-open",
    "lightbulb",
    "flask-conical",
    "layers",
    "wrench",
    "star",
    "heart",
];
pub const COLORS: &[&str] = &[
    "gray", "blue", "green", "teal", "purple", "pink", "orange", "red",
];

pub fn canonical_folder(path: &str) -> Result<String, String> {
    let path = Path::new(path).canonicalize().map_err(|_| {
        "This workspace folder is unavailable. Choose another workspace.".to_string()
    })?;
    if !path.is_dir() {
        return Err("Choose a folder for the workspace".into());
    }
    path.to_str()
        .map(String::from)
        .ok_or_else(|| "Workspace paths must be valid UTF-8".into())
}
pub fn folder_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(path)
        .into()
}
pub fn git_root(path: &str) -> bool {
    // Ordinary folders do not need a Git executable or invoke Git.
    if !Path::new(path).join(".git").exists() {
        return false;
    }
    worktrees::root(path)
        .ok()
        .and_then(|root| canonical_folder(&root).ok())
        .as_deref()
        == Some(path)
}
pub fn git_directory(path: &str) -> bool {
    if !Path::new(path).is_dir() || !Path::new(path).ancestors().any(|p| p.join(".git").exists()) {
        return false;
    }
    worktrees::root(path).is_ok()
}
pub fn inspect(mut workspace: Workspace) -> Workspace {
    workspace.available = Path::new(&workspace.path).is_dir();
    workspace.is_git_root = workspace.available && git_root(&workspace.path);
    workspace
}

// Canonical folder identity also protects old sessions/worktrees whose saved
// paths used an alias (e.g. macOS /var versus /private/var).
pub fn same_folder(a: &str, b: &str) -> bool {
    a == b
        || canonical_folder(a)
            .ok()
            .zip(canonical_folder(b).ok())
            .is_some_and(|(a, b)| a == b)
}
