// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BackgroundProcesses, type ToolProcess } from "./BackgroundProcesses";
const call = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ call: (...args: unknown[]) => call(...args) }));
const process: ToolProcess = {
  id: "watch",
  command: "gh pr checks 1916 --watch",
  cwd: "/workspace",
  startedAt: Date.now(),
  wireSessionId: "root",
  output: "Checks pending",
  truncated: false,
  exitCode: null,
  stopped: false,
};
beforeEach(() => {
  call.mockReset();
  window.matchMedia = vi
    .fn()
    .mockReturnValue({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("lists only running processes and opens a terminal instead of an accordion", async () => {
  call.mockResolvedValue([
    process,
    { ...process, id: "finished", command: "git status", exitCode: 0 },
    {
      ...process,
      id: "stopped",
      command: "old watcher",
      stopped: true,
      exitCode: 137,
    },
  ]);
  const onOpen = vi.fn();
  render(<BackgroundProcesses sessionId="chat" onOpen={onOpen} />);
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Background processes" }),
    { button: 0, ctrlKey: false, pointerType: "mouse" },
  );
  await screen.findByRole("menuitem", { name: process.command });
  expect(screen.queryByText("git status")).toBeNull();
  expect(screen.queryByText("old watcher")).toBeNull();
  expect(document.querySelector("details")).toBeNull();
  expect(screen.queryByText("Checks pending")).toBeNull();
  fireEvent.click(screen.getByRole("menuitem", { name: process.command }));
  expect(onOpen).toHaveBeenCalledWith(process);
  await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
});
it("removes a process from the dropdown when it exits", async () => {
  vi.useFakeTimers();
  call
    .mockResolvedValueOnce([process])
    .mockResolvedValue([{ ...process, exitCode: 1 }]);
  render(<BackgroundProcesses sessionId="chat" onOpen={vi.fn()} />);
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Background processes" }),
    { button: 0, ctrlKey: false, pointerType: "mouse" },
  );
  await act(async () => {});
  expect(screen.getByRole("menuitem", { name: process.command })).toBeTruthy();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.queryByRole("menuitem", { name: process.command })).toBeNull();
  expect(screen.getByText("No background processes.")).toBeTruthy();
  expect(document.querySelector(".process-count")).toBeNull();
});
it("does not let stale status open an unverified process", async () => {
  vi.useFakeTimers();
  call.mockResolvedValueOnce([process]).mockRejectedValue(new Error("offline"));
  render(<BackgroundProcesses sessionId="chat" onOpen={vi.fn()} />);
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Background processes" }),
    { button: 0, ctrlKey: false, pointerType: "mouse" },
  );
  await act(async () => {});
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(screen.getByText("Process status unavailable")).toBeTruthy();
  expect(screen.queryByRole("menuitem", { name: process.command })).toBeNull();
});
it("keeps dropdown interactions from starting a header drag", async () => {
  call.mockResolvedValue([process]);
  const drag = vi.fn();
  render(
    <header onMouseDown={drag}>
      <BackgroundProcesses sessionId="chat" onOpen={vi.fn()} />
    </header>,
  );
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Background processes" }),
    { button: 0, ctrlKey: false, pointerType: "mouse" },
  );
  fireEvent.mouseDown(
    await screen.findByRole("menuitem", { name: process.command }),
  );
  expect(drag).not.toHaveBeenCalled();
});
