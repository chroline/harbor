# storage and recovery

[← Harbor](../README.md)

## data, archives, and reconnection

- the database and archives live in `~/Library/Application Support/dev.harbor.desktop/`. database version 2 introduced shared workspace records. Version 3 removes unsupported-provider chats and their metadata, including archived chats, but preserves all working files, project/workspace/worktree/archive records, and native CLI history. Older Harbor builds cannot read the migrated database.
- with **keep working in the background** enabled (the default), window close hides Harbor and agents continue under its menu-bar icon. with it disabled, closing the window stops managed agents and quits Harbor. explicit quit always stops managed processes. on restart, saved sessions begin disconnected and the selected chat reconnects through its saved identity; saved “working” status is never presented as live. Unsent root and worker drafts survive restart.
- deleting a conversation stops its process and archives the conversation. an owned worktree is removed only after its last attached conversation is gone. main and external checkouts are retained.
- before Worktrunk removal, Harbor bundles Git history, copies the index, and saves all working files, including untracked and ignored files. a full extraction and SHA-256 manifest comparison must succeed, and files/index/HEAD must still match immediately before removal. no commit is added to the working branch.
- restore from worktrees → archives. restored files and staged state are placed in a new `harbor/restore-*` branch; the saved conversation can then reconnect. failed cleanup retains the worktree and exposes a retryable state. nested repositories and special files are refused rather than incompletely archived.
- transcripts are stored completely as ordered events. the UI retains a bounded recent window (200 messages, 100 tools, 256 workers) and offers a complete JSONL export when that window is exceeded. terminal replay is capped at 2 mebibytes, with 10,000 rendered scrollback lines.
- Claude Code, OpenAI Codex, and Grok Build reopen saved ACP identities through advertised load/resume support. A mismatched identity is refused and saved history remains intact. Native terminal handoff is limited to the exact verified combinations in the [compatibility matrix](providers.md).

## worktree constraints

see [recovery constraints](architecture.md#recovery-constraints) for archive verification, external writers, and failed restoration details.

window closure follows the [background setting](getting-started.md#window-behavior).
