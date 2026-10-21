// Adapted from https://www.vivid-layer.com/components/chat-minimap.
// Source snapshot: docs/vendor/vivid-layer/chat-minimap.tsx.
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { HoverCard } from "radix-ui";
import { useReducedMotion } from "motion/react";
import { useMessageScroller } from "./message-scroller";
import { cn } from "@/lib/utils";
import "./chat-minimap.css";

export type ChatMinimapItem = {
  id: string;
  title: string;
  description: string;
};

type ChatMinimapProps = ComponentProps<"nav"> & {
  items: readonly ChatMinimapItem[];
  currentItemId: string | null;
};

export function ChatMinimap({
  items,
  currentItemId,
  className,
  ...props
}: ChatMinimapProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const nav = useRef<HTMLElement>(null);
  const { scrollToMessage } = useMessageScroller();
  const reducedMotion = useReducedMotion();

  // Keep the current turn reachable when a long conversation fills the rail.
  // Only scroll the rail; scrollIntoView would also move the transcript.
  useEffect(() => {
    const rail = nav.current;
    const current = rail?.querySelector<HTMLElement>("[data-current]");
    if (
      !rail ||
      !current ||
      rail.contains(document.activeElement) ||
      rail.matches(":hover")
    )
      return;
    if (
      current.offsetTop < rail.scrollTop ||
      current.offsetTop + current.offsetHeight >
        rail.scrollTop + rail.clientHeight
    )
      rail.scrollTop =
        current.offsetTop - (rail.clientHeight - current.offsetHeight) / 2;
  }, [currentItemId]);

  return (
    <nav
      ref={nav}
      data-slot="chat-minimap"
      aria-label="Chat minimap"
      className={cn("chat-minimap", className)}
      {...props}
    >
      {items.map((item, index) => {
        const isCurrent = item.id === currentItemId;
        return (
          <HoverCard.Root
            key={item.id}
            openDelay={100}
            closeDelay={100}
            open={previewId === item.id}
            onOpenChange={(open) =>
              setPreviewId((previous) =>
                open ? item.id : previous === item.id ? null : previous,
              )
            }
          >
            <HoverCard.Trigger asChild>
              <button
                type="button"
                data-slot="chat-minimap-item"
                data-current={isCurrent || undefined}
                aria-label={`Jump to: ${item.title}`}
                aria-current={isCurrent ? "location" : undefined}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => {
                  setHoveredIndex(index);
                  setPreviewId(item.id);
                }}
                onBlur={() => {
                  setHoveredIndex(null);
                  setPreviewId(null);
                }}
                onClick={() =>
                  scrollToMessage(item.id, {
                    align: "start",
                    behavior: reducedMotion ? "auto" : "smooth",
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setPreviewId(null);
                    return;
                  }
                  const next =
                    event.key === "ArrowDown"
                      ? index + 1
                      : event.key === "ArrowUp"
                        ? index - 1
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? items.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  nav.current
                    ?.querySelectorAll<HTMLButtonElement>("button")
                    [Math.max(0, Math.min(items.length - 1, next))]?.focus();
                }}
              >
                <span
                  data-slot="chat-minimap-marker"
                  style={{ width: getMarkerWidth(index, hoveredIndex) }}
                />
              </button>
            </HoverCard.Trigger>
            <HoverCard.Portal>
              <HoverCard.Content
                data-slot="chat-minimap-preview"
                className="chat-minimap-preview"
                side="right"
                sideOffset={10}
                collisionPadding={12}
              >
                <p className="chat-minimap-title">{item.title}</p>
                {item.description && (
                  <p className="chat-minimap-description">{item.description}</p>
                )}
              </HoverCard.Content>
            </HoverCard.Portal>
          </HoverCard.Root>
        );
      })}
    </nav>
  );
}

// Upstream's cosine lens, adapted from Mantine Lens Select (MIT):
// https://github.com/gfazioli/mantine-lens-select
function getMarkerWidth(index: number, hoveredIndex: number | null) {
  if (hoveredIndex === null) return 12;
  const distance = Math.abs(index - hoveredIndex);
  return distance >= 3
    ? 12
    : 12 + (24 * (1 + Math.cos((Math.PI * distance) / 3))) / 2;
}
