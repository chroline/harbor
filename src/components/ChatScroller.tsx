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
} from "react";
import { useReducedMotion } from "motion/react";
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
export const useTranscriptScroller = () =>
  useContext(TranscriptScrollerContext);

export function TranscriptRow({
  id,
  anchor = false,
  user = false,
  children,
  ref,
}: {
  id: string;
  anchor?: boolean;
  user?: boolean;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}) {
  const inScroller = useTranscriptScroller();
  return inScroller ? (
    <MessageScrollerItem
      ref={ref}
      messageId={id}
      scrollAnchor={anchor}
      className={user ? "transcript-turn" : undefined}
    >
      {children}
    </MessageScrollerItem>
  ) : (
    <div
      ref={ref}
      data-transcript-row={id}
      className={user ? "transcript-turn" : undefined}
    >
      {children}
    </div>
  );
}

function ScrollContent({
  children,
  savedScrollTop,
  onScrollPosition,
  requestId,
  minimapItems,
}: {
  children: ReactNode;
  savedScrollTop?: number;
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
  const restored = useRef(false);
  const liveEdge = useRef(savedScrollTop === undefined);
  const initialTop = useRef(savedScrollTop);
  const lastRequest = useRef(requestId);
  const reducedMotion = useReducedMotion();
  const { scrollToMessage, scrollToStart } = useMessageScroller();
  const { end } = useMessageScrollerScrollable();

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (viewport.current && initialTop.current !== undefined) {
        // Enter the primitive's free-scrolling mode before restoring pixels,
        // so its next content measurement cannot follow output over the saved view.
        scrollToStart({ behavior: "auto" });
        viewport.current.scrollTop = initialTop.current;
      }
      restored.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToStart]);

  const attachViewport = useCallback((element: HTMLDivElement | null) => {
    // A conversation can switch before the browser dispatches its final scroll
    // event. Save the actual DOM position while its viewport is still attached.
    if (!element && viewport.current && restored.current) {
      onPosition.current(viewport.current.scrollTop);
    }
    viewport.current = element;
  }, []);

  useEffect(() => {
    if (restored.current) liveEdge.current = !end;
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
        <ChatMinimap items={minimapItems} currentItemId={currentItemId} />
      )}
      <MessageScroller className="conversation-scroll">
        <MessageScrollerViewport
          ref={attachViewport}
          onScroll={() => {
            if (viewport.current && restored.current)
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
  savedScrollTop,
  ...props
}: {
  ready: boolean;
  savedScrollTop?: number;
  children: ReactNode;
  onScrollPosition: (top: number) => void;
  requestId?: string;
  minimapItems: readonly ChatMinimapItem[];
}) {
  // The primitive treats a changed default as a new opening request. Keep it
  // fixed for this keyed conversation, even after scroll events populate its
  // in-memory saved position.
  const openingPosition = useRef<"start" | "end">(
    savedScrollTop !== undefined ? "start" : "end",
  );
  if (!ready)
    return (
      <div className="conversation-scroll" aria-label="Loading messages" />
    );
  return (
    <MessageScrollerProvider
      autoScroll
      defaultScrollPosition={openingPosition.current}
      scrollEdgeThreshold={100}
    >
      <ScrollContent {...props} savedScrollTop={savedScrollTop} />
    </MessageScrollerProvider>
  );
}
