# Kobra Attachment and Lightbox ports

Recovered on 2026-10-27 from the modules delivered to the public demos:

- https://kobra.systems/components/attachment
- https://kobra.systems/components/lightbox
- Shared component bundle: https://kobra.systems/assets/use-narrow-shell-C9IfYz4r.js
- Trackpad helper: https://kobra.systems/assets/trackpad-swipe-MOPDzk0v.js

`attachment.public.js` and `lightbox.public.js` are the corresponding sections
extracted from the formatted public bundle. `trackpad-swipe.public.js` is the
unmodified helper module. These are retained as the source of comparison.

`src/components/ui/attachment.tsx` retains all nine original parts, class strings,
DOM, slots, states, size/orientation variants, and Base UI render composition.
The local button's `icon-compact` replaces Kobra's `icon-xs` size alias.

`src/components/ui/lightbox.tsx` preserves the original gallery row algorithm,
ripple displacement, Web Animations spring curves, image transition geometry,
clipping, zoom/pan physics, pointer/pinch gestures, wheel swipe detection,
keyboard navigation, reduced motion, and standalone LightboxPhoto behavior.
Bundled React, Base UI Dialog/direction primitives and icon references resolve
to installed packages; button and class merging resolve to Harbor equivalents.
The recovered JavaScript internals retain their original inferred behavior;
the exported gallery and standalone-photo APIs have explicit TypeScript props.

`src/components/MessageAttachments.tsx` is the Harbor adapter. It supplies file
metadata, filename-based icons, object URL ownership for drafts, measured image
dimensions, and optional removal. Both the composer and sent messages use the
original Attachment parts; images compose LightboxPhoto inside AttachmentMedia.
The card receives Harbor's semantic border color. Sent previews use their
existing data URL directly, avoiding the previous base64-to-File conversion.

Validation covers file input, drop, removal, attachment-only submission,
sent image previews, narrow layout, lightbox opening/reopening, Escape and close
button dismissal, and focus return. The browser fixture mirrors provider image
replay through a Markdown data link, matching the protocol's supported decoder.

Source SHA-256:

- Shared bundle: `e1d79ff48a919f6f07638c82c4682e05bca3d2178a22c5b05c0a44f9b906cf8a`
- Trackpad helper: `d1ffe74fe7d8ad86df4b0bbd69d68444806b7322157e47ca57c28e97923973e5`
