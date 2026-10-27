use crate::{acp::Sink, db::Database, terminal::NativeTerminal, AppState};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedShell {
    pub id: String,
    pub session_id: String,
    pub cwd: String,
}

pub fn list(db: &Database, session: &str) -> Result<Vec<SavedShell>, String> {
    Ok(db
        .list::<SavedShell>("shell-tab")?
        .into_iter()
        .filter(|tab| tab.session_id == session)
        .collect())
}

pub fn save(db: &Database, id: &str, session: &str, cwd: &str) -> Result<(), String> {
    db.put(
        "shell-tab",
        id,
        &SavedShell {
            id: id.into(),
            session_id: session.into(),
            cwd: cwd.into(),
        },
    )
}

// Called while holding the terminal registry lock, as are tab creation and
// deletion. A late status response must never recreate a closed tab.
pub fn remember_cwd(db: &Database, id: &str, status: &serde_json::Value) -> Result<(), String> {
    let Ok(mut tab) = db.get::<SavedShell>("shell-tab", id) else {
        return Ok(());
    };
    if let Some(cwd) = status["cwd"].as_str().filter(|cwd| *cwd != tab.cwd) {
        tab.cwd = cwd.into();
        db.put("shell-tab", id, &tab)?;
    }
    Ok(())
}

pub fn remove_session(db: &Database, session: &str) -> Result<(), String> {
    for tab in list(db, session)? {
        db.delete("shell-tab", &tab.id)?;
    }
    Ok(())
}

pub fn start(state: &Arc<AppState>, id: &str, cwd: &str) -> Result<Arc<NativeTerminal>, String> {
    let sid = id.to_owned();
    let weak = Arc::downgrade(state);
    let sink: Sink = Arc::new(move |kind, payload| {
        if kind == "terminal/data" {
            if let Some(state) = weak.upgrade() {
                state.emit(&sid, kind, payload);
            }
        }
    });
    NativeTerminal::start_shell(cwd, sink)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn tabs_and_directories_survive_database_reopening_and_closed_tabs_stay_closed() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("tabs.sqlite");
        let db = Database::open(&path).unwrap();
        save(&db, "shell:a:1", "a", "/first").unwrap();
        save(&db, "shell:a:2", "a", "/second").unwrap();
        save(&db, "shell:b:1", "b", "/other").unwrap();
        remember_cwd(&db, "shell:a:1", &json!({"cwd":"/changed"})).unwrap();
        db.delete("shell-tab", "shell:a:2").unwrap();
        remember_cwd(&db, "shell:a:2", &json!({"cwd":"/late"})).unwrap();
        drop(db);
        let db = Database::open(&path).unwrap();
        let a = list(&db, "a").unwrap();
        assert_eq!(a.len(), 1);
        assert_eq!(a[0].id, "shell:a:1");
        assert_eq!(a[0].cwd, "/changed");
        assert_eq!(list(&db, "b").unwrap().len(), 1);
        remove_session(&db, "a").unwrap();
        assert!(list(&db, "a").unwrap().is_empty());
        assert_eq!(list(&db, "b").unwrap().len(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn a_restored_shell_starts_in_its_last_working_directory() {
        let temp = tempfile::tempdir().unwrap();
        let folder = temp.path().join("changed");
        std::fs::create_dir(&folder).unwrap();
        let folder = folder
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .into_owned();
        let path = temp.path().join("tabs.sqlite");
        let db = Database::open(&path).unwrap();
        let sink: Sink = Arc::new(|_, _| {});
        let terminal = NativeTerminal::start(
            "/bin/sh",
            &["-i".into()],
            temp.path().to_str().unwrap(),
            sink.clone(),
        )
        .unwrap();
        save(&db, "shell:a:1", "a", temp.path().to_str().unwrap()).unwrap();
        terminal
            .write(&format!("cd '{}'\n", folder.replace('\'', "'\\''")))
            .unwrap();
        let until = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while terminal.status()["cwd"] != folder {
            assert!(
                std::time::Instant::now() < until,
                "shell did not change directory"
            );
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        remember_cwd(&db, "shell:a:1", &terminal.status()).unwrap();
        terminal.stop();
        drop(db);
        let db = Database::open(&path).unwrap();
        let saved = list(&db, "a").unwrap().remove(0);
        let restored = NativeTerminal::start("/bin/sh", &["-i".into()], &saved.cwd, sink).unwrap();
        assert_eq!(restored.status()["cwd"], folder);
        restored.stop();
    }
}
