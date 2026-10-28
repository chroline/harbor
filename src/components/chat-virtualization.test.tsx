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
