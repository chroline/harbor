# Kobra File Diff port

Recovered on 2026-10-27 from the browser-delivered module used by
[the public File Diff demo](https://kobra.systems/components/file-diff).

- Component module: `https://kobra.systems/assets/file-diff-DIyTJuPT.js`
- Demo fixture: `https://kobra.systems/assets/file-diff-NoOrxxgt.js`
- Shared highlighter: `https://kobra.systems/assets/code-block-CAebJ4Tj.js`
- Component module SHA-256: `d6f6e29d755a467d5bff4f12f76f4da377ec0bc79f1b9abe79bc3cc55b7785c7`
- `file-diff.public.js` is the unmodified module captured for comparison.

`src/components/ui/file-diff.tsx` deminifies that module into typed JSX. It
retains the original figure/caption DOM, three-column body, props, old/new line
number algorithm, consecutive change runs, striped deletion marker, 8% row
tints, screen-reader labels, and highlighting only on changed lines.
`src/lib/file-diff-highlight.ts` ports the shared Lezer highlighter and token
palette, including its TS/TSX/JS/JSX support and plain-text fallback.

Harbor adaptations are limited to local imports, existing Tabler icon wrappers,
13px and 15px converted to rem at a 16px root, and host border/font defaults.
Harbor supplies its semantic colors and typography tokens. The original
component has no copy, wrap, collapse, or split controls.

The separate Harbor adapter in `src/components/FileDiff.tsx` converts ACP
snapshots and parsed Git hunks to the component's line model. Each Git hunk
retains its own offsets. Split review composes two copies. An absent old
snapshot is shown as unknown; explicit null means a newly created file.
Chat edits, writes, deletions, and review use this component. Markdown code
fences, terminal output, and raw fallback output render as plain preformatted
text. Mermaid diagrams have their own frame and source toggle.

Validation: original and port both produce a 41px caption, 24px code rows, and
203px figure for the six-line demo at a 16px root. Browser QA checks real chat
and review rendering, narrow screens, light/dark themes, and horizontal scroll.
