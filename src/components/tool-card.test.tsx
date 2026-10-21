// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ToolCard } from "./Chat";
import type { Tool } from "../lib/protocol";

vi.mock("./NativeTerminal", () => ({ NativeTerminal: () => null }));
vi.mock("./Review", () => ({ Review: () => null }));
vi.mock("../lib/store", () => ({ useStore: () => ({ setError: vi.fn() }) }));
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }));
});
afterEach(cleanup);

const write = (patch: Partial<Tool> = {}): Tool => ({
  id: "root:write",
  sequence: 1,
  sessionId: "root",
  title: "write",
  kind: "edit",
  status: "completed",
  content: [
    {
      type: "content",
      content: { type: "text", text: "Successfully wrote 38 bytes" },
    },
  ],
  rawInput: {
    path: "/tmp/example.txt",
    content: "temp file written with the write tool\n",
  },
  rawOutput: {
    role: "toolResult",
    content: [{ type: "text", text: "Successfully wrote 38 bytes" }],
  },
  ...patch,
});

it("shows the written file and contents without the success receipt or raw JSON", () => {
  const { container } = render(<ToolCard tool={write()} />);
  fireEvent.click(screen.getByRole("button", { name: /write.*completed/ }));
  expect(screen.getByText("/tmp/example.txt")).toBeTruthy();
  expect(container.querySelector("pre")?.textContent?.trim()).toBe(
    "temp file written with the write tool",
  );
  expect(container.textContent).not.toContain("Successfully wrote");
  expect(container.textContent).not.toContain("toolResult");
  expect(container.querySelectorAll('[data-slot="code-block"]')).toHaveLength(
    1,
  );
});

it("uses the recorded diff instead of the original input and supports empty files", () => {
  const { container } = render(
    <ToolCard
      tool={write({
        content: [
          { type: "diff", path: "/tmp/empty.txt", newText: "", oldText: null },
        ],
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /write.*completed/ }));
  expect(screen.getByText("/tmp/empty.txt")).toBeTruthy();
  expect(container.querySelector("pre")?.textContent?.trim()).toBe("");
  expect(container.textContent).not.toContain("temp file written");
  expect(container.textContent).not.toContain("Successfully wrote");
});

it("keeps the error visible for a failed write", () => {
  render(
    <ToolCard
      tool={write({
        status: "failed",
        content: [
          {
            type: "content",
            content: { type: "text", text: "Permission denied" },
          },
        ],
        rawOutput: null,
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /write.*failed/ }));
  expect(screen.getByText("Permission denied")).toBeTruthy();
});

it("keeps results visible for tools that do not write files", () => {
  render(
    <ToolCard
      tool={write({
        title: "read",
        kind: "read",
        rawInput: null,
        rawOutput: null,
        content: [
          { type: "content", content: { type: "text", text: "Read result" } },
        ],
      })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /read.*completed/ }));
  expect(screen.getByText("Read result")).toBeTruthy();
});

it("resolves terminal references to the captured error and exit code", () => {
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        title: "git show missing-ref",
        kind: "execute",
        status: "failed",
        content: [{ type: "terminal", terminalId: "exec-1" }],
        rawInput: null,
        rawOutput: null,
      })}
      terminals={{
        "exec-1": {
          output: "fatal: invalid object name 'missing-ref'.\n",
          exitCode: 128,
          truncated: false,
        },
      }}
    />,
  );
  expect(container.querySelector("pre")?.textContent).toContain(
    "fatal: invalid object name 'missing-ref'.",
  );
  expect(screen.getByText("Exit code 128")).toBeTruthy();
  expect(container.textContent).not.toContain('"terminalId"');
});

it("explains when an older call has no recorded terminal output", () => {
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        kind: "execute",
        status: "failed",
        content: [{ type: "terminal", terminalId: "old-call" }],
        rawInput: null,
        rawOutput: null,
      })}
    />,
  );
  expect(container.textContent).toContain(
    "Terminal output was not captured for this call.",
  );
  expect(container.textContent).not.toContain('"terminalId"');
});

it("shows the exit code when a failed command produces no output", () => {
  render(
    <ToolCard
      detailsOnly
      tool={write({
        kind: "execute",
        status: "failed",
        content: [{ type: "terminal", terminalId: "empty-call" }],
        rawInput: null,
        rawOutput: null,
      })}
      terminals={{
        "empty-call": { output: "", truncated: false, exitCode: 1 },
      }}
    />,
  );
  expect(screen.getByText("Exit code 1")).toBeTruthy();
  expect(screen.getByText("No terminal output was recorded.")).toBeTruthy();
});
