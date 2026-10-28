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
  fireEvent.click(screen.getByRole("button", { name: /write.*completed/i }));
  expect(screen.getByText("/tmp/example.txt")).toBeTruthy();
  expect(container.querySelector("pre")?.textContent?.trim()).toBe(
    "temp file written with the write tool",
  );
  expect(container.textContent).not.toContain("Successfully wrote");
  expect(container.textContent).not.toContain("toolResult");
  expect(container.querySelectorAll('[data-slot="file-diff"]')).toHaveLength(1);
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
  fireEvent.click(screen.getByRole("button", { name: /write.*completed/i }));
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
  fireEvent.click(screen.getByRole("button", { name: /write.*failed/i }));
  expect(screen.getByText("Permission denied")).toBeTruthy();
});

it("renders edits and deletions through the file diff component", () => {
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        content: [
          {
            type: "diff",
            path: "src/a.ts",
            oldText: "const n = 1;\n",
            newText: "const n = 2;\n",
          },
          {
            type: "diff",
            path: "src/deleted.ts",
            oldText: "old\n",
            newText: null,
          },
        ],
      })}
    />,
  );
  expect(container.querySelectorAll('[data-slot="file-diff"]')).toHaveLength(2);
  expect(screen.getByText("1 added, 1 removed")).toBeTruthy();
  expect(screen.getByText("0 added, 1 removed")).toBeTruthy();
});

it("shows proposed edits before completion without turning a failure into a success", () => {
  render(
    <ToolCard
      detailsOnly
      tool={write({
        status: "failed",
        content: [
          {
            type: "content",
            content: { type: "text", text: "Edit was rejected" },
          },
          {
            type: "diff",
            path: "a.txt",
            oldText: "before\n",
            newText: "after\n",
          },
        ],
        rawInput: null,
        rawOutput: null,
      })}
    />,
  );
  expect(screen.getByText("Edit was rejected")).toBeTruthy();
  expect(screen.getByText("1 added, 1 removed")).toBeTruthy();
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

it("shows captured terminal errors without exit-code or truncation notices", () => {
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
          truncated: true,
        },
      }}
    />,
  );
  expect(container.querySelector("pre")?.textContent).toContain(
    "fatal: invalid object name 'missing-ref'.",
  );
  expect(screen.queryByText("Exit code 128")).toBeNull();
  expect(
    screen.queryByText("Earlier terminal output was truncated."),
  ).toBeNull();
  expect(container.textContent).not.toContain('"terminalId"');
  expect(container.querySelector('[data-slot="file-diff"]')).toBeTruthy();
  expect(screen.getByText("Output")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
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

it("keeps the empty-output explanation without adding an exit-code notice", () => {
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
  expect(screen.queryByText("Exit code 1")).toBeNull();
  expect(screen.getByText("No terminal output was recorded.")).toBeTruthy();
});

it("renders image reads as images without exposing their encoded output", () => {
  const image = { type: "image", mimeType: "image/png", data: "aGVsbG8=" };
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        title: "Read /tmp/screenshot.png",
        kind: "read",
        rawInput: { path: "/tmp/screenshot.png" },
        content: [
          { type: "content", content: image },
          {
            type: "content",
            content: { type: "text", text: "Screenshot loaded" },
          },
        ],
        rawOutput: { content: [image] },
      })}
    />,
  );
  expect(screen.getByRole("img").getAttribute("src")).toBe(
    "data:image/png;base64,aGVsbG8=",
  );
  expect(screen.getByText("Screenshot loaded")).toBeTruthy();
  expect(container.textContent).not.toContain("aGVsbG8=");
});

it("shows a command and one result without JSON input/output dumps", () => {
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        name: "Bash",
        kind: "execute",
        rawInput: { command: "cat wiki.md", description: "Read the wiki" },
        content: [
          {
            type: "content",
            content: { type: "text", text: "```console\nWiki result\n```" },
          },
        ],
        rawOutput: "Wiki result",
      })}
    />,
  );
  expect(
    screen.getByText("Input").closest("figure")?.querySelector("code")
      ?.textContent,
  ).toBe("cat wiki.md\n");
  expect(
    screen.getByText("Output").closest("figure")?.querySelector("code")
      ?.textContent,
  ).toBe("Wiki result\n");
  expect(container.textContent?.match(/Wiki result/g)).toHaveLength(1);
  expect(screen.queryByLabelText("Input")).toBeNull();
  expect(container.textContent).not.toContain('"description"');
});

