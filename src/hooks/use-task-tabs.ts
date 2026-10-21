import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { call } from "../lib/api";

export function orderTaskTabs<T extends { id: string }>(
  tabs: T[],
  order: string[],
) {
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const result: T[] = [];
  for (const id of order) {
    const tab = byId.get(id);
    if (tab) {
      result.push(tab);
      byId.delete(id);
    }
  }
  return [...result, ...byId.values()];
}
export function moveTaskTab(
  ids: string[],
  id: string,
  target: string,
  after: boolean,
) {
  if (id === target || !ids.includes(id) || !ids.includes(target)) return ids;
  const next = ids.filter((value) => value !== id);
  next.splice(next.indexOf(target) + Number(after), 0, id);
  return next;
}
type Slot = { id: string; left: number; width: number; node: HTMLElement };
type Drag = {
  id: string;
  pointer: number;
  node: HTMLElement;
  list: HTMLElement;
  x: number;
  y: number;
  rect: DOMRect;
  scroll: number;
  slots: Slot[];
  ids: string[];
  active: boolean;
  lastTime: number;
  lastOutside: number;
};
type TabMotion = {
  id: string;
  x: number;
  y: number;
  rect: DOMRect;
  offsets: Record<string, number>;
};

// Mouse pressure is unavailable; distance and outward velocity distinguish a
// deliberate tear-off from the small vertical drift of a horizontal reorder.
export function shouldDetachTab(
  outsideX: number,
  outsideY: number,
  travel: number,
  outwardSpeed: number,
) {
  return (
    outsideY >= 56 ||
    outsideX >= 80 ||
    (Math.hypot(outsideX, outsideY) >= 24 &&
      travel >= 32 &&
      outwardSpeed >= 0.8)
  );
}

