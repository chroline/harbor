// @vitest-environment jsdom
import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProcessTerminal } from "./ProcessTerminal";
import type { ToolProcess } from "../hooks/use-tool-processes";
const mock = vi.hoisted(() => ({
  call: vi.fn(),
  write: vi.fn(),
  reset: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock("../lib/api", () => ({ call: mock.call }));
vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    write = mock.write;
    reset = mock.reset;
    dispose = mock.dispose;
    loadAddon() {}
    open() {}
  },
}));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
const process: ToolProcess = {
  id: "watch",
  command: "watch CI",
  cwd: "/workspace",
  startedAt: 1,
  wireSessionId: "root",
  output: "pending\n",
  truncated: false,
  exitCode: null,
  stopped: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
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
  vi.useRealTimers();
});
it("streams the existing process output and keeps its final output after exit", async () => {
  mock.call
    .mockResolvedValueOnce([process])
    .mockResolvedValue([
      { ...process, output: "pending\nfailed\n", exitCode: 1 },
    ]);
  render(<ProcessTerminal sessionId="chat" initial={process} visible />);
  await act(async () => {});
  expect(mock.write).toHaveBeenCalledWith("pending\n");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(mock.write).toHaveBeenCalledWith("failed\n");
  expect(mock.reset).not.toHaveBeenCalled();
  expect(screen.getByText("Exited 1")).toBeTruthy();
  expect(screen.queryByText("Stop process")).toBeNull();
});
it("stops the original process and does not stop it when its tab closes", async () => {
  mock.call.mockResolvedValue([process]);
  const view = render(
    <ProcessTerminal sessionId="chat" initial={process} visible />,
  );
  await act(async () => {});
  fireEvent.click(screen.getByText("Stop process"));
  await act(async () => {});
  expect(mock.call).toHaveBeenCalledWith("stop_tool_process", {
    sessionId: "chat",
    processId: "watch",
  });
  mock.call.mockClear();
  view.unmount();
  expect(mock.call).not.toHaveBeenCalled();
  expect(mock.dispose).toHaveBeenCalled();
});

it("replays initial output when React remounts the terminal effects", async () => {
  mock.call.mockResolvedValue([process]);
  render(
    <StrictMode>
      <ProcessTerminal sessionId="chat" initial={process} visible />
    </StrictMode>,
  );
  await act(async () => {});
  expect(
    mock.write.mock.calls.filter(([text]) => text === process.output),
  ).toHaveLength(2);
});
