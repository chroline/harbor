// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSidebarOrder } from "./sidebar-order";

function List({ onSelect = () => {} }: { onSelect?: () => void }) {
  const order = useSidebarOrder();
  return (
    <div
      data-slot="scroll-area-viewport"
      data-testid="viewport"
      onClick={(event) => {
        // Fluid delegates clicks on menu gaps to the nearest row.
        if (event.target === event.currentTarget)
          event.currentTarget.querySelector("button")!.click();
      }}
    >
      {["a", "b"].map((id) => (
        <button
          key={id}
          onClick={onSelect}
          {...order.row("projects", id, id, ["a", "b"]).props}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("scrolls consistently when drag animation frames are throttled and stops on cancellation", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.spyOn(performance, "now").mockReturnValue(0);
  const request = vi
    .fn<(callback: FrameRequestCallback) => number>()
    .mockReturnValue(1);
  const cancel = vi.fn();
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  render(<List />);
  const viewport = screen.getByTestId("viewport");
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 100, 100),
  );
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => screen.getByRole("button", { name: "b" }),
  });

  fireEvent.pointerDown(screen.getByRole("button", { name: "a" }), {
    button: 0,
    clientX: 50,
    clientY: 10,
  });
  fireEvent.pointerMove(window, { clientX: 50, clientY: 95 });
  act(() => request.mock.calls.at(-1)![0](500));
  expect(viewport.scrollTop).toBe(240);
  act(() => request.mock.calls.at(-1)![0](1000));
  expect(viewport.scrollTop).toBe(480);
  fireEvent.keyDown(window, { key: "Escape" });
  expect(cancel).toHaveBeenCalledWith(1);
  const frames = request.mock.calls.length;
  act(() => request.mock.calls.at(-1)![0](1500));
  expect(viewport.scrollTop).toBe(480);
  expect(request).toHaveBeenCalledTimes(frames);
});

it("suppresses the drag release before a menu can delegate it to a different row", () => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal("requestAnimationFrame", vi.fn().mockReturnValue(1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const selected = vi.fn();
  render(<List onSelect={selected} />);
  const viewport = screen.getByTestId("viewport");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => screen.getByRole("button", { name: "b" }),
  });
  fireEvent.pointerDown(screen.getByRole("button", { name: "a" }), {
    button: 0,
    clientX: 10,
    clientY: 10,
  });
  fireEvent.pointerMove(window, { clientX: 20, clientY: 40 });
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.pointerUp(window);
  fireEvent.click(viewport, { detail: 1 });
  expect(selected).not.toHaveBeenCalled();
  fireEvent.pointerDown(viewport, { button: 0 });
  fireEvent.click(viewport, { detail: 1 });
  expect(selected).toHaveBeenCalledOnce();
});
