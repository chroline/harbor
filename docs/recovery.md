# storage and recovery

[← Harbor](../README.md)

## data, archives, and reconnection

- the database and archives live in `~/Library/Application Support/dev.harbor.desktop/`. database version 2 migrates existing Git projects into projects and shared workspace records, preserving project ids, conversations, worktrees, and archives. older Harbor builds cannot read the migrated database.
- with **keep working in the background** enabled (the default), window close hides Harbor and agents continue under its menu-bar icon. with it disabled, closing the window stops managed agents and quits Harbor. explicit quit always stops managed processes. on restart, sessions are disconnected until explicitly reconnected; saved “working” status is never presented as live.
- deleting a conversation stops its process and archives the conversation. an owned worktree is removed only after its last attached conversation is gone. main and external checkouts are retained.
- before Worktrunk removal, Harbor bundles Git history, copies the index, and saves all working files, including untracked and ignored files. a full extraction and SHA-256 manifest comparison must succeed, and files/index/HEAD must still match immediately before removal. no commit is added to the working branch.
- restore from worktrees → archives. restored files and staged state are placed in a new `harbor/restore-*` branch; the saved conversation can then reconnect. failed cleanup retains the worktree and exposes a retryable state. nested repositories and special files are refused rather than incompletely archived.
- transcripts are stored completely as ordered events. the UI retains a bounded recent window (200 messages, 100 tools, 256 workers) and offers a complete JSONL export when that window is exceeded. terminal replay is capped at 2 mebibytes, with 10,000 rendered scrollback lines.
- Prime Agent's ACP ids are temporary. Harbor resumes its exact saved JSONL conversation through `--resume`, then opens a new ACP wrapper while retaining the transcript, workspace, draft, and model settings. new Prime chats use an isolated session directory under Harbor's app data. existing chats are matched by workspace and first user message; missing or ambiguous matches remain recoverable errors instead of silently starting over. native terminal handoff remains unverified.

## worktree constraints

see [recovery constraints](architecture.md#recovery-constraints) for archive verification, external writers, and failed restoration details.

window closure follows the [background setting](getting-started.md#window-behavior).
