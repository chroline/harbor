# Worker conversation acceptance, October 14, 2026

Harbor was tested against the installed agents using their existing authentication and isolated temporary repositories. Each parent created one worker with a unique marker. A second message omitted that original marker and supplied a fresh nonce. Success required both retained context and receipt of the follow-up.

| Agent | Installed adapter | Continuation route | Live result |
| --- | --- | --- | --- |
| Prime Agent / Grok 4.7 | Prime 0.9.8 | Exact child JSONL and resident session, separate ACP wrapper | Passed backend and packaged UI |
| Codex | codex-acp 2.1.1 | Parent's native worker messaging | Passed backend and packaged UI; the same child rollout independently recorded the reply |
| Claude Code | claude-agent-acp 0.88.0 | SendMessage through parent, including delayed child completion | Passed backend and rebuilt packaged UI; deferred reply remained in the selected worker transcript |
| Cursor | CLI 2026.08.11-e8db854 | Task continuation through parent | Passed backend and packaged UI; cursor/task carried the original worker's reported agent ID and new prompt |
| Pi | pi-acp 0.0.34 / Pi 0.84.2 / pi-subagents | Resume existing child run through parent | Passed backend and packaged UI; resume receipt and original-marker recall |
| OpenCode | 1.18.31 | Load existing child session and prompt directly | Passed backend and packaged UI |
| Grok Build / Grok 4.7 | Grok 1.0.30 | Typed tool receipt / forwarded child session identity, load existing child session directly | Passed backend and packaged UI |

The parent created `sub-864b927e` using `xai/grok-4.7`. Selecting that child loaded its saved history. A new message sent through the child composer returned `HARBOR_CHILD_ORIGIN_713 HARBOR_UI_REPLY_9472`; the original marker was absent from the follow-up.

The worker's initial reply used Prime's native `agent_message.send` tool. Its exact body, `CHILD_READY_713\nHARBOR_CHILD_ORIGIN_713`, was stored under the tool result's structured `sentAgentMessages` receipt. The old importer skipped that receipt, leaving only an assistant summary. The rebuilt app now displays the actual body under **Message to parent**, separately from that summary, and imports the incoming parent task under **Message from parent**. Replay follows the selected branch, deduplicates communication IDs, and does not infer sends from Python source or assistant prose.

The labeled relay was also verified through the packaged Codex UI. Selecting its existing worker and sending a fresh follow-up returned `RELAY_ORIGIN_631 RELAY_UI_REPLY_917`, visible under **Parent relay**.

Pi's worker composer returned `PI_ORIGIN_364 PI_UI_REPLY_928` through the labeled parent relay. OpenCode loaded the real child's history and returned `OPENCODE_ORIGIN_623 OPENCODE_UI_REPLY_275` directly.

Claude's first UI run found a delayed reply appearing only in the parent view. Harbor now retains the relay destination beyond the prompt response until a new user turn takes over. After restarting the rebuilt app, a fresh follow-up through the existing worker composer returned `CLAUDE_ORIGIN_483 CLAUDE_UI_FIXED_851` in that worker view, including its deferred completion. Generation aliases share one frontend worker identity and retain tool/message isolation. On reconnect Claude can advertise a synthetic replay ID separately from its live native ID; these remain separate entries when the provider supplies no authoritative identity link, and parent continuation resolves the original native worker.

Cursor's worker declined the synthetic marker checks, then answered a practical follow-up about handling asynchronous worker replies. This proves an actual UI exchange; the separate backend test supplies the original-marker recall evidence. Cursor reported a different telemetry ID on its first continuation, so its selector currently retains both provider-reported identities rather than guessing that they are equivalent.

Parent-only history replay also used to clear locally routed worker input and parent relay messages. These now survive parent reconnection, while an explicit child replay can still replace its own history. Pi's original worker input and `PI_ORIGIN_364 PI_UI_REPLY_928` reply were recovered from the persisted event log and verified in the rebuilt packaged UI after reconnecting.

The normal suites passed: 52 Rust tests (four additional tests opt in to live provider access), 132 frontend tests, TypeScript checking, production frontend compilation, and the macOS app build. Frontend worker-routing coverage includes every bundled provider and the custom-provider entry. Arbitrary custom executables depend on the worker identity and continuation facilities they expose.

During packaged UI testing, a stalled Git probe on an unrelated existing project froze Harbor's main thread. Bootstrap inspection now runs on a blocking worker, and root probes have a two-second timeout. A regression test verifies that a stalled probe returns and its subprocess is reaped. The fixed packaged app was restarted successfully before the final Claude exchange.

To repeat a provider continuation check, configure `HARBOR_SMOKE_COMMAND`, `HARBOR_SMOKE_ARGS` (JSON array), `HARBOR_SMOKE_PROVIDER`, and an isolated `HARBOR_SMOKE_WORKDIR`, then set `HARBOR_SMOKE_WORKER_ROUNDTRIP=1` and run the ignored `live_provider_smoke` test. Tests use real model usage. The Prime existing-child check is `live_prime_worker_roundtrip`, configured through the `HARBOR_LIVE_*` variables documented by that test's required inputs.

## Grok Build acceptance

Grok Build 1.0.30 with Grok 4.7 passed the same backend worker continuation test. Worker `01a13e1d-ff36-72f0-b7f5-9c159e33ef26` loaded directly through `session/load`; the follow-up omitted its original marker and returned `CHILD-MEMORY-66226f08-d3ca-46a4-9e66-40204e9c5a1f WORKER-FOLLOWUP-c1ae994a-2fc4-4fcf-b517-4883c23abddc`.

ChatGPT computer use verified the actual packaged Harbor UI. Worker `01a13e1f-a2bf-7242-b53d-3b9822312562` appeared as **Grok UI Worker**. Opening it replayed the original task and `GROK_CHILD_READY_5831`. Its own composer sent a fresh request containing only `GROK_UI_REPLY_9476` and an instruction to recall the original token. The child answered `GROK_CHILD_ORIGIN_5831 GROK_UI_REPLY_9476`, proving retained context and direct delivery to the existing worker.

Grok writes rich `_x.ai/session/update` lifecycle events to its local log, but those did not arrive on the tested ACP client connection. Harbor instead uses structured `SubagentCompleted` and `TaskOutput.Result` / `MultiResult` receipts. It also registers an explicitly identified child session when Grok forwards that child's messages, before its completion receipt arrives, so early child messages stay out of the parent transcript. A background start acknowledgment alone does not mark a worker complete. Shell tasks and worker IDs mentioned in assistant prose do not create workers. Three new Rust regressions cover these cases; all 55 regular Rust tests pass.

After the final rebuild and restart, the same parent created a fresh **Grok Isolation Worker**, `01a13e22-92a4-7693-9f6a-4c9b91c2025f`. Its announcement was persisted as event 15489 before its first message (15490). The packaged parent view showed the parent's request and summary, while the child's task and ready reply appeared only in the child view. A new direct worker-composer request omitted `GROK_ISOLATION_ORIGIN_2469` and supplied `GROK_ISOLATION_UI_REPLY_5917`; the child answered `GROK_ISOLATION_ORIGIN_2469 GROK_ISOLATION_UI_REPLY_5917` in its own transcript.
