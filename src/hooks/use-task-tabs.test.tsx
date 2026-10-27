// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createPortal } from "react-dom";
import {
  moveTaskTab,
  orderTaskTabs,
  shouldDetachTab,
  useTaskTabs,
} from "./use-task-tabs";
vi.mock("../lib/api", () => ({ call: vi.fn().mockResolvedValue([]) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const tabs = ["parent", "worker:one", "shell:two"].map((id) => ({ id }));
function Strip({
  detach = vi.fn().mockResolvedValue(undefined),
}: {
  detach?: (id: string, x: number, y: number) => Promise<void>;
}) {
  const state = useTaskTabs("chat", detach, vi.fn());
  const ordered = orderTaskTabs(tabs, state.order);
  return (
    <div role="tablist">
      {ordered.map((tab) => {
        const surface = (
          <span className="task-tab-surface" {...state.surfaceProps(tab.id)}>
            {tab.id}
          </span>
        );
        return (
          <button
            key={tab.id}
            aria-label={tab.id}
            {...state.props(
              tab.id,
              tab.id,
              ordered.map((t) => t.id),
            )}
          >
            {state.dragging === tab.id
              ? createPortal(surface, document.body)
              : surface}
          </button>
        );
      })}
      <output>{state.detached.join(",")}</output>
    </div>
  );
}
function dragSetup() {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const list = screen.getByRole("tablist");
  vi.spyOn(list, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 600, 40),
  );
  screen.getAllByRole("button").forEach((tab, index) => {
    vi.spyOn(tab, "getBoundingClientRect").mockReturnValue(
      new DOMRect(index * 200, 0, 200, 40),
    );
  });
}
it("orders known tabs once, appends new tabs, and ignores missing saved tabs", () => {
  expect(
    orderTaskTabs(tabs, ["missing", "shell:two", "shell:two"]).map((t) => t.id),
  ).toEqual(["shell:two", "parent", "worker:one"]);
  expect(
    moveTaskTab(
      tabs.map((t) => t.id),
      "parent",
      "shell:two",
      true,
    ),
  ).toEqual(["worker:one", "shell:two", "parent"]);
});
it("reorders across tab types by dragging and retains that order after remount", () => {
  const { unmount } = render(<Strip />);
  dragSetup();
  fireEvent.pointerDown(screen.getByRole("button", { name: "parent" }), {
    button: 0,
    clientX: 100,
    clientY: 20,
  });
  fireEvent.pointerMove(window, { clientX: 550, clientY: 20 });
  expect(
    document.querySelector<HTMLElement>('[data-task-tab-surface="parent"]')!
      .style.position,
  ).toBe("fixed");
  expect(
    document.querySelector<HTMLElement>('[data-task-tab-surface="parent"]')!
      .style.transform,
  ).toContain("450px");
  expect(
    screen.getByRole("button", { name: "worker:one" }).style.transform,
  ).toContain("-200px");
  fireEvent.pointerUp(window, { clientX: 550, clientY: 20 });
  expect(screen.getAllByRole("button").map((e) => e.textContent)).toEqual([
    "worker:one",
    "shell:two",
    "parent",
  ]);
  unmount();
  render(<Strip />);
  expect(screen.getAllByRole("button").map((e) => e.textContent)).toEqual([
    "worker:one",
    "shell:two",
    "parent",
  ]);
});
it("lifts the real surface outside the scrolling rail and returns it after cancellation", () => {
  render(<Strip />);
  dragSetup();
  fireEvent.pointerDown(screen.getByRole("button", { name: "parent" }), {
    button: 0,
    clientX: 100,
    clientY: 20,
  });
  fireEvent.pointerMove(window, { clientX: 140, clientY: 35 });
  const floating = document.querySelector<HTMLElement>(
    '[data-task-tab-surface="parent"]',
  )!;
  expect(floating.parentElement).toBe(document.body);
  expect(floating.getAttribute("style")).toContain("position: fixed");
  expect(screen.getByRole("button", { name: "parent" }).style.height).toBe(
    "40px",
  );
  fireEvent.keyDown(window, { key: "Escape" });
  expect(
    screen
      .getByRole("button", { name: "parent" })
      .querySelector(".task-tab-surface"),
  ).not.toBeNull();
  expect(document.body.querySelector(":scope > .task-tab-surface")).toBeNull();
});
it("swaps at the pointer crossing 50 percent, even when grabbed near the right edge", () => {
  render(<Strip />);
  dragSetup();
  const parent = screen.getByRole("button", { name: "parent" });
  const worker = screen.getByRole("button", { name: "worker:one" });
  fireEvent.pointerDown(parent, { button: 0, clientX: 195, clientY: 20 });
  fireEvent.pointerMove(window, { clientX: 299, clientY: 20 });
  expect(worker.style.transform).toContain("translate3d(0px");
  fireEvent.pointerMove(window, { clientX: 301, clientY: 20 });
  expect(worker.style.transform).toContain("-200px");
  // The worker now occupies the first slot. Crossing its old midpoint again
  // must not undo the swap; moving past its new midpoint does.
  fireEvent.pointerMove(window, { clientX: 299, clientY: 20 });
  expect(worker.style.transform).toContain("-200px");
  fireEvent.pointerMove(window, { clientX: 99, clientY: 20 });
  expect(worker.style.transform).toContain("translate3d(0px");
  fireEvent.pointerUp(window);
  expect(screen.getAllByRole("button").map((tab) => tab.textContent)).toEqual([
    "parent",
    "worker:one",
    "shell:two",
  ]);
});
it("swaps leftward at the pointer midpoint regardless of the grab position", () => {
  render(<Strip />);
  dragSetup();
  const shell = screen.getByRole("button", { name: "shell:two" });
  const worker = screen.getByRole("button", { name: "worker:one" });
  fireEvent.pointerDown(shell, { button: 0, clientX: 405, clientY: 20 });
  fireEvent.pointerMove(window, { clientX: 301, clientY: 20 });
  expect(worker.style.transform).toContain("translate3d(0px");
  fireEvent.pointerMove(window, { clientX: 299, clientY: 20 });
  expect(worker.style.transform).toContain("200px");
  fireEvent.pointerMove(window, { clientX: 99, clientY: 20 });
  fireEvent.pointerUp(window);
  expect(screen.getAllByRole("button").map((tab) => tab.textContent)).toEqual([
    "shell:two",
    "parent",
    "worker:one",
  ]);
});
it("detaches during a decisive off-rail drag before release, once per gesture", async () => {
  const detach = vi.fn().mockResolvedValue(undefined);
  render(<Strip detach={detach} />);
  dragSetup();
  const first = screen.getByRole("button", { name: "parent" });
  fireEvent.pointerDown(first, { button: 0, clientX: 100, clientY: 20 });
  fireEvent.pointerMove(window, {
    clientX: 100,
    clientY: 150,
    screenX: 900,
    screenY: 500,
  });
  await waitFor(() => expect(detach).toHaveBeenCalledWith("parent", 900, 500));
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe("parent"),
  );
  fireEvent.pointerMove(window, { clientX: 100, clientY: 200 });
  fireEvent.pointerUp(window, { clientX: 100, clientY: 200 });
  expect(detach).toHaveBeenCalledTimes(1);
});
it("allows slight vertical drift and Escape restores the original arrangement", () => {
  const detach = vi.fn();
  render(<Strip detach={detach} />);
  dragSetup();
  fireEvent.pointerDown(screen.getByRole("button", { name: "parent" }), {
    button: 0,
    clientX: 100,
    clientY: 20,
  });
  fireEvent.pointerMove(window, { clientX: 550, clientY: 55 });
  expect(detach).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.pointerUp(window, { clientX: 550, clientY: 55 });
  expect(screen.getAllByRole("button").map((e) => e.textContent)).toEqual([
    "parent",
    "worker:one",
    "shell:two",
  ]);
  expect(
    screen.getByRole("button", { name: "worker:one" }).style.transform,
  ).toBe("");
  expect(detach).not.toHaveBeenCalled();
});
it("requires deliberate distance or a fast outward pull to detach", () => {
  expect(shouldDetachTab(0, 15, 50, 2)).toBe(false);
  expect(shouldDetachTab(0, 30, 50, 0.1)).toBe(false);
  expect(shouldDetachTab(0, 30, 50, 1)).toBe(true);
  expect(shouldDetachTab(0, 56, 76, 0.1)).toBe(true);
  expect(shouldDetachTab(80, 0, 100, 0.1)).toBe(true);
});
it("supports keyboard reordering without detaching", () => {
  const detach = vi.fn();
  render(<Strip detach={detach} />);
  fireEvent.keyDown(screen.getByRole("button", { name: "parent" }), {
    key: "ArrowRight",
    altKey: true,
  });
  expect(screen.getAllByRole("button").map((e) => e.textContent)).toEqual([
    "worker:one",
    "parent",
    "shell:two",
  ]);
  expect(detach).not.toHaveBeenCalled();
});
