// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { ChatScroller, VirtualTranscriptTurn } from "./ChatScroller";

const observers: {
  target?: Element;
  callback: IntersectionObserverCallback;
}[] = [];
beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      entry: (typeof observers)[number];
      constructor(callback: IntersectionObserverCallback) {
        this.entry = { callback };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  window.matchMedia = vi.fn().mockReturnValue({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
  Element.prototype.scrollTo = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("unmounts offscreen content, retains measured space and IDs, and protects focused controls", () => {
  const heightCache = new Map<string, number>();
  const { container, unmount } = render(
    <ChatScroller
      ready
      heightCache={heightCache}
      onScrollPosition={() => {}}
      minimapItems={[]}
    >
      <VirtualTranscriptTurn id="old">
        <button>Old control</button>
      </VirtualTranscriptTurn>
      <VirtualTranscriptTurn id="live" live>
        <p>Streaming reply</p>
      </VirtualTranscriptTurn>
    </ChatScroller>,
  );
  const old = container.querySelector<HTMLElement>('[data-message-id="old"]')!;
  const observer = observers.find((o) => o.target === old)!;
  const visibility = (visible: boolean) =>
    act(() =>
      observer.callback(
        [
          {
            target: old,
            isIntersecting: visible,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      ),
    );
  expect(screen.queryByText("Old control")).toBeNull();
  expect(screen.getByText("Streaming reply")).toBeTruthy();
  expect(old.style.height).toBe("240px");
  vi.spyOn(old, "getBoundingClientRect").mockReturnValue({
    height: 640,
  } as DOMRect);
  visibility(true);
  const button = screen.getByText("Old control");
  fireEvent.focus(button);
  visibility(false);
  expect(screen.getByText("Old control")).toBeTruthy();
  fireEvent.blur(button, { relatedTarget: document.body });
  expect(screen.queryByText("Old control")).toBeNull();
  expect(old.style.height).toBe("640px");
  expect(old.dataset.messageId).toBe("old");
  visibility(true);
  expect(screen.getByText("Old control")).toBeTruthy();
  unmount();
  const restored = render(
    <ChatScroller
      ready
      heightCache={heightCache}
      onScrollPosition={() => {}}
      minimapItems={[]}
    >
      <VirtualTranscriptTurn id="old">
        <button>Old control</button>
      </VirtualTranscriptTurn>
    </ChatScroller>,
  );
  expect(
    restored.container.querySelector<HTMLElement>('[data-message-id="old"]')!
      .style.height,
  ).toBe("640px");
});

it("glides follow-end scroll updates smoothly and cancels on user wheel input", () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });
  let frameId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = ++frameId;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });

  const { container } = render(
    <ChatScroller
      ready
      onScrollPosition={() => {}}
      minimapItems={[]}
    >
      <VirtualTranscriptTurn id="live" live>
        <p>Streaming reply</p>
      </VirtualTranscriptTurn>
    </ChatScroller>,
  );

  const viewport = container.querySelector<HTMLElement>(
    '[data-slot="message-scroller-viewport"]',
  )!;
  Object.defineProperty(viewport, "scrollHeight", {
    configurable: true,
    value: 1000,
  });
  Object.defineProperty(viewport, "clientHeight", {
    configurable: true,
    value: 600,
  });
  viewport.scrollTop = 300;
  viewport.setAttribute("data-autoscrolling", "");
  viewport.removeAttribute("data-pending-scroll");

  viewport.scrollTo({ top: 400, behavior: "auto" });
  // Glide waits for rAF rather than snapping immediately to 400.
  expect(viewport.scrollTop).toBe(300);

  let now = 16;
  for (let i = 0; i < 4 && frames.size > 0; i++) {
    const batch = [...frames.entries()];
    frames.clear();
    for (const [, cb] of batch) cb(now);
    now += 16;
  }
  expect(viewport.scrollTop).toBeGreaterThan(300);
  expect(viewport.scrollTop).toBeLessThan(400);

  // User wheel cancels the active glide immediately.
  fireEvent.wheel(viewport, { deltaY: -100 });
  const stoppedAt = viewport.scrollTop;
  const remaining = [...frames.entries()];
  frames.clear();
  for (const [, cb] of remaining) cb(now + 16);
  expect(viewport.scrollTop).toBe(stoppedAt);
});
