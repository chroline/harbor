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
    pub fn answered_request_ids(&self, session: &str) -> Result<Vec<String>, String> {
        let connection = self.0.lock().map_err(|e| e.to_string())?;
        let mut query = connection.prepare("SELECT payload FROM events WHERE session_id=?1 AND kind='answered'").map_err(|e| e.to_string())?;
        let rows = query.query_map([session], |r| r.get::<_, String>(0)).map_err(|e| e.to_string())?;
        let mut ids = Vec::new();
        for row in rows {
            let payload: Value = serde_json::from_str(&row.map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            if let Some(id) = payload["id"].as_str() { ids.push(id.to_owned()); }
        }
        Ok(ids)
    }
    pub fn open(path: &Path) -> Result<Self, String> {
        let mut c = Connection::open(path).map_err(|e| e.to_string())?;
        let version: u32 = c
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if version > 3 {
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
        if version < 3 { migrate_providers(&mut c)?; }
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
    pub fn delete(&self, kind: &str, id: &str) -> Result<(), String> {
        self.0.lock().map_err(|e| e.to_string())?
            .execute("DELETE FROM records WHERE kind=?1 AND id=?2", params![kind, id])
            .map_err(|e| e.to_string())?;
        Ok(())
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
    pub fn subagents(&self, session: &str) -> Result<Vec<SubagentRecord>, String> {
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let prefix = format!("{session}:");
        let mut query = c.prepare("SELECT data FROM records WHERE kind='subagent' AND substr(id,1,length(?1))=?1").map_err(|e|e.to_string())?;
        let rows = query.query_map([prefix], |row|row.get::<_,String>(0)).map_err(|e|e.to_string())?;
        rows.map(|row|serde_json::from_str(&row.map_err(|e|e.to_string())?).map_err(|e|e.to_string())).collect()
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
    /// Read the newest complete turns first. Small setup/worker events from the
    /// prefix preserve routing; bulk prose and tool output stay off the first read.
    pub fn recent_events(&self, session: &str) -> Result<RecentEvents, String> {
        let c = self.0.lock().map_err(|e| e.to_string())?;
        let start: i64 = c.query_row(
            "WITH dialogue AS (
                SELECT sequence,kind,
                    CASE WHEN kind='user_message' OR json_extract(payload,'$.update.sessionUpdate')='user_message_chunk' THEN 1 ELSE 0 END AS is_user,
                    COALESCE(json_extract(payload,'$.sessionId'),'native') AS stream
                FROM events WHERE session_id=?1 AND (kind='user_message' OR (kind='session/update' AND
                    CASE WHEN instr(payload,'message_chunk')>0 OR instr(payload,'thought_chunk')>0 OR instr(payload,'tool_call')>0
                    THEN json_extract(payload,'$.update.sessionUpdate') IN ('user_message_chunk','agent_message_chunk','agent_thought_chunk','tool_call','tool_call_update') ELSE 0 END))
            ), boundaries AS (
                SELECT sequence,kind,is_user,LAG(is_user) OVER (PARTITION BY stream ORDER BY sequence) AS previous_user FROM dialogue
            ) SELECT CASE WHEN COUNT(*) < 3 THEN 0 ELSE MIN(sequence) END FROM (
                SELECT sequence FROM boundaries WHERE is_user=1 AND (kind='user_message' OR COALESCE(previous_user,0)=0) ORDER BY sequence DESC LIMIT 3
            )",
            [session], |r| r.get(0),
        ).map_err(|e| e.to_string())?;
        let has_earlier = start > 0 && c.query_row(
            "SELECT EXISTS(SELECT 1 FROM events WHERE session_id=?1 AND sequence<?2)",
            params![session, start], |r| r.get::<_, bool>(0),
        ).map_err(|e| e.to_string())?;
        let mut query = c.prepare(
            "SELECT sequence,kind,payload,timestamp FROM events WHERE session_id=?1 AND (
                sequence>=?2 OR kind IN ('initialized','connected','disconnected','history_reset','child_connected','child_disconnected','child_status','child_history_reset','request','answered')
                OR (kind='session/update' AND CASE WHEN instr(payload,'subagent_update')>0 OR instr(payload,'available_commands_update')>0 THEN json_extract(payload,'$.update.sessionUpdate') IN ('subagent_update','available_commands_update') ELSE 0 END)
            ) ORDER BY sequence"
        ).map_err(|e| e.to_string())?;
        let events = query.query_map(params![session, start], |r| {
            Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, f64>(3)?))
        }).map_err(|e| e.to_string())?.map(|row| {
            let (sequence, kind, payload, timestamp) = row.map_err(|e| e.to_string())?;
            Ok(SessionEvent { sequence: sequence as f64, session_id: session.into(), kind,
                payload: serde_json::from_str(&payload).map_err(|e| e.to_string())?, timestamp })
        }).collect::<Result<Vec<_>, String>>()?;
        Ok(RecentEvents { events, has_earlier })
    }
    pub fn has_user_message(&self, session: &str) -> Result<bool, String> {
        self.0.lock().map_err(|e| e.to_string())?
            .query_row("SELECT EXISTS(SELECT 1 FROM events WHERE session_id=?1 AND kind='user_message')", [session], |r| r.get(0))
            .map_err(|e| e.to_string())
    }
    /// A generated title may only replace its original fallback. Provider titles
    /// win even when their text happens to match that fallback.
    pub fn set_session_title(
        &self,
        id: &str,
        title: &str,
        expected: Option<&str>,
    ) -> Result<Option<SessionRecord>, String> {
        let mut c = self.0.lock().map_err(|e| e.to_string())?;
        let tx = c.transaction().map_err(|e| e.to_string())?;
        let data: String = tx.query_row(
            "SELECT data FROM records WHERE kind='session' AND id=?1", [id], |r| r.get(0),
        ).map_err(|e| e.to_string())?;
        let mut session: SessionRecord = serde_json::from_str(&data).map_err(|e| e.to_string())?;
        let supplied: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM records WHERE kind='provider-title' AND id=?1)", [id], |r| r.get(0),
        ).map_err(|e| e.to_string())?;
        if session.archived || expected.is_some_and(|old| session.title != old || supplied) {
            return Ok(None);
        }
        if expected.is_none() {
            write_record(&tx, "provider-title", id, &true)?;
        }
        session.title = title.into();
        // Naming a chat is not new activity; retain its sort order and UI state.
        write_record(&tx, "session", id, &session)?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(Some(session))
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
/// Remove obsolete chat data only. No filesystem operation belongs in this migration.
fn migrate_providers(c: &mut Connection) -> Result<(), String> {
    use std::collections::HashSet;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, Value)> = {
        let mut query = tx.prepare("SELECT kind,id,data FROM records").map_err(|e| e.to_string())?;
        let raw = query.query_map([], |r| Ok((r.get::<_, String>(0)?,r.get::<_, String>(1)?,r.get::<_, String>(2)?)))
            .map_err(|e| e.to_string())?;
        raw.map(|row| {
            let (kind,id,data) = row.map_err(|e| e.to_string())?;
            let value = serde_json::from_str(&data).map_err(|e| format!("Cannot migrate {kind}/{id}: {e}"))?;
            Ok((kind,id,value))
        }).collect::<Result<_,String>>()?
    };
    let sessions: HashSet<_> = rows.iter().filter(|(kind,_,data)| kind == "session"
        && data["providerId"].as_str().is_some_and(|id| require_provider(id).is_ok()))
        .map(|(_,id,_)| id.as_str()).collect();
    for (kind,id,data) in &rows {
        let remove = match kind.as_str() {
            "provider" => require_provider(id).is_err(),
            "session" | "provider-title" => !sessions.contains(id.as_str()),
            "subagent" => !sessions.iter().any(|session| id.starts_with(&format!("{session}:"))),
            "shell-tab" => !data["session_id"].as_str().is_some_and(|id| sessions.contains(id)),
            "preference" => id.rsplit_once(':').is_none_or(|(_,provider)| require_provider(provider).is_err()),
            "prime_session" | "pi_worker_source" | "pi_worker_history" => true,
            _ => false,
        };
        if remove {
            tx.execute("DELETE FROM records WHERE kind=?1 AND id=?2",params![kind,id]).map_err(|e| e.to_string())?;
        } else if kind == "provider" {
            if !data.is_object() {
                return Err(format!("Cannot migrate provider/{id}: expected an object"));
            }
            let mut saved = data.clone();
            let definition = providers().into_iter().find(|p| p.id == *id).unwrap();
            saved["id"] = Value::String(id.clone());
            saved["name"] = Value::String(definition.name);
            saved["installHint"] = Value::String(definition.install_hint);
            saved["color"] = Value::String(definition.color);
            write_record(&tx,kind,id,&saved)?;
        }
    }
    tx.execute("DELETE FROM events WHERE session_id NOT IN (SELECT id FROM records WHERE kind='session')",[]).map_err(|e| e.to_string())?;
    tx.pragma_update(None,"user_version",3).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
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
    fn recent_events_returns_complete_newest_turns_with_worker_context() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Database::open(&tmp.path().join("recent.sqlite")).unwrap();
        let worker = db.event("chat", "session/update", json!({"sessionId":"root", "update":{"sessionUpdate":"subagent_update","sessionId":"worker","title":"Worker"}})).unwrap();
        db.event("other", "user_message", json!({"text":"Other chat"})).unwrap();
        for i in 0..6 {
            db.event("chat", "user_message", json!({"text":format!("Prompt {i}")})).unwrap();
            for chunk in 0..4 {
                db.event("chat", "session/update", json!({"sessionId":"root", "update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":format!("Reply {i} chunk {chunk}")}}})).unwrap();
            }
            db.event("chat", "turn_complete", json!({})).unwrap();
        }
        let recent = db.recent_events("chat").unwrap();
        assert!(recent.has_earlier);
        assert_eq!(recent.events[0].sequence, worker.sequence);
        assert_eq!(recent.events.iter().filter(|e| e.kind == "user_message").map(|e| e.payload["text"].as_str().unwrap()).collect::<Vec<_>>(), vec!["Prompt 3","Prompt 4","Prompt 5"]);
        assert_eq!(recent.events.iter().filter(|e| e.kind == "session/update").count(), 13);
        assert!(recent.events.iter().all(|e| e.session_id == "chat"));
        let short = db.recent_events("other").unwrap();
        assert!(!short.has_earlier);
        assert_eq!(short.events.len(), 1);
        let empty = db.recent_events("empty").unwrap();
        assert!(!empty.has_earlier);
        assert!(empty.events.is_empty());
    }
    #[test]
    fn recent_events_groups_imported_prompt_chunks_into_complete_turns() {
        let tmp = tempfile::tempdir().unwrap();
        let db = Database::open(&tmp.path().join("chunks.sqlite")).unwrap();
        for i in 0..6 {
            for part in ["a","b"] {
                db.event("chat", "session/update", json!({"sessionId":"root", "update":{"sessionUpdate":"user_message_chunk","content":{"type":"text","text":format!("Prompt {i} {part}")}}})).unwrap();
            }
            db.event("chat", "session/update", json!({"sessionId":"root", "update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Reply"}}})).unwrap();
        }
        let recent = db.recent_events("chat").unwrap();
        assert!(recent.has_earlier);
        assert_eq!(recent.events.len(),9);
        assert_eq!(recent.events[0].payload["update"]["content"]["text"], "Prompt 3 a");
    }
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
        let chat = json!({"id":"s","providerId":"codex","projectId":"p1","cwd":"/missing/tree","worktreeId":"tree","acpSessionId":"native"});
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

