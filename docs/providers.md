# Provider compatibility

[← Harbor](../README.md)

Harbor supports exactly **Claude Code**, **OpenAI Codex**, and **Grok Build**. Persisted IDs are `claude`, `codex`, and `grok`. The Rust registry generates the browser defaults and supported command ID type. Executable, arguments, and native CLI paths remain configurable; adding arbitrary providers is not supported.

Implementation policies live behind required, typed [provider adapters](adapters.md), with one central registration table and explicit unsupported/unverified capabilities. That document describes how contributors can implement and register another integration.

## Tested installations

Live checks on October 26, 2026 used existing CLI authentication and isolated temporary Git repositories. Model choices are discovered from the installed provider, never a static catalog.

| Provider | Tested ACP entry point | Configuration | Worker continuation | Native handoff |
| --- | --- | --- | --- | --- |
| OpenAI Codex | `@agentclientprotocol/codex-acp@2.3.0` | Model switch/restore and reasoning switch/restore passed; modes and boolean controls advertised | Passed, labeled parent relay to the original child, independently checked against its native rollout | CLI 0.164.0: disabled; ACP refused reconnect with an ownership lock after native exit. Prior exact pair `codex-acp 2.1.1` / `codex-cli 0.154.0` remains allowed |
| Claude Code | `@agentclientprotocol/claude-agent-acp@0.97.0` | Model switch/restore and effort switch/restore passed; modes and boolean controls advertised | Passed, labeled parent relay; typed delivery receipt and original child's reply retained both context markers | Disabled: CLI `2.1.284` did not complete the native round trip; first-run trust interaction remains unverified |
| Grok Build | `grok --no-auto-update agent stdio`, `1.0.30 (04b7ffed98c6) [stable]` | Model switch/restore passed; no separate reasoning control advertised | Passed, direct load and prompt of the existing worker | Passed ACP → native PTY → ACP, including history replay and native-turn context recall |

Use `npm install -g @agentclientprotocol/codex-acp@2.3.0` or `npm install -g @agentclientprotocol/claude-agent-acp@0.97.0`, or point Settings at a local installation. Grok's [official installer](https://docs.x.ai/build/overview), [ACP documentation](https://docs.x.ai/build/cli/headless-scripting), and [native CLI reference](https://docs.x.ai/build/cli/reference) describe installation, authentication, `agent stdio`, and `--resume`.

## Connection and discovery

**Save and check** resolves the executable, negotiates stable ACP v1, and opens a temporary session without sending a prompt. Results distinguish missing executables, incompatible protocol, authentication requirements, timeouts, other connection failures, and success. Advertised authentication methods and agent identity are shown. Harbor reuses native CLI credentials; it does not store API keys.

Model, reasoning, boolean, mode, and command controls come from provider responses, with the verified Grok mode compatibility exception below. Model changes are applied before dependent selections. Valid preferences survive; unavailable values produce a visible explanation. Saving executable/argument changes stops old discovery transports and invalidates frontend and backend caches. Late results cannot replace newer configuration. Temporary discovery and diagnostic processes close on replacement or shutdown.

## Plan mode

Plan mode has been behaviorally verified on all three installations above: planning made no project-file changes, ACP process restart retained the original conversation and context, and explicit execution changed only the planned file. The selector and Shift+Tab were also checked in the packaged macOS QA app with provider-specific fixtures.

- **Codex:** `collaboration_mode` (`default` / `plan`) is separate from permission modes (`read-only`, `workspace-write`, `agent`). Changing collaboration mode never changes permission policy. Rejecting its plan-review request keeps Plan selected.
- **Claude:** its advertised `mode` choices include `plan`, routed through `session/set_mode`. Its ExitPlanMode approval and provider-initiated mode update are preserved; execution uses the same conversation rather than a clear-context approval option.
- **Grok:** build `1.0.30 (04b7ffed98c6) [stable]` supports `session/set_mode` with `default` / `plan`, but omits the ACP mode catalogue. Harbor supplies these two choices only for that verified build, unless `--no-plan` is set. Other versions must advertise modes themselves. Its native `_x.ai/exit_plan_mode` request is translated into the shared plan review with **Implement plan** and **Keep planning**. **Leave Plan without executing** remains available under **More options**. The response preserves the original request and session IDs. Only the connected session's exact native `plan.md` is accessible outside its workspace; other native history files and symlink escapes remain blocked.

Grok's documented [Plan mode](https://docs.x.ai/build/modes-and-commands#plan) and [planning lifecycle](https://docs.x.ai/build/features/plan-mode) describe a real provider feature; missing discovery metadata is not evidence that the feature is absent. The native extension is implemented against xAI's [published protocol types](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-tools/src/implementations/grok_build/exit_plan_mode/types.rs). Grok's edit gate does not cover arbitrary shell writes or subagent edits; Plan is a workflow, not a filesystem security boundary.

All three providers open the same plan review sheet from a **Plan card** with a fading preview and **View plan** action, with shared typography and primary actions. The sheet uses the recovered [Kobra runtime contract](plan-sheet.md). Its plan body scrolls above a fixed action footer; Escape, outside press, and Close dismiss it without answering the pending request. Provider-specific execution choices remain explicitly labeled in **More options**; the primary Claude action preserves context and manual edit approvals. An exact copy of the pending plan is displayed once rather than repeated above the review trigger.