it("uses Claude write input to display file contents instead of harness receipts", () => {
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        name: "Write",
        title: "Write workflow.md",
        rawInput: { file_path: "workflow.md", content: "Flow diagram" },
        content: [],
        rawOutput:
          "File created successfully at: workflow.md (file state is current in your context — no need to Read it back)",
      })}
    />,
  );
  expect(container.querySelector('[data-slot="file-diff"]')).toBeTruthy();
  expect(container.textContent).toContain("Flow diagram");
  expect(container.textContent).not.toContain("file state is current");
});

it("renders unfamiliar tool parameters and structured results as JSON code blocks", () => {
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        name: "Unknown",
        title: "Inspect resource",
        rawInput: {
          resource: "issue-pipeline",
          options: { includeArchived: false },
        },
        content: [{ type: "routing", id: "hidden" }],
        rawOutput: { found: true },
      })}
    />,
  );
  const blocks = container.querySelectorAll("pre > code.language-json");
  expect(blocks).toHaveLength(2);
  expect(JSON.parse(blocks[0].textContent!)).toEqual({
    resource: "issue-pipeline",
    options: { includeArchived: false },
  });
  expect(JSON.parse(blocks[1].textContent!)).toEqual({ found: true });
  expect(container.querySelector("dl")).toBeNull();
  expect(container.querySelector("details")).toBeNull();
  expect(container.textContent).not.toContain("hidden");
});

it("renders file reads in the shared file panel without diff controls", () => {
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        name: "Read",
        title: "Read File",
        kind: "read",
        rawInput: { file_path: "src/workflow.ts", offset: 20, limit: 2 },
        rawOutput: null,
        content: [
          {
            type: "content",
            content: {
              type: "text",
              text: "```ts\n20\texport const enabled = true;\n21\t// workflow\n```",
            },
          },
        ],
      })}
    />,
  );
  const panel = container.querySelector(
    '[data-slot="file-diff"][data-mode="read"]',
  );
  expect(panel).toBeTruthy();
  expect(panel?.querySelector("figcaption")?.textContent).toBe(
    "src/workflow.ts",
  );
  expect(panel?.querySelector("pre")?.textContent).toBe(
    "export const enabled = true;\n// workflow\n",
  );
  expect(panel?.textContent).toContain("20");
  expect(panel?.textContent).toContain("21");
  expect(panel?.textContent).not.toContain("added");
  expect(panel?.textContent).not.toContain("removed");
  expect(container.textContent).not.toContain("Previous contents unavailable");
  expect(container.querySelector(".markdown")).toBeNull();
});

it("keeps failed reads as errors instead of file contents", () => {
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        name: "Read",
        kind: "read",
        status: "failed",
        rawInput: { file_path: "missing.ts" },
        content: [],
        rawOutput: "File not found",
      })}
    />,
  );
  expect(screen.getByText("File not found")).toBeTruthy();
  expect(container.querySelector('[data-mode="read"]')).toBeNull();
});

it("renders wakeups with the requested delay inside an accordion", () => {
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        name: "ScheduleWakeup",
        title: "ScheduleWakeup",
        kind: "other",
        rawInput: { delaySeconds: 1200 },
        content: [],
        rawOutput: "Next wakeup scheduled for 12:06:00 (in 1233s).",
      })}
    />,
  );
  expect(screen.getByText("Wakeup scheduled for 12:06:00")).toBeTruthy();
  const toggle = screen.getByRole("button", { name: "View details" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.textContent).not.toContain("20 min delay");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("20 min delay")).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(container.querySelector("dl")).toBeNull();
  expect(container.textContent).not.toContain("No additional details");
  expect(container.querySelector('[aria-label="Input"]')).toBeNull();
});

