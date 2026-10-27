use std::{
    collections::HashMap,
    sync::{Arc, Mutex as StdMutex, Weak},
};
use tokio::sync::{Mutex, OwnedMutexGuard};

#[derive(Default)]
pub struct Operations {
    locks: StdMutex<HashMap<(&'static str, String), Weak<Mutex<()>>>>,
}

impl Operations {
    // When both are needed, acquire the session before its workspace. Never
    // retain a registry lock while waiting on a chat, filesystem, or agent.
    pub async fn session(&self, id: &str) -> OwnedMutexGuard<()> {
        self.lock("session", id).await
    }

    pub async fn provider(&self, id: &str) -> OwnedMutexGuard<()> {
        self.lock("provider", id).await
    }

    pub async fn workspace(&self, path: &str) -> OwnedMutexGuard<()> {
        let key = crate::workspaces::canonical_folder(path).unwrap_or_else(|_| path.into());
        self.lock("workspace", &key).await
    }

    async fn lock(&self, kind: &'static str, id: &str) -> OwnedMutexGuard<()> {
        let lock = {
            let mut locks = self.locks.lock().unwrap();
            locks.retain(|_, lock| lock.strong_count() > 0);
            let slot = locks.entry((kind, id.into())).or_default();
            slot.upgrade().unwrap_or_else(|| {
                let lock = Arc::new(Mutex::new(()));
                *slot = Arc::downgrade(&lock);
                lock
            })
        };
        lock.lock_owned().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    use tokio::time::timeout;

    #[tokio::test]
    async fn aliases_share_the_workspace_lock() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().to_str().unwrap();
        let operations = Operations::default();
        let _held = operations.workspace(path).await;
        assert!(timeout(
            Duration::from_millis(20),
            operations.workspace(&format!("{path}/."))
        )
        .await
        .is_err());
        assert!(crate::workspaces::same_folder(path, &format!("{path}/.")));
    }
    #[tokio::test]
    async fn slow_worktree_does_not_block_other_chats_or_workspaces() {
        let operations = Operations::default();
        let _new_chat = operations.session("new-chat").await;
        let _creating = operations.workspace("/repo/creating").await;
        let _other_chat = timeout(
            Duration::from_millis(100),
            operations.session("existing-chat"),
        )
        .await
        .expect("an existing chat must not wait for worktree creation");
        let _other_workspace = timeout(
            Duration::from_millis(100),
            operations.workspace("/repo/other"),
        )
        .await
        .expect("unrelated workspace operations must remain available");
    }

    #[tokio::test]
    async fn conflicting_operations_wait_and_resume_when_released() {
        let operations = Operations::default();
        let creating = operations.workspace("/repo/shared").await;
        assert!(timeout(
            Duration::from_millis(20),
            operations.workspace("/repo/shared")
        )
        .await
        .is_err());
        drop(creating);
        let _archive = timeout(
            Duration::from_millis(100),
            operations.workspace("/repo/shared"),
        )
        .await
        .unwrap();
        let connecting = operations.session("chat").await;
        assert!(
            timeout(Duration::from_millis(20), operations.session("chat"))
                .await
                .is_err()
        );
        drop(connecting);
        let _handoff = timeout(Duration::from_millis(100), operations.session("chat"))
            .await
            .unwrap();
    }
}
