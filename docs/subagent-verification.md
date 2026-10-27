# Three-provider acceptance — October 26, 2026

This record separates deterministic contract coverage, live backend checks, browser fixture checks, and packaged-app verification. Fixture results do not certify upstream behavior.

## Live backend checks

Existing local authentication was used in isolated repositories under `/tmp/harbor-provider-acceptance`. Current adapters were installed locally for acceptance; no global adapter installation was changed.

| Provider | Version | Model configuration | Initial chat and worker | Existing-worker context |
| --- | --- | --- | --- | --- |
| OpenAI Codex | codex-acp 2.3.0 | Model and reasoning switch/restore passed without prompts | Passed | Parent relay passed; the original child rollout independently contained both markers |
| Claude Code | claude-agent-acp 0.97.0 | Model and effort switch/restore passed without prompts | Passed | Parent relay passed; `session_message` addressed the original child, whose own reply retained both markers |
| Grok Build | 1.0.30, build 04b7ffed98c6 | Model switch/restore passed without prompts; no separate effort selector advertised | Passed | Direct child `session/load` and follow-up passed with retained context |

Each worker received an original random marker. Its follow-up supplied a fresh nonce but omitted the original marker. Passing required the same child's answer to include both. The Claude verifier was updated to use its observed typed communication receipts instead of requiring native control-tool telemetry that the current adapter suppresses.

Grok passed native continuity in both directions: ACP remembered the first marker, the native CLI resumed that identity and recalled it, then ACP replayed the native turn and recalled a second marker introduced only in the CLI. Native resume used `--no-auto-update --resume <id>`.

Claude CLI 2.1.284's native round trip remains unverified: the test could not complete the first-run trust interaction. Codex ACP 2.3.0 / native CLI 0.164.0 recalled the original ACP marker in its exact native rollout and exited, but ACP then refused to reopen it with “session is in use by another Codex client.” That pair remains disabled. Neither a successful version check nor an ACP prompt alone qualifies a new version for handoff.

## Automated coverage

The normal suites exercise:

- Transactional v3 migration with mixed providers, archived chats, missing definitions, orphaned events/metadata, repeat startup, rollback, and preservation of working files and workspace/worktree/archive records.
- A closed provider registry, generated supported IDs/defaults, shared new/load/resume identity checks, and exact native compatibility checks.
- Separate Claude, Codex, and Grok fixture entry points: authentication/protocol diagnostics without prompts, model dependencies, boolean/mode controls, streaming text/thinking, plans, tools, attachments, permissions/forms, worker receipts, history replay, cancellation, malformed frames, and crashes.
- Request ownership, nested workers, parent versus direct routing, delayed completion, duplicate streams, draft/history preservation, and unsupported cancellation.
- Provider selection and settings, discovery cache invalidation and stale responses, dependent controls, connection errors, removal of custom-agent creation, and frontend persistence reconciliation.

The TypeScript suite passed 347 tests. The Rust suite passed 92 tests with six opt-in live tests ignored. The production build passed with its existing bundle-size advisory.

## Browser and packaged checks

Browser fixture checks confirmed exactly three providers, successful setup diagnostics, launch, and an ACP form answer with the original request ID and typed values. This is simulated IPC, distinct from the live provider tests above.

A signed debug macOS bundle was built with an isolated QA application ID (`dev.harbor.provider-qa`), fixture ACP executables, and a separate v2 database. The normal Harbor application database was not opened or migrated during acceptance. Packaged checks passed:

- Real startup migrated v2 to v3, retained exactly the three providers and workspace/project records, removed the obsolete provider/chat/events, and preserved the repository's working file.
- Codex freeform launch, Claude plain-folder launch, and Grok owned-worktree launch.
- Root permission approval and typed form response, with the returned protocol payload visible in the transcript.
- Codex and Claude worker tabs with labeled provider-specific parent relays; Grok direct child history and context recall.
- A shell tab with visible command/output and tab close.
- Root draft, history, selected worker tab, and worker draft across quit/restart. The first pass found worker drafts were memory-only; persistent storage and regression tests were added, and the rebuilt app retained `persistent-worker-draft-verified` after restart.
- Window close kept agents running in the background; explicit Quit stopped the QA process and its fixture children.
- Archival removed the disposable owned worktree after creating bundle/snapshot/index recovery artifacts; the main checkout and its file remained intact.

All three live providers separately passed process restart, original-identity ACP reconnect, and original-context recall. Packaged routing checks use deterministic fixtures; they are not a claim of a new packaged live-provider matrix. Live cancellation, image understanding, every authentication method, and every native product feature are not certified by the configuration/worker smoke tests.

## Plan-mode acceptance — October 26, 2026

