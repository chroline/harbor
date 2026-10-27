# Harbor UI review

Completed 2026-10-22. Scope: the existing desktop web interface, preserving its neutral Fluid controls and skyline. Native minimum is 900×620; inspected at 1380×900, 1100×720, and 900×620 in light and dark themes. Browser IPC fixtures use synthetic data and do not verify native providers or macOS behavior. Pre-existing uncommitted work was preserved.

## Design rules

- Keep the existing type scale and compact 28px composer controls.
- Align page headings and section content; use a 32px page introduction and 24px section rhythm.
- Settings use a consistent trailing control column, horizontal theme choices, and readable descriptions.
- Form columns share field baselines; helper text belongs below its field. Pending and failed operations remain visible in the form.
- Preserve the skyline and bottom composer composition, with intentional bottom clearance.
- Keep branch identity prominent and paths secondary; omit redundant per-row labels.

## Findings

| ID / priority | Observation and effect | Implemented remedy | Status / evidence |
| --- | --- | --- | --- |
| UI-01 / substantial | At 900×620 Agentation covers Start/Send and intercepts pointer input. | Reserve composer clearance in development while the toolbar is mounted. | Verified: actual Start task and Send message clicks; `final-chat-dark-compact.png`. |
| UI-02 / polish | Theme choices stack to 108px; selects and theme controls have mismatched widths; oversized introduction pushes content below the fold. | Horizontal equal theme choices; consistent 288px controls, narrower page measure, 24px section rhythm and responsive stacking. | Verified: `final-settings-{light,dark}-{1380,1100,900}.png`. |
| UI-03 / polish | Provider fields exceed grid tracks; helper text above Arguments misaligns Native CLI. | Shrinkable equal columns, full-width fields, helper below textarea; responsive one-column layout. | Verified at minimum desktop width: `final-provider-{pending,error,check}.png`; no horizontal overflow. |
| UI-04 / usability | Blank executable/name accepted; global errors detach from form, busy actions indistinguishable, no explicit Cancel. | Validate trimmed required values, separate pending labels, duplicate-submit guard, local error retaining draft, Cancel. Rename action to “Save and check” to reflect its write. | Verified: pending/failure/retry browser interactions and component tests; screenshots above. |
| UI-05 / polish | Worktree rows repeat “Worktree path”; branch muted; long paths crowd neighboring columns. | Hidden accessible copy label, branch emphasis, stable table columns, slash-aware wrapping. | Verified: `final-worktrees-light-compact.png`; full long paths and ownership visible. |
| UI-06 / polish | Home composer ends 14px from frame bottom despite larger side gutters. | 24px production bottom inset. | Verified: `final-production-home-900.png` and light/dark home captures. |
| UI-07 / usability | Worktree loading/failure looks like a valid empty list; failed refresh can obscure useful context. | Distinct initial loading and inline error states; retain previous rows on refresh failure; ignore stale results. | Verified: `final-worktrees-loading.png`, `final-worktrees-error.png`; loading/error/empty/refresh component tests. |
| UI-08 / accessibility | Light secondary text measured below 4.5:1 (4.23 on chrome, 4.42 on content); selected dark search metadata measured 4.17:1. | Darken light muted foreground to #666; use foreground text for selected search descriptions. | Verified with rendered contrast scans on settings both themes, provider states, chat and search. |
| UI-09 / usability | Search titles without descriptions restricted to half the row; empty status nested in listbox violates its child-role requirements. | Allow full row width when metadata absent; render empty status alongside the listbox. | Verified: `final-search-results.png`, `final-search-empty.png`; keyboard filtering regression test and accessibility scan. |
| UI-10 / substantial | Model picker opens below the bottom composer into only 64px of available height, hiding options. | Prefer opening above the composer while retaining collision handling. | Verified at 900×620: all model rows visible and selecting GPT-6 Astra updates trigger; `final-model-menu.png`. |
| UI-11 / substantial | Follow-up: composer pickers use three different visual systems—effort has custom colors/pill shape, model has custom surface/density, mode and workspace use Fluid. Widths range from 180px to 410px. | Shared `ComposerPickerContent` / `ComposerPickerSurface`: 320px menus, same Fluid elevation/shadow/radius, compact type and rows, top/start placement. Effort now uses Fluid Button, Dropdown and MenuItem, with the hints retained. Model/agent rows use matching density and neutral checks. | Verified: all five picker surfaces compared in both themes at 900×620; expanded model/agent/worktree panes, empty search, keyboard effort selection, mode selection and focus return; 1380×900 check. `final-pickers-*` supersede the earlier picker captures. |
| A11Y-01 / follow-up | Existing workspace dropdown places its searchbox inside `role=menu`, which axe flags as an invalid child. | Needs a separate semantic restructuring of the shared searchable Dropdown (search control outside the menu). Visual changes preserve the current search/navigation behavior. | Open; recorded in `screenshots/ui-craft/picker-checks.json`. No other violations reported in the 17 sampled picker states. |
| QA-01 / harness | Missing editor mock generates a false error; worktrees repeat identical paths across workspaces; transparent browser canvas misleads dark contrast scans. | Add explicit fixture responses, workspace-specific paths, deterministic pause/failure controls, and browser-only Canvas background. | Verified in browser regression; native window transparency unchanged. |

