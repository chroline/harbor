import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
  type ReactNode,
  type CSSProperties,
  type FocusEventHandler,
} from "react";
import { useReducedMotion } from "motion/react";
import { flushSync } from "react-dom";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
} from "./ui/message-scroller";

import { ChatMinimap, type ChatMinimapItem } from "./ui/chat-minimap";

const OVERLAP_CLEARANCE = 8;
const GUTTER_CLEARANCE = 12;
const REVEAL_TURN_EVENT = "harbor:reveal-turn";
const TURN_OVERSCAN = 1200;

function minimapOverlapsContent(root: HTMLElement) {
  const content = root.querySelector<HTMLElement>(".conversation-content");
  const minimap = root.querySelector<HTMLElement>(".chat-minimap");
  if (!content || !minimap) return false;
  const padding =
    Number.parseFloat(getComputedStyle(content).paddingInlineStart) || 0;
  // Compare against the text and bubbles, not the column's empty padding.
  return (
    content.getBoundingClientRect().left + padding <
    minimap.getBoundingClientRect().right + OVERLAP_CLEARANCE
  );
}

function pointerInMinimapGutter(root: HTMLElement, clientX: number) {
  const minimap = root.querySelector<HTMLElement>(".chat-minimap");
  if (!minimap) return false;
  const rootLeft = root.getBoundingClientRect().left;
  return (
    clientX - rootLeft <=
    minimap.getBoundingClientRect().right - rootLeft + GUTTER_CLEARANCE
  );
}

const TranscriptScrollerContext = createContext(false);
const TranscriptHeightsContext = createContext<Map<string, number> | null>(
  null,
);
export const useTranscriptScroller = () =>
  useContext(TranscriptScrollerContext);

export function TranscriptRow({
  id,
  anchor = false,
  user = false,
  children,
  ref,
  style,
  onFocusCapture,
  onBlurCapture,
  virtualMounted,
}: {
  id: string;
  anchor?: boolean;
  user?: boolean;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
  style?: CSSProperties;
  onFocusCapture?: FocusEventHandler<HTMLDivElement>;
  onBlurCapture?: FocusEventHandler<HTMLDivElement>;
  virtualMounted?: boolean;
}) {
  const inScroller = useTranscriptScroller();
  return inScroller ? (
    <MessageScrollerItem
      ref={ref}
      style={style}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
      data-virtual-mounted={virtualMounted}
      messageId={id}
      scrollAnchor={anchor}
      className={user ? "transcript-turn" : undefined}
    >
      {children}
    </MessageScrollerItem>
  ) : (
    <div
      ref={ref}
      style={style}
      onFocusCapture={onFocusCapture}
      onBlurCapture={onBlurCapture}
      data-virtual-mounted={virtualMounted}
      data-transcript-row={id}
      className={user ? "transcript-turn" : undefined}
    >
      {children}
    </div>
  );
}

/** Keep stable scroll targets while unmounting expensive offscreen markdown,
 * images, and tool output. Virtualize whole turns to preserve sticky prompts. */
