# Fluid Functionalism integration

Harbor vendors the Radix registry components from [Fluid Functionalism](https://www.fluidfunctionalism.com/). `components.json` registers `@fluid` at `https://www.fluidfunctionalism.com/r/{name}.json`; `package-lock.json` locks dependency resolutions. Registry source was installed October 8, 2026. Upstream main observed during integration: `bf9ece46728035afef54feef6ac67e1f413cc0b0`. The registry endpoint itself is not commit-versioned; the vendored source and lockfile are the reproducible implementation.

## Coverage

| Area                            | Registry implementation                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Navigation                      | Sidebar, CommandMenu, Dropdown, MenuItem, Tooltip                                                     |
| Home and composers              | InputMessage, Dialog, Button, Card                                                                    |
| Launch and settings             | Combobox, Select, InputGroup, RadioGroup, Switch, InputCopy                                           |
| Questions and permissions       | Questionnaire with Fluid CheckboxGroup/RadioGroup, Card, Button                                       |
| Conversations                   | shadcn Message, Bubble, Trace, Code Block, Message Scroller, Marker, Questionnaire with Fluid styling |
| Errors and ownership            | Banner, Badge                                                                                         |
| Worktrees and archives          | Table, Tabs, Card, InputCopy                                                                          |
| Conversation and diff modes     | TabsSubtle                                                                                            |
| Review files and child sessions | Shared useFluidHover and FluidHoverHighlight                                                          |
| Foundation                      | Spring tokens, surface and size providers, registry typography CSS, variable-font weight helpers      |

CarouselDots and ColorPicker are intentionally excluded. Reasoning effort uses a compact menu adapted from Kokonut UI's AI Prompt control, composed with Fluid Button, Dropdown, and MenuItem. It sits beside the model selector, shows the current level with rising bars, and keeps provider-supplied values and descriptions. Model, effort, mode, workspace, and worktree pickers share a 320px compact surface and open above the composer with collision handling. The vendored Slider remains available for other controls. Harbor enables attachment thumbnails through InputMessage; suggestions and queued messages remain unused.

## Theme and behavior

Inter Variable is bundled locally with weight and optical-size axes; its SIL license is included in `src/assets/fonts/LICENSE.txt`. Source: https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/InterVariable.woff2. Fluid controls use the registry type scale: default body 13px/20px and compact body 12px/18px, with 36px and 28px control heights respectively. Code and terminals use monospace. The theme restoration below supersedes the earlier Harbor typography overrides.

Harbor owns sidebar visibility with persistence and the registry shortcut disabled; Cmd+B remains the application shortcut. `MotionConfig reducedMotion="user"` wraps the app. Surfaces stay neutral in dark and light themes. Application layout and specialized code styling remain in `styles.css`. Window chrome now references Fluid surface tokens; the custom translucent palette was removed.

## Narrow source adaptations

- **Button:** center the icon-only wrapper with inline flex so nested SVGs do not inherit an inline baseline gap. Text buttons use the component’s icon props to preserve label alignment.

- **CommandMenu:** exports its existing context hook to bridge Lexical keyboard input to the native palette. Short labels retain their width while descriptions truncate, with long labels capped at half the row. The composer uses the compact CommandMenu rows, ScrollArea fades, rounded shape tokens, and Elevated surface without custom row or shell styling.

- **InputMessage:** an optional `editor` slot lets Harbor render its Lexical command/skill editor inside the existing Fluid frame; container clicks focus either editor implementation. Optional `submitOn` and `sendControl` preserve Enter/Shift+Enter chat shortcuts, Cmd+Enter setup, IME composition, Connect → Start task, and Stop. Handled submit keys stop propagation to prevent duplicate session creation.
- **Dialog:** controlled dialogs remember and restore the previously focused element; the close button has an explicit accessible name. Spring motion is retained.
- **InputGroup:** compose consumer focus/blur handlers with internal state; hidden field labels have one accessible text copy.
- **Switch:** optional hidden accessible label; imperative thumb motion respects reduced motion.
- **RadioGroup:** hide the internal Radix item with `display:none`; the existing focusable row remains the single accessible radio. This avoids nested interactive controls without changing selection or keyboard handling.
- **CheckboxGroup:** the decorative Radix checkbox and its generated input are wrapped in an inert, aria-hidden span. The Fluid row remains the accessible control and receives square clicks; this avoids nested interactive controls in Questionnaire forms.
- **SidebarMenu:** decorative shared hover overlays live inside a presentational list item, keeping list markup valid.
- **ThinkingIndicator:** optional factual label replaces rotating decorative verbs when Harbor supplies agent status.
- **ThinkingSteps:** the October 13 registry snapshot remains in [`vendor/thinking-steps.json`](vendor/thinking-steps.json) for provenance. Chat activity and plans now use Trace, as described below.
- **ScrollArea:** other screens retain the Fluid viewport adaptations; chat scrolling now uses Message Scroller.
- **TabsSubtle:** declare the already-forwarded `disabled` item prop for capability-gated terminal mode.
- **Card:** native anchor replaces the registry's Next.js Link dependency in this Vite/Tauri app.

Project creation and editing retain a centered icon and name with a workspace row and footer actions, composed from vendored Dialog, InputGroup, Dropdown, MenuItem, and Button. The icon button opens Fluid submenus for icon and color choices. Use layout spacing and the name field’s typography tokens to preserve this arrangement; retain the registry surfaces, focus behavior, and loading states rather than creating custom controls.

Harbor-specific composition lives in `components/fluid.tsx` and screen components. No Rust commands, ACP types, or persistence schemas change.

## Functional exceptions

- Markdown, Highlight.js/lowlight syntax highlighting, the review pane’s unified/split diffs, and xterm remain specialized implementations. Chat fences and tool output share the new Code Block composition; surrounding controls use Fluid.
- Provider argument editing uses a multiline textarea inside InputGroup because InputField is single-line.
- Review and child-session action rows use shared Fluid hover behavior with native buttons to retain arbitrary content and hierarchical indentation.
- Sidebar slot buttons are native elements composed inside Fluid SidebarMenu components, not independent stock controls.
- Confirmation content and provider permission actions retain explicit supported options and original request/child identifiers. Questionnaire composes the supported clarification shapes with Fluid choices while retaining provider constraints.

## Verification

`npm test` covers protocol normalization plus composer shortcuts, duplicate-submit prevention, IME composition, pending plans, disabled terminal mode, disclosure state, field events, permission identifiers, single-choice answers, and multi-choice answers.

The deterministic `tests/ui.html` fixture exercises the actual React application through simulated IPC. Ego-browser checks included dark/light themes, 1380×900 and 900×620 layouts, keyboard search and focus restoration, Cmd+B, model-dependent effort options, child transcripts, approvals, cancellation cleanup, split review, portal menus, and a 240-message transcript (200 rendered-message bound). Drafts survive navigation. Narrow review uses the content frame instead of compressing both columns. These UI fixtures do not certify additional provider versions or native terminal handoffs.

## October 14, 2026: AI Elements chat integration

The chat now composes the actual Radix `radix-rhea` registry implementations of Trace, Code Block, Message, Bubble, Message Scroller, Marker, Questionnaire, and Collapsible. Original registry responses and their SHA-256 digests are saved in [`vendor/ai-elements`](vendor/ai-elements/provenance.json). `@shadcn/react` supplies the Message Scroller and Questionnaire headless behavior; `package-lock.json` records the installed version. AI Elements is copied composition code, with no AI SDK transport or credential dependency.

Imports resolve to Harbor’s `cn` helper and existing Fluid Button. Registry icon placeholders become Lucide icons. Theme overrides use the existing neutral surfaces, radius tokens, focus rings, and Inter font. Messages retain 14px/22px prose and 12px/18px code. User messages explicitly use end alignment and an automatic leading margin, placing bubbles on the right; assistant and system messages use start alignment. Trace disclosures use `spring.moderate`; shimmer, scrolling, and disclosures respect reduced motion. Existing Fluid registry components remain available to other screens.

- **Messages and activity:** Message/Bubble replace the chat’s ChatMessage wrapper. Trace replaces ThinkingSteps for adjacent tools/reasoning and provider plans, retaining chronological order, stable IDs, recorded durations, and explicit disclosure choices. Running work opens, completed work collapses, and failed/interrupted work opens by default. Pending plan entries remain visible. Worker Trace links select the existing child conversation and show the recorded worker status.
- **Code:** `shared.CodeBlock({ text, language })` remains compatible and additionally accepts `title`, `compact`, `lineNumbers`, and `diff: { before, after }`. Markdown fences use the same composition. Highlight.js via lowlight retains Harbor’s syntax classes without rendering nested Markdown. TSX/JSX aliases are supported; unknown languages fall back to text. Copy returns the original source (or the diff’s resulting file), including blank lines. Tool file diffs are displayed only with real old/new strings; bounded diff computation falls back to the resulting file. Logs and terminal output use compact blocks without line numbers. Existing review-pane code also receives this shared renderer.
- **Scrolling:** Message Scroller owns following output and the “Scroll to latest” control. Rows have stable IDs. Automatic turn anchoring applies to the latest newly submitted user turn; replayed history is excluded to avoid the headless scroller mistaking retained rows for fresh anchors when the 200-message buffer evicts older rows. Opening position is fixed for each keyed conversation. Parent positions continue using `save_session_ui`; child positions are held separately in memory. Exact in-memory zero is a saved top position, while the existing persisted zero keeps its historical “open at latest” meaning. New requests reveal themselves only while following output.
- **Clarifications:** Questionnaire owns steps and validation. Visible choices remain Fluid RadioGroup/CheckboxGroup rows; hidden, non-focusable Questionnaire choices mirror their values for headless form registration without duplicate accessible choices. Single-choice selections still advance immediately. Mixed/multiple-choice requests require explicit submission. Provider IDs, permission actions, plan approvals, retry handling, and parent/child routing are retained.
- **Composer:** The shared Fluid InputMessage, model/mode menus, draft handling, Enter/Shift+Enter submission, IME handling, and Stop behavior remain the prompt-input composition. Attachments and provider protocol changes are outside this integration.

Validation includes the transcript, code block, worker/plan, and request-routing unit tests plus `tests/ai-elements-browser.mjs`, run through ego-browser against `tests/ui.html`. The browser regression covers the 200-message bound, paused streaming, request routing, independent parent/worker positions, exact-top restoration, and scrolling back to latest. The fixture includes explicit child attachment and routed-answer simulation. These simulated checks do not certify native provider processes.

The integration was checked at 1380×900 in dark mode and 900×620 in light mode with reduced motion enabled. The narrow fixture retained 14px prose, 12px code, and no page overflow. Axe WCAG A/AA checks on the light chat fixture, including a multiple-choice request, reported no violations after adapting Trace error contrast and the decorative checkbox primitive. Native provider processes were not launched for these checks.


### Packaged macOS acceptance, October 14, 2026

Rebuilt and launched `src-tauri/target/release/bundle/macos/Harbor.app`, using the normal app database and existing provider login. A new freeform chat, “Native chat UI smoke test…”, used Codex with GPT-6 Luna to run `pwd` once and stream a TypeScript reply. The command completed through real ACP events, Trace displayed the tool, and the work section collapsed when the turn ended. The code block rendered syntax highlighting and line numbers. Copying and pasting into the unsent composer matched all 24 source lines exactly, without line numbers. The temporary draft was cleared. No project files were read or changed by the smoke-test prompt.

Native testing found that editing the composer reset a Markdown block’s Wrap setting. React Markdown’s inline component definitions were being recreated on each render. Its component map now lives at module scope; a regression test covers parent rerenders and streamed code updates. The frontend suite passes 143 tests, and the packaged app was rebuilt for the fix. After reopening that app, enabling Wrap and typing into the native composer preserved the enabled state; clearing the unsent draft also preserved it. The app was left open on the verified response.

An existing Pi conversation was also opened, its real tool disclosures expanded, and its saved worker selected through the new Trace link. The worker’s previously recorded parent relay reply remained visible. This was a history/navigation check, not a new Pi worker execution.

## Chat minimap

The chat includes a left-edge turn navigator adapted from [Vivid Layer Chat Minimap](https://www.vivid-layer.com/components/chat-minimap). It appears when the displayed parent or worker conversation has at least two user turns. Each stable message ID gets a marker with its prompt and a bounded assistant-response preview; reasoning, tool details, and other conversations are excluded. The cosine lens, hover cards, smooth jumps, and current-turn indicator follow the reference, with Harbor's neutral surfaces and reduced-motion preference. Arrow keys and Home/End move between markers, Enter jumps, and Escape dismisses the preview. Long rails scroll independently and keep the current marker visible while reading.

Reading-position measurement is separate from Message Scroller's automatic turn anchors, preserving history restoration and paused streaming. The original source, Community License, and third-party notices are preserved in `docs/vendor/vivid-layer/`; the upstream license permits integrated end products and restricts source redistribution. `tests/chat-minimap-browser.mjs` verifies the 200-message window, selected-turn jumps, previews, keyboard behavior, paused streaming, narrow light layout, and reduced motion. Run with `ego-browser nodejs < tests/chat-minimap-browser.mjs` while Vite is running.

## October 14, 2026: upstream sidebar composition

The sidebar now uses Fluid's Radix `SidebarTrigger`, `SidebarGroupAction`, and integrated `SidebarRail` along with the existing `SidebarContent`, groups, menus, nested chat rows, and footer. Harbor keeps its navigation structure and window chrome; the reference preset's Base UI flavor, inset layout, and header/footer menus were not adopted. Projects and Workspaces now enable `SidebarGroup collapsible`, matching the reference's section-level collapse in addition to the workspace-row nesting. Fluid owns section state, label toggles, chevrons, and measured-height transitions; Harbor does not implement a separate section accordion.

The current Radix [sidebar registry](https://www.fluidfunctionalism.com/r/sidebar.json) was compared with the vendored sidebar and its direct registry dependencies. The original response is saved in [`vendor/fluid-sidebar/sidebar.json`](vendor/fluid-sidebar/sidebar.json); [`provenance.json`](vendor/fluid-sidebar/provenance.json) records retrieval time, source hashes, dependency hashes, and sampled pre-change source differences. Surface context and the Fluid hover hook match upstream. Other retained dependencies include Harbor's existing motion imports, rem conversions, Tabler icon mapping, scroll-viewport hooks, button adaptations, and the shared size context. Application theme/type-scale overrides were subsequently removed as described below. Shared dependency source was not overwritten.

The built-in rail restores upstream's 160–360px limits, click collapse, drag collapse below the minimum plus its 56px threshold, and recovery if the pointer returns before release. The separate shell-wide resize-only handle, its custom props, keyboard resizing, reset behavior, and gutter-based sidebar padding are removed. New preferences start at 16rem (256px at Harbor's 16px root); existing `harbor.sidebar.v1` preferences retain visibility and clamp their width into the upstream range. Mobile still uses the existing 600px breakpoint and 18rem modal drawer; peek remains disabled.

The sidebar source retains these narrow adaptations:

- `SidebarProvider.onWidthChange` keeps the sidebar, titlebar, and local-storage preference synchronized. The titlebar track follows the sidebar width exactly throughout the full 160–360px range; collapsed/mobile chrome reserves 10rem. The sidebar glyph's visible left edge sits approximately 18px beyond the native green light, matching the red light's 18px window inset. The same 18px rhythm separates the divider from the last history glyph and the title. At track widths of 176px or less, the history pair becomes a compact Fluid History menu so navigation remains available within the 160px minimum. Browser preview lights use the native 14px diameter and 9px gaps. The browser regression measures the SVG's painted edges and checks the divider gaps and control fit while resizing.
- The titlebar divider renders another `SidebarRail` from the same provider. When a rail is outside the sidebar DOM, it starts from the provider's controlled width; resize limits, click collapse, drag-collapse recovery, pointer cancellation, and tooltip behavior remain shared with the integrated rail. The chrome centers its 8px hit area over the existing divider and extends it to meet the sidebar rail. Hovering either rail, or dragging, highlights both as one continuous line; the former gap is also draggable. It is available only on expanded desktop sidebars, and remains mounted during drag-collapse previews to preserve pointer capture and recovery. Unit coverage exercises both rail locations, and browser coverage drags the titlebar rail while checking sidebar, titlebar, and frame alignment.
- Workspace trees use a level-one `SidebarMenuButton` and measured-height `SidebarMenuSub` with `SidebarMenuSubItem`/`SidebarMenuSubButton` chat rows. The parent button pins its gutter and owns `group/parent-row`: its trailing 24px chevron slot rotates through 90° with `spring.fast`. Expanded rows reveal the chevron only on the parent button's hover/focus; child hover never reveals it. Existing independent workspace expansion and row context menus remain available.
- Closed sections and submenus mark their retained content `inert`, so clipped rows cannot receive Tab focus. This accessibility adaptation leaves Fluid's collapse motion and DOM retention intact.
- `SidebarProvider.shortcutLabel` supplies the platform's Cmd/Ctrl+B tooltip text without binding a bare key. `SidebarKeyboardShortcut` calls Fluid's `toggleSidebar()` for desktop collapse or mobile opening. Cookie persistence and upstream bare-key bindings remain disabled.
- Mobile drawer autofocus remembers its opening element and explicitly restores focus on dismissal. Fluid's sidebar trigger sits outside `Dialog.Root`, so Radix cannot restore it through its own `Dialog.Trigger` ref.
- Existing rem conversions, `framer-motion` imports, and the presentational list item around decorative menu overlays remain. The upstream rail additionally retains primary-button filtering, safe pointer-capture release, and capture-loss cleanup.

`sidebar-resize.test.tsx` covers integrated bounds, click/drag collapse and recovery, cancellation/capture loss, Cmd/Ctrl+B, independent mobile visibility, Escape dismissal, and focus restoration. `navigation.test.ts` covers the preference default and legacy-width clamping. `tests/sidebar-browser.mjs` runs the real React app against simulated IPC, including a fixture stress list of 45 additional conversations. It checks navigation and actions, nested keyboard focus, hover actions, long labels, scrolling/footer visibility, themes, reduced motion, minimum desktop dimensions and both sidebar widths, mobile dismissal/focus, and empty projects. It does not launch native provider processes.

Validation: all 161 tests across 22 files pass, along with the production TypeScript/Vite build and the browser regression. The browser resize helper checks that the topbar and sidebar edges match while the pointer is still held, including at 160px and 360px. Screenshots were inspected at 1380×900, 900×620, and 480×800. A sidebar WCAG A/AA scan reports no violations with a deterministic solid chrome backdrop; axe's default white-canvas compositing flags contrast for the existing transparent desktop chrome, whose native vibrancy backdrop is outside this simulated fixture.

## October 14, 2026: sidebar context menus

Project, workspace, and conversation rows now compose the actual shadcn `base-rhea` Context Menu on the installed Base UI primitives. The original [registry source](https://ui.shadcn.com/r/styles/base-rhea/context-menu.json), its hash, adaptation notes, and MIT license are saved in `docs/vendor/shadcn-context-menu/`. Imports use Harbor's `cn` helper and Tabler icons; menu surfaces retain the existing neutral colors, typography, and rounded tokens. Provider protocols are unchanged. The animation utility dependency is described below.

The row-end Edit, New task, and Archive controls are replaced by right-click, long-press, Shift+F10, and Context Menu key actions. Regular row clicks retain navigation and workspace expansion. The Projects section's Create project control remains a section action. Archive conversation still opens the existing confirmation, preserves selection of a different conversation, and calls the existing archive operation only after confirmation.

`SidebarRowMenu` composes directly onto each Fluid row through Base UI's `render` prop, preserving list markup and one focus target. Actions run after the menu closes, with focus first returned to the originating row; dialog focus and subsequent focus restoration therefore use a live row instead of an unmounted menu item. Context menus inside the mobile drawer portal into that drawer so Radix's focus/pointer scope remains intact. Escape dismisses a context menu before the drawer. Sidebar hover and arrow navigation pause while a root or nested row's context menu is open.

Context menus use the actual shadcn Base UI registry animation classes, backed by `tw-animate-css`. The popup grows from 95% to 100% on both axes using Base UI’s cursor-relative `--transform-origin`, with the upstream side-aware 8px slide and 100ms duration. The upstream 4px alignment offset is retained. This replaces the previous Fluid Dropdown Motion wrapper, which scaled only vertically around a fixed edge and did not reproduce the requested cursor-origin growth. Base UI observes the CSS animation on its Popup and keeps closing content mounted through the exit animation. Root and nested popups share this behavior; reduced motion disables animation. Pending row actions still run after close completion so dialog focus remains correct. The old Fluid Motion source snapshot is retained as historical comparison only.

Context menus inherit Fluid’s compact body tokens (12px/18px); there are no portal-local type overrides. Rows use Fluid’s compact 28px height, 14px icons, 4px gaps and 6px horizontal padding. The popup uses Fluid’s rounded container, 4px inset, and substrate-relative surface elevation with shadow level 3, matching Dropdown. The shadcn/Base UI context-menu behavior and 128px minimum width remain.

`sidebar-context-menu.test.tsx` covers right-click versus normal click, keyboard opening/navigation/dismissal, action routing, destructive styling, menu-to-dialog focus restoration, rows without actions, and modal/drawer scope. The existing app tests now invoke context menus while retaining their project/workspace and archive target assertions. `tests/sidebar-browser.mjs` additionally checks workspace keyboard actions and composer focus, nested chat archiving, mobile long-press without accidental navigation, one-level-at-a-time Escape dismissal, and the existing resize/layout/theme checks.

Context-menu validation: all 168 tests across 23 files pass, as does the updated browser regression, including desktop right-click/keyboard actions and mobile long-press/dismissal. The signed development app was rebuilt and restarted; a native WebKit right-click on a project exposed Edit project, and Escape dismissed the menu.

## October 14, 2026: restore Fluid typography and theme

`src/fluid-theme.css` now supplies Fluid’s upstream design tokens, theme switching, surface/shadow ladder, semantic colors, and registry type scale. The exact source responses and SHA-256 hashes are in [`vendor/fluid-theme/provenance.json`](vendor/fluid-theme/provenance.json). Source pixel values are converted to rem at the existing 16px root; visual values are unchanged. The locally bundled Inter variable font is registered under the upstream family name.

Removed the global Harbor type scale, duplicate light/dark surface overrides, custom chrome palette and translucency, Tailwind text-size overrides, transcript-scoped type-token overrides, and context-menu-local type tokens. Existing application color aliases now point to Fluid semantic/surface tokens. Nested sidebar labels again use upstream body text, rather than the caption role introduced locally: parent and nested labels are 13px/20px, section labels 12px/16px, and row heights remain 32px/28px. Context menus use Fluid’s surface and shape helpers while retaining Base UI behavior.

This corrects the shared theme and sidebar styling. Application layout CSS (including native titlebar placement), specialized transcript/code/terminal rendering, and previously adapted controls elsewhere in the app still exist; this is not a claim that every application CSS rule is upstream. No new visual adaptations should be introduced when composing Fluid components.

Validation: 169 tests pass across 23 files; production and signed desktop builds pass. `tests/sidebar-browser.mjs` passes interaction, responsive, theme, and reduced-motion checks. `tests/fluid-style-browser.mjs` compares computed parent/nested row dimensions and typography directly with the live Fluid nesting example, plus semantic colors and all eight surface colors in both themes; all match. The rebuilt native app was restarted and its sidebar/titlebar inspected.

The main frame uses the same surface-2 / shadow-2 pairing as Fluid SidebarInset, above surface-1 window chrome. Both normal and reduced-transparency modes preserve that elevation. The obsolete 100vmax chrome-painting shadow was removed now that chrome and frame are opaque Fluid surfaces. Light/dark computed background and shadow values were verified against the shared tokens.

`tests/context-menu-motion-browser.mjs` checks two-axis entry scaling, the cursor-relative transform origin including the upstream alignment offset, a mounted and running 100ms exit animation, menu-to-dialog focus, and reduced motion. Mutation samples before Base UI positioning are excluded from the anchor assertion.

Native motion verification: a fresh recording of the rebuilt Harbor application shows the shadcn zoom/slide entry and fade/zoom exit on an actual sidebar right-click. Focused context-menu tests (7), production/native builds, and the browser origin/motion/focus/reduced-motion checks pass. Browser frame delivery can pause during automated input; the exit assertion verifies a running animation on the mounted popup rather than requiring an intermediate opacity sample in every run.

Native stoplight persistence: AppKit was restoring the default 9px left inset and 16px center after native appearance changes, despite the configured `trafficLightPosition`. The macOS window-event handler now reapplies the existing title on appearance, focus, and display-scale changes; Tao’s title setter restores the configured inset on the main queue. No geometry is duplicated in Rust. Native screenshots after Light, Dark, and System changes measure an 18px red-light inset and a 23.75px rasterized center (the 24px titlebar center). The signed desktop build passes; the original System preference and view were restored after verification.


## October 19, 2026: composer control consistency

The shared task composer now uses the default Fluid InputMessage size. Workspace Combobox, checkout Select, mode/model Buttons, and the send Button all use the native default control height (36px), body labels (13px), and icons (16px). Fluid retains its field caret line height and icon-only button typography. Composer pickers use the native borderless variant; mode/model triggers use ghost Buttons. Model and mode triggers use Button's leading/trailing icon props so glyph sizing and label alignment follow the component.

Removed Harbor's composer surface, textarea, trigger-height, typography, padding, and workspace-field state overrides. Application CSS only arranges and constrains the controls; InputMessage and the registry controls own their surfaces, focus, hover, shape, and type scale. Mode selection now composes Fluid DropdownMenu, DropdownContent, DropdownLabel, and MenuItem, including selected radio semantics, hover motion, and keyboard navigation. Shift+Tab mode cycling, next-turn selections, pending/error handling, and Stop remain unchanged.

Validation: all 188 frontend tests and the production build pass. `tests/composer-controls-browser.mjs` measures controls and icons, checks both themes at 1380×900 and 900×620, and exercises workspace selection, worktree controls, the mode/model menus, and chat launch. The native signed development app is rebuilt for these changes.


Composer popup sizing: mode uses a compact 180px panel, while workspace selection uses a 352px panel capped to the viewport. The workspace popup width is independent of its compact composer trigger. Generic Picker callers retain Fluid's default popup sizing; composer workspace pickers pass a content class for their wider list. Both controls keep their borderless/ghost trigger variants.


## October 19, 2026: compact composer arrangement

Workspace and working-directory selection now sit above the input surface. Branch settings expand above the input as well. The agent/model menu and mode selector sit together inside the bottom-left of InputMessage, with Send/Stop at the bottom-right. Home and launch configuration show the workspace controls above the input. Existing chats omit repository and branch details; their model and mode controls remain inside the input surface. The agent/model and Send/Stop arrangement is shared by all three.

Selectors use Fluid's compact SizeProvider: 28px controls, 12px labels, and 14px icons. InputMessage stays on its default step for comfortable message text and uses compact providers only around its selector slots, avoiding InputMessage's extra footer downscaling. Trigger variants remain borderless/ghost; workspace and mode popup widths remain 352px and 180px. Browser checks verify vertical placement, the model's left alignment, compact dimensions, settings expansion, both themes, and 1380px/900px layouts.


## October 19, 2026: workspace dropdown composition

Home and launch configuration share WorkspacePicker, composed from Fluid DropdownMenu, DropdownSearch, DropdownLabel, MenuItem, and DropdownSeparator. A compact ghost Button shows the selected workspace; search lives inside the popup and receives focus on open. Recents sort by last-used time, filter by folder name or path, show folder icons and selection checkmarks, and keep unavailable folders labeled. Separate footer actions select No workspace or open the native chooser through Use Existing…. The menu retains the 352px viewport-capped width, compact size, keyboard navigation, and focus restoration.

Component tests cover search focus, recent ordering, checked selection, path filtering, empty results, and the native folder action. The composer browser regression covers the new menu, keeps workspace controls above the input, and checks that model and mode stay inside the input while existing chats omit repository details.


## October 19, 2026: seamless native window chrome

Removed the separate background fills from Harbor's sidebar and titlebar. Both now share the app shell's single translucent tint over the native macOS sidebar material, including the outer window gutters. This prevents the sidebar's rectangular fill from ending abruptly at the bottom and side insets. Reduced transparency retains one opaque app-shell fallback, and the main frame and mobile drawer keep their own surfaces.

`tests/sidebar-transparency-browser.mjs` checks transparent sidebar/titlebar/content layers in both themes, the remaining translucent window and main-frame surfaces, and the solid reduced-transparency fallback. Native window screenshots check the resulting chrome after the signed rebuild.


## October 19, 2026: combined worktree settings

WorktreePicker combines New worktree / Current checkout with branch name and base branch or commit in one compact popup above the new-task composer. The separate Branch settings disclosure is removed from Home and launch configuration. The popup uses Radix Popover for form-safe keyboard interaction and Fluid Button, Dropdown/MenuItem, and InputGroup/InputField for its controls and surface. The 320px-wide popup opens with checkmarked working-directory choices. New worktree drills into a separate pane with a back button and compact horizontal Branch and Base fields; both pickers use the shared PickerViews component, keeping inactive panes mounted and inaccessible while the viewport height and pane positions animate together. This avoids replaying an entry animation on every switch. Back or Escape from that pane returns to the choices without losing edits. There is no confirmation footer; outside click or Enter in a branch field closes the popup, and Escape from the choices dismisses it; current checkout closes it immediately. Branch/base values stay in the caller's existing state, so selection changes do not discard edits. Existing chats continue to omit repository and branch controls.

Component tests cover branch/base editing, reopen persistence, checkout/worktree switching, dismissal, and disabled controls. The composer browser check exercises the combined popup and confirms that the old row is absent.

The worktree motion browser check runs with reduced motion disabled, verifies pane identity across switches, checks that animated height and slide positions do not overshoot, and covers back navigation and edit persistence.

The worktree choices use Dropdown’s embedded mode inside the single popup surface. Embedded mode renders a plain container with no surface background, shadow, or rounded outer edge, preventing doubled corner outlines. The composer browser check verifies the computed shadow, radius, and background.

Base uses a compact searchable Dropdown backed by list_branches for the selected workspace. The Git lookup lists local and remote branches without fetching or including symbolic remote aliases. HEAD remains available, and a Use ref row accepts commit hashes or other explicit Git refs. Search selection and Escape close the nested dropdown while preserving the worktree pane.

The worktree PickerViews reserves a 2px focus gutter inside its animation clip, offset by negative margins so popup dimensions and row placement stay unchanged. This accommodates Fluid’s outset menu focus rings on all four sides. The focus-ring browser check covers both boundary rows in both themes.

The worktree popup uses the shared popupMotionClass origin/direction and spring.fast entry/exit timing. Its portal remains mounted until the closing animation finishes (with the standard timeout fallback); the closing popup is inert. The popup motion browser check records entry and exit opacity/scale and verifies focus restoration.
