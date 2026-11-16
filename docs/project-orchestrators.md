# Project orchestrators and Harbor-owned agents

Projects are ongoing areas of work. Each project has an active orchestrator conversation and a library under `.harbor/projects/<project-id>/` in its workspace. Multiple projects can share a workspace. Project creation records the initial instructions and starts an introductory agent turn. Reopening a project restores its conversation without submitting another prompt.

## Ordinary chat sessions

Children are ordinary Harbor sessions, linked to the orchestrator by nullable `parentSessionId`. Project association and `isOrchestrator` are separate fields. Each child owns its ACP connection, configuration, transcript, questions, approvals, direct human input, and ordinary prompt queue. Its model initially inherits the orchestrator's selection; later model changes use normal chat controls and do not overwrite the project's default.

The sidebar uses the standard conversation row and menus. Children remain nested under their project and are excluded from workspace lists and separate top-level tabs. They start in the project workspace. Worktrees are created only through existing explicit controls.

## Tools and delivery

The orchestrator receives `harbor_project.create_agent`, `send_message`, `list_agents`, and `stop_agent`. Children receive `send_message`, `list_agents`, and their own `ask_user` question interface. They cannot create or stop other agents. Provider-native project delegation is disabled through supported provider configuration.

The MCP stdio process calls an authenticated loopback IPC server. Credentials identify the calling session; the backend independently checks its active project and role. Tools cannot address another project's agents or a previous orchestrator's family. Session stop revokes its credentials. Credentials are transport configuration, never transcript content.

`create_agent` atomically saves the ordinary session, its assignment, and a delivery receipt, then returns immediately. `send_message` atomically saves the actual message and receipt. Request identities make repeated IPC requests idempotent. Messages retain their sender, recipient, literal text, attachments, and delivery ID. Sending does not cancel the recipient. An idle recipient connects and starts; a busy recipient uses the ordinary queue. A real child message wakes an idle orchestrator. The orchestrator finishes after dispatch rather than waiting or polling.

Agent inputs use the provider's embedded-context channel with a `harbor-agent-message://<sender>/<delivery>` resource. Harbor displays its stored author and content. Human inputs retain their human authorship and appear once, including attachments. Tool calls remain visible through the standard tool renderer. There are no receipt-generated bubbles, encrypted-message placeholders, parent-relay prompts, or synthetic answer summaries.

## Context and instructions

The library contains `index.md`, `decisions.md`, `current-state.md`, `orchestrator.md`, and `worker.md`. Initialization is lazy and create-only. Users can edit documents. Context previews, relative links, and editor opening use checked paths; symlinks cannot cross or alias project directories. Harbor does not modify repository-wide agent instruction files or `.gitignore`.

Role setup uses the provider's hidden instruction channel. Each prompt also carries a labeled versioned project-context block, separately from the displayed message. Events retain its instruction text/version for debugging. The orchestrator consults context, delegates product work, and curates sourced memory. Children perform their assignments, ask questions in their own chats, and report useful progress/results. Shared memory ownership is a workflow convention.

Previous orchestrator conversations are available through **Conversation history…** in the project's right-click menu. They are not rendered as nested agent rows.

**Start fresh conversation** preserves history and files, creates the replacement successfully before changing the pointer, and requires active agents to finish or stop. Workspace changes preserve existing conversations' directories and require a fresh orchestrator.

## Recovery and cutover

Database v5 transactionally adds default-null parent IDs and removes project-native worker projections and child-only replay events. Project files, orchestrator history, and unrelated chats remain. The transcript-cache version invalidates stale child projections. Generic native-worker support for unrelated ordinary chats remains independent of project orchestration.

Queued or dispatching agent messages become `interrupted` after process restart. Reconnect restores session identities and transcript ordering; it does not create agents or redispatch assignments. Interrupted messages appear in a paused queue for explicit recovery. Removing a queued delivery marks it cancelled so it cannot return after restart. Previously delivered messages are deduplicated by delivery ID.

Project deletion uses the existing ownership-aware archive and cleanup path for all associated ordinary sessions and owned worktrees. Shared workspace folders and worktrees with other consumers remain protected.

## Verification

Fixture tests and live provider acceptance are separate evidence. The browser fixture is `tests/project-orchestrators-browser.mjs`; it checks startup, ordinary-child navigation, sidebar placement, context, and fresh conversations. Rust tests cover transactional migration/rollback, project isolation, role catalogs, context paths, replay ordering, and the existing queue/deletion services. Frontend tests cover authorship, attachments, reconnect, normal child menus, model controls, and pending-question state.

Debug packages provide an opt-in isolated acceptance runner, `project_agent_acceptance.rs`. It requires `HARBOR_TEST_DATA_DIR` with a `harbor-owned-acceptance-*` basename, `HARBOR_AGENT_ACCEPTANCE=create` (then `queue` and `restart`), and an authenticated `HARBOR_SMOKE_COMMAND` ACP executable. It runs the packaged application's real services, MCP IPC, ordinary sessions, direct human attachment input, child-owned questions, automatic parent resumption, visible tool events, and restart checks. It writes separate JSON evidence inside the disposable data directory and never runs against a normal application database.

