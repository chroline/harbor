# interface reference

[← Harbor](../README.md)

## foundation

a local desktop home for coding agents. Tauri 2, React 19, strict TypeScript, shadcn/ui, SQLite, ACP v1, native PTYs, and Worktrunk. the dark and light themes use neutral gray surfaces and text.

## native window surfaces

the sidebar sits outside the rounded main-content frame, over the original active macOS sidebar vibrancy. sidebar, titlebar, and outer gutters share Codex's 70% surface tint (#ededed in light mode, #212121 in dark mode). the main frame retains its original color and 84% light / 72% dark surface opacity. the native blur material is shared across the whole window. reduced transparency supplies an opaque chrome background. there is no grain texture. browser checks verify the CSS layers; native desktop screenshots verify the shared chrome after rebuilding.

macOS traffic lights are aligned within the 48px titlebar in both main and detached windows. native layout and appearance changes reapply their spacing; fullscreen keeps system placement.

## skyline backgrounds

Settings → Appearance selects San Francisco, Los Angeles, or New York City and either automatic lighting or a fixed dawn, day, sunset, or night image. Automatic lighting follows the local clock and refreshes each minute and on focus. The decorative image persists across new-task and chat views; chat uses a blurred, subdued version. The composer and its menus follow the artwork's light or dark palette without changing the saved application theme.

The new-task image has a fine pixel layer with one soft light point following the cursor. Pixel positions stay fixed while intensity falls off around that point. The image and pixel layer tilt together with subtle perspective, inspired by the [Apple TV card interaction](https://github.com/marcreichel/apple-tv-card); controls and window chrome stay fixed. Leaving the canvas resets the tilt. Reduced motion keeps the image static and disables the animated highlight.

Artwork and generation prompts are bundled in [San Francisco](../src/assets/artwork/sf/README.md), [Los Angeles](../src/assets/artwork/la/README.md), and [New York City](../src/assets/artwork/nyc/README.md).

## conversations and controls

The sidebar shows working, waiting-for-input, and unseen-completion states, including a summary on collapsed workspaces. Opening a chat clears its unseen marker. Long user prompts expand in place, image attachments use thumbnails, and streaming prose fades in without remounting completed text or code controls. Sticky prompts retain a background aligned with the chat scene.

Enter sends a prompt; Shift+Enter adds a line. Model, effort, mode, workspace, and worktree menus share compact surfaces above the composer. Connection failures retain the draft and offer executable configuration. Provider checks distinguish missing executables, sign-in requirements, incompatible protocols, timeouts, and other failures.

Plan approvals use a saved review card and a full plan sheet. Implement plan and Keep planning preserve the provider's original option IDs; additional provider options remain available separately. Answered or interrupted cards stay readable in history. See [plan review behavior](plan-sheet.md).

## provider artwork

The Claude Code, OpenAI Codex, and Grok Build icons are bundled SVG brand marks from the [ACP registry](https://github.com/agentclientprotocol/registry). Exact source URLs, pinned registry revision, and checksums are recorded in [artwork provenance](../src/assets/providers/sources.json).

## component integration

see [Fluid Functionalism](fluid-functionalism.md) for registry integration, provenance, and compatibility patches.
