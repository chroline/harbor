use crate::types::*;
use rusqlite::{params, Connection};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use std::{path::Path, sync::Mutex};

pub struct Database(pub Mutex<Connection>);
impl Database {
    pub fn export(&self, session: &str, path: &Path) -> Result<(), String> {
        use std::io::Write;
        let mut file = std::io::BufWriter::new(
            std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(path)
                .map_err(|e| e.to_string())?,
        );
        let mut after = 0.;
        loop {
            let batch = self.events(session, after, 5000)?;
            if batch.is_empty() {
                break;
            }
            for event in &batch {
                serde_json::to_writer(&mut file, event).map_err(|e| e.to_string())?;
                file.write_all(b"\n").map_err(|e| e.to_string())?;
            }
            after = batch.last().unwrap().sequence;
        }
        file.flush().map_err(|e| e.to_string())?;
        file.get_ref().sync_all().map_err(|e| e.to_string())
    }
    pub fn open(path: &Path) -> Result<Self, String> {
        let mut c = Connection::open(path).map_err(|e| e.to_string())?;
        let version: u32 = c
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if version > 2 {
            return Err(
                "This database was created by a newer Harbor version. Update Harbor to open it."
                    .into(),
            );
        }
        c.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
   CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(kind,id));
   CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY AUTOINCREMENT,session_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,timestamp REAL NOT NULL);
   CREATE INDEX IF NOT EXISTS events_session ON events(session_id,sequence);").map_err(|e| e.to_string())?;
        if version < 2 {
            migrate_workspaces(&mut c)?;
        }
        Ok(Self(Mutex::new(c)))
    }
    pub fn save_project(
        &self,
        project_id: Option<&str>,
        name: &str,
        icon: &str,
        color: &str,
        path: &str,
    ) -> Result<Project, String> {
        use crate::workspaces::*;
        let name = name.trim();
        if name.is_empty() {
            return Err("Enter a project name".into());
        }
        if !ICONS.contains(&icon) || !COLORS.contains(&color) {
            return Err("Choose a supported project icon and color".into());
        }
        let path = canonical_folder(path)?;
        let mut c = self.0.lock().map_err(|e| e.to_string())?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        let project_id = if let Some(project_id) = project_id {
            tx.query_row(
                "SELECT id FROM records WHERE kind='project' AND id=?1",
                [project_id],
                |r| r.get::<_, String>(0),
            )
            .map_err(|_| "Project no longer exists".to_string())?
        } else {
            id()
        };
        let mut workspace = read_values(&tx, "workspace")?
            .into_iter()
            .map(serde_json::from_value::<Workspace>)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|w| w.path == path)
            .unwrap_or_else(|| Workspace {
                id: id(),
                name: folder_name(&path),
                path,
                last_used_at: 0.,
                available: false,
                is_git_root: false,
            });
        workspace.last_used_at = now();
        let project = Project {
            id: project_id,
            name: name.into(),
            workspace_id: workspace.id.clone(),
            icon: icon.into(),
            color: color.into(),
        };
        write_record(&tx, "workspace", &workspace.id, &workspace)?;
        write_record(&tx, "project", &project.id, &project)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(project)
    }
    pub fn save_workspace(&self, path: &str) -> Result<Workspace, String> {
        use crate::workspaces::*;
        let path = canonical_folder(path)?;
        let mut c = self.0.lock().map_err(|e| e.to_string())?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        let mut workspace = read_values(&tx, "workspace")?
            .into_iter()
            .map(serde_json::from_value::<Workspace>)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|w| same_folder(&w.path, &path))
            .unwrap_or_else(|| Workspace {
                id: id(), name: folder_name(&path), path,
                last_used_at: 0., available: false, is_git_root: false,
            });
        workspace.last_used_at = now();
        workspace = inspect(workspace);
        write_record(&tx, "workspace", &workspace.id, &workspace)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(workspace)
    }
    pub fn touch_workspace(&self, id: &str) -> Result<(), String> {
        let mut c = self.0.lock().map_err(|e| e.to_string())?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        let data: String = tx
            .query_row(
                "SELECT data FROM records WHERE kind='workspace' AND id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut w: Workspace = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        w.last_used_at = now();
        write_record(&tx, "workspace", id, &w)?;
        tx.commit().map_err(|e| e.to_string())
    }
    pub fn put<T: Serialize>(&self, kind: &str, id: &str, v: &T) -> Result<(), String> {
        let data = serde_json::to_string(v).map_err(|e| e.to_string())?;
        self.0.lock().map_err(|e|e.to_string())?.execute("INSERT INTO records VALUES(?1,?2,?3) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data",params![kind,id,data]).map_err(|e|e.to_string())?;
        Ok(())
    }
    pub fn get<T: DeserializeOwned>(&self, kind: &str, id: &str) -> Result<T, String> {
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let data: String = c
            .query_row(
                "SELECT data FROM records WHERE kind=?1 AND id=?2",
                params![kind, id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&data).map_err(|e| e.to_string())
    }
    pub fn list<T: DeserializeOwned>(&self, kind: &str) -> Result<Vec<T>, String> {
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let mut q = c
            .prepare("SELECT data FROM records WHERE kind=?1 ORDER BY rowid")
            .map_err(|e| e.to_string())?;
        let rows = q
            .query_map([kind], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.map(|r| {
            serde_json::from_str(&r.map_err(|e| e.to_string())?).map_err(|e| e.to_string())
        })
        .collect()
    }
    pub fn event(&self, session: &str, kind: &str, payload: Value) -> Result<SessionEvent, String> {
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let time = now();
        c.execute(
            "INSERT INTO events(session_id,kind,payload,timestamp) VALUES(?1,?2,?3,?4)",
            params![session, kind, payload.to_string(), time],
        )
        .map_err(|e| e.to_string())?;
        Ok(SessionEvent {
            sequence: c.last_insert_rowid() as f64,
            session_id: session.into(),
            kind: kind.into(),
            payload,
            timestamp: time,
        })
    }
    pub fn events(
        &self,
        session: &str,
        after: f64,
        limit: u32,
    ) -> Result<Vec<SessionEvent>, String> {
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let mut q=c.prepare("SELECT sequence,kind,payload,timestamp FROM events WHERE session_id=?1 AND sequence>?2 ORDER BY sequence LIMIT ?3").map_err(|e|e.to_string())?;
        let rows = q
            .query_map(params![session, after, limit.min(5000)], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, f64>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.map(|r| {
            let (seq, kind, p, time) = r.map_err(|e| e.to_string())?;
            Ok(SessionEvent {
                sequence: seq as f64,
                session_id: session.into(),
                kind,
                payload: serde_json::from_str(&p).map_err(|e| e.to_string())?,
                timestamp: time,
            })
        })
        .collect()
    }
    pub fn update_session(
        &self,
        id: &str,
        f: impl FnOnce(&mut SessionRecord),
    ) -> Result<SessionRecord, String> {
        let mut c = self.0.lock().map_err(|e| e.to_string())?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        let data: String = tx
            .query_row(
                "SELECT data FROM records WHERE kind='session' AND id=?1",
                [id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut s: SessionRecord = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        f(&mut s);
        s.updated_at = now();
        tx.execute(
            "UPDATE records SET data=?1 WHERE kind='session' AND id=?2",
            params![serde_json::to_string(&s).map_err(|e| e.to_string())?, id],
        )
        .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(s)
    }
}

fn read_values(c: &Connection, kind: &str) -> Result<Vec<Value>, String> {
    let mut q = c
        .prepare("SELECT data FROM records WHERE kind=?1 ORDER BY rowid")
        .map_err(|e| e.to_string())?;
    let rows = q
        .query_map([kind], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.map(|r| serde_json::from_str(&r.map_err(|e| e.to_string())?).map_err(|e| e.to_string()))
        .collect()
}
fn write_record(c: &Connection, kind: &str, id: &str, v: &impl Serialize) -> Result<(), String> {
    c.execute("INSERT INTO records VALUES(?1,?2,?3) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data", params![kind, id, serde_json::to_string(v).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
    Ok(())
}
fn migrate_workspaces(c: &mut Connection) -> Result<(), String> {
    use crate::workspaces::*;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let mut paths = std::collections::HashMap::new();
    let mut projects = std::collections::HashMap::new();
    for mut p in read_values(&tx, "project")? {
        let legacy_path = p["path"].as_str().ok_or("Legacy project has no folder")?;
        // Missing folders must not prevent loading the user's saved chats.
        let path = canonical_folder(legacy_path).unwrap_or_else(|_| legacy_path.into());
        let workspace_id = paths.entry(path.clone()).or_insert_with(id).clone();
        let w = Workspace {
            id: workspace_id.clone(),
            name: folder_name(&path),
            path,
            last_used_at: now(),
            available: false,
            is_git_root: false,
        };
        write_record(&tx, "workspace", &w.id, &w)?;
        let project_id = p["id"]
            .as_str()
            .ok_or("Legacy project has no ID")?
            .to_string();
        p.as_object_mut().unwrap().remove("path");
        p["workspaceId"] = serde_json::json!(workspace_id);
        p["icon"] = serde_json::json!("folder");
        p["color"] = serde_json::json!("gray");
        write_record(&tx, "project", &project_id, &p)?;
        projects.insert(project_id, w.id);
    }
    for mut s in read_values(&tx, "session")? {
        s["workspaceId"] = s["projectId"]
            .as_str()
            .and_then(|id| projects.get(id))
            .map(|id| serde_json::json!(id))
            .unwrap_or(Value::Null);
        s["isGit"] = serde_json::json!(git_directory(s["cwd"].as_str().unwrap_or("")));
        let session_id = s["id"].as_str().ok_or("Legacy chat has no ID")?.to_string();
        write_record(&tx, "session", &session_id, &s)?;
    }
    tx.pragma_update(None, "user_version", 2)
        .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod workspace_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn migration_preserves_associations_missing_folders_and_is_repeatable() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("legacy.sqlite");
        let c = Connection::open(&path).unwrap();
        c.execute_batch("CREATE TABLE records(kind TEXT,id TEXT,data TEXT,PRIMARY KEY(kind,id)); PRAGMA user_version=1;").unwrap();
        for id in ["p1", "p2"] {
            write_record(
                &c,
                "project",
                id,
                &json!({"id":id,"name":"Legacy","path":"/missing/repo"}),
            )
            .unwrap();
        }
        let chat = json!({"id":"s","projectId":"p1","cwd":"/missing/tree","worktreeId":"tree","acpSessionId":"native"});
        write_record(&c, "session", "s", &chat).unwrap();
        let tree = json!({"id":"tree","projectId":"p1","repo":"/missing/repo"});
        write_record(&c, "worktree", "tree", &tree).unwrap();
        write_record(&c, "archive", "a", &json!({"id":"a","worktree":tree})).unwrap();
        drop(c);
        let db = Database::open(&path).unwrap();
        let projects = db.list::<Project>("project").unwrap();
        assert_eq!(projects[0].id, "p1");
        assert_eq!(projects[0].name, "Legacy");
        assert_eq!(projects[0].icon, "folder");
        assert_eq!(projects[0].color, "gray");
        assert_eq!(projects[0].workspace_id, projects[1].workspace_id);
        assert_eq!(db.list::<Workspace>("workspace").unwrap().len(), 1);
        let saved: Value = db.get("session", "s").unwrap();
        for key in ["id", "projectId", "cwd", "worktreeId", "acpSessionId"] {
            assert_eq!(saved[key], chat[key]);
        }
        assert_eq!(saved["workspaceId"], projects[0].workspace_id);
        assert_eq!(db.get::<Value>("worktree", "tree").unwrap(), tree);
        assert_eq!(db.get::<Value>("archive", "a").unwrap()["worktree"], tree);
        drop(db);
        let reopened = Database::open(&path).unwrap();
        assert_eq!(reopened.list::<Workspace>("workspace").unwrap().len(), 1);
        assert_eq!(
            reopened.list::<Project>("project").unwrap()[0].workspace_id,
            projects[0].workspace_id
        );
    }
    #[test]
    fn workspaces_can_be_saved_without_projects_and_reuse_canonical_folders() {
        let temp = tempfile::tempdir().unwrap();
        let db = Database::open(&temp.path().join("db.sqlite")).unwrap();
        let one = db.save_workspace(temp.path().to_str().unwrap()).unwrap();
        let two = db.save_workspace(&format!("{}/.", temp.path().display())).unwrap();
        assert_eq!(one.id, two.id);
        assert!(one.available);
        assert!(!one.is_git_root);
        assert_eq!(db.list::<Workspace>("workspace").unwrap().len(), 1);
        assert!(db.list::<Project>("project").unwrap().is_empty());
        assert!(db.save_workspace("/missing/harbor-test").is_err());
    }
    #[test]
    fn failed_migration_rolls_back_project_updates_and_version() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("bad.sqlite");
        let c = Connection::open(&path).unwrap();
        c.execute_batch("CREATE TABLE records(kind TEXT,id TEXT,data TEXT,PRIMARY KEY(kind,id)); PRAGMA user_version=1;").unwrap();
        let original = json!({"id":"good","name":"Keep","path":"/missing"});
        write_record(&c, "project", "good", &original).unwrap();
        write_record(&c, "project", "bad", &json!({"id":"bad","name":"Broken"})).unwrap();
        drop(c);
        assert!(Database::open(&path).is_err());
        let c = Connection::open(&path).unwrap();
        assert_eq!(read_values(&c, "project").unwrap()[0], original);
        assert!(read_values(&c, "workspace").unwrap().is_empty());
        assert_eq!(
            c.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))
                .unwrap(),
            1
        );
    }
    #[test]
    fn save_deduplicates_folders_and_edits_without_moving_chats() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Database::open(&tmp.path().join("db.sqlite")).unwrap();
        let folder = tmp.path().to_str().unwrap();
        let one = db
            .save_project(None, "One", "rocket", "purple", folder)
            .unwrap();
        let two = db
            .save_project(None, "One", "code", "blue", &format!("{folder}/."))
            .unwrap();
        assert_ne!(one.id, two.id);
        assert_eq!(one.workspace_id, two.workspace_id);
        assert_eq!(db.list::<Workspace>("workspace").unwrap().len(), 1);
        let chat = json!({"id":"s","projectId":one.id,"workspaceId":one.workspace_id,"cwd":folder});
        db.put("session", "s", &chat).unwrap();
        let other = tmp.path().join("other");
        std::fs::create_dir(&other).unwrap();
        let edited = db
            .save_project(
                Some(&one.id),
                " Edited ",
                "heart",
                "pink",
                other.to_str().unwrap(),
            )
            .unwrap();
        assert_eq!(edited.id, one.id);
        assert_eq!(edited.name, "Edited");
        assert_eq!(edited.icon, "heart");
        assert_eq!(edited.color, "pink");
        assert_ne!(edited.workspace_id, one.workspace_id);
        assert_eq!(db.get::<Value>("session", "s").unwrap(), chat);
        assert!(db
            .save_project(None, " ", "folder", "gray", folder)
            .is_err());
        assert!(db
            .save_project(None, "Name", "invalid", "gray", folder)
            .is_err());
        assert!(db
            .save_project(None, "Name", "folder", "gray", "/missing")
            .is_err());
        assert!(db
            .save_project(Some("unknown"), "Name", "folder", "gray", folder)
            .is_err());
        assert_eq!(db.list::<Project>("project").unwrap().len(), 2);
    }
}
