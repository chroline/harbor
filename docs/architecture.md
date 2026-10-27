# Implementation map

Rust owns execution and storage; the webview owns presentation. `src-tauri/src/lib.rs` defines the narrowly scoped Tauri commands and coordinates the following services:

| Module | Responsibility |
| --- | --- |
| `types.rs` | Public records, ordered events, generated command request union |
| `providers.rs` | Capability negotiation, version-specific handoff checks, old Codex draft normalization |
| `acp.rs` | NDJSON JSON-RPC, process groups, request correlation, permissions, client filesystem and terminal methods |
| `db.rs` | SQLite WAL database, versioned schema, ordered events, transactional records, streaming export |
| `workspaces.rs` | Canonical local folder identity, availability and Git checkout capability |
| `worktrees.rs` | Worktrunk JSON schema normalization, ownership, Git bundles, file manifests, snapshots, verification, removal, restoration |
| `terminal.rs` | Native PTY creation, input, resize, bounded byte replay and process cleanup |
| `subagents.rs` | Existing worker attachments, Prime child identity validation and branch-aware history replay |

`src/lib/store.tsx` subscribes before bootstrapping and batches events at 50 ms. Histories load in pages with a concurrent-event buffer. `protocol.ts` reduces normalized events into messages, tools, child sessions, approvals and plans. A successful session/load starts a replacement history; failed loads preserve the existing transcript. Process generations reject events from replaced connections.

`prime_sessions.rs` handles Prime's CLI-backed persistence separately from ACP capabilities. A `prime_session` database record pins each Harbor chat to its saved JSONL path. Prime is launched with that exact `--resume` path before `session/new` creates a fresh connection-local ACP ID; the native conversation and Harbor event history remain intact. New chats use isolated directories in app data. Legacy recovery matches a root session by workspace and first user prompt, rejecting ambiguous matches. This does not enable native terminal handoff or advertise unsupported ACP load/resume capabilities.

`titles.rs` gives new chats a shortened first-input title and persists root ACP `session_info_update` titles. On the first submission, a background ACP session asks that same configured provider for a concise title using its existing login, concurrently with the main turn. Generation starts immediately unless the provider has already supplied a title. It uses a temporary directory, advertises no client tools, rejects reverse client requests, and never adds its prompt or response to the user's transcript. Generation has a sixty-second deadline, closes supported sessions, and stops its transport on completion, disconnection, archival, or app shutdown. Failures retain the input title. Provider titles take priority over late generation, and atomic title updates preserve drafts, status, and activity ordering. Attachment-only chats retain their filename fallback.

The generated `CommandRequest` union controls frontend command names and argument tuples. Record and event definitions are generated from Rust with ts-rs; JSON extension fields remain JSON values. Unknown extension data is persisted as data and never interpreted as instructions.

## ACP compatibility

The core transport targets stable ACP v1. Draft `subagent_update` events are kept separate from the stable transport. Codex adapter 2.1.1 requires a legacy capability in `_meta.jetbrains.air` because its published schema strips the draft top-level capability. Its `subagent_spawned` and `subagent_state_update` events are converted to normalized child records with the original fields retained under `_legacy`.

Cursor reverse requests `cursor/ask_question` and `cursor/create_plan` are held and shown as blocking interactions, using their original request IDs. Unsupported reverse methods receive a JSON-RPC method-not-found response instead of remaining pending forever. Child permission requests retain their original child session ID. Individual child cancellation uses an attached worker's ordinary ACP session, or the parent's advertised child-cancellation capability.

Selecting a worker attaches a separate ACP transport to its existing conversation through advertised load/resume support. When direct child input is unavailable, the child composer uses a labeled parent relay that asks the native parent to continue that existing worker through its worker messaging tools. It never deliberately falls back to spawning a replacement worker. Prime uses its exact saved child JSONL path and a fresh ACP wrapper attached to the same resident session. Parent links, workspace, IDs, ambiguous files, and historical root wrapper IDs are checked before attachment. Prime history follows the selected JSONL branch. Cursor worker telemetry is acknowledged as an extension request, including underscore-prefixed ACP method names. OpenCode task metadata and Pi workflow completion receipts are normalized into worker ownership records. Ordinary session support alone does not guarantee standalone child input; Codex explicitly prohibits it for multi-agent v2 children.

Child messages and completion events carry a child ID and have separate turn counters and drafts. Child approval IDs are scoped by worker and routed back to the originating transport. While a worker is attached independently, its duplicate stream on the parent connection is suppressed. Relayed responses are labeled as parent relay messages, and child generations remain visible in the original worker transcript. An early parent response does not finish a relay while its child is still working. Parent reconnect, archive, and shutdown stop the child transports as well. Failed child attachment preserves existing history and never replaces the parent transcript.

The relay destination survives prompt completion so deferred parent notifications still reach the worker view. A new parent prompt clears it, another worker continuation replaces it, and disconnection clears it. Resumed `:generation:N` events use the original worker's identity in the frontend, including its tool activity. Bootstrap folder inspection runs off the native UI thread; Git root probes have a two-second deadline and reap stalled subprocesses.

