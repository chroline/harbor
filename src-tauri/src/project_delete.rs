//! Project teardown uses recorded ownership, never a repository-wide worktree sweep.
use crate::{db::Database, types::*, workspaces, worktrees, AppState};
use serde_json::{json, Value};
use std::{collections::HashSet, path::Path, sync::Arc};
use tauri::Emitter;

struct Inventory {
    sessions: Vec<SessionRecord>,
    trees: Vec<WorktreeRecord>,
    preserved: Vec<WorktreeRecord>,
}
fn inventory(db: &Database, id: &str) -> Result<Inventory, String> {
    let _: Project = db.get("project", id)?;
    let all: Vec<SessionRecord> = db.list("session")?;
    let sessions: Vec<_> = all
        .iter()
        .filter(|s| s.project_id.as_deref() == Some(id))
        .cloned()
        .collect();
    let workspaces: Vec<Workspace> = db.list("workspace")?;
    let mut trees = Vec::new();
    let mut preserved = Vec::new();
    for tree in db.list::<WorktreeRecord>("worktree")? {
        if tree.project_id.as_deref() != Some(id)
            && !sessions
                .iter()
                .any(|s| s.worktree_id.as_ref() == Some(&tree.id))
        {
            continue;
        }
        let shared = all.iter().any(|s| {
            s.project_id.as_deref() != Some(id)
                && (s.worktree_id.as_ref() == Some(&tree.id)
                    || workspaces::same_folder(&s.cwd, &tree.path))
        });
        let workspace = workspaces
            .iter()
            .any(|w| workspaces::same_folder(&w.path, &tree.path));
        if tree.owned && !shared && !workspace {
            trees.push(tree);
        } else {
            preserved.push(tree);
        }
    }
    Ok(Inventory {
        sessions,
        trees,
        preserved,
    })
}
#[tauri::command]
pub async fn project_deletion_summary(
    state: tauri::State<'_, Arc<AppState>>,
    project_id: String,
) -> Result<Value, String> {
    let i = inventory(&state.db, &project_id)?;
    let workers = i.sessions.iter().filter(|s|s.parent_session_id.is_some()).count() + i
        .sessions
        .iter()
        .map(|s| state.db.subagents(&s.id).map(|w| w.len()))
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .sum::<usize>();
    Ok(
        json!({"conversations":i.sessions.len(),"agents":workers,"worktrees":i.trees.iter().filter(|t| t.state != "archived").map(|t| &t.path).collect::<Vec<_>>(),"preservedWorktrees":i.preserved.iter().map(|t| &t.path).collect::<Vec<_>>()}),
    )
}
#[tauri::command]
pub async fn delete_project(
    state: tauri::State<'_, Arc<AppState>>,
    project_id: String,
) -> Result<(), String> {
    let _project = state.operations.project(&project_id).await;
    let project: Project = state.db.get("project", &project_id)?;
    let mut i = inventory(&state.db, &project_id)?;
    i.sessions.sort_by(|a, b| a.id.cmp(&b.id));
    let mut guards = Vec::new();
    for session in &i.sessions {
        guards.push(state.operations.session(&session.id).await);
    }
    // Refresh ownership after acquiring the conversation locks.
    i = inventory(&state.db, &project_id)?;
    let mut folders = HashSet::new();
    if let Ok(workspace) = state
        .db
        .get::<Workspace>("workspace", &project.workspace_id)
    {
        folders.insert(workspace.path);
    }
    folders.extend(i.sessions.iter().map(|s| s.cwd.clone()));
    // Validate all context paths before stopping anything. Missing folders are retryable.
    let mut contexts = Vec::new();
    for folder in folders {
        if !Path::new(&folder).exists() {
            continue;
        }
        let raw = Path::new(&folder)
            .join(".harbor/projects")
            .join(&project_id);
        match std::fs::symlink_metadata(&raw) {
            Ok(_) => contexts.push(crate::projects::directory(&folder, &project_id, false)?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    for session in &i.sessions {
        crate::archive_session_locked(state.inner(), &session.id, false).await?;
    }
    for tree in &i.trees {
        if tree.state == "archived" {
            continue;
        }
        let _workspace = state.operations.workspace(&tree.path).await;
        // Do not remove a checkout that gained another consumer during teardown.
        let current = inventory(&state.db, &project_id)?;
        if !current.trees.iter().any(|t| t.id == tree.id) {
            return Err(format!(
                "Worktree ownership changed for {}. Retry project deletion.",
                tree.path
            ));
        }
        if Path::new(&tree.path).exists() {
            let tree_copy = tree.clone();
            let destination = state.data.join("archives");
            let owner = i
                .sessions
                .iter()
                .find(|s| s.worktree_id.as_ref() == Some(&tree.id))
                .map(|s| s.id.clone())
                .unwrap_or_else(|| project_id.clone());
            let archive = tokio::task::spawn_blocking(move || {
                worktrees::archive(&tree_copy, &owner, &destination)
            })
            .await
            .map_err(|e| e.to_string())??;
            std::fs::write(
                Path::new(&archive.snapshot)
                    .parent()
                    .ok_or("Invalid archive path")?
                    .join("archive.json"),
                serde_json::to_vec_pretty(&archive).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            // Recovery data stays on disk even after the project history is deleted.
            let copy = archive.clone();
            tokio::task::spawn_blocking(move || worktrees::remove_verified(&copy))
                .await
                .map_err(|e| e.to_string())??;
        }
        let mut removed = tree.clone();
        removed.state = "archived".into();
        state.db.put("worktree", &removed.id, &removed)?;
    }
    for context in contexts {
        tokio::task::spawn_blocking(move || match std::fs::remove_dir_all(context) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.to_string()),
        })
        .await
        .map_err(|e| e.to_string())??;
    }
    for tree in &i.preserved {
        if tree.project_id.as_deref() == Some(&project_id) {
            let mut tree = tree.clone();
            tree.project_id = None;
            state.db.put("worktree", &tree.id, &tree)?;
        }
    }
    state.db.purge_project(
        &project_id,
        &i.sessions.iter().map(|s| s.id.clone()).collect::<Vec<_>>(),
        &i.trees.iter().map(|t| t.id.clone()).collect::<Vec<_>>(),
    )?;
    let _ = state
        .app
        .emit("project-changed", json!({"id":project_id,"deleted":true}));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn session(project: &Project, cwd: &str, id: &str, archived: bool) -> SessionRecord {
        serde_json::from_value(json!({"id":id,"projectId":project.id,"workspaceId":project.workspace_id,"providerId":"codex","cwd":cwd,"title":"Billing","status":"idle","mode":"gui","createdAt":0,"updatedAt":0,"configOptions":[],"modes":null,"models":null,"capabilities":AgentCapabilities::default(),"draft":"","scrollTop":0,"reviewOpen":false,"archived":archived})).unwrap()
    }
    #[test]
    fn teardown_includes_history_and_orphan_trees_but_preserves_shared_and_workspace_paths() {
        let temp = tempfile::tempdir().unwrap();
        let db = Database::open(&temp.path().join("db.sqlite")).unwrap();
        let cwd = temp.path().to_str().unwrap();
        let p = db
            .save_project(None, "Billing", "folder", "blue", cwd)
            .unwrap();
        let other = db
            .save_project(None, "Other", "folder", "blue", cwd)
            .unwrap();
        for s in [
            session(&p, cwd, "root", false),
            session(&p, cwd, "old", true),
            session(&other, "/shared", "unrelated", true),
        ] {
            db.put("session", &s.id, &s).unwrap();
        }
        for (id, path, owned) in [
            ("orphan", "/owned", true),
            ("shared", "/shared", true),
            ("workspace", cwd, true),
            ("external", "/external", false),
        ] {
            db.put(
                "worktree",
                id,
                &WorktreeRecord {
                    id: id.into(),
                    project_id: Some(p.id.clone()),
                    repo: cwd.into(),
                    path: path.into(),
                    branch: id.into(),
                    owned,
                    state: "active".into(),
                },
            )
            .unwrap();
        }
        let mut child=session(&p, cwd, "child", false); child.parent_session_id=Some("root".into());
        db.put("session", &child.id, &child).unwrap();
        let i = inventory(&db, &p.id).unwrap();
        assert_eq!(i.sessions.len(), 3);
        assert!(i.sessions.iter().any(|s|s.parent_session_id.as_deref()==Some("root")));
        assert_eq!(
            i.trees.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(),
            vec!["orphan"]
        );
        assert_eq!(i.preserved.len(), 3);
        db.event("root", "user_message", json!({"text":"delete me"}))
            .unwrap();
        db.event("unrelated", "user_message", json!({"text":"keep me"}))
            .unwrap();
        db.put("subagent", "root:child", &json!({"sentinel":true}))
            .unwrap();
        db.put("subagent", "unrelated:child", &json!({"sentinel":true}))
            .unwrap();
        db.put("project-start", "root", &json!({"status":"completed"}))
            .unwrap();
        db.purge_project(
            &p.id,
            &vec!["root".into(), "old".into()],
            &vec!["orphan".into()],
        )
        .unwrap();
        assert!(db.get::<Project>("project", &p.id).is_err());
        assert!(db.get::<SessionRecord>("session", "old").is_err());
        assert!(db.get::<Value>("subagent", "root:child").is_err());
        assert!(db.get::<Value>("project-start", "root").is_err());
        assert!(db.events("root", 0., 100).unwrap().is_empty());
        assert_eq!(db.events("unrelated", 0., 100).unwrap().len(), 1);
        assert!(db.get::<Value>("subagent", "unrelated:child").is_ok());
        assert!(db.get::<Project>("project", &other.id).is_ok());
        assert!(db.get::<WorktreeRecord>("worktree", "shared").is_ok());
        assert!(db.get::<Workspace>("workspace", &p.workspace_id).is_ok());
    }
}