export function useTaskTabs(
  sessionId: string,
  detach: (id: string, x: number, y: number) => Promise<void>,
  onError: (error: string) => void,
) {
  const key = `harbor.task-tabs.${sessionId}`;
  const [order, setOrder] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "[]");
      return Array.isArray(saved)
        ? saved.filter((id) => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });
  const [detached, setDetached] = useState<string[]>([]);
  const [motion, setMotion] = useState<TabMotion | null>(null);
  const drag = useRef<Drag | null>(null);
  const landing = useRef<
    { node: HTMLElement; left: number; top: number }[] | null
  >(null);
  const suppressClick = useRef(false);
  const revision = useRef(0);
  const latest = useRef({ detach, onError });
  latest.current = { detach, onError };
  const reducedMotion = () =>
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(order));
    } catch {}
  }, [key, order]);
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    const refresh = async () => {
      const version = revision.current;
      const ids = await call<string[]>("list_detached_tabs", { sessionId });
      if (!disposed && version === revision.current) setDetached(ids ?? []);
    };
    void listen<string>("task-tabs-changed", (event) => {
      if (event.payload === sessionId) void refresh().catch(() => {});
    })
      .then((stop) => {
        if (disposed) stop();
        else off = stop;
        return refresh();
      })
      .catch(() => {});
    return () => {
      disposed = true;
      off?.();
    };
  }, [sessionId]);

  // Animate the real surfaces from their last visible positions into their
  // committed slots. This also settles a cancelled drag without a snap.
  useLayoutEffect(() => {
    if (!landing.current || motion) return;
    const previous = landing.current;
    landing.current = null;
    if (reducedMotion()) return;
    for (const { node, left, top } of previous) {
      if (!node.isConnected) continue;
      const rect = node.getBoundingClientRect();
      const x = left - rect.left;
      const y = top - rect.top;
      if (Math.abs(x) + Math.abs(y) < 1) continue;
      node.animate?.(
        [
          { transform: `translate3d(${x}px, ${y}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        { duration: 160, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    }
  }, [order, motion]);

  useEffect(() => {
    let previousCursor = "";
    const finish = (cancelled: boolean) => {
      const current = drag.current;
      drag.current = null;
      if (!current?.active) return;
      landing.current = current.slots.map(({ node }) => {
        const surface =
          node.querySelector<HTMLElement>(".task-tab-surface") ?? node;
        const rect = surface.getBoundingClientRect();
        return { node: surface, left: rect.left, top: rect.top };
      });
      suppressClick.current = true;
      if (current.node.hasPointerCapture?.(current.pointer))
        current.node.releasePointerCapture(current.pointer);
      document.documentElement.style.cursor = previousCursor;
      if (!cancelled) setOrder(current.ids);
      setMotion(null);
    };
    const move = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointer) return;
      const dx = event.clientX - current.x;
      const dy = event.clientY - current.y;
      if (!current.active) {
        if (Math.hypot(dx, dy) < 6) return;
        current.active = true;
        current.node.setPointerCapture?.(current.pointer);
        previousCursor = document.documentElement.style.cursor;
        document.documentElement.style.cursor = "grabbing";
      }
      event.preventDefault();
      const rail = current.list.getBoundingClientRect();
      const outsideX = Math.max(
        rail.left - event.clientX,
        event.clientX - rail.right,
        0,
      );
      const outsideY = Math.max(
        rail.top - event.clientY,
        event.clientY - rail.bottom,
        0,
      );
      const outside = Math.hypot(outsideX, outsideY);
      const elapsed = event.timeStamp - current.lastTime;
      const outwardSpeed =
        elapsed > 0 && elapsed <= 100
          ? Math.max(0, outside - current.lastOutside) / elapsed
          : 0;
      current.lastTime = event.timeStamp;
      current.lastOutside = outside;
      if (
        shouldDetachTab(outsideX, outsideY, Math.hypot(dx, dy), outwardSpeed)
      ) {
        // End capture before creating/focusing the native window. Release and
        // pointercancel events from that transfer must never create it again.
        finish(false);
        revision.current++;
        void latest.current
          .detach(current.id, event.screenX, event.screenY)
          .then(() => {
            revision.current++;
            setDetached((ids) => [...new Set([...ids, current.id])]);
          })
          .catch((error) => latest.current.onError(String(error)));
        return;
      }
      if (event.clientX < rail.left + 32) current.list.scrollLeft -= 20;
      else if (event.clientX > rail.right - 32) current.list.scrollLeft += 20;
      const scrollDelta = current.list.scrollLeft - current.scroll;
      const midpoint = (index: number) =>
        current.slots[index].left -
        scrollDelta +
        current.slots[index].width / 2;
      let index = current.ids.indexOf(current.id);
      current.ids = [...current.ids];
      // Compare the pointer with each neighbor's current slot. After a swap,
      // its new midpoint prevents the same crossing from swapping it back.
      while (
        index < current.ids.length - 1 &&
        event.clientX > midpoint(index + 1)
      ) {
        [current.ids[index], current.ids[index + 1]] = [
          current.ids[index + 1],
          current.ids[index],
        ];
        index++;
      }
      while (index > 0 && event.clientX < midpoint(index - 1)) {
        [current.ids[index], current.ids[index - 1]] = [
          current.ids[index - 1],
          current.ids[index],
        ];
        index--;
      }
      const offsets = Object.fromEntries(
        current.slots.map((slot) => [
          slot.id,
          current.slots[current.ids.indexOf(slot.id)].left - slot.left,
        ]),
      );
      setMotion({ id: current.id, x: dx, y: dy, rect: current.rect, offsets });
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId === drag.current?.pointer)
        finish(event.type === "pointercancel");
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        finish(true);
      }
    };
    const click = (event: MouseEvent) => {
      if (suppressClick.current && event.detail !== 0) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const down = () => {
      suppressClick.current = false;
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("click", click, true);
    window.addEventListener("pointerdown", down, true);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("click", click, true);
      window.removeEventListener("pointerdown", down, true);
      if (drag.current?.active)
        document.documentElement.style.cursor = previousCursor;
      drag.current = null;
    };
  }, []);
  return {
    order,
    detached,
    dragging: motion?.id ?? null,
    focus: (id: string) => {
      void call("focus_task_tab", { sessionId, tabId: id }).catch((error) =>
        onError(String(error)),
      );
    },
    surfaceProps: (id: string): { style?: CSSProperties } =>
      motion?.id === id
        ? {
            style: {
              position: "fixed",
              left: motion.rect.left,
              top: motion.rect.top,
              width: motion.rect.width,
              height: motion.rect.height,
              transform: `translate3d(${motion.x}px, ${motion.y}px, 0)`,
              zIndex: 9999,
              pointerEvents: "none",
              transition: "none",
            },
          }
        : {},
    props: (
      id: string,
      _label: string,
      ids: string[],
    ): HTMLAttributes<HTMLElement> & {
      "data-task-tab-id": string;
      "data-tab-dragging"?: boolean;
    } => ({
      "data-task-tab-id": id,
      "data-tab-dragging": motion?.id === id || undefined,
      style: motion
        ? {
            height: motion.id === id ? motion.rect.height : undefined,
            transform:
              motion.id !== id
                ? `translate3d(${motion.offsets[id] ?? 0}px, 0, 0)`
                : undefined,
            transition:
              motion.id !== id && !reducedMotion()
                ? "transform 160ms cubic-bezier(0.2, 0.8, 0.2, 1)"
                : "none",
          }
        : { transition: "none" },
      onPointerDown: (event) => {
        if (
          event.button !== 0 ||
          event.pointerType === "touch" ||
          (event.target as HTMLElement).closest(".terminal-tab-close")
        )
          return;
        const node = event.currentTarget;
        const list = node.closest<HTMLElement>('[role="tablist"]');
        if (!list) return;
        const nodes = [
          ...list.querySelectorAll<HTMLElement>("[data-task-tab-id]"),
        ];
        for (const tab of nodes)
          for (const animation of tab
            .querySelector(".task-tab-surface")
            ?.getAnimations?.() ?? [])
            animation.cancel();
        drag.current = {
          id,
          pointer: event.pointerId,
          node,
          list,
          x: event.clientX,
          y: event.clientY,
          rect: node.getBoundingClientRect(),
          scroll: list.scrollLeft,
          slots: nodes.map((tab) => {
            const rect = tab.getBoundingClientRect();
            return {
              id: tab.dataset.taskTabId!,
              left: rect.left,
              width: rect.width,
              node: tab,
            };
          }),
          ids,
          active: false,
          lastTime: event.timeStamp,
          lastOutside: 0,
        };
      },
      onDragStart: (event) => event.preventDefault(),
      onKeyDownCapture: (event) => {
        if (!event.altKey || !["ArrowLeft", "ArrowRight"].includes(event.key))
          return;
        event.preventDefault();
        event.stopPropagation();
        const after = event.key === "ArrowRight";
        const target = ids[ids.indexOf(id) + (after ? 1 : -1)];
        if (target) setOrder(moveTaskTab(ids, id, target, after));
      },
    }),
  };
}