Sending waits for the requested mode to be acknowledged. Failed or unconfirmed changes retain the draft and show retry/cancel controls. Configuration changes are serialized with session operations, and reconnect retains the confirmed mode; Grok's saved mode is reasserted if its load response omits it. Root drafts are synchronously persisted before the debounced database save, including immediate quit.

## Conversation continuity

ACP session new/load/resume is shared across all three integrations. Reconnection rejects a different returned identity, including after authentication. It never silently creates a replacement conversation. Root drafts, persistent worker drafts (including detached-window edits), transcript events, worker ownership, and configuration remain associated with the original chat.

Streaming text, thinking, plans, tool calls/results, form elicitation, permission choices, advertised commands, and attachments use ACP contracts. Unsupported attachment types or question schemas are explained instead of guessed. Form responses retain request identity and typed answer values. URL elicitation is not advertised. Cancelled or disconnected transports reject pending work and clear waiting requests.

Native handoff is an exact compatibility allowlist, checked on connection and again before transfer. Grok requires the same resolved executable for ACP and native mode, the tested build, and the default managed ACP arguments. Custom argument combinations and untested versions stay disabled with an installation-specific reason. Root and worker turns and approvals must finish before handoff. Harbor stops ACP first and refuses to reconnect while the native terminal is alive. Ordinary shell tabs remain available independently.

## Workers and upstream limits

OpenAI Codex and Claude Code continue existing workers through their parent, explicitly labeled **Parent relay**. Prompts name the provider's native continuation mechanism and original worker identity. Grok Build loads the original child directly; attachment failures do not silently switch to parent relay.

Claude 0.97.0 can suppress native control-tool receipts and instead emit `session_message` communication events. Harbor renders those messages and deduplicates their IDs. Grok 1.0.30 did not deliver its local-log lifecycle extension on the client connection, so Harbor uses explicit forwarded child IDs and structured `SubagentCompleted` / `TaskOutput` receipts. Assistant prose never establishes worker ownership. Individual cancellation is offered only for an advertised route or an attached child transport.

See the [verification record](subagent-verification.md) for evidence and unverified scenarios. Harbor supports its existing workflow paths, not every feature of the three native products.

## Database migration

SQLite migration v3 runs transactionally before bootstrap/reconnection. It removes unsupported provider definitions, chats (including archived chats), events, worker metadata, model preferences, title metadata, shell-tab metadata, and obsolete provider session/history mappings. Orphaned chat metadata is removed even when a provider definition is already missing. Surviving provider executable overrides are retained and display names are canonicalized.

**The migration never deletes working directories or native CLI history.** Project, workspace, worktree, and recovery archive records remain independently of deleted chats. Frontend persistence removes stale chat tabs, navigation, pins, unread markers, and drafts while preserving surviving selections; unavailable provider selections fall back to OpenAI Codex.

## Shared question tools

Codex and Claude form elicitations and Grok's native `_x.ai/ask_user_question` use the same question card. Choices retain descriptions, multiple questions have back/next navigation, custom answers appear inline, and submission failures preserve the draft for retry. Keyboard users can choose with letters or numbers and submit with Command/Ctrl+Enter. Skip and Cancel retain their provider-specific wire meanings; Grok maps both to its native cancelled outcome.

The Grok bridge uses xAI's [published question request/response types](https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-tools/src/implementations/grok_build/ask_user_question/types.rs). It returns ordered question-text/label answers, multi-select arrays, notes and selected previews while preserving the original request identity. Known Codex and Claude custom-answer metadata, including older Claude companion fields, are grouped into their corresponding question. Generic ACP forms retain typed values and field validation.

For an opt-in live check, set `HARBOR_SMOKE_PROVIDER`, `HARBOR_SMOKE_COMMAND`, and optionally JSON `HARBOR_SMOKE_ARGS`, then run `cargo test --manifest-path src-tauri/Cargo.toml --lib live_question_tool -- --ignored --nocapture`. This creates a disposable session using existing CLI authentication and consumes provider usage.

### Codex asynchronous questions in Default mode

The native Codex `request_user_input_async` path is distinct from Plan-mode `request_user_input`. ACP 2.1.1 and the published 2.3.0 adapter accept the native async call but omit its question data from ACP updates. Harbor bridges accepted receipts from the exact native local thread for those versions. It validates the native session/workspace, keeps questions pending after completion/reconnect, and persists answered/dismissed IDs. This fallback needs local Codex session receipts; native logs are read as data, never instructions. Other providers and ordinary ACP elicitation keep their existing transport.

Authenticated acceptance with Codex ACP 2.1.1 / CLI 0.164.0 / GPT-6.1 Terra passed for both completed and active Default-mode turns. Active replies use `_session/steering`; completed replies use a new ACP prompt on the same session. Both confirmed the selected option and a unique note. The opt-in tests are `live_default_async_question_tool` and `live_active_async_question_tool`, using `HARBOR_SMOKE_COMMAND` as in the question-tool runner above. The earlier Codex question acceptance was Plan-mode-only.