Prime child history also imports structured agent communications: incoming `custom_message` records and outgoing `toolResult.details.sentAgentMessages` receipts. Actual bodies appear as labeled messages, separate from later assistant summaries. Stable communication IDs deduplicate replay; discarded branches and Python source strings are never interpreted as sent messages. Completed direct Prime turns refresh these receipts. Parent history resets preserve worker-composer input and parent-relayed replies; explicit child replay still replaces that child's history.

Native terminal output stays terminal output. Harbor does not derive structured conversation state from ANSI. The opt-in terminal test inspects bytes only to validate fact recall; production reconnection uses ACP history replay. Installed version checks and an explicit native session ID gate ownership transfer. ACP is stopped before the native controller starts, and returning to ACP requires the native CLI to exit first.

## Commands and skills

`commands.rs` discovers the selected provider's ACP command catalog in the effective workspace without submitting prompts or saving Harbor chats. Discovery waits up to ten seconds after session creation for the initial advertisement, closes supported ACP sessions, and always stops its transport. Canonical workspace paths and provider executable/arguments scope the sixty-second cache; concurrent requests share a probe, and shutdown stops active probes. Freeform discovery uses an isolated scratch directory for global commands only. Model discovery remains project-independent.

Live `available_commands_update` events replace the root or attached worker catalog in `protocol.ts`. Relayed worker composers do not offer their parent's commands. Both `/` and `$` open the same catalog at word boundaries and recognize the same names. Selection inserts the advertised spelling; send boundaries normalize manually typed aliases back to the native prefix without changing code, links, URLs, or unknown names. Exact advertised spellings win when a command and skill share a name. The menu uses readable labels and inline descriptions, with a Skills section for advertised `$` and `skill:` entries. A Lexical plain-text editor occupies InputMessage's optional editor slot, preserving the Fluid frame and plain-string draft/prompt boundary. Root transforms reconcile exact invocation spans after every edit, including boundary changes, without a second history update. The existing Fluid `CommandMenu`, `CommandMenuList`, and `CommandMenuItem` own row rendering, compact typography, keyboard/pointer highlight, scrolling and fades; `Elevated` and the rounded shape tokens own popup surfaces and radii. An exported menu hook bridges the palette to Lexical while keeping input focus. Radix supplies only popover positioning and modal interaction. Sent user messages retain invocation ranges derived during event reduction; Markdown decoration skips code and links, and copy/export keep the original text.

Browser acceptance is reproducible with `ego-browser nodejs < tests/command-autocomplete-browser.mjs` against the Vite fixture. `tests/unified-command-picker-browser.mjs` additionally checks prefix equivalence, native dispatch from all three entry points, and standard compact Fluid dimensions. The `?picker` fixture supplies a long command/skill list, and the `?launch=1` fixture exercises the otherwise standalone new-task dialog. The ignored `commands::tests::live_command_catalog` test checks a configured adapter using `HARBOR_CATALOG_COMMAND`, optional JSON `HARBOR_CATALOG_ARGS`, and optional `HARBOR_CATALOG_CWD`, without sending a prompt.

## Recovery constraints

The normal repository branch is never committed as part of archival. Git objects/refs are preserved in a bundle and the index is copied separately. Files are archived independently of Git ignore rules, including symlinks and Unix modes. A verification extraction is compared against both the source manifest and its Git state. Cleanup refuses the main worktree, external ownership, nested repositories, unsupported special files, or changes since verification.

Harbor cannot coordinate an unrelated external editor or process writing after the final verification check. Stop external writers before deleting a worktree. Its archive is kept outside the removed checkout even if Worktrunk removal fails. A failed restoration may leave a newly created recovery branch/worktree for manual inspection; the original archive remains intact.

## References

- [ACP session configuration](https://agentclientprotocol.com/protocol/v1/session-config-options)
- [ACP subagent proposal](https://agentclientprotocol.com/rfds/subagents)
- [Worktrunk](https://worktrunk.dev/)
- [Cursor ACP](https://cursor.com/docs/cli/acp)
- [Fluid Functionalism](https://www.fluidfunctionalism.com/)
- [Jakub’s interface guidance](https://jakub.kr/skills)

## Projects and workspaces

Workspace records identify canonical local folders and track recent use. Projects reference exactly one workspace and own a display name, Lucide icon key, and palette color key. Saving a project validates its folder and appearance, then atomically upserts a shared workspace and the project. Version 2 migrates legacy project paths and chat workspace associations in one SQLite transaction, retaining missing folders and all existing IDs.

New chats capture their workspace ID and working directory. Reconnection uses the saved chat directory, independent of later project edits. Worktrunk is available only at Git checkout roots; ordinary folders skip Git. Change review follows the chat directory's Git capability. Worktree listings are fetched once per available Git workspace, while existing ownership and archive records retain their original repository paths and project IDs.
