// Deminified from the public demo module use-resize-grip-BM5QuF4B.js.
// https://kobra.systems/components/resizable
// SHA-256 45e2ae5694474de144640038b71d5fe83ad3e2536bb345748500b000c1798ede
// Harbor adaptations: TypeScript, and useSpring in place of the bundled
// `r(0, { stiffness: 700, damping: 50, mass: 0.6 })`. Placement classes,
// jump/set calls, and the follow formula are unchanged.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useSpring } from "framer-motion";

export const GRIP = 32;
export const GRIP_HELD = 48;

const spring = { type: "spring" as const, duration: 0.25, bounce: 0 };
const placementClass = {
  start: "end-1/2 top-0 me-0.75 w-1",
  end: "start-1/2 top-0 ms-0.75 w-1",
  center: "start-1/2 top-0 -ms-0.5 w-1",
  above: "bottom-1/2 left-0 mb-0.75 h-1",
  below: "top-1/2 left-0 mt-0.75 h-1",
  middle: "top-1/2 left-0 -mt-0.5 h-1",
} as const;

export type GripPlacement = keyof typeof placementClass;

const reduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const subscribeMounted = () => () => {};

const pointer = { clientX: 0, clientY: 0 };
let tracking = false;

function trackPointer() {
  if (tracking) return;
  tracking = true;
  window.addEventListener(
    "pointermove",
    (event) => {
      pointer.clientX = event.clientX;
      pointer.clientY = event.clientY;
    },
    { capture: true, passive: true },
  );
}

export function useResizeGrip(
  placement: GripPlacement,
  { rest = false }: { rest?: boolean } = {},
) {
  const ref = useRef<HTMLElement | null>(null);
  const axis =
    placement === "start" || placement === "end" || placement === "center"
      ? "y"
      : "x";
  const value = useSpring(0, { stiffness: 700, damping: 50, mass: 0.6 });
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [held, setHeld] = useState(false);
  const length = held ? GRIP_HELD : GRIP;
  const half = useRef(16);
  useLayoutEffect(() => {
    half.current = length / 2;
  }, [length]);

  const span = useCallback(() => {
    const node = ref.current;
    return node ? (axis === "y" ? node.offsetHeight : node.offsetWidth) : 0;
  }, [axis]);

  const follow = useCallback(
    (event: { clientX: number; clientY: number }, jump: boolean) => {
      const node = ref.current;
      if (!node) return;
      const box = node.getBoundingClientRect();
      const size = span();
      const scale = (axis === "y" ? box.height : box.width) / size || 1;
      const local =
        axis === "y" ? event.clientY - box.top : event.clientX - box.left;
      const next =
        size < half.current * 2
          ? size / 2
          : Math.min(Math.max(local / scale, half.current), size - half.current);
      if (jump || reduced()) value.jump(next);
      else value.set(next);
    },
    [axis, span, value],
  );

  const center = useCallback(
    (jump: boolean) => {
      const next = span() / 2;
      if (jump || reduced()) value.jump(next);
      else value.set(next);
    },
    [span, value],
  );

  useEffect(trackPointer, []);
  useEffect(() => {
    if (!hovered && !held) return;
    const onMove = (event: PointerEvent) => follow(event, false);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [follow, held, hovered]);
  useEffect(() => {
    if (!held) return;
    const release = () => setHeld(false);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
    };
  }, [held]);

  const resting = !hovered && !held && !focused;
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const firstCenter = useRef(true);
  useLayoutEffect(() => {
    if (!rest || !resting) return;
    center(firstCenter.current);
    firstCenter.current = false;
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(() => center(true));
    observer.observe(node);
    return () => observer.disconnect();
  }, [center, rest, resting]);

  const handlers = {
    onPointerEnter: (event: ReactPointerEvent) => {
      if (event.pointerType === "touch") return;
      follow(event, !rest);
      setHovered(true);
    },
    onPointerLeave: () => setHovered(false),
    onPointerDown: (event: ReactPointerEvent) => {
      if (event.button !== 0) return;
      if (!hovered) follow(event, !rest);
      setHeld(true);
    },
    onFocus: (event: { currentTarget: HTMLElement }) => {
      if (!event.currentTarget.matches(":focus-visible")) return;
      center(!rest);
      setFocused(true);
    },
    onBlur: () => setFocused(false),
  };

  const flags = useRef({ hovered, held, focused });
  useLayoutEffect(() => {
    flags.current = { hovered, held, focused };
  }, [focused, held, hovered]);

  const sync = useCallback(
    (next: { hovered: boolean; held: boolean; focused: boolean }) => {
      const previous = flags.current;
      if ((next.hovered || next.held) && !previous.hovered && !previous.held)
        follow(pointer, !rest);
      else if (next.focused && !next.hovered && !next.held && !previous.focused)
        center(!rest);
      setHovered(next.hovered);
      setHeld(next.held);
      setFocused(next.focused);
    },
    [center, follow, rest],
  );

  const props = () => {
    const still = reduced();
    const [hidden, shown, exit] =
      axis === "y"
        ? [
            {
              opacity: 0,
              scaleY: still ? 1 : 0.6,
              height: GRIP,
              marginTop: -GRIP / 2,
            },
            { opacity: 1, scaleY: 1, height: length, marginTop: -length / 2 },
            {
              opacity: 0,
              scaleY: still ? 1 : 0.8,
              transition: { duration: 0.12 },
            },
          ]
        : [
            {
              opacity: 0,
              scaleX: still ? 1 : 0.6,
              width: GRIP,
              marginLeft: -GRIP / 2,
            },
            { opacity: 1, scaleX: 1, width: length, marginLeft: -length / 2 },
            {
              opacity: 0,
              scaleX: still ? 1 : 0.8,
              transition: { duration: 0.12 },
            },
          ];
    return {
      "aria-hidden": true as const,
      style: axis === "y" ? { y: value } : { x: value },
      initial: rest && resting ? false : hidden,
      animate: shown,
      exit,
      transition: spring,
      className: `pointer-events-none absolute rounded-full bg-foreground/40 ${placementClass[placement]}`,
    };
  };

  return { ref, shown: (rest && mounted) || !resting, held, handlers, sync, props };
}
