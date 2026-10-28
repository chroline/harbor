# interface reference

[← Harbor](../README.md)

## foundation

a local desktop home for coding agents. Tauri 2, React 19, strict TypeScript, shadcn/ui, SQLite, ACP v1, native PTYs, and Worktrunk. the dark and light themes use neutral gray surfaces and text.

## native window surfaces

the sidebar sits outside the rounded main-content frame, over the original active macOS sidebar vibrancy. sidebar, titlebar, and outer gutters share Codex's 70% surface tint (#ededed in light mode, #212121 in dark mode). the main frame retains its original color and 84% light / 72% dark surface opacity. the native blur material is shared across the whole window. reduced transparency supplies an opaque chrome background. there is no grain texture. browser checks verify the CSS layers; native desktop screenshots verify the shared chrome after rebuilding.

macOS traffic lights are aligned within the 48px titlebar in both main and detached windows. native layout and appearance changes reapply their spacing; fullscreen keeps system placement.

## skyline backgrounds

Settings → Appearance selects San Francisco, Los Angeles, or New York City and either automatic lighting or a fixed dawn, day, sunset, or night image. Automatic lighting follows the local clock and refreshes each minute and on focus. Light mode shows dawn or day; dark mode shows sunset or night. Fixed choices are limited to the active theme, and a saved choice from the other theme uses its corresponding appearance. The decorative image persists across new-task and chat views; chat uses a blurred, subdued version. The composer and its menus follow the artwork's palette—light for dawn and day, dark for sunset and night—without changing the saved application theme.

The new-task background uses Woven light at 40% light intensity and 0.5× motion speed. Fixed circular dots range from 20% to 70% of full size over a 12px-blurred copy of the artwork at 20% opacity, using the same centered crop. One warm light pool has twice the original falloff radius without increased peak brightness. It smoothly follows the cursor and stays there while the cursor remains inside the frame, returning to its autonomous path only when the cursor leaves. Focusing the composer fades out the pool’s light and tint while all dots transition together to 20% size over 450 ms; the settled background then stops repainting. Leaving the composer restores the pool and size variation. Hidden, offscreen, or inactive scenes also pause; reduced motion applies focus changes immediately without animation. Dawn and Day use light palettes; Sunset and Night use dark palettes. Chat uses a solid background.

Artwork and generation prompts are bundled in [San Francisco](../src/assets/artwork/sf/README.md), [Los Angeles](../src/assets/artwork/la/README.md), and [New York City](../src/assets/artwork/nyc/README.md).

## conversations and controls

The sidebar shows working, waiting-for-input, and unseen-completion states, including a summary on collapsed workspaces. Opening a chat clears its unseen marker. Long user prompts expand in place, image attachments use thumbnails, and streaming prose fades in without remounting completed text or code controls. Sticky prompts retain a background aligned with the chat scene.

Enter sends a prompt; Shift+Enter adds a line. Model, effort, mode, workspace, and worktree menus share compact surfaces above the composer. Connection failures retain the draft and offer executable configuration. Provider checks distinguish missing executables, sign-in requirements, incompatible protocols, timeouts, and other failures.

Plan approvals use a saved review card and a full plan sheet. Implement plan and Keep planning preserve the provider's original option IDs; additional provider options remain available separately. Answered or interrupted cards stay readable in history. See [plan review behavior](plan-sheet.md).

## provider artwork

The Claude Code, OpenAI Codex, and Grok Build icons are bundled SVG brand marks from the [ACP registry](https://github.com/agentclientprotocol/registry). Exact source URLs, pinned registry revision, and checksums are recorded in [artwork provenance](../src/assets/providers/sources.json).

## component integration

see [Fluid Functionalism](fluid-functionalism.md) for registry integration, provenance, and compatibility patches.
