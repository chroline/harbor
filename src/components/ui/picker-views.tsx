import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { spring } from "@/lib/springs";
import { cn } from "@/lib/utils";

// Picker panes stay mounted: switching moves the existing panes and measures
// their contents instead of replaying an entry animation on a replacement node.
export function PickerViews<T extends string>({
  view,
  panes,
  classPrefix = "picker",
  focusGutter = false,
}: {
  view: T;
  panes: { id: T; content: ReactNode; focusSelector: string }[];
  classPrefix?: string;
  /** Reserve the 2px outset used by Fluid focus rings inside the clip. */
  focusGutter?: boolean;
}) {
  const reduced = useReducedMotion();
  const refs = useRef(new Map<T, HTMLDivElement>());
  const previousView = useRef(view);
  const [height, setHeight] = useState<number>();
  const focusSelector = panes.find((pane) => pane.id === view)?.focusSelector;
  useLayoutEffect(() => {
    const active = refs.current.get(view);
    if (!active) return;
    const measure = () => setHeight(active.offsetHeight || undefined);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(active);
    if (previousView.current !== view) {
      (
        active.querySelector<HTMLElement>(focusSelector ?? "button") ??
        active.querySelector<HTMLElement>("button")
      )?.focus({ preventScroll: true });
      active.parentElement?.parentElement?.scrollTo?.({ top: 0 });
    }
    previousView.current = view;
    return () => observer.disconnect();
  }, [view, focusSelector, focusGutter]);
  const activeIndex = panes.findIndex((pane) => pane.id === view);
  return (
    <motion.div
      className={cn(`${classPrefix}-viewport relative overflow-hidden`, focusGutter && "-m-0.5")}
      initial={false}
      animate={{ height: height ?? "auto" }}
      transition={reduced ? { duration: 0 } : spring.moderate}
    >
      {panes.map(
        (pane, index) =>
          pane.content && (
            <motion.div
              key={pane.id}
              ref={(node) => {
                if (node) refs.current.set(pane.id, node);
                else refs.current.delete(pane.id);
              }}
              className={cn(
                `${classPrefix}-view w-full flow-root`,
                focusGutter && "p-0.5",
                view !== pane.id &&
                  "absolute inset-x-0 top-0 pointer-events-none",
              )}
              data-active={view === pane.id}
              inert={view !== pane.id}
              aria-hidden={view !== pane.id}
              initial={false}
              animate={{
                x: reduced
                  ? 0
                  : index === activeIndex
                    ? "0%"
                    : index < activeIndex
                      ? "-100%"
                      : "100%",
                opacity: view === pane.id ? 1 : 0,
              }}
              transition={reduced ? spring.fast : spring.moderate}
            >
              {pane.content}
            </motion.div>
          ),
      )}
    </motion.div>
  );
}
