use crate::{types::*, AppState};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetachedTab {
    pub session_id: String,
    pub tab_id: String,
    pub draft: Option<String>,
    #[serde(default)]
    pub attachments: Vec<PromptAttachment>,
}
#[derive(Default)]
pub struct TabWindows(Mutex<HashMap<String, DetachedTab>>);
impl TabWindows {
    pub fn list(&self, session: &str) -> Vec<String> {
        self.0
            .lock()
            .unwrap()
            .values()
            .filter(|tab| tab.session_id == session)
            .map(|tab| tab.tab_id.clone())
            .collect()
    }
    pub fn take(&self, label: &str) -> Option<DetachedTab> {
        self.0.lock().unwrap().remove(label)
    }
    pub fn contains(&self, label: &str) -> bool {
        self.0.lock().unwrap().contains_key(label)
    }
    pub fn close_session(&self, app: &tauri::AppHandle, session: &str) {
        let labels: Vec<_> = self
            .0
            .lock()
            .unwrap()
            .iter()
            .filter(|(_, tab)| tab.session_id == session)
            .map(|(label, _)| label.clone())
            .collect();
        for label in labels {
            self.take(&label);
            if let Some(window) = app.get_webview_window(&label) {
                let _ = window.close();
            }
        }
    }
}

#[tauri::command]
pub async fn list_detached_tabs(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
) -> Result<Vec<String>, String> {
    Ok(state.tab_windows.list(&session_id))
}

#[tauri::command]
pub async fn get_detached_tab(
    state: tauri::State<'_, Arc<AppState>>,
    window: WebviewWindow,
) -> Result<DetachedTab, String> {
    state
        .tab_windows
        .0
        .lock()
        .unwrap()
        .get(window.label())
        .cloned()
        .ok_or("This tab window is no longer available".into())
}

#[tauri::command]
pub async fn detach_task_tab(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    tab_id: String,
    draft: Option<String>,
    attachments: Vec<PromptAttachment>,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let _guard = state.operations.session(&session_id).await;
    if state.quitting.load(std::sync::atomic::Ordering::SeqCst) {
        return Err("Harbor is quitting".into());
    }
    let session: SessionRecord = state.db.get("session", &session_id)?;
    if session.archived {
        return Err("This conversation is archived".into());
    }
    let title = if let Some(id) = tab_id.strip_prefix("shell:") {
        if !id.starts_with(&format!("shell:{session_id}:")) {
            return Err("Terminal belongs to another task".into());
        }
        state
            .terminals
            .lock()
            .await
            .get(id)
            .ok_or("Terminal is no longer available")?
            .status()["title"]
            .as_str()
            .unwrap_or("Terminal")
            .to_owned()
    } else if let Some(child) = tab_id.strip_prefix("worker:") {
        state
            .db
            .get::<SubagentRecord>("subagent", &format!("{session_id}:{child}"))?
            .title
    } else if tab_id == "parent" || (tab_id == "terminal" && session.mode == "terminal") {
        session.title.clone()
    } else {
        return Err("Unknown task tab".into());
    };
    let label = format!("tab-{}", uuid::Uuid::new_v4());
    {
        let mut entries = state.tab_windows.0.lock().unwrap();
        if let Some((label, _)) = entries
            .iter()
            .find(|(_, tab)| tab.session_id == session_id && tab.tab_id == tab_id)
        {
            if let Some(window) = state.app.get_webview_window(label) {
                let _ = window.set_focus();
            }
            return Ok(());
        }
        entries.insert(
            label.clone(),
            DetachedTab {
                session_id: session_id.clone(),
                tab_id,
                draft,
                attachments,
            },
        );
    }
    let mut builder = WebviewWindowBuilder::new(
        &state.app,
        &label,
        WebviewUrl::App(format!("index.html?detached={label}").into()),
    )
    .title(&title)
    .inner_size(1000.0, 720.0)
    .min_inner_size(480.0, 360.0)
    .decorations(true)
    .transparent(true)
    .disable_drag_drop_handler();
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true);
        if let Some(effects) = state
            .app
            .config()
            .app
            .windows
            .first()
            .and_then(|window| window.window_effects.clone())
        {
            builder = builder.effects(effects);
        }
    }
    if x.is_finite() && y.is_finite() {
        builder = builder.position(x - 120.0, y - 24.0);
    }
    let window = builder.build().map_err(|error| {
        state.tab_windows.take(&label);
        error.to_string()
    })?;
    #[cfg(target_os = "macos")]
    crate::window_chrome::install(&window);
    let _ = state.app.emit("task-tabs-changed", &session_id);
    Ok(())
}

#[tauri::command]
pub async fn focus_task_tab(
    state: tauri::State<'_, Arc<AppState>>,
    session_id: String,
    tab_id: String,
) -> Result<(), String> {
    let label = state
        .tab_windows
        .0
        .lock()
        .unwrap()
        .iter()
        .find(|(_, tab)| tab.session_id == session_id && tab.tab_id == tab_id)
        .map(|(label, _)| label.clone())
        .ok_or("The standalone window has closed")?;
    let window = state
        .app
        .get_webview_window(&label)
        .ok_or("The standalone window has closed")?;
    window.show().map_err(|e| e.to_string())?;
    window.unminimize().map_err(|e| e.to_string())?;
    window.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn destroyed(state: Arc<AppState>, label: &str) {
    let Some(tab) = state.tab_windows.take(label) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        if let Some(id) = tab.tab_id.strip_prefix("shell:") {
            let terminal = state.terminals.lock().await.remove(id);
            if let Some(terminal) = terminal {
                let _ = tokio::task::spawn_blocking(move || terminal.stop()).await;
            }
        }
        let _ = state.app.emit("task-tabs-changed", &tab.session_id);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detached_tabs_are_scoped_to_their_task_and_removed_once() {
        let windows = TabWindows::default();
        windows.0.lock().unwrap().insert(
            "tab-one".into(),
            DetachedTab {
                session_id: "one".into(),
                tab_id: "parent".into(),
                draft: Some("unsent".into()),
                attachments: vec![],
            },
        );
        assert_eq!(windows.list("one"), vec!["parent"]);
        assert!(windows.list("two").is_empty());
        assert_eq!(
            windows.take("tab-one").unwrap().draft.as_deref(),
            Some("unsent")
        );
        assert!(windows.take("tab-one").is_none());
        assert!(windows.list("one").is_empty());
    }
}