Live `live_plan_tests::live_plan_mode` passed separately for Codex ACP 2.3.0 (native CLI 0.164.0), Claude ACP 0.97.0 (native CLI 2.1.284), and Grok `1.0.30 (04b7ffed98c6) [stable]`. Each test created a fresh temporary Git repository containing `greeting.txt` with `hello`, captured all project files except `.git`, requested a concrete plan to change it to `ahoy`, and asserted the snapshot remained identical. It then stopped and restarted the ACP process, loaded the original identity, checked confirmed Plan mode and recall of a random marker, and explicitly approved execution. The final snapshot allowed only `greeting.txt` to change.

| Provider | Observed controls and approval | Outcome |
| --- | --- | --- |
| Codex | Modern `collaboration_mode`; independent permission `mode`; native plan review options include `implement_plan` and `revise_plan` | Rejected review kept Plan; explicit `default` selection enabled execution; restart/context/filesystem checks passed |
| Claude | Modern `mode` plus matching ACP legacy modes; `session/set_mode` required; ExitPlanMode offers manual edit approval | Same-conversation manual approval and subsequent edit approval passed; provider published its exit mode; restart/context/filesystem checks passed |
| Grok | Model-only config, no mode catalogue; real `session/set_mode: plan` succeeded; current-mode notifications; native `_x.ai/exit_plan_mode` | Exact-version compatibility added and verified; native plan-file access and typed approval worked; restart/context/filesystem checks passed |

The first Grok investigation incorrectly treated its omitted catalogue as lack of support. Direct probing and official documentation disproved that conclusion. Initial execution failed because Harbor rejected the native plan-exit request and blocked the session's plan file. The final passing test exercises both fixes; a successful `set_mode` call alone was not accepted as proof.

Evidence logs for this run: `/tmp/harbor-plan-{codex,claude,grok}.log`, optional corresponding `-trace.json` files, `/tmp/harbor-plan-ts-suite.log`, `/tmp/harbor-plan-rust-suite.log`, and `/tmp/harbor-plan-qa-build.log`. These are local run artifacts, not committed credentials or permanent CI evidence.

Deterministic regression coverage includes provider-specific configuration/approval payloads, failed and delayed acknowledgments, rapid switching, queued changes during cancellation, unconfirmed success, wrong conversation identity, rejection/cancellation retaining Plan, replay, unverified Grok versions, and exact native plan-path restrictions. Frontend tests verify visible plan review text and original approval IDs. Browser checks in `tests/plan-mode-browser.mjs` passed for modern Codex and legacy Grok controls: no prompt during pending configuration, preserved draft after failure, and cancellation restoring the confirmed selection.

The rebuilt signed macOS QA app passed Codex and Claude Plan selector/Shift+Tab and review flows. Grok additionally passed menu and Shift+Tab selection, rejection retaining Plan, immediate quit/restart with `grok-plan-restart-draft`, original wire identity, displayed plan review, and approval returning to Default and writing `ahoy`. The root draft initially failed immediate quit because its database write was debounced; synchronous local persistence fixed it, and the rebuilt app passed. Native UI checks used fixtures and the isolated `dev.harbor.provider-qa` database. Live provider checks ran through Harbor's real Rust ACP transport, not the packaged UI. Live rapid switching/cancellation and every upstream plan-exit option are not separately certified; their deterministic contract coverage is not a claim of live verification.

To repeat Plan acceptance, set `HARBOR_SMOKE_PROVIDER`, `HARBOR_SMOKE_COMMAND`, and JSON `HARBOR_SMOKE_ARGS`, then run `cargo test --manifest-path src-tauri/Cargo.toml live_plan_tests::live_plan_mode -- --ignored --nocapture`. It uses existing CLI authentication and consumes model usage. Grok arguments are `["--no-auto-update","agent","stdio"]`. `HARBOR_PLAN_TRACE` optionally captures protocol evidence. Production frontend and signed QA bundle builds passed; bundle-size advisory and local notarization skip remain unchanged.

## Repeating live checks

Set `HARBOR_SMOKE_PROVIDER` to one of `claude`, `codex`, or `grok`, `HARBOR_SMOKE_COMMAND` to its ACP executable, `HARBOR_SMOKE_ARGS` to a JSON argument array, and `HARBOR_SMOKE_WORKDIR` to an isolated repository. Run the ignored `live_tests::live_provider_smoke` test with:

- `HARBOR_SMOKE_CONNECT_ONLY=1 HARBOR_SMOKE_CONFIG_ROUNDTRIP=1` for no-prompt configuration discovery/change/restore.
- `HARBOR_SMOKE_WORKER_ROUNDTRIP=1` for real worker continuation and original-context recall.
- `HARBOR_SMOKE_RECONNECT=1` for original-identity/context recovery after the ACP process exits.
- `HARBOR_SMOKE_HANDOFF=1 HARBOR_SMOKE_NATIVE=/absolute/path/to/cli` for a native PTY round trip. The generated test directory must end in `/work/live-repo` before the test may accept its first-run folder trust screen. Optional native hooks are skipped.

The latter two consume real model usage. Run the normal Rust and TypeScript suites independently; never substitute fixture success for missing live prerequisites.
