import { useEffect, useRef, useState, type HTMLAttributes } from "react";
import { ArrowDown, ArrowUp } from "./icons";

export const SIDEBAR_ORDER_KEY = "harbor.sidebar-order.v1";
export const NO_WORKSPACE_ID = "__no_workspace__";
type Orders = Record<string, string[]>;
type Placement = "before" | "after";
type Target = { id: string; placement: Placement };
type Drag = {
  group: string;
  id: string;
  label: string;
  ids: string[];
  pointerId: number;
  row: HTMLElement;
  x: number;
  y: number;
  active: boolean;
  target: Target | null;
};

export function parseSidebarOrder(raw: string | null): Orders {
  try {
    const value: unknown = JSON.parse(raw ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([group, ids]) =>
        Array.isArray(ids)
          ? [
              [
                group,
                [
                  ...new Set(
                    ids.filter((id): id is string => typeof id === "string"),
                  ),
                ],
              ],
            ]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

export function orderSidebarItems<T>(
  items: T[],
  ids: string[] = [],
  id: (item: T) => string,
): T[] {
  const remaining = new Map(items.map((item) => [id(item), item]));
  const ordered: T[] = [];
  for (const key of ids) {
    const item = remaining.get(key);
    if (item !== undefined) ordered.push(item);
    remaining.delete(key);
  }
  return [...ordered, ...remaining.values()];
}

export function moveSidebarItem(
  ids: string[],
  id: string,
  target: string,
  placement: Placement,
): string[] {
  if (id === target || !ids.includes(id) || !ids.includes(target)) return ids;
  const next = ids.filter((key) => key !== id);
  next.splice(next.indexOf(target) + (placement === "after" ? 1 : 0), 0, id);
  return next;
}

/** Pointer sorting works in the desktop webview without native HTML drag interception. */
export function useSidebarOrder() {
  const [orders, setOrders] = useState<Orders>(() => {
    try {
      return parseSidebarOrder(localStorage.getItem(SIDEBAR_ORDER_KEY));
    } catch {
      return {};
    }
  });
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState<{
    group: string;
    id: string;
    target: Target | null;
  } | null>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_ORDER_KEY, JSON.stringify(orders));
    } catch {
      /* Keep reordering usable when storage is unavailable. */
    }
  }, [orders]);

  const move = (
    group: string,
    ids: string[],
    id: string,
    label: string,
    target: string,
    placement: Placement,
  ) => {
    const next = moveSidebarItem(ids, id, target, placement);
    if (next.every((key, index) => key === ids[index])) return;
    setOrders((current) => ({ ...current, [group]: next }));
    setAnnouncement(
      `${label} moved to position ${next.indexOf(id) + 1} of ${next.length}.`,
    );
  };
  const moveRef = useRef(move);
  moveRef.current = move;

  useEffect(() => {
    let frame = 0;
    let pointerX = 0;
    let pointerY = 0;
    let lastScrollTime = 0;
    const findTarget = (current: Drag) => {
      const row = document
        .elementFromPoint(pointerX, pointerY)
        ?.closest<HTMLElement>("[data-reorder-id]");
      current.target =
        row?.dataset.reorderGroup === current.group &&
        row.dataset.reorderId !== current.id
          ? {
              id: row.dataset.reorderId!,
              placement:
                pointerY <
                row.getBoundingClientRect().top +
                  row.getBoundingClientRect().height / 2
                  ? "before"
                  : "after",
            }
          : null;
      setDragging((previous) =>
        previous?.target?.id === current.target?.id &&
        previous?.target?.placement === current.target?.placement &&
        previous?.id === current.id
          ? previous
          : { group: current.group, id: current.id, target: current.target },
      );
    };
    const scroll = (time: number) => {
      const elapsed = Math.min(1000, Math.max(0, time - lastScrollTime));
      lastScrollTime = time;
      const current = drag.current;
      if (!current?.active) return;
      const viewport = current.row.closest<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      );
      if (viewport) {
        const rect = viewport.getBoundingClientRect();
        if (pointerX >= rect.left && pointerX <= rect.right) {
          const delta =
            pointerY < rect.top + 32 ? -8 : pointerY > rect.bottom - 32 ? 8 : 0;
          if (delta) {
            // Keep the same speed on high-refresh displays and throttled frames.
            viewport.scrollTop += Math.sign(delta) * elapsed * 0.48;
            findTarget(current);
          }
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    const finish = (cancelled: boolean) => {
      const current = drag.current;
      drag.current = null;
      cancelAnimationFrame(frame);
      setDragging(null);
      if (!current?.active) return;
      suppressClick.current = true;
      if (current.row.hasPointerCapture?.(current.pointerId))
        current.row.releasePointerCapture(current.pointerId);
      if (!cancelled && current.target)
        moveRef.current(
          current.group,
          current.ids,
          current.id,
          current.label,
          current.target.id,
          current.target.placement,
        );
    };
    const pointerMove = (event: PointerEvent) => {
      const current = drag.current;
      if (!current || event.pointerId !== current.pointerId) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (!current.active) {
        if (Math.hypot(pointerX - current.x, pointerY - current.y) < 6) return;
        current.active = true;
        current.row.setPointerCapture?.(current.pointerId);
        lastScrollTime = performance.now();
        frame = requestAnimationFrame(scroll);
      }
      event.preventDefault();
      findTarget(current);
    };
    const pointerUp = (event: PointerEvent) => {
      if (event.pointerId === drag.current?.pointerId)
        finish(event.type === "pointercancel");
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && drag.current) {
        event.preventDefault();
        finish(true);
      }
    };
    const blur = () => finish(true);
    const pointerDown = () => {
      suppressClick.current = false;
    };
    const click = (event: MouseEvent) => {
      if (!suppressClick.current || event.detail === 0) return;
      suppressClick.current = false;
      event.preventDefault();
      // Catch gap clicks before Fluid can delegate one to a nearby row.
      event.stopImmediatePropagation();
    };
    window.addEventListener("pointerdown", pointerDown, true);
    window.addEventListener("click", click, true);
    window.addEventListener("pointermove", pointerMove, { passive: false });
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerUp);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("blur", blur);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerdown", pointerDown, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerUp);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("blur", blur);
      drag.current = null;
    };
  }, []);

  return {
    announcement,
    sort: <T>(group: string, items: T[], id: (item: T) => string) =>
      orderSidebarItems(items, orders[group], id),
    row: (group: string, id: string, label: string, ids: string[]) => {
      const index = ids.indexOf(id);
      const shift = (direction: -1 | 1) =>
        move(
          group,
          ids,
          id,
          label,
          ids[index + direction],
          direction < 0 ? "before" : "after",
        );
      const props: HTMLAttributes<HTMLElement> & Record<string, unknown> = {
        "data-reorder-id": id,
        "data-reorder-group": group,
        "data-reorder-dragging":
          dragging?.group === group && dragging.id === id ? "true" : undefined,
        "data-reorder-drop":
          dragging?.group === group && dragging.target?.id === id
            ? dragging.target.placement
            : undefined,
        "aria-describedby": ids.length > 1 ? "sidebar-reorder-help" : undefined,
        onPointerDown: (event) => {
          // Touch keeps native scrolling and long-press menus; those menus also offer move actions.
          if (
            event.button !== 0 ||
            event.pointerType === "touch" ||
            ids.length < 2
          )
            return;
          drag.current = {
            group,
            id,
            label,
            ids,
            pointerId: event.pointerId,
            row: event.currentTarget,
            x: event.clientX,
            y: event.clientY,
            active: false,
            target: null,
          };
        },
        onDragStart: (event) => event.preventDefault(),
        onKeyDownCapture: (event) => {
          if (
            !event.altKey ||
            (event.key !== "ArrowUp" && event.key !== "ArrowDown")
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          const direction = event.key === "ArrowUp" ? -1 : 1;
          if (ids[index + direction]) shift(direction);
        },
      };
      return {
        props,
        actions: [
          ...(index > 0
            ? [{ label: "Move up", icon: ArrowUp, onSelect: () => shift(-1) }]
            : []),
          ...(index >= 0 && index < ids.length - 1
            ? [
                {
                  label: "Move down",
                  icon: ArrowDown,
                  onSelect: () => shift(1),
                },
              ]
            : []),
        ],
      };
    },
  };
}