it("omits scheduling instructions and output disclosures from successful wakeups", () => {
  const text =
    "Next wakeup scheduled for 12:06:00. " +
    "If you owe the user a status update this tick, write it now as ordinary response text; then end the turn — the harness re-invokes you when the wakeup fires.";
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        name: "ScheduleWakeup",
        title: "ScheduleWakeup",
        kind: "other",
        rawInput: { delaySeconds: 1200 },
        content: [],
        rawOutput: text,
      })}
    />,
  );
  expect(screen.getByText("Wakeup scheduled for 12:06:00")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "View details" }));
  expect(screen.getByText("20 min delay")).toBeTruthy();
  expect(container.querySelector("details")).toBeNull();
  expect(container.textContent).not.toContain("harness");
  expect(container.textContent).not.toContain("delaySeconds");
});

it("puts a tool search query inline and renders reference results once", () => {
  const { container } = render(
    <ToolCard
      tool={write({
        name: "ToolSearch",
        title: "ToolSearch",
        kind: "other",
        rawInput: { query: "linear issue create" },
        content: [
          {
            type: "content",
            content: { type: "text", text: "Tool: mcp__linear__create_issue" },
          },
        ],
        rawOutput: [
          { type: "tool_reference", tool_name: "mcp__linear__create_issue" },
        ],
      })}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: /ToolSearch linear issue create/ }),
  );
  expect(container.querySelectorAll(".tool-references code")).toHaveLength(1);
  expect(container.querySelector(".tool-references")?.textContent).toBe(
    "mcp__linear__create_issue",
  );
  expect(container.textContent).not.toContain(
    "Tool: mcp__linear__create_issue",
  );
  expect(container.querySelector(".tool-context")).toBeNull();
});

it("pretty-prints MCP JSON results without summarizing them or adding a full-output toggle", () => {
  const result = {
    id: "ENG-1642",
    uuid: "issue-id",
    title: "Add interactive issue pipeline map built from YAML",
    description:
      "## Context\nNothing shows the issue pipeline end to end.\n" +
      "Keep all of the result. ".repeat(30),
    state: "Done",
  };
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        name: "mcp__linear-server__save_issue",
        title: "mcp__linear-server__save_issue",
        kind: "other",
        rawInput: { id: "ENG-1642", state: "Done" },
        content: [
          {
            type: "content",
            content: { type: "text", text: JSON.stringify(result) },
          },
        ],
        rawOutput: [{ type: "text", text: JSON.stringify(result) }],
      })}
    />,
  );
  const blocks = container.querySelectorAll("pre > code.language-json");
  expect(blocks).toHaveLength(2);
  expect(blocks[0].textContent).toBe(
    JSON.stringify({ id: "ENG-1642", state: "Done" }, null, 2) + "\n",
  );
  expect(JSON.parse(blocks[1].textContent!)).toEqual(result);
  const panels = container.querySelectorAll(
    '[data-slot="file-diff"][data-language="json"]',
  );
  expect(panels).toHaveLength(2);
  expect(
    Array.from(
      panels,
      (panel) => panel.querySelector("figcaption")?.textContent,
    ),
  ).toEqual(["Input", "Output"]);
  for (const panel of panels) {
    expect(panel.querySelector('[data-slot="file-diff-gutter"]')).toBeTruthy();
    expect(panel.querySelector("pre .text-success")).toBeTruthy();
  }
  expect(container.querySelector("dl")).toBeNull();
  expect(container.querySelector("details")).toBeNull();
  expect(container.querySelector("h2")).toBeNull();
  expect(container.textContent).not.toContain("Full output");
});

it("renders truncated JSON as code rather than prose", () => {
  const source = '{"id":"ENG-1642","description":"truncated';
  const { container } = render(
    <ToolCard
      detailsOnly
      tool={write({
        name: "mcp__linear-server__save_issue",
        kind: "other",
        rawInput: null,
        content: [{ type: "content", content: { type: "text", text: source } }],
        rawOutput: null,
      })}
    />,
  );
  expect(container.querySelector("pre > code.language-json")?.textContent).toBe(
    source + "\n",
  );
  expect(container.querySelector("details")).toBeNull();
});