export function VirtualTranscriptTurn({
  id,
  anchor = false,
  user = false,
  live = false,
  children,
}: {
  id: string;
  anchor?: boolean;
  user?: boolean;
  live?: boolean;
  children: ReactNode;
}) {
  const inScroller = useTranscriptScroller();
  const enabled = inScroller && typeof IntersectionObserver !== "undefined";
  const heights = useContext(TranscriptHeightsContext);
  const row = useRef<HTMLDivElement>(null);
  const height = useRef(heights?.get(id) ?? 240);
  const [nearby, setNearby] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [focused, setFocused] = useState(false);
  const mounted = !enabled || nearby || revealed || live || focused;

  useLayoutEffect(() => {
    const element = row.current;
    if (!element || !enabled) return;
    const root = element.closest<HTMLElement>(
      '[data-slot="message-scroller-viewport"]',
    );
    const observer = new IntersectionObserver(
      ([entry]) => setNearby(entry.isIntersecting),
      { root, rootMargin: `${TURN_OVERSCAN}px 0px` },
    );
    let revealFrame = 0;
    const reveal = () => {
      setRevealed(true);
      cancelAnimationFrame(revealFrame);
      // Hold premeasured content until the jump's intersection observations
      // arrive, then let visibility own it again (including unused overscan).
      revealFrame = requestAnimationFrame(() => {
        revealFrame = requestAnimationFrame(() => setRevealed(false));
      });
    };
    element.addEventListener(REVEAL_TURN_EVENT, reveal);
    observer.observe(element);
    return () => {
      element.removeEventListener(REVEAL_TURN_EVENT, reveal);
      observer.disconnect();
      cancelAnimationFrame(revealFrame);
    };
  }, [enabled]);

  useLayoutEffect(() => {
    const element = row.current;
    if (!element || !mounted) return;
    const measure = () => {
      height.current = element.getBoundingClientRect().height;
      heights?.set(id, height.current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mounted, heights, id]);

  return (
    <TranscriptRow
      ref={row}
      id={id}
      anchor={anchor}
      user={user}
      style={mounted ? undefined : { height: height.current }}
      virtualMounted={mounted}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      {mounted && children}
    </TranscriptRow>
  );
}

function ScrollContent({
  children,
  onScrollPosition,
  requestId,
  minimapItems,
}: {
  children: ReactNode;
  onScrollPosition: (top: number) => void;
  requestId?: string;
  minimapItems: readonly ChatMinimapItem[];
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const scrollFrame = useRef<HTMLDivElement>(null);
  const pointerX = useRef<number | null>(null);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [overlaps, setOverlaps] = useState(false);
  const [gutter, setGutter] = useState(false);
  const showMinimap = minimapItems.length > 1;

  useLayoutEffect(() => {
    const root = scrollFrame.current;
    if (!root || !showMinimap) {
      setOverlaps(false);
      return;
    }
    const measure = () => {
      setOverlaps((current) => {
        const next = minimapOverlapsContent(root);
        return current === next ? current : next;
      });
      if (pointerX.current === null) return;
      const inGutter = pointerInMinimapGutter(root, pointerX.current);
      setGutter((current) => (current === inGutter ? current : inGutter));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    const content = root.querySelector(".conversation-content");
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [showMinimap]);

  const trackPointer = (event: { clientX: number }) => {
    const root = scrollFrame.current;
    if (!root) return;
    pointerX.current = event.clientX;
    const inGutter = pointerInMinimapGutter(root, event.clientX);
    setGutter((current) => (current === inGutter ? current : inGutter));
  };

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element || !minimapItems.length) return;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const readingLine = element.getBoundingClientRect().top + 80;
        const ids = new Set(minimapItems.map((item) => item.id));
        let current = minimapItems[0].id;
        for (const row of element.querySelectorAll<HTMLElement>(
          "[data-message-id]",
        )) {
          if (
            ids.has(row.dataset.messageId!) &&
            row.getBoundingClientRect().top <= readingLine
          )
            current = row.dataset.messageId!;
        }
        setCurrentItemId(current);
      });
    };
    element.addEventListener("scroll", sync, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(element);
    if (element.firstElementChild) observer?.observe(element.firstElementChild);
    sync();
    return () => {
      element.removeEventListener("scroll", sync);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [minimapItems]);
  const onPosition = useRef(onScrollPosition);
  onPosition.current = onScrollPosition;
  const opened = useRef(false);
  const liveEdge = useRef(true);
  const lastRequest = useRef(requestId);
  const reducedMotion = useReducedMotion();
  const { scrollToMessage, scrollToEnd } = useMessageScroller();
  const { end } = useMessageScrollerScrollable();

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollToEnd({ behavior: "auto" });
      opened.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToEnd]);

  const attachViewport = useCallback((element: HTMLDivElement | null) => {
    // A conversation can switch before the browser dispatches its final scroll
    // event. Save the actual DOM position while its viewport is still attached.
    if (!element && viewport.current && opened.current) {
      onPosition.current(viewport.current.scrollTop);
    }
    viewport.current = element;
  }, []);

  useEffect(() => {
    if (opened.current) liveEdge.current = !end;
  }, [end]);

  useEffect(() => {
    const changed = requestId && requestId !== lastRequest.current;
    lastRequest.current = requestId;
    if (changed && liveEdge.current)
      scrollToMessage(requestId, { align: "nearest", behavior: "auto" });
  }, [requestId, scrollToMessage]);

  return (
    <div
      className="conversation-scroll-frame"
      ref={scrollFrame}
      data-minimap-overlaps={overlaps || undefined}
      data-minimap-gutter={(overlaps && gutter) || undefined}
      onPointerMove={showMinimap ? trackPointer : undefined}
      onPointerDown={showMinimap ? trackPointer : undefined}
      onPointerLeave={() => {
        pointerX.current = null;
        setGutter(false);
      }}
    >
      {showMinimap && (
        <ChatMinimap
          items={minimapItems}
          currentItemId={currentItemId}
          onNavigate={(id, options) => {
            const root = viewport.current;
            const target =
              root &&
              Array.from(
                root.querySelectorAll<HTMLElement>("[data-virtual-mounted]"),
              ).find((row) => row.dataset.messageId === id);
            if (!root || !target) {
              return scrollToMessage(id, options);
            }
            const bounds = target.getBoundingClientRect();
            const view = root.getBoundingClientRect();
            if (
              target.dataset.virtualMounted === "true" &&
              bounds.bottom >= view.top - TURN_OVERSCAN &&
              bounds.top <= view.bottom + TURN_OVERSCAN
            )
              return scrollToMessage(id, options);
            // Measure the destination before the primitive calculates its
            // offset. Smoothly traversing unmeasured turns changes that offset
            // mid-animation, so distant virtual jumps use an immediate scroll.
            const candidates = Array.from(
              root.querySelectorAll<HTMLElement>("[data-virtual-mounted]"),
            ).filter((row) => {
              const rect = row.getBoundingClientRect();
              return (
                rect.bottom >= bounds.top - TURN_OVERSCAN &&
                rect.top <= bounds.bottom + root.clientHeight + TURN_OVERSCAN
              );
            });
            flushSync(() => {
              for (const row of candidates)
                row.dispatchEvent(new Event(REVEAL_TURN_EVENT));
            });
            return scrollToMessage(id, { ...options, behavior: "auto" });
          }}
        />
      )}
      <MessageScroller className="conversation-scroll">
        <MessageScrollerViewport
          ref={attachViewport}
          onScroll={() => {
            if (viewport.current && opened.current)
              onScrollPosition(viewport.current.scrollTop);
          }}
        >
          <MessageScrollerContent className="conversation-content chat-transcript">
            <TranscriptScrollerContext.Provider value={true}>
              {children}
            </TranscriptScrollerContext.Provider>
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton
          aria-label="Scroll to latest"
          behavior={reducedMotion ? "auto" : "smooth"}
        />
      </MessageScroller>
    </div>
  );
}

/** Key this component by conversation so each provider has one scroll owner. */
export function ChatScroller({
  ready,
  heightCache,
  ...props
}: {
  ready: boolean;
  heightCache?: Map<string, number>;
  children: ReactNode;
  onScrollPosition: (top: number) => void;
  requestId?: string;
  minimapItems: readonly ChatMinimapItem[];
}) {
  if (!ready)
    return (
      <div className="conversation-scroll" aria-label="Loading messages" />
    );
  return (
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition="end"
      scrollEdgeThreshold={100}
    >
      <TranscriptHeightsContext.Provider value={heightCache ?? null}>
        <ScrollContent {...props} />
      </TranscriptHeightsContext.Provider>
    </MessageScrollerProvider>
  );
}
