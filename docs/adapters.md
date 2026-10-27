# Provider adapters

Harbor registers Claude Code (`claude`), OpenAI Codex (`codex`), and Grok Build (`grok`). Provider-specific behavior belongs in these directories:

| Integration | Backend | Frontend |
| --- | --- | --- |
| Claude Code | `src-tauri/src/adapters/claude-code/` | `src/adapters/claude-code/` |
| OpenAI Codex | `src-tauri/src/adapters/codex/` | `src/adapters/codex/` |
| Grok Build | `src-tauri/src/adapters/grok-build/` | `src/adapters/grok-build/` |

## Contracts and ownership

`src-tauri/src/adapters/contract.rs` defines the required `Adapter` trait. It has no default methods: omitting a policy is a compiler error. Each integration supplies its descriptor, executable search paths, version arguments, client extensions, plan protocol, native resume arguments, terminal compatibility assessment, legacy update normalization, and native worker receipt conversion. Workers declare parent relay, direct attachment, or unsupported behavior. Unsupported hooks return `Capability::Unsupported { reason }`; descriptors distinguish implemented, unsupported, and unverified features. An implemented native plan extension still checks the installed version and arguments before activation.

The shared transport owns stable ACP v1 initialization, requests, streaming, cancellation, process cleanup, and session identity checks. Model/mode discovery, authentication, attachments, ordinary permissions, and session new/load/resume use advertised ACP capabilities rather than separate implementations per provider. An adapter supplies only additional provider policies. Grok's native plan protocol and worker receipts are isolated under `grok-build/`; Claude and Codex use their advertised ACP plan flows.

`PlanProtocol` requires typed modes, normalized permission requests, decisions, responses, and plan-file access policies. The plan approval contract also distinguishes implemented, unsupported, and unverified states; unavailable approvals require a reason rather than placeholder option IDs. Native worker receipts become typed `WorkerAnnouncement` values. External JSON remains untrusted: adapters validate vendor messages at ingress and reject malformed requests. Shared ACP envelopes and preserved legacy fields remain JSON at the wire boundary. Rust types prove the shape and completeness of our implementation, not the correctness of an upstream executable or its undocumented behavior. Compatibility gates and provider fixtures remain necessary.

`src/adapters/contract.ts` defines the required frontend hooks for icons, control labels, and plan interpretation. `Adapter<Id>` correlates an implementation and its descriptor with its exact provider ID. The mapped `AdapterRegistry` requires one correctly typed entry for every generated supported ID. Rust generates descriptors and the `SupportedProviderId` union; frontend code does not maintain a second capability table. A plan is promoted only after validating its declared option IDs and permission kinds. Old request snapshots without provider identity require a unique matching contract.

Live lookup uses `SupportedProviderId`; raw persisted provider records remain readable for migrations. `resolve` validates raw IDs before transport launch, and unsupported IDs are rejected. The old `types::providers()` helper delegates to the adapter registry for compatibility with database/bootstrap code. Executable, arguments, and native CLI overrides remain configurable.

## Adding an adapter

1. Create a backend directory and implement every method of `Adapter`. Explicitly return unsupported/unverified reasons for capabilities that are unavailable or lack acceptance evidence. Do not enable terminal handoff based only on a resume flag.
2. Add one row to `register_adapters!` in `src-tauri/src/adapters/mod.rs`. This defines the persisted ID, module, exhaustive lookup, registry list, and generated ID type together.
3. Run `cargo test --manifest-path src-tauri/Cargo.toml` to regenerate checked-in TypeScript bindings, adapter descriptors, and bootstrap defaults. Missing Rust methods fail compilation.
4. Create the frontend module implementing `Adapter<"your-id">`, then add it to `src/adapters/index.ts`. Missing entries, mismatched IDs/descriptors, and missing frontend hooks fail `tsc` in `npm run build`.
5. Add realistic protocol fixtures and contract tests. Verify setup, discovery, planning/execution, tools, workers, recovery, and cleanup against the real executable. Record exact versions and limitations in [provider compatibility](providers.md) before enabling version-dependent behavior.

## Refactor verification

The adapter refactor preserves existing version gates and provider behavior. Compiler regression checks include a Rust compile-fail example for incomplete implementations and TypeScript negative assertions for missing hooks, unknown IDs, and mismatched adapter IDs. Runtime tests cover registry consistency, unsupported reasons, provider-specific plan contracts, malformed extension messages, worker receipts, resume arguments, and exact terminal compatibility gates. Existing shared transport/provider fixture suites exercise the refactored dispatch paths.

Live upstream acceptance is separate from fixture verification; ignored opt-in live tests are not evidence of a passing live check. See [provider compatibility](providers.md) and [worker verification](subagent-verification.md) for previously observed versions and limitations.

Verified on 2026-10-26:

- Frontend: 49 test files, 408 tests passed; production TypeScript checking and Vite build passed.
- Rust: 100 tests passed, six opt-in live checks ignored; the incomplete-adapter compile-fail doctest passed.
- Browser fixture: `plan-review-browser.mjs` passed for all three contracts, including exact action IDs, dismissal/focus, menus, long-plan scrolling, errors/retry, and reduced motion. `plan-lifecycle-browser.mjs` passed approval, continued execution text, read-only history sheets, and fresh-store replay without raw-plan fallback. Captured sheet/card screenshots were inspected.
- Packaged macOS: debug app bundle built and `desktop:verify-signing` passed. This refactor did not rerun real-provider or packaged-app interaction acceptance; existing compatibility limitations remain in force.
- `git diff --check` passed.

## Codex native async question receipt bridge

`adapters/codex/questions.rs` isolates the fallback required by ACP 2.1.1 and 2.3.0 for native `request_user_input_async` calls. Those adapters omit the native question data. The bridge validates the exact local native receipt’s thread/workspace and accepted tool result, then emits the same ACP form consumed by the shared question UI. Reads are bounded; native receipt content is data. Only the inspected adapter versions enable this fallback. A newer adapter must be checked for native support before extending the gate.

Async answers are normal user input to the original conversation, with the advertised steering extension during an active turn. They are not fabricated JSON-RPC replies to a server request. Pending async forms survive turn completion and reconnect; stored answered/dismissed IDs prevent resurrection. Ordinary ACP requests retain their existing lifecycle. See `UI-QUESTIONS.md` for exact live acceptance and storage limitations.
