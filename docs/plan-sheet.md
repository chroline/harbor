# Plan review sheet: runtime reconstruction

Inspected October 26, 2026. Reference: [Kobra Sheet](https://kobra.systems/components/sheet).

## How the component was recovered

We traced the JavaScript and CSS actually delivered to the public demo, then checked its rendered DOM, computed styles, opening/closing behavior, and settled screenshot. This was not a reconstruction from a screenshot. The gated TypeScript source was not accessed; the minified runtime exposes the wrapper and its dependencies.

The page's `component-gallery-CehzRNik.js` selects the `sheet` module from export `M` in `use-narrow-shell-C9IfYz4r.js`. That module (`TA` in this build) exports Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, and SheetDescription. Its wrappers delegate to Base UI Dialog Root, Trigger, Close, Portal, Backdrop, Popup, Title, and Description. Styles resolve through `app-Cmhp9-2h.css`. Bundle names are evidence for this observed deployment, not stable integration URLs.

Harbor now uses the same Base UI Dialog primitive (installed `@base-ui/react` 1.8.0), the recovered component composition, and the recovered CSS contract. It does not fetch Kobra assets at runtime. Source lives in `src/components/ui/sheet.tsx` and `sheet.css`.

## Recovered contract

| Part | Observed implementation |
| --- | --- |
| Defaults | `side="end"`, `showCloseButton=true`; logical start/end resolve through the direction provider. Explicit left/right/top/bottom supported. |
| Vertical sheet | Fixed; 12px inset from the top, bottom and selected side; 440px wide, bounded to viewport width minus 24px. |
| Surface | 16px corners; popover background/foreground; clipped overflow; column layout. |
| Shadow | Five black layers: 0 40px 80px at 6%, 0 20px 40px at 5%, 0 10px 20px at 4%, 0 5px 10px at 3%, 0 2px 4px at 2%; 1px ring at black 5% / dark white 18%. |
| Backdrop | Fixed inset 0; black gradient 20% to 25%; blur 2px; opacity transition 200ms, cubic-bezier(.4,0,.2,1). |
| Motion | Base UI `data-starting-style` / `data-ending-style`; opacity and 16px translation toward the selected edge. Enter 300ms, exit 200ms, cubic-bezier(.32,.72,0,1). Reduced motion disables transitions. No spring or JavaScript animation loop. |
| Header/footer | Column layout, default 16px padding; header gap4, footer gap8 and margin-top:auto. Demo header overrides to 20px horizontal padding and 56px end padding for the close control. |
| Close | Absolute top/end 16px; circular 32px button, 16px icon, stroke1.8; foreground 5% background, 10% hover. |
| Lifecycle | Base UI handles focus containment, background inertness, scroll lock, dismissal, return focus, and delayed unmount for transitions. Escape, outside press and close button dismiss. |

## Harbor integration

Claude, Codex, and Grok share one Plan card with a fading preview and one sheet. Harbor supplies its existing theme colors, a scrollable Markdown body, and a fixed action footer. The initial focus is the review heading, so opening a plan does not focus an execution action. Dismissal only hides the sheet; it never responds to a provider request. Reopening displays the same pending plan.

Implement plan and Keep planning retain the existing provider option IDs. Additional provider options remain fully labeled in the secondary menu. That menu portals inside the sheet to preserve modal focus and accessibility. Response failures stay visible inside the sheet; pending responses disable submission actions. Existing child/request ownership routing is unchanged.

## Verification

`tests/plan-review-browser.mjs` exercises realistic provider payload fixtures in the browser. The fixtures do not run live providers or modify project files. The prior live-provider Plan mode verification remains separate in `docs/providers.md`; this change only replaces review presentation.

## Plan card runtime reconstruction

The [Kobra Plan Card](https://kobra.systems/components/plan-card) was traced through the same public gallery bundle: `PlanCard:sl` selects module export `B` from `use-narrow-shell-C9IfYz4r.js`. `B` resolves to module `JD`, which exports function `iO`. The delivered function's props include icon, title, description, steps, visibleSteps (default 3), approval/view/download callbacks, and optional auto-approval. We read that function and compared the actual card DOM and computed styles.

Recovered structure: full width capped at 512px; 16px outer corners; 1px border; card background; 20px padding. Header uses a 12px gap, a 28px warning-tinted icon slot (16px icon), and an 18px semibold title. The inset content has 16px top spacing, 14px corners, muted background at 60%, and 12px padding. Footer has 16px top spacing, 12px gaps and wrapping; actions align to the inline end with an 8px gap and 32px height. The warning icon's raised-label fill and layered shadows were also recovered from the delivered CSS.

Harbor ports those parts in `ui/plan-card.tsx` and `plan-card.css`. At the user's request, the final integration overrides the original width cap to fill the message column, and uses the messages' `--panel`, `--shadow-3` edge, and `--radius-xl`. The icon's recovered raised-label structure uses neutral surface tokens; the preview uses a recessed background and subtle inset edge. The user's requested change replaces the to-do rows with the actual plan Markdown: three 24px lines at most, with the first two readable and a mask fading the third to transparent. The title is displayed in the header and removed from the preview. The full, unchanged plan remains in the sheet. The preview is noninteractive and hidden from assistive technology because its visually clipped text is available in full through View plan.

The reference's optional description, download callback, auto-approval countdown, and global approval shortcut are not enabled. The footer uses Harbor's existing buttons and provider-safe Implement plan action; its View plan action opens the existing sheet. There is no to-do extraction, step count, expansion animation, or fabricated provider capability. These are explicit integration choices rather than claims about the upstream component.

`tests/plan-card-browser.mjs` verifies the three provider cards, full-column alignment and identical message surface/shadow/radius, preview clipping/fade, full text in the sheet, keyboard opening, original inline approval IDs, pending controls, response failure/retry, long titles/content at 900×620, and light-theme rendering.

## Plan lifetime after approval

Plan cards are transcript content, rather than a rendering of the pending-permission queue. The frontend records request snapshots, their sequence/owner/user-turn anchor, and their answered/interrupted state while reducing the existing saved event log. A card keeps a stable sequence-based identity after approval. Only its status and available actions change; the full plan remains available through a view-only sheet.

The backend's saved `answered` event now includes the response, before any Grok wire-format conversion. Approved, kept-planning, cancelled and interrupted states can therefore be distinguished on replay. Older answer events lack the response and display **Response recorded**, without inferring approval. No SQLite schema migration is needed: existing request snapshots reconstruct historical cards, including requests already answered before this fix.

Exact duplicate plan prose and its matching mode tool are replaced by the card only in the associated conversation/user turn. Plan requests create a message-stream boundary, preserving later implementation output as a separate message. Older logs that appended output to the plan's prose retain that output after the card. Provider history resets retain request/answer records and reanchor their cards to the corresponding replayed user occurrence; unrelated turns and workers remain separate. Pending child approvals still surface in the parent when their worker transcript is not being viewed.

The rendering window retains at most 200 interaction records, consistent with the existing bounded message window; the full saved event log remains in SQLite. `tests/plan-lifecycle-browser.mjs` covers approval and subsequent output for each provider, view-only historical sheets, and a fresh frontend/store reading the same saved events. Reducer tests also cover native history reset/replay, reused request IDs, interrupted/cancelled reviews and worker ownership.
