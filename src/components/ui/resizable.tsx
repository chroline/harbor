"use client";

// Ported from the public demo modules on 2026-11-15.
// https://kobra.systems/components/resizable
// resizable-CWbdMRSm.js resolves Resizable* through playground, which renders
// the wrappers at the end of snap-stops-B65Rw2-k.js. Those wrappers are
// react-resizable-panels Group, Panel, and Separator, plus the grip from
// use-resize-grip-BM5QuF4B.js. Class strings and the 10px hit slop are copied
// from that wrapper. Harbor supplies the installed panel package and cn().

import {
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import { useResizeGrip, type GripPlacement } from "./use-resize-grip";

const HIT_SLOP = 10;

function assignRef<T>(ref: Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as { current: T | null }).current = node;
}

export function ResizablePanelGroup({
  className,
  ...props
}: ComponentProps<typeof Group>) {
  return (
    <Group
      data-slot="resizable-panel-group"
      className={cn("flex h-full w-full aria-[orientation=vertical]:flex-col", className)}
      {...props}
    />
  );
}

export function ResizablePanel(props: ComponentProps<typeof Panel>) {
  return <Panel data-slot="resizable-panel" {...props} />;
}

/** The handle's grip, without the panel separator. A separator cannot render outside its group. */
export function ResizeGrip({
  active = false,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  const { ref, ...grip } = useResizeGrip("center");
  const { sync } = grip;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let near = false;
    const read = () => {
      sync({
        hovered: near,
        held: active,
        focused: false,
      });
    };
    const onMove = (event: PointerEvent) => {
      const box = node.getBoundingClientRect();
      const slop = Math.max(box.width, HIT_SLOP) / 2;
      const inside =
        Math.abs(event.clientX - box.left - box.width / 2) <= slop &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom;
      if (inside !== near) {
        near = inside;
        read();
      }
    };
    read();
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [active, ref, sync]);
  return (
    <span ref={(node) => { ref.current = node; }} aria-hidden className={className}>
      <AnimatePresence>
        {grip.shown ? <motion.span key="grip" {...grip.props()} /> : null}
      </AnimatePresence>
    </span>
  );
}

export function ResizableHandle({
  withHandle,
  className,
  children,
  elementRef,
  ...props
}: ComponentProps<typeof Separator> & {
  withHandle?: boolean;
  elementRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
}) {
  const [placement, setPlacement] = useState<GripPlacement>("center");
  const { ref, ...grip } = useResizeGrip(placement, { rest: withHandle });
  const { sync } = grip;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let near = false;
    const read = () => {
      setPlacement(
        node.getAttribute("aria-orientation") === "horizontal" ? "middle" : "center",
      );
      const state = node.dataset.separator;
      sync({
        hovered: near && state !== "disabled",
        held: state === "active",
        focused: state === "focus" && node.matches(":focus-visible"),
      });
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = node.getBoundingClientRect();
      const horizontal = node.getAttribute("aria-orientation") === "horizontal";
      const slop = Math.max(horizontal ? box.height : box.width, HIT_SLOP) / 2;
      const inside = horizontal
        ? Math.abs(event.clientY - box.top - box.height / 2) <= slop &&
          event.clientX >= box.left &&
          event.clientX <= box.right
        : Math.abs(event.clientX - box.left - box.width / 2) <= slop &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom;
      if (inside !== near) {
        near = inside;
        read();
      }
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(node, {
      attributes: true,
      attributeFilter: ["data-separator", "aria-orientation"],
    });
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, [ref, sync]);

  return (
    <Separator
      data-slot="resizable-handle"
      elementRef={(node) => {
        ref.current = node;
        assignRef(elementRef, node);
      }}
      className={cn(
        "relative flex w-px items-center justify-center bg-border ring-offset-background transition-ring after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        withHandle && "bg-transparent",
        className,
      )}
      {...props}
    >
      {children}
      <AnimatePresence>
        {grip.shown ? <motion.span key="grip" {...grip.props()} /> : null}
      </AnimatePresence>
    </Separator>
  );
}