#[cfg(test)]
mod provider_migration_tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn supported_chat_survives_missing_provider_definition() {
        let dir=tempfile::tempdir().unwrap();
        let path=dir.path().join("harbor.sqlite");
        let db=Database::open(&path).unwrap();
        db.put("session","saved",&json!({"providerId":"codex","draft":"Keep","archived":true})).unwrap();
        db.event("saved","user_message",json!({"text":"Keep"})).unwrap();
        db.0.lock().unwrap().pragma_update(None,"user_version",2).unwrap();
        drop(db);
        let db=Database::open(&path).unwrap();
        assert_eq!(db.get::<Value>("session","saved").unwrap()["draft"],"Keep");
        assert_eq!(db.events("saved",0.,100).unwrap().len(),1);
    }
    #[test]
    fn removes_obsolete_and_orphaned_chat_data_but_preserves_work() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("harbor.sqlite");
        let db = Database::open(&path).unwrap();
        let work = dir.path().join("working-file.txt");
        std::fs::write(&work,"keep working files").unwrap();
        for provider in ["codex","claude","grok","cursor","pi","prime","opencode","custom-test","missing-provider"] {
            let chat = format!("chat-{provider}");
            db.put("session",&chat,&json!({"id":chat,"providerId":provider,"archived":true,"cwd":dir.path(),"draft":"saved"})).unwrap();
            db.put("subagent",&format!("{chat}:child"),&json!({"parentId":"native"})).unwrap();
            db.put("provider-title",&chat,&true).unwrap();
            db.put("shell-tab",&format!("shell-{provider}"),&json!({"session_id":chat})).unwrap();
            db.put("preference",&format!("provider:{provider}"),&json!({"model":"saved"})).unwrap();
            db.put("preference",&format!("workspace:{provider}"),&json!({"model":"saved"})).unwrap();
            db.event(&chat,"user_message",json!({"text":"saved"})).unwrap();
            if provider != "missing-provider" {
                db.put("provider",provider,&json!({"id":provider,"command":"custom-path","args":["--flag"],"nativeCommand":"native-path"})).unwrap();
            }
        }
        for kind in ["prime_session","pi_worker_source","pi_worker_history"] { db.put(kind,"orphan",&json!({})).unwrap(); }
        for (kind,id,data) in [("provider-title","orphan",json!(true)),("subagent","orphan:child",json!({})),("shell-tab","orphan",json!({"session_id":"orphan"}))] { db.put(kind,id,&data).unwrap(); }
        db.event("orphan","user_message",json!({})).unwrap();
        for kind in ["workspace","project","worktree","archive"] { db.put(kind,"keep",&json!({"id":"keep","path":dir.path()})).unwrap(); }
        db.0.lock().unwrap().pragma_update(None,"user_version",2).unwrap();
        drop(db);
        for _ in 0..2 {
            let db = Database::open(&path).unwrap();
            assert_eq!(db.list::<Value>("session").unwrap().len(),3);
            for kind in ["provider","subagent","provider-title","shell-tab"] { assert_eq!(db.list::<Value>(kind).unwrap().len(),3,"{kind}"); }
            assert_eq!(db.list::<Value>("preference").unwrap().len(),6);
            for kind in ["prime_session","pi_worker_source","pi_worker_history"] { assert!(db.list::<Value>(kind).unwrap().is_empty()); }
            for provider in ["codex","claude","grok"] {
                let chat = format!("chat-{provider}");
                assert_eq!(db.get::<Value>("session",&chat).unwrap()["draft"],"saved");
                assert_eq!(db.events(&chat,0.,5000).unwrap().len(),1);
                let saved = db.get::<Value>("provider",provider).unwrap();
                assert_eq!(saved["command"],"custom-path");
                assert_eq!(saved["args"],json!(["--flag"]));
                assert_eq!(saved["nativeCommand"],"native-path");
            }
            assert!(db.events("orphan",0.,5000).unwrap().is_empty());
            assert!(db.events("chat-cursor",0.,5000).unwrap().is_empty());
            for kind in ["workspace","project","worktree","archive"] { assert_eq!(db.get::<Value>(kind,"keep").unwrap()["id"],"keep"); }
            assert_eq!(std::fs::read_to_string(&work).unwrap(),"keep working files");
        }
    }
    #[test]
    fn provider_migration_failure_rolls_back_deletions_and_version() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("db.sqlite");
        let db = Database::open(&path).unwrap();
        db.put("provider","cursor",&json!({"id":"cursor"})).unwrap();
        db.put("session","obsolete",&json!({"id":"obsolete","providerId":"cursor"})).unwrap();
        db.event("obsolete","user_message",json!({})).unwrap();
        db.0.lock().unwrap().execute_batch("PRAGMA user_version=2; CREATE TRIGGER prevent_event_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'fixture failure'); END;").unwrap();
        drop(db);
        assert!(Database::open(&path).is_err());
        let c = Connection::open(&path).unwrap();
        assert_eq!(read_values(&c,"provider").unwrap().len(),1);
        assert_eq!(read_values(&c,"session").unwrap().len(),1);
        assert_eq!(c.query_row("PRAGMA user_version",[],|r|r.get::<_,u32>(0)).unwrap(),2);
    }
}

#[cfg(test)]
mod async_question_tests {
    use super::*;
    #[test]
    fn answered_question_ids_survive_reopen_and_stay_scoped_to_the_chat() {
        let dir=tempfile::tempdir().unwrap(); let path=dir.path().join("questions.sqlite");
        let db=Database::open(&path).unwrap();
        db.event("chat","answered",serde_json::json!({"id":"harbor:codex-question:thread:call","result":{"action":"decline"}})).unwrap();
        db.event("other","answered",serde_json::json!({"id":"unrelated"})).unwrap();
        db.event("chat","answered",serde_json::json!({"id":0})).unwrap();
        drop(db);
        assert_eq!(Database::open(&path).unwrap().answered_request_ids("chat").unwrap(),vec!["harbor:codex-question:thread:call"]);
    }
}