## Tab overflow follow-up (2026-10-26)

- UI-12 / polish: the task tab strip clips abruptly at the right edge (user screenshot). Added a transparent 3rem mask that shrinks with the remaining horizontal overflow and clears when the tabs fit. The adjacent add button stays outside the mask.
- Browser measurements verified start, middle, 12px from the end, and end (0px remaining), plus resize updates. Build and 32 chat/tab tests passed. Screenshot capture repeatedly timed out in Ego Lite, so final visual inspection and native macOS verification remain open.

## Archive alignment follow-up (2026-10-26)

- UI-13 / substantial: inline SVG children of the shared Button label rendered as blocks, stacking spinners above text. Reproduced with the pending archive action: icon center y=444.65, text center y=461.40, inside a 36px button. Make the label a centered flex row with the inherited gap; this also covers standalone-window actions and compound tab labels. Verified: pending archive button/icon centers both y=454.40; text center y=454.15. Viewed `final-archive-alignment.png` at 1280×720.
- UI-14 / polish: the archive explanation icon was aligned to the top of its line box, and the close button sat above the title. Align the note icon to the first text line, align the close control to the heading, and reserve heading space for long chat names. Verified: note icon and first-line centers differ by less than 0.01px; close control visually aligns with the heading.
- Regression: visually inspected the compact project dialog and dense worktree controls in dark mode (`final-alignment-project.png`, `final-alignment-worktrees.png`). All 40 tests across home/task, Fluid controls, project dialog and worktrees passed; production build and `git diff --check` passed. Existing bundle-size advisory remains.
- Reproduction: `/tests/ui.html?showcase&archive-alignment` supplies the screenshot's title and owned-worktree state and pauses the fixture's archive operation. Right-click Explore OliverSpec, select Archive conversation, then Archive and delete. No real conversation or files are changed.
- Ego screenshot capture failed; final visual evidence was captured and viewed with the in-app browser. Native desktop rendering was not verified in this follow-up.

## Pixel intensity focus (2026-10-26)

