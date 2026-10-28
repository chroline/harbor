var Yo = t({
    Attachment: () => Zo,
    AttachmentAction: () => is,
    AttachmentActions: () => rs,
    AttachmentContent: () => es,
    AttachmentDescription: () => ns,
    AttachmentGroup: () => ss,
    AttachmentMedia: () => $o,
    AttachmentTitle: () => ts,
    AttachmentTrigger: () => as,
  }),
  Xo = D(
    `group/attachment relative flex w-fit max-w-full min-w-0 shrink-0 flex-wrap rounded-xl border bg-card text-card-foreground transition-ring focus-within:ring-1 focus-within:ring-ring/50 has-[>a,>button]:hover:bg-muted/50 data-[state=error]:border-destructive/30 data-[state=idle]:border-dashed`,
    {
      variants: {
        size: {
          default: `gap-2 text-sm has-data-[slot=attachment-content]:px-2.5 has-data-[slot=attachment-content]:py-2 has-data-[slot=attachment-media]:p-2`,
          sm: `gap-2.5 text-xs has-data-[slot=attachment-content]:px-2 has-data-[slot=attachment-content]:py-1.5 has-data-[slot=attachment-media]:p-1.5`,
          xs: `gap-1.5 rounded-lg text-xs has-data-[slot=attachment-content]:px-1.5 has-data-[slot=attachment-content]:py-1 has-data-[slot=attachment-media]:p-1`,
        },
        orientation: {
          horizontal: `min-w-40 items-center`,
          vertical: `w-24 flex-col has-data-[slot=attachment-content]:w-30`,
        },
      },
    },
  );
function Zo({
  className: e,
  state: t = `done`,
  size: n = `default`,
  orientation: r = `horizontal`,
  ...i
}) {
  return (0, Z.jsx)(`div`, {
    "data-slot": `attachment`,
    "data-state": t,
    "data-size": n,
    "data-orientation": r,
    className: a(Xo({ size: n, orientation: r }), e),
    ...i,
  });
}
var Qo = D(
  `relative flex aspect-square w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-foreground group-data-[orientation=vertical]/attachment:w-full group-data-[size=sm]/attachment:w-8 group-data-[size=xs]/attachment:w-7 group-data-[size=xs]/attachment:rounded-md group-data-[state=error]/attachment:bg-destructive/10 group-data-[state=error]/attachment:text-destructive group-data-[orientation=vertical]/attachment:*:data-[slot=spinner]:size-6! [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 group-data-[orientation=vertical]/attachment:[&_svg:not([class*='size-'])]:size-6 group-data-[size=xs]/attachment:[&_svg:not([class*='size-'])]:size-3.5`,
  {
    variants: {
      variant: {
        icon: ``,
        image: `opacity-60 group-data-[state=done]/attachment:opacity-100 group-data-[state=idle]/attachment:opacity-100 *:[img]:aspect-square *:[img]:w-full *:[img]:object-cover`,
      },
    },
    defaultVariants: { variant: `icon` },
  },
);
function $o({ className: e, variant: t = `icon`, ...n }) {
  return (0, Z.jsx)(`div`, {
    "data-slot": `attachment-media`,
    "data-variant": t,
    className: a(Qo({ variant: t }), e),
    ...n,
  });
}
function es({ className: e, ...t }) {
  return (0, Z.jsx)(`div`, {
    "data-slot": `attachment-content`,
    className: a(
      `max-w-full min-w-0 flex-1 leading-tight group-data-[orientation=vertical]/attachment:px-1`,
      e,
    ),
    ...t,
  });
}
function ts({ className: e, ...t }) {
  return (0, Z.jsx)(`span`, {
    "data-slot": `attachment-title`,
    className: a(
      `group-data-[state=processing]/attachment:shimmer group-data-[state=uploading]/attachment:shimmer block max-w-full min-w-0 truncate font-medium`,
      e,
    ),
    ...t,
  });
}
function ns({ className: e, ...t }) {
  return (0, Z.jsx)(`span`, {
    "data-slot": `attachment-description`,
    className: a(
      `mt-0.5 block min-w-0 truncate text-xs text-muted-foreground group-data-[state=error]/attachment:text-destructive/80`,
      `max-w-full`,
      e,
    ),
    ...t,
  });
}
function rs({ className: e, ...t }) {
  return (0, Z.jsx)(`div`, {
    "data-slot": `attachment-actions`,
    className: a(
      `relative z-20 flex shrink-0 items-center group-data-[orientation=vertical]/attachment:absolute group-data-[orientation=vertical]/attachment:end-3 group-data-[orientation=vertical]/attachment:top-3 group-data-[orientation=vertical]/attachment:gap-1`,
      e,
    ),
    ...t,
  });
}
function is({ className: e, variant: t, size: n = `icon-xs`, ...r }) {
  return (0, Z.jsx)(re, {
    "data-slot": `attachment-action`,
    variant: t ?? `ghost`,
    size: n,
    className: a(e),
    ...r,
  });
}
function as({ className: e, render: t, type: n, ...r }) {
  return Vr({
    defaultTagName: `button`,
    props: m(
      {
        type: t ? n : (n ?? `button`),
        className: a(`absolute inset-0 z-10 outline-none`, e),
      },
      r,
    ),
    render: t,
    state: { slot: `attachment-trigger` },
  });
}
var os = D(`min-w-0 gap-3 py-1`, {
  variants: {
    layout: {
      scroll: `scroll-fade-x flex snap-x snap-mandatory scroll-px-1 scrollbar-none overflow-x-auto overscroll-x-contain *:data-[slot=attachment]:flex-none *:data-[slot=attachment]:snap-start`,
      grid: `grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] *:data-[slot=attachment]:w-full`,
    },
  },
  defaultVariants: { layout: `scroll` },
});
function ss({ className: e, layout: t = `scroll`, ...n }) {
  return (0, Z.jsx)(`div`, {
    "data-slot": `attachment-group`,
    "data-layout": t,
    className: a(os({ layout: t }), e),
    ...n,
  });
}
