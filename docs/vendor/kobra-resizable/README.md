# Kobra Resizable port

Recovered on 2026-11-15 from the modules delivered to the public demo at
https://kobra.systems/components/resizable.

- Demo wrapper: `https://kobra.systems/assets/resizable-CWbdMRSm.js`
- Panel primitive and Kobra wrappers: `https://kobra.systems/assets/snap-stops-B65Rw2-k.js`
- Grip: `https://kobra.systems/assets/use-resize-grip-BM5QuF4B.js`
- Playground binder: `https://kobra.systems/assets/playground-DSOaiRrS.js`

The source dock on that page blurs a dummy `Component` function. The running
demo does not use it. `resizable.public.js` renders `ResizablePanelGroup`,
`ResizablePanel`, and `ResizableHandle` from the playground binder. That binder
returns the wrappers at the end of `snap-stops.public.js`, which are
`react-resizable-panels` `Group`, `Panel`, and `Separator` plus the grip.

SHA-256:

- `resizable.public.js` `fc96250adb18d6fddc85fb7cf303a4558e6e341fa617b8d978bb00805dd43b4f`
- `snap-stops.public.js` `284b781d19bf0c423a0c7cdf50b21aa99780733c6d33ee7e5a366081ea4e28be`
- `use-resize-grip.public.js` `45e2ae5694474de144640038b71d5fe83ad3e2536bb345748500b000c1798ede`
- `playground.public.js` `255f65db5bda814b8e093623e18dcbe5e69d8504080d344a5edfa5d2e3ae8bb8`

`src/components/ui/resizable.tsx` keeps the wrapper class strings, the 10px
hit slop, `withHandle`, and the grip mount. `src/components/ui/use-resize-grip.ts`
keeps the placement classes and the pointer-follow formula. Harbor resolves
the panel primitive to the installed `react-resizable-panels` package and
`useMotionValue` to the installed Motion package. Harbor does not reimplement the grip, the 10px proximity test, or the
separator. Those stay inside `ResizableHandle`. Putting this group around
the existing sidebar shell clips the card, so it is not mounted there.