Codex passed isolated live acceptance on October 28, 2026 using ACP 2.3.0 and Codex 0.164.0. The packaged application created an ordinary child with zero native subagents, delivered its real reply to resume the parent, changed the child model independently, displayed one literal parent message, accepted one direct human attachment, and answered the child's own question form. A second live phase held that question open while queuing an agent message and human input: the parent returned immediately, the question remained pending, and each queued input arrived once with the correct author. Process restart retained both session identities and all four agent deliveries, with no redispatch and one preserved human attachment input. The final signed main bundle also passed the busy-delivery phase in the same isolated database and a subsequent restart retained all five deliveries without redispatch. These are actual provider/application-service results, separate from browser fixtures. Native visual interaction was subsequently verified after the Mac was unlocked.

Local evidence for this run: `/tmp/harbor-owned-live-create3.log`, `/tmp/harbor-owned-live-queue.log`, and `/tmp/harbor-owned-live-restart.log`, `/tmp/harbor-owned-live-queue-final.log`, and `/tmp/harbor-owned-live-restart-final.log`. The isolated data path is recorded in `/tmp/harbor-owned-acceptance-path`.

Codex is enabled for projects. Other providers show an actionable unverified explanation until their ordinary-chat, hidden-setup, native-tool-disable, MCP, and delivery contracts pass live acceptance. Ordinary chats remain available. Historical native-subagent acceptance does not establish acceptance of this architecture.

Automated verification for this change: 166 Rust tests passed (11 opt-in tests skipped), 589 frontend tests passed, the production frontend build passed, and signed isolated macOS bundles built successfully. The browser fixture passed startup, ordinary-child navigation, fresh conversation, context access, and provider error handling; frontend component tests cover the shared sidebar menus. Filesystem and ownership-aware deletion behavior are covered by the Rust suites; native visual checks also passed after unlocking the Mac.

### Native UI and regular-app cutover (October 29, 2026)

Created `Owned chats UI verification` through the isolated packaged application's project dialog using the disposable QA workspace. Its introductory greeting appeared in the chat. The orchestrator created `UI child` through the visible Harbor MCP tool call and returned promptly. The child appeared only beneath the project, displayed a Needs you indicator, presented its own question form, received `UI-MARKER-20261029`, and sent that answer back as a labeled agent message. Direct human input appeared once under Your message and received `HUMAN-INPUT-OK`. Its right-click menu offered the standard pin/archive actions. The create-agent disclosure showed the real assignment and queued delivery receipt.

Quit and relaunched the regular signed Harbor app. Migration advanced its database from v4 to v5, retained all 42 existing session IDs and the existing project ID, removed all project-native worker records, and kept the project context files. Reopened the existing AI chat project and visually confirmed its conversation history and normal composer. No assignment was submitted to the regular project during this check. Closed the isolated QA app and left the regular updated app open.

### Original image forwarding (November 2, 2026)

`create_agent` and `send_message` accept `attachments: [{"reference": "latest"}]` to forward the caller's most recently received files, or an exact `harbor-attachment:` reference supplied with its prompt. Inline base64 remains supported. Harbor resolves references only from attachments already received by that session, validates storage containment and symlinks, and copies the original bytes into the ordinary recipient attachment pipeline. The child sees the image preview and the provider receives image content or its supported resource/link fallback. Legacy image metadata remains forwardable through `previewSource`.

Project role instructions now explicitly require forwarding the original relevant images rather than substituting descriptions. A separate instruction block exposes current file references without changing displayed user/agent message text. Context-only follow-ups can use `latest` without reuploading the screenshot.

An isolated signed-app live Codex acceptance forwarded an actual PNG through the orchestrator's create-agent call, compared the child's stored bytes to the original, verified preview metadata, and received the child's own visual inspection report. Evidence: `/tmp/harbor-image-forward-live.log`. Reproduce this isolated packaged-app check with `HARBOR_AGENT_ACCEPTANCE=image` and the standard dedicated acceptance data directory and authenticated ACP executable. Rust tests cover exact-byte forwarding, reference ownership, legacy images, later text-only follow-ups, file-link fallback, traversal/symlink rejection, and old inline payloads. The full Rust suite passed (169 tests, 11 opt-in tests skipped). Frontend attachment/image/protocol tests passed (56 tests).

### Human message ordering after reconnect (November 2, 2026)

A preserved project transcript reset its turn counter on reconnect. A new human input could reuse an earlier fallback stream key and inherit that earlier message's replay position, moving the new input above its preceding reply. Project/reconnected human inputs now use their durable event sequence as a stable stream identity; only explicitly identified native streams can reuse replay positions. Transcript cache v8 rebuilds prior cached projections from the saved event log.

Two reducer regressions cover chronological placement with attachments and preservation when reconnect provides no assistant replay. The relevant transcript/protocol/queue suites passed (76 tests). A separate local replay of the affected conversation's saved events confirmed the existing human message appears exactly once before its actual response, at its original persisted sequence. No human input was reconstructed or resent. Local verification receipt: `/tmp/harbor-missing-user-real-replay.log`.
