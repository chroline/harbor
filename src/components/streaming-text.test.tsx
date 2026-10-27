// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { StreamingText } from "./ui/streaming-text";

function mockMotion(reduced: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduced && String(query).includes("prefers-reduced-motion"),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  }));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("keeps the reply so far and reveals words that arrive afterward", () => {
  mockMotion(false);
  vi.useFakeTimers();
  const view = render(<StreamingText wordMs={16}>Hello</StreamingText>);
  expect(view.container.textContent).toBe("Hello");
  expect(view.container.querySelector(".streaming-word")).toBeNull();

  view.rerender(<StreamingText wordMs={16}>Hello there friend</StreamingText>);
  expect(view.container.textContent).toBe("Hello");

  act(() => {
    vi.advanceTimersByTime(16);
  });
  expect(view.container.textContent).toBe("Hello there");
  act(() => {
    vi.advanceTimersByTime(16);
  });
  expect(view.container.textContent).toBe("Hello there friend");
  expect(
    [...view.container.querySelectorAll(".streaming-word")].map(
      (word) => word.textContent,
    ),
  ).toEqual(["there", "friend"]);
});

it("shows a reduced-motion reply immediately, without the word animation", () => {
  mockMotion(true);
  vi.useFakeTimers();
  const view = render(<StreamingText wordMs={16}>Hello</StreamingText>);
  view.rerender(<StreamingText wordMs={16}>Hello there</StreamingText>);
  expect(view.container.textContent).toBe("Hello there");
  expect(view.container.querySelector(".streaming-word")).toBeNull();
  act(() => {
    vi.advanceTimersByTime(32);
  });
  expect(view.container.querySelector(".streaming-word")).toBeNull();
});