- UI-15 / requested visual enhancement: fine background pixels brighten around one broad cursor-following light, with a smooth radial falloff. The latest revision replaces autonomous shuffling and multiple concentrated hotspots. Pixels retain their positions within the artwork. Target pixel size is 2px, bounded to 750×500 samples; the inspected 1380×900 view samples at 506×424. Status: verified in the browser fixture.
- Added image-only perspective tilt inspired by [apple-tv-card](https://github.com/marcreichel/apple-tv-card), with up to 4 degrees on each axis. The image and pixel layer share the transform. The composer, sidebar, and frame keep identical bounds and no transform. Leaving the scene eases the light and tilt back to center; opening a chat clears the tilt. Reduced motion keeps the image static.
- Viewed `screenshots/pixel-scene/final-cursor-tilt-{top-left,bottom-right}.png` at 1474×715, `final-cursor-tilt-compact.png` at 900×620, and `final-cursor-tilt-day.png` at 1380×900. These supersede the earlier focus and scattered-sparkle captures. `cursor-tilt-checks.json` records layer alignment, stable UI geometry, four-corner image coverage, pointer-leave reset, reduced motion, and chat cleanup. The composer remained usable to start a simulated conversation.
- Production build, 89 skyline/home-task tests, and scoped whitespace checks passed. Pixel painting is capped at 24 fps while the transform follows display refresh; stationary pointers, inactive scenes, and hidden documents do not continuously repaint. The existing bundle-size advisory remains. Native macOS rendering was not checked.

## Individual sparkles restored (2026-10-26)

- Supersedes UI-15's cursor-following light and perspective tilt at the user's request. Individual pixels now brighten and fade independently on staggered cycles, retaining the fine 2px sampling and fixed artwork positions.
- Browser verification: sparse pixel changes without pointer input, unchanged image transform after pointer movement, static reduced-motion rendering, no painting while hidden, and an inactive overlay in chat. Viewed `screenshots/pixel-scene/restored-sparkles-{night,day}.png`.
- All 89 skyline/home tests and the production build passed. The existing bundle-size advisory remains. This pass used the browser IPC fixture; packaged native rendering was not rechecked.

## Background design lab (2026-10-26)

- UI-LAB-01 / exploration: sequential changes to a single background did not give the user a useful comparison. Added a separate development lab at `/labs/backgrounds.html`, showing six distinct treatments of the same bundled skyline: Light tide, Woven light, Liquid glass, Contour field, Dither bloom, and Chromatic echo. Selected direction: Woven light over aligned blurred artwork, at 40% intensity and 0.5× motion speed; these are now its saved defaults.
- The lab shares city and lighting controls across studies, opens a larger preview with an editable sample composer, and provides per-study intensity/speed controls and a browser-local shortlist. Dawn and Day use light palettes throughout the lab and every preview composer; Sunset and Night use dark palettes. Contour field and Dither bloom also adapt their canvas background/ink colors, preserving their animation geometry. Woven light draws sharp dots on a transparent canvas over a separately blurred copy of the selected artwork; the blur never affects the dots or composer. The selected Woven light treatment is now integrated into the new-task UI; lab controls remain independent preview adjustments.
- Verified the rendered three-column comparison at 1474px and two-column comparison at 900px, without horizontal overflow. Viewed `screenshots/design-lab/comparison-final.png`, `comparison-compact.png`, `dither-detail.png`, and `contour-artwork.png`.
- Browser interactions passed for full-size exploration, editable sample prompt, intensity, speed, city, lighting, shortlist selection, composer visibility, pause, reduced motion, and Escape focus return. The comparison page's scoped WCAG A/AA scan reported no violations. TypeScript, the production app build, and an isolated lab bundle build passed; the lab remains excluded from the production app bundle.
- User direction: Light tide and Woven light are preferred. Woven light uses 400 columns of fixed circular dots. Warm and cool pools follow Light tide's paths; each dot's radius decreases linearly with distance from the nearest pool center, with no independent pulse phases. Intensity controls the size range while keeping the maximum fixed: 0% gives all full-size dots, 50% gives half to full size, and 100% gives near-zero to full size. Eight raster pixels per cell preserve circular edges; exact area coverage handles subpixel dots without the browser's arc-size bands. One-off checks verified all 60,000 dots at 0/25/50/75/100% intensity, including proportional radii and positive minima. TypeScript and whitespace checks pass. Verified both endpoints in the live preview; saved `screenshots/design-lab/woven-intensity-range.png`.

## Woven light in the new-task UI (2026-10-27)

- Replaces the independent sparkles with the accepted Woven light renderer at 40% intensity and 0.5× speed. The product and lab share `src/lib/woven-light.ts`, including the fixed 400-column circular grid, proportional distance falloff, and moving warm/cool pools.
- Sharp dots sit over a 12px-blurred image with identical centered cover crops and no independent scaling. The blurred image is at 20% opacity in both the new-task UI and lab; the dots remain at full opacity. Dawn/Day retain light composer palettes; Sunset/Night retain dark palettes. Chat keeps its subdued blur and does not animate dots.
- Dots render in one GPU draw with a Canvas fallback, removing the per-dot Canvas calls that delayed input at full window sizes. The renderer filters to display resolution and releases GPU resources on cleanup. Actual app navigation to Settings and back verified inactive cleanup and responsive interaction.
- Lifecycle checks cover half-speed timing, centered image sampling, hidden/inactive cleanup, reduced-motion handling, and the accepted dot-size range. All 93 focused tests and the production build passed (existing bundle-size advisory only).
- Browser inspection of the actual app verified the new-task treatment and identical 1016×668 image/canvas bounds at a 1280×720 viewport. The deterministic fixture at `/tests/ui.html?skyline=day` verified the light scene and composer; captured `screenshots/design-lab/woven-production-day.png`. The final actual app preview is `screenshots/design-lab/woven-production.png`. Native packaged rendering was not rechecked.

### Animation efficiency

- Removed the 24 fps paint throttle while preserving elapsed-time-based 0.5× pool motion. The old renderer measured 21.6 fps on a 120 Hz browser; the optimized actual new-task page measured 120 fps over 10 seconds (1201 paints, 8.3 ms median / 9.8 ms p95 interval) at 1280×720, DPR 2.
- Preserved the 400-column grid and all GPU dot-size, falloff, color, and pool formulas. Sampling uses a separate temporary canvas so the animated canvas is never read back. High-quality filtering now draws directly into the display-resolution canvas, removing an intermediate canvas, an enlargement, and per-frame layout reads. At the measured size, the animated 2D backing surface shrank from 3200×2104 to 2032×1336. The blurred image remains at 20% opacity.
- Frozen night/day comparisons at multiple pool positions retain the appearance, with slightly crisper dots from removing the extra resize. The original renderer is retained only as a browser-test fixture at `/tests/skyline-comparison.html`.
- All 95 focused tests and the production build pass (existing bundle-size advisory only), including every-refresh painting at 120 Hz, half-speed timing, Retina sizing with unchanged sampling, and avoiding pixel readback from the animation surface. The production output excludes the optional benchmark. Performance proof: `screenshots/design-lab/woven-120fps.png`. Native packaged WebKit FPS was not measured.

### Cursor and composer interaction

- Current treatment: one warm pool with twice the original falloff radius and unchanged peak light intensity. Dot sizes range from 20–70%; their fixed positions and circular shape remain unchanged. The lab shares these size and radius defaults.
- Pointer movement smoothly steers the pool. It stays at the cursor while the cursor remains in the frame, including when stationary, and eases back to its autonomous path only on frame exit. The original 0.5× autonomous motion speed remains.
- Focus within the composer fades the pool’s brightness and tint out and transitions all dots together to 20% size over 450 ms. Once settled, the renderer stops scheduling frames. Blur restores the effect; reduced motion changes focus state immediately with no animation.
- Browser inspection verified cursor tracking, persistence after the cursor stopped, the return to ambient motion on frame exit, and the focused scene with no light pool. Evidence: `screenshots/design-lab/woven-cursor-pool.png` and `screenshots/design-lab/woven-composer-focused.png`. All 103 focused tests and the production build pass; tests cover exact size endpoints, doubled falloff radius, focus tint removal, stationary-cursor persistence, frame exit, and animation cleanup.
- The final animated-page check measured 120 fps over 10 seconds (1201 paints; 8.3 ms median / 9.9 ms p95 interval, 1280×720 at DPR 2). A temporary local preview with hot reload disabled isolated the check from concurrent artwork updates. Proof: `screenshots/design-lab/woven-cursor-performance.png`. The temporary preview was closed afterward.

## Coverage matrix


| Surface / states | Final verification |
| --- | --- |
| Home: empty, populated composer, disabled send, skyline | Viewed light/dark screenshots at all three sizes; actual pointer reachability at minimum size; fixture task created. |
| Settings: theme, city, editor, switches | Viewed light/dark wide, intermediate and compact layouts; theme change and selected state; scoped accessibility scan. Native editor launch and notifications excluded. |
| Provider form: invalid, long executable, focus, pending, failure, retry, cancel | Browser interactions and screenshots at 900×620; component tests for validation, draft retention and retry. |
| Chat: completed response, code block, follow-up | Two fixture turns submitted by pointer; code blocks and sticky message context inspected; dark accessibility scan. Worker tab opened and viewed (`final-worker-tab.png`); no worker message sent. Reconnection was not verified: the fixture disconnect helper targeted the worker rather than the viewed parent. |
| Model/mode menus | Model list fully visible above composer, model selection updates trigger; mode selection verified. Effort and workspace menus opened and visually inspected (`final-effort-menu.png`, `final-workspace-menu.png`). |
| Project dialog | Light/dark screenshots at 900×620; initial focus, disabled empty submit, long name, repeated Tab containment, Escape and return focus. Creation cancelled. |
| Search | Results and no-results screenshots; title width, selected metadata, empty semantics, Escape and restored focus. |
| Worktrees | Populated rows, long paths, loading and failure screenshots; empty archives inspected; component tests cover refresh failure preserving rows. |
| Sidebar | Long names/ellipsis and selected rows visible across screenshot matrix; collapse toggled and expanded chat viewed (`final-chat-collapsed.png`). Native dragging and window transfer excluded. |
| Browser-only production preview | Built app opened at 900×620; skyline/composer composition and no development toolbar visually confirmed. No native IPC. |
| Native titlebar/vibrancy, OS dialogs, live provider execution, OS notifications | Not verified in this browser pass. |

## Checks and evidence

- `npm test`: 307 frontend tests across 42 files. One concurrent run exposed an intermittent existing worktree-picker focus/Enter failure; isolated rerun passed. The final full rerun passed all 307 tests.
- `cargo test --manifest-path src-tauri/Cargo.toml`: 86 passed, six opt-in live tests ignored.
- `npm run build`: passes; existing large-chunk advisory remains.
- `git diff --check`: passes.
- `tests/ui-polish-browser.mjs`: passed real-browser interaction checks with seven scoped axe WCAG A/AA scans (zero reported violations; `screenshots/ui-craft/browser-checks.json`). This is sampled accessibility evidence, not a complete compliance audit. Uses the synthetic fixture; does not touch real projects/providers.

Captures are in [screenshots/ui-craft](screenshots/ui-craft). Only **final-*** images are final evidence. **before-*** are baselines; **after-*** are intermediate/superseded, including transitional captures. Baseline `before-settings-dark.png` used the browser's actual 1474×715 window. Final captures use explicit viewport dimensions; reduced motion avoids presenting transition frames. Normal animation behavior was also observed during initial inspection.

Browser tabs were task-owned; fixture changes are in-memory only. No real projects, providers, credentials or conversations were created or modified. No deployment or commit was performed.

## Composer picker follow-up

The initial pass missed visual consistency across the composer pickers. The follow-up unifies model, effort, mode, workspace and worktree menus through shared Fluid surfaces. Visible content still determines height: explanatory effort rows and editable worktree fields retain their necessary space.

- `tests/composer-pickers-browser.mjs`: 17 inspected states, identical measured width/background/shadow/radius across the five menus in each theme, bounded menus, no horizontal overflow, keyboard effort and mode selection. Recorded workspace search semantics exception above; every other scoped axe result was clean.
- `npm test`: 307 tests passed in 42 files after these changes.
- `npm run build` and `git diff --check`: passed. Existing bundle-size advisory remains.
- Final follow-up evidence: `final-pickers-{dark,light}-{model,model-list,model-empty,agents,effort,mode,workspace,worktree,worktree-branch}.png` and `final-pickers-light-wide-model.png`.

## Plan review consistency — October 26, 2026

| ID / priority | Observation and effect | Remedy and acceptance | Status / evidence |
| --- | --- | --- | --- |
| UI-PLAN-01 / substantial | Codex shows plan prose above a permission box; Claude and Grok put it inside. Approval labels, button count, and emphasis differ. | One Review plan card, identical typography and Implement plan / Keep planning actions; explicit provider-specific options in a secondary menu. Preserve original option IDs and permission policies, deduplicate only exact pending-plan prose. | Verified: 354 frontend tests and production/signed macOS builds pass. Browser interactions cover all three contracts, failure recovery, pending disabled controls, exact option IDs, and compact menus. `final-plan-review-{codex,claude,grok}.png` and `final-plan-review-compact-options.png`. User's screenshots and saved request payloads establish the baseline. |

Plan review captures were visually inspected in the dark theme at 1380×900 and 900×620. The attempted light-theme fixture check reverted to dark on navigation, so light-theme visual verification is not claimed. The overflow menu retains complete provider labels (including context clearing and bypass permissions). Only the one-shot manual execution option is promoted to the primary action. Browser checks use realistic provider payload fixtures, not live execution. The rebuilt regular app is ready for the next launch; the running app was left open with its pending approvals.

## Plan sheet runtime reconstruction — October 26, 2026

| ID / priority | Observation and effect | Remedy and acceptance | Status / evidence |
| --- | --- | --- | --- |
| UI-PLAN-02 / substantial | User requests Kobra's actual sheet component mechanics instead of inline approval cards or a visual approximation. | Trace the delivered runtime and CSS; port its Base UI Dialog composition, defaults, logical sides, geometry, shadows, backdrop, motion and dismissal. Use one review sheet for all three providers. | Implemented. [Runtime trace and contract](docs/plan-sheet.md). Browser checks passed across all three provider fixtures. `final-plan-sheet-{codex,claude,grok}.png`, `final-plan-sheet-options.png`, `final-plan-sheet-compact.png`, `final-plan-sheet-light.png`. Supersedes UI-PLAN-01's inline presentation. |

- Browser validation: 440px width / 12px inset / 16px radius; initial heading focus, repeated Tab containment, Escape/close/outside dismissal without submitting, focus return, reopen, all provider approval/rejection IDs, Grok's alternate exit, explicit Claude options, compact menu bounded within the sheet, long-plan scrolling with fixed footer, failed answer/retry, disabled pending actions, reduced motion. A nested Radix-menu/Base-UI Escape race was reproduced and fixed by checking the originating event as well as menu state.
- Visual inspection: dark provider sheets at 1380×900; long plan/options at 900×620; light sheet at 1380×900. Light tokens were explicitly applied to the fixture root for the last capture; this verifies sheet rendering, not settings persistence or the surrounding scene theme.
- Final frontend run: **355 passed in 48 files**, `npm test -- --maxWorkers=2`. The initial default-concurrency run had three picker timing failures; those 13 tests passed in isolation, and two full runs with bounded concurrency passed. No unrelated picker code was changed.
- Browser tests use simulated IPC and realistic provider payloads. No live provider execution or packaged-app interaction is claimed for this presentation-only follow-up. Rust behavior was unchanged. Existing pending approvals in the running regular app were left untouched.
- Production build and signed macOS bundle build passed; `desktop:verify-signing` passed. The existing large-chunk advisory remains; notarization was skipped because notarization credentials are not configured. The rebuilt app is ready for the next launch.

## Plan card with fading preview — October 26, 2026

| ID / priority | Observation and effect | Remedy and acceptance | Status / evidence |
| --- | --- | --- | --- |
| UI-PLAN-03 / substantial | User requests the actual Kobra PlanCard composition, replacing to-dos with a fading plan preview; then requests full message-column width and matching chat surfaces. | Recover the public runtime function and CSS. Port its header/inset/footer; override width, palette, corner and edge tokens to match messages/composer. Keep full plan in the existing sheet and original provider approval IDs. | Verified through provider fixtures and rendered inspection. Runtime trace in `docs/plan-sheet.md`; screenshots `final-plan-card-{codex,claude,grok,compact,light}.png`. |

- The runtime trace identifies module `JD` → `iO` and records the original 512px width cap, 20px padding, 28px icon slot, inset and footer composition. Full width and Harbor's neutral surfaces are user-requested overrides. No to-do rows, synthetic task counts, countdown, or global approval shortcut were added.
- Dark captures at 1380×900 for all three providers; compact long-title/long-preview capture at 900×620; light card at 900×620. Viewed final captures. The light capture explicitly changes the fixture's skyline appearance as well as the selected app theme, because skyline appearance has its own dark/light class. This verifies card rendering, not time-based skyline selection.
- Browser checks pass: card width equals message width; matching message background/shadow/radius; preview bounded to three lines with a fade after two; complete plan through keyboard-opened sheet; exact safe inline approval IDs for all three providers; disabled pending actions; inline failure/retry and error continuity into the sheet; long titles/content without horizontal overflow. Existing sheet regression script also passes across all three providers, including nested menu Escape behavior.
- Frontend suite: **359 passed in 48 files**, `npm test -- --maxWorkers=2`. No Rust behavior changed. These are realistic provider payload fixtures with simulated IPC, not live provider execution or packaged-app interaction checks.
- Production build, signed macOS app build, and signature verification passed. Restarted the regular Harbor app with the rebuilt bundle. App process startup was confirmed; native UI interaction is not claimed in this browser verification. Existing large-chunk advisory and unavailable notarization credentials remain.

## Plan approval lifetime regression — October 26, 2026

| ID / priority | Observation and effect | Remedy and acceptance | Status / evidence |
| --- | --- | --- | --- |
| UI-PLAN-04 / substantial | Clicking Implement removed the pending-request card and disabled prose deduplication, exposing the plan as ordinary Markdown. Previous browser checks incorrectly expected all plan cards to disappear after an answer. | Reconstruct plans as durable transcript cards from saved request/answer events. Preserve the card after any response, show the recorded outcome, remove response controls and keep the full sheet viewable. Preserve later execution text and reconstruct cards on replay. | Verified through reducer/component tests and browser lifecycle checks for Claude/Codex/Grok. `final-plan-approved-{codex,claude,grok}.png`, `final-plan-approved-replayed.png`. |

- New lifecycle regressions failed before the fix for all three providers and passed afterward. Tests cover answered cards, exact prose replacement, separate post-approval streams, native history reset/replay, reused IDs and identical plans in different turns, interrupted/cancelled reviews, worker ownership and view-only historical controls.
- Browser verification approves a plan for each provider, observes the card and approved status after resolution, opens its sheet without response actions, adds implementation output, then reloads the frontend and restores the same fixture event log through the mock backend. Fresh StoreProvider/get_events replay retains the cards and outcomes; no raw assistant-plan heading returns. This is simulated IPC/replay, not a new live-provider acceptance run.
- Existing pending-approval sheet checks also pass: focus containment/return, dismissal without submission, exact response IDs, nested provider options, long content, failed response/retry, pending disabled actions and reduced motion. Browser waits now allow the focus guard's redirect to settle after Tab.
- Frontend suite: **366 passed in 48 files**. Rust suite: **92 passed, 6 opt-in live tests ignored**. TypeScript check and `git diff --check` pass. Final approval/replay screenshots were viewed in the dark theme at 1380×900. No working files or native CLI history were modified by the tests.
- Production and signed macOS app builds passed; signature verification passed. Restarted the rebuilt regular app and inspected the actual existing **Dummy plan presentation** chat through native accessibility and a rendered screenshot. The saved **Dummy Plan: Organize a Team Lunch** appears as a card with **Response recorded** (its old answer event predates outcome recording), and the subsequent implementation messages remain separate. Opened its full sheet: complete plan text, legacy response status, and Close; no approval controls. Closed the sheet and verified focus returned to its View plan trigger. No live prompt or approval was submitted during this native check. The native screenshot was viewed in the tool output rather than saved in the browser evidence folder.

## Commit preparation verification — October 26, 2026

All outstanding changes were grouped by concern, with documentation updated for the supported provider contracts, saved drafts and shell tabs, lazy conversation restoration, plan review lifetime, composer controls, and skyline settings and interaction.

- Frontend: **408 tests passed in 49 files**, using `NODE_OPTIONS=--no-experimental-webstorage npm test -- --maxWorkers=2` on Node 24. The environment flag avoids Node's global Web Storage implementation replacing the jsdom test storage.
- Native: **100 Rust tests and one compile-fail doctest passed** with `cargo test --manifest-path src-tauri/Cargo.toml`; six opt-in live tests remained ignored.
- The title smoke test now uses a supported provider ID from `HARBOR_TITLE_PROVIDER` (default `codex`). Its fixture path was separately verified against a local mock executable; this was not a live-provider run.
- Production TypeScript and Vite build passed. The existing large-chunk advisory remains. Scoped staged checks also verified the adapter/backend, provider UI, draft/plan, and lazy-restoration commit boundaries.
- Browser and native screenshots above are evidence from their dated verification passes. This commit-preparation pass reran automated tests and the production build, without repeating live-provider or packaged-app UI checks.
