# development

[← Harbor](../README.md)

## run from source

for development, install Node 22+, Rust, and Xcode command-line tools:

```sh
npm ci
npm run desktop
```

`npm run dev` opens the browser preview at `http://127.0.0.1:1420`. the normal browser preview contains real empty states and cannot start local processes. `npm run desktop:build` creates `src-tauri/target/release/bundle/macos/Harbor.app`.

### folder access across rebuilds

packaged builds automatically reuse the **Harbor Local Development** signing certificate in your user keychain, creating it once if needed. the bundle keeps the identifier `dev.harbor.desktop`. this gives macOS a stable app identity so existing folder approvals survive rebuilds. the former ad-hoc signature identified each executable by its changing code hash; see [Apple's explanation of designated requirements](https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements).

when moving from the old ad-hoc build, macOS may ask once more for each protected folder. after approving the signed build, rebuild with `npm run desktop:build`, quit Harbor, and reopen the same `Harbor.app`. keep the certificate and its private key in your keychain: replacing them changes the app's identity again. the setup grants only `/usr/bin/codesign` access to the new key and deletes the temporary key files after import. it does not change macOS privacy settings or certificate trust settings.

`npm run desktop:verify-signing` checks the actual app signature, signs a modified temporary copy, and verifies that the changed copy satisfies the original app identity. `npm run desktop` runs Tauri's unbundled hot-reload executable and does not use this packaged identity; use the built `.app` when checking folder permission persistence. release signing can override the local certificate with `APPLE_SIGNING_IDENTITY`.

## background design lab

With `npm run dev` running, open [Background studies](http://127.0.0.1:1420/labs/backgrounds.html) for six independent animated treatments: Light tide, Woven light, Liquid glass, Contour field, Dither bloom, and Chromatic echo. All studies share the selected city and lighting so they can be compared fairly. Dawn and Day use the light palette for the preview, composer, and lab controls; Sunset and Night use the dark palette. Open any study to preview it behind an editable sample composer, adjust intensity and speed, or add it to the browser-local shortlist. Pause and reduced-motion preferences stop animation; offscreen and hidden previews also pause.

The lab lives in `labs/backgrounds.html` and `src/design-lab/`. It uses bundled artwork, makes no provider calls, and does not change the app's saved settings. It is a development-only entry point, excluded from the production app bundle. A URL fragment such as `#dither` opens a specific study directly.

## visual feedback

[Agentation](https://www.agentation.com/) is installed as a pinned development dependency. its toolbar appears in the bottom-right corner in `npm run dev` and `npm run desktop`. to package a development app with the toolbar, run `npm run desktop:build:dev` and open `src-tauri/target/debug/bundle/macos/Harbor.app`. this uses `npm run build:dev` to include Agentation in the bundled frontend. development assets go into `dist-dev/`, separate from production's `dist/`, so a production frontend build cannot replace them while Tauri is compiling. click an element, write feedback, and copy the annotations into your coding agent. the toolbar and its package code are excluded from production builds (`npm run build` and `npm run desktop:build`).

for optional direct annotation sync, [configure Agentation MCP](https://www.agentation.com/mcp) in your coding agent and restart or reload that agent. set `VITE_AGENTATION_ENDPOINT=http://localhost:4747` in `.env.local`, then restart Vite. without an endpoint, annotations stay local to the browser and use the copy/paste workflow.

## validation

```sh
cargo test --manifest-path src-tauri/Cargo.toml --lib
npm test
npm run build
```

the Rust suite covers concurrent transports, permissions and their correlation, filesystem/terminal client requests, model-dependent configuration, cancellation, malformed frames, crashes, legacy subagent normalization, terminal output bounds, and archive restoration of staged/unstaged/untracked/ignored files. it also checks that post-archive writes prevent removal and that external ownership is refused. Rust tests regenerate the TypeScript command, record, and event definitions in `src/lib/bindings`.

the TypeScript suite covers streamed chunks, duplicate events, parent/child routing, cycles, nullable capabilities, permission matching, replay replacement, grouped controls, large transcript bounds, Fluid composer shortcuts and IME handling, pending plans, disabled terminal mode, disclosure/field behavior, and provider answer routing.

the interface uses actual Fluid Functionalism registry components. see [integration details and compatibility patches](fluid-functionalism.md).

`tests/ui.html` is an explicitly labeled deterministic browser IPC fixture. it is excluded from the production bundle. Ego-browser verified launch/configuration, model-dependent effort changes, worker views, syntax highlighting, unified/split review, draft and panel retention, keyboard search/focus, reduced motion, 900×620 layout, and both neutral themes.

live provider tests are opt-in, can consume model usage, and use the provider’s existing login:

For background naming, run `cargo test --manifest-path src-tauri/Cargo.toml live_title_generation -- --ignored --nocapture` with `HARBOR_TITLE_COMMAND` set to the ACP executable. `HARBOR_TITLE_PROVIDER` selects `codex` (default), `claude`, or `grok`; `HARBOR_TITLE_ARGS` optionally supplies a JSON array of arguments. This opens a temporary title-only session using the selected adapter.

```sh
HARBOR_SMOKE_COMMAND=/absolute/path/to/codex-acp \
HARBOR_SMOKE_WORKDIR=/absolute/path/to/test/repository \
HARBOR_SMOKE_PROVIDER=codex \
HARBOR_SMOKE_REQUIRE_SUBAGENT=1 \
HARBOR_SMOKE_HANDOFF=1 \
cargo test --manifest-path src-tauri/Cargo.toml live_provider_smoke -- --ignored --nocapture
```

use `HARBOR_SMOKE_ARGS='["--no-auto-update","agent","stdio"]'` for Grok Build. Set `HARBOR_SMOKE_PROVIDER` to `codex`, `claude`, or `grok`; supply an installed ACP executable through `HARBOR_SMOKE_COMMAND`. the native handoff test verifies original-fact recall in the actual PTY CLI, presence of the CLI-created message in replayed ACP history, and second-fact recall after returning to ACP. the test only auto-accepts trust for its generated `work/live-repo` fixture; other repositories must already be trusted.

## verification limits

this is a runnable development release, not a completed cross-provider certification. provider-specific child cancellation beyond shared transport tests, macOS notification permission delivery, and full close/quit/crash recovery through the packaged UI require separate live acceptance. See the current [three-provider verification record](subagent-verification.md) for tested versions and handoff results. the core paths exist; fixture tests are not a substitute for those live checks. Windows/Linux packaging, remote hosts, an app account, a full editor, Developer ID distribution signing, and notarization are not included. local macOS builds use the development certificate described above.

## provider contracts

`tests/providers/{codex,claude,grok}.mjs` are separate entry points into a deterministic protocol fixture. They model different reasoning controls and worker receipt shapes. Rust contract tests cover no-prompt diagnostics, authentication/protocol failures, dependent configuration, typed questions, permission IDs, persistence/replay, worker identity, and direct Grok continuation. These are protocol tests, not evidence that a live upstream provider implements a capability.

The opt-in live smoke supports `HARBOR_SMOKE_CONNECT_ONLY=1 HARBOR_SMOKE_CONFIG_ROUNDTRIP=1` for model/effort changes with restoration, and `HARBOR_SMOKE_WORKER_ROUNDTRIP=1` for same-worker context retention. `HARBOR_SMOKE_TRACE_PATH` optionally saves the isolated test's follow-up events for diagnosis. Live runs can consume provider usage. Use a disposable workspace, with `/work/live-repo` suffix for the handoff test's bounded trust handling.
