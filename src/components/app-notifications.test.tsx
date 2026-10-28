// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { AppNotifications } from "./AppNotifications";
import { Toaster, toast } from "./ui/toaster";
import type { SessionRecord } from "../lib/bindings/SessionRecord";

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  act(() => toast.dismiss());
  vi.useRealTimers();
});
const session = (status: string, id = "task") =>
  ({
    id,
    status,
    title: `Task ${id}`,
    archived: false,
    error: null,
  }) as SessionRecord;
const base = {
  error: null,
  onDismissError: vi.fn(),
  sessions: [],
  ready: true,
};
const cards = () =>
  document.querySelectorAll(".ui-tsc__toast:not([data-removing])");

it("updates the application error in one card and clears it on dismissal", () => {
  const dismiss = vi.fn();
  const { rerender } = render(
    <AppNotifications
      {...base}
      error="First failure"
      onDismissError={dismiss}
    />,
  );
  rerender(
    <AppNotifications {...base} error="New failure" onDismissError={dismiss} />,
  );
  expect(cards()).toHaveLength(1);
  expect(
    cards()[0].querySelector(".ui-tsc__copy:not(.ui-tsc__ghost)")?.textContent,
  ).toContain("New failure");
  expect(dismiss).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
  expect(dismiss).toHaveBeenCalledOnce();
});

it("does not replay existing statuses and opens a newly finished chat", () => {
  const open = vi.fn();
  const { rerender } = render(
    <AppNotifications
      {...base}
      sessions={[session("working"), session("needs_input", "old")]}
      onOpenSession={open}
    />,
  );
  expect(cards()).toHaveLength(0);
  rerender(
    <AppNotifications
      {...base}
      sessions={[session("completed"), session("needs_input", "old")]}
      onOpenSession={open}
    />,
  );
  expect(cards()).toHaveLength(1);
  expect(cards()[0].textContent).toContain("Task finished");
  // Unrelated refreshes must not dismiss a completion that is still on screen.
  rerender(
    <AppNotifications
      {...base}
      sessions={[session("completed"), session("needs_input", "old")]}
      onOpenSession={open}
    />,
  );
  expect(cards()).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
  expect(open).toHaveBeenCalledWith("task");
});

it("updates attention in place and dismisses it when the agent resumes", () => {
  const { rerender } = render(
    <AppNotifications {...base} sessions={[session("working")]} />,
  );
  rerender(<AppNotifications {...base} sessions={[session("needs_input")]} />);
  expect(cards()[0].textContent).toContain("Agent needs your input");
  rerender(<AppNotifications {...base} sessions={[session("error")]} />);
  expect(cards()).toHaveLength(1);
  expect(
    cards()[0].querySelector(".ui-tsc__copy:not(.ui-tsc__ghost)")?.textContent,
  ).toContain("Task interrupted");
  rerender(<AppNotifications {...base} sessions={[session("working")]} />);
  expect(cards()).toHaveLength(0);
});

it("keeps the active conversation quiet and removes notifications for deleted chats", () => {
  const { rerender } = render(
    <AppNotifications
      {...base}
      sessions={[session("working")]}
      activeSessionId="task"
    />,
  );
  rerender(
    <AppNotifications
      {...base}
      sessions={[session("needs_input")]}
      activeSessionId="task"
    />,
  );
  expect(cards()).toHaveLength(0);
  rerender(<AppNotifications {...base} sessions={[session("error")]} />);
  expect(cards()).toHaveLength(1);
  rerender(<AppNotifications {...base} sessions={[]} />);
  expect(cards()).toHaveLength(0);
});

it("uses the original promise morph and preserves the result", async () => {
  render(<Toaster />);
  let resolve!: (value: string) => void;
  const work = new Promise<string>((done) => {
    resolve = done;
  });
  let result!: Promise<string>;
  act(() => {
    result = toast.promise(work, {
      loading: "Saving",
      success: (value) => `Saved ${value}`,
      error: "Failed",
    });
  });
  const id = cards()[0].getAttribute("data-toast-id");
  expect(cards()[0].getAttribute("data-type")).toBe("loading");
  await act(async () => {
    resolve("draft");
    await result;
  });
  expect(await result).toBe("draft");
  expect(cards()).toHaveLength(1);
  expect(cards()[0].getAttribute("data-toast-id")).toBe(id);
  expect(cards()[0].getAttribute("data-type")).toBe("success");
});

it("pauses the original timer while the pointer is over the stack", () => {
  vi.useFakeTimers();
  render(<Toaster />);
  act(() => {
    toast.success("Saved", { duration: 1000 });
  });
  act(() => {
    vi.advanceTimersByTime(400);
  });
  const region = screen.getByRole("region", { name: "Notifications (F8)" });
  fireEvent.pointerEnter(region, { pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(2000);
  });
  expect(cards()).toHaveLength(1);
  fireEvent.pointerLeave(region, { pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(601);
  });
  expect(cards()).toHaveLength(0);
});
