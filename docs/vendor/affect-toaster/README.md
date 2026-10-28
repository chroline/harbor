# Affect UI Toaster (Clean) port

Recovered on 2026-10-27 from the browser-delivered public demo:

- Component page: https://www.affectui.com/components/toaster
- Demo module: https://www.affectui.com/assets/demo.clean-Nl_cej3R.js
- Module SHA-256: `2b475882ad34b9dbaab47724f99aad1b9efc418dc30ffa507656f9cbbb082254`

`demo.clean.public.js` is the unmodified reference module, including its demo.
`src/components/ui/toaster.tsx` extracts the original component and shared store,
renames module-level symbols, resolves React/JSX imports locally, and adds typed
public exports. The demo controls and sample content are excluded.
`src/components/ui/toaster.css` is the original embedded style string formatted
as CSS, with the glyph-specific drawing rules removed; it is still injected
with the original React style precedence/href.

The store, id updates, promise transitions, measured stack
layout, hover/focus/touch expansion, paused and queued timers, visibility handling,
swipe physics, F8/Escape navigation, focus return, live announcements, touch hit
areas, dark theme, and reduced-motion rules are retained. No dependencies added.

`src/components/AppNotifications.tsx` connects Harbor's error state and background
chat status transitions to the toaster. Existing statuses are seeded without
startup notifications; the active conversation stays quiet. Background completion,
input requests, errors and cleanup use optional Open chat actions. Dismissal,
resumption, opening a chat, archival, and deletion clear the relevant toast.
Global application errors remain until dismissed and update in place. Detached
windows also use the toaster for application errors. The persistent notification
bell and native desktop notification preference retain their existing purposes.

Harbor adds a top offset to clear the titlebar and uses the shared Tabler icon
wrappers for success, error, info, loading, and dismissal. Loading keeps its spin
and settled statuses keep their pop animation. Card geometry, colors, typography,
and stack motion come from Affect UI. One default stack per window also supports
the original `toast`, `toast.success/error/info/loading`, `toast.promise`, and
`toast.dismiss` APIs from event handlers or effects elsewhere in the app.

Validation: production build; application and toast tests for in-place errors,
status transitions, action navigation, startup/active-chat suppression, deleted
chat cleanup, promise morphs and pause-on-hover timers. Browser coverage includes
F8/Escape and focus return, stacking, promise updates, light/dark and narrow gutters.
