// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ChatTranscript, groupActivity } from "./ChatTranscript";
import type { TimelineEntry, Tool } from "../lib/protocol";
import { emptyTranscript, reduceEvent, timeline } from "../lib/protocol";

vi.mock("../lib/store", () => ({ useStore: () => ({ setError: vi.fn() }) }));

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:attachment-preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
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
const message = (
  sequence: number,
  role: "user" | "assistant" | "thought",
): TimelineEntry => ({
  type: "message",
  sequence,
  message: {
    id: `message-${sequence}`,
    streamId: "root",
    sequence,
    role,
    text: `${role} ${sequence}`,
    timestamp: sequence,
  },
});
const tool = (sequence: number, status = "completed"): TimelineEntry => ({
  type: "tool",
  sequence,
  tool: {
    id: `tool-${sequence}`,
    sequence,
    sessionId: "root",
    title: `Read file ${sequence}`,
    status,
    kind: "read",
    content: [],
    rawInput: null,
    rawOutput: null,
  },
});
const renderTool = (tool: Tool) => <span>{tool.title}</span>;
it("renders a replayed image as an image without exposing its data as message text", () => {
  const src =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS9sAAAAASUVORK5CYII=";
  const transcript = reduceEvent(emptyTranscript(), {
    sequence: 1,
    sessionId: "chat",
    timestamp: 1,
    kind: "session/update",
    payload: {
      sessionId: "root",
      update: {
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: `Review this\n[screen.png](${src})` },
      },
    },
  });
  render(
    <ChatTranscript entries={timeline(transcript)} renderTool={renderTool} />,
  );
  expect(
    screen.getByRole("img", { name: "screen.png" }).getAttribute("src"),
  ).toBe(src);
  expect(screen.getByRole("button", { name: "Open screen.png" }).getAttribute("aria-haspopup")).toBe("dialog");
  expect(screen.getByTitle("screen.png")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Remove screen.png" }),
  ).toBeNull();
  const prompt = screen.getByLabelText("Your message");
  expect(prompt.textContent).toContain("Review this");
  expect(prompt.textContent).not.toContain("base64");
  expect(prompt.querySelector('[title="Review this"]')).toBeTruthy();
});
it("aligns user turns to the end and assistant turns to the start", () => {
  render(
    <ChatTranscript
      entries={[message(1, "user"), message(2, "assistant")]}
      renderTool={renderTool}
    />,
  );
  expect(screen.getByLabelText("Your message").getAttribute("data-align")).toBe(
    "end",
  );
  expect(
    screen.getByLabelText("Assistant message").getAttribute("data-align"),
  ).toBe("start");
});

it("toggles each user message independently and preserves expansion during updates", () => {
  const entries = [
    message(1, "user"),
    message(2, "assistant"),
    message(3, "user"),
  ];
  const view = render(
    <ChatTranscript entries={entries} renderTool={renderTool} />,
  );
  const [first, second] = screen.getAllByRole("button", {
    name: "Expand message",
  });
  expect(first.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(first);
  expect(first.getAttribute("aria-expanded")).toBe("true");
  expect(second.getAttribute("aria-expanded")).toBe("false");
  view.rerender(
    <ChatTranscript
      entries={[...entries, message(4, "assistant")]}
      renderTool={renderTool}
    />,
  );
  expect(first.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(first);
  expect(first.getAttribute("aria-expanded")).toBe("false");
  fireEvent.keyDown(first, { key: "Enter" });
  expect(first.getAttribute("aria-expanded")).toBe("true");
  fireEvent.keyDown(first, { key: " " });
  expect(first.getAttribute("aria-expanded")).toBe("false");
});

it("keeps links and text selection from toggling a user message", () => {
  const entry = message(1, "user");
  if (entry.type !== "message") throw new Error("Expected a message");
  entry.message.text = "Read the [details](https://example.com).";
  render(<ChatTranscript entries={[entry]} renderTool={renderTool} />);
  const toggle = screen.getByRole("button", { name: "Expand message" });
  const link = screen.getByRole("link", { name: "details" });
  link.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(link);
  fireEvent.keyDown(link, { key: "Enter" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  const selection = vi.spyOn(window, "getSelection").mockReturnValue({
    toString: () => "selected text",
  } as Selection);
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  selection.mockRestore();
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});

it("shows the actual message to the parent with a visible destination label", () => {
  const entry = message(1, "assistant") as Extract<
    TimelineEntry,
    { type: "message" }
  >;
  entry.message.text = "CHILD_READY_713\nHARBOR_CHILD_ORIGIN_713";
  entry.message.label = "Message to parent";
  render(<ChatTranscript entries={[entry]} renderTool={renderTool} />);
  expect(screen.getByLabelText("Message to parent")).toBeTruthy();
  expect(screen.getByText("Message to parent")).toBeTruthy();
  expect(screen.getByText(/CHILD_READY_713/)).toBeTruthy();
});

it("groups adjacent work without moving tools across prose or user messages", () => {
  const entries = [
    message(1, "user"),
    message(2, "assistant"),
    tool(3),
    message(4, "thought"),
    tool(5),
    message(6, "assistant"),
    tool(7),
    message(8, "user"),
  ];
  const groups = groupActivity(entries);
  expect(groups.map((group) => group.type)).toEqual([
    "message",
    "message",
    "activity",
    "message",
    "activity",
    "message",
  ]);
  expect(
    groups.flatMap((group) =>
      group.type === "activity" ? group.entries : [group.entry],
    ),
  ).toEqual(entries);
});

it("collapses completed work and lets the user expand it", () => {
  render(
    <ChatTranscript
      entries={[tool(1), tool(2), message(3, "assistant")]}
      renderTool={renderTool}
    />,
  );
  const toggle = screen.getByRole("button", { name: "Worked" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  // Radix adds aria-controls only when open; the closed content stays mounted
  // for the Fluid disclosure exit animation and carries the hidden attribute.
  expect(
    document.querySelector(".transcript-activity > [hidden]"),
  ).toBeTruthy();
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(
    document.getElementById(toggle.getAttribute("aria-controls")!)?.hidden,
  ).toBe(false);
  expect(screen.getByLabelText("Assistant message").textContent).toContain(
    "assistant 3",
  );
});

it("opens running work and preserves an explicit collapse after a tool fails", () => {
  const view = render(
    <ChatTranscript
      entries={[tool(1, "in_progress")]}
      renderTool={renderTool}
    />,
  );
  const toggle = screen.getByRole("button", { name: "Working..." });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(toggle);
  view.rerender(
    <ChatTranscript
      entries={[tool(1, "in_progress"), tool(2)]}
      renderTool={renderTool}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "Working..." })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  view.rerender(
    <ChatTranscript
      entries={[tool(1, "failed"), tool(2)]}
      renderTool={renderTool}
    />,
  );
  expect(screen.queryByRole("button", { name: "Needs attention" })).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Worked" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
});

it.each(["failed", "interrupted"])(
  "keeps %s status on the individual tool rather than the work group",
  (status) => {
    const { container } = render(
      <ChatTranscript entries={[tool(1, status)]} renderTool={renderTool} />,
    );
    const toggle = screen.getByRole("button", { name: "Worked" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(
      toggle
        .querySelector('[data-slot="trace-line"]')
        ?.getAttribute("data-status"),
    ).not.toBe("error");
    expect(screen.queryByText("Needs attention")).toBeNull();
    fireEvent.click(toggle);
    const toolToggle = screen.getByRole("button", { name: "View details" });
    expect(toolToggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toolToggle);
    expect(toolToggle.getAttribute("aria-expanded")).toBe("true");
    if (status === "failed") {
      expect(screen.queryByText("Failed")).toBeNull();
      expect(
        container.querySelector('.activity-step[data-status="error"] .sr-only')
          ?.textContent,
      ).toBe("error");
    } else {
      expect(screen.getByText("Interrupted")).toBeTruthy();
    }
    expect(
      container.querySelectorAll('.activity-step[data-status="error"]'),
    ).toHaveLength(1);
  },
);

it("keeps thinking between tool calls until the response finishes", () => {
  const view = render(
    <ChatTranscript entries={[tool(1)]} renderTool={renderTool} working />,
  );
  expect(
    screen
      .getByRole("button", { name: "Working..." })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(
    document.querySelector(
      '.transcript-activity .activity-step[data-status="running"] [data-slot="trace-title"]',
    )?.textContent,
  ).toBe("Thinking…");
  expect(screen.queryByText("Done")).toBeNull();
  view.rerender(<ChatTranscript entries={[tool(1)]} renderTool={renderTool} />);
  expect(
    screen
      .getByRole("button", { name: "Worked" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Worked" }));
  expect(screen.queryByText("Done")).toBeNull();
});

it("uses Trace before the first tool and while reasoning streams", () => {
  const view = render(
    <ChatTranscript entries={[]} renderTool={renderTool} working />,
  );
  expect(
    screen
      .getByRole("button", { name: "Working..." })
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(
    document.querySelector(
      '.transcript-activity .activity-step[data-status="running"] [data-slot="trace-title"]',
    )?.textContent,
  ).toBe("Thinking…");
  view.rerender(
    <ChatTranscript
      entries={[message(1, "thought")]}
      renderTool={renderTool}
      working
    />,
  );
  expect(
    document.querySelector(
      '.transcript-activity .activity-step[data-status="running"] [data-slot="trace-title"]',
    )?.textContent,
  ).toBe("Reasoning…");
  expect(screen.queryByText("Done")).toBeNull();
  const details = screen.getByRole("button", { name: "View reasoning" });
  expect(details.getAttribute("aria-expanded")).toBe("true");
  expect(
    document.querySelector("[data-slot='streaming-text']")?.textContent,
  ).toBe("thought 1");
  fireEvent.click(details);
  view.rerender(
    <ChatTranscript
      entries={[message(1, "thought")]}
      renderTool={renderTool}
      working
    />,
  );
  expect(details.getAttribute("aria-expanded")).toBe("false");
});

it("preserves a tool detail disclosure while streamed steps arrive", () => {
  const view = render(
    <ChatTranscript
      entries={[tool(1, "in_progress")]}
      renderTool={renderTool}
    />,
  );
  const details = screen.getByRole("button", { name: "View details" });
  fireEvent.click(details);
  view.rerender(
    <ChatTranscript
      entries={[tool(1), tool(2, "pending")]}
      renderTool={renderTool}
    />,
  );
  expect(
    screen
      .getAllByRole("button", { name: "View details" })[0]
      .getAttribute("aria-expanded"),
  ).toBe("true");
  expect(
    document.querySelector(
      '.activity-step[data-status="pending"] [data-slot="trace-title"]',
    )?.textContent,
  ).toBe("Read file 2");
  expect(screen.queryByText("Done")).toBeNull();
});

it("replaces the live header and thinking glyph with the recorded duration", () => {
  const entry = tool(1, "in_progress");
  if (entry.type !== "tool") throw new Error("Expected tool fixture");
  entry.tool.timestamp = 1000;
  const view = render(
    <ChatTranscript entries={[entry]} renderTool={renderTool} working />,
  );
  const header = screen.getByRole("button", { name: "Working..." });
  expect(
    header.querySelector('[data-slot="thinking-indicator-glyph"]'),
  ).toBeTruthy();
  view.rerender(
    <ChatTranscript
      entries={[
        {
          ...entry,
          tool: {
            ...entry.tool,
            status: "completed",
            updatedAt: 65000,
            workCompletedAt: 66000,
          },
        },
      ]}
      renderTool={renderTool}
    />,
  );
  const completed = screen.getByRole("button", { name: "Worked for 1m 5s" });
  expect(
    completed.querySelector('[data-slot="thinking-indicator-glyph"]'),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Working..." })).toBeNull();
  view.unmount();
  render(
    <ChatTranscript
      entries={[
        {
          ...entry,
          tool: { ...entry.tool, status: "completed", workCompletedAt: 66000 },
        },
      ]}
      renderTool={renderTool}
    />,
  );
  expect(screen.getByRole("button", { name: "Worked for 1m 5s" })).toBeTruthy();
});

it("ends an earlier activity block when assistant prose resumes", () => {
  const entry = tool(1);
  if (entry.type !== "tool") throw new Error("Expected tool fixture");
  entry.tool.timestamp = 1000;
  entry.tool.workCompletedAt = 21000;
  const prose = message(2, "assistant");
  if (prose.type !== "message") throw new Error("Expected message fixture");
  prose.message.timestamp = 4000;
  render(<ChatTranscript entries={[entry, prose]} renderTool={renderTool} />);
  expect(screen.getByRole("button", { name: "Worked for 3s" })).toBeTruthy();
});

it("does not keep animating an unfinished tool after its turn ended", () => {
  const entry = tool(1, "in_progress");
  if (entry.type !== "tool") throw new Error("Expected tool fixture");
  entry.tool.timestamp = 1000;
  entry.tool.workCompletedAt = 9000;
  render(<ChatTranscript entries={[entry]} renderTool={renderTool} />);
  expect(screen.getByRole("button", { name: "Worked for 8s" })).toBeTruthy();
  expect(
    document.querySelector('[data-slot="trace-line"][data-status="running"]'),
  ).toBeNull();
});

it("uses streaming text for the reply still arriving, not for settled or user text", () => {
  const view = render(
    <ChatTranscript
      entries={[message(1, "user"), message(2, "assistant")]}
      renderTool={renderTool}
      working
    />,
  );
  expect(
    screen
      .getByLabelText("Assistant message")
      .querySelector("[data-slot='streaming-text']"),
  ).toBeTruthy();
  expect(
    screen
      .getByLabelText("Your message")
      .querySelector("[data-slot='streaming-text']"),
  ).toBeNull();
  view.rerender(
    <ChatTranscript
      entries={[message(1, "user"), message(2, "assistant")]}
      renderTool={renderTool}
    />,
  );
  expect(document.querySelector("[data-slot='streaming-text']")).toBeNull();
});

it("does not stream an earlier reply once a tool is the active step", () => {
  render(
    <ChatTranscript
      entries={[message(1, "assistant"), tool(2, "in_progress")]}
      renderTool={renderTool}
      working
    />,
  );
  expect(document.querySelector("[data-slot='streaming-text']")).toBeNull();
});

it("uses the same readable tool presentation in activity rows", () => {
  const entry = tool(1);
  if (entry.type !== "tool") throw new Error("Expected tool");
  entry.tool = {
    ...entry.tool,
    name: "Bash",
    kind: "execute",
    title: "cat wiki.md",
    rawInput: { command: "cat wiki.md", description: "Read wiki quickstart" },
  };
  render(<ChatTranscript entries={[entry]} renderTool={renderTool} working />);
  expect(screen.getByText("Read wiki quickstart")).toBeTruthy();
});

it("renders scheduling receipts with delay inside an expandable body", () => {
  const entry = tool(1);
  if (entry.type !== "tool") throw new Error("Expected tool");
  entry.tool = {
    ...entry.tool,
    name: "ScheduleWakeup",
    title: "ScheduleWakeup",
    kind: "other",
    rawInput: { delaySeconds: 1200 },
    rawOutput:
      "Next wakeup scheduled for 12:06:00. Internal harness instructions.",
  };
  render(<ChatTranscript entries={[entry]} renderTool={renderTool} working />);
  expect(screen.getByText("Wakeup scheduled for 12:06:00")).toBeTruthy();
  const toggle = screen.getByRole("button", { name: "View details" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(toggle.textContent).not.toContain("20 min delay");
  fireEvent.click(toggle);
  expect(screen.getByText("20 min delay")).toBeTruthy();
  expect(screen.queryByText(/Internal harness/)).toBeNull();
});

it("does not open a tool when it fails during active work", () => {
  const view = render(
    <ChatTranscript
      entries={[tool(1, "in_progress")]}
      renderTool={renderTool}
      working
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "View details" })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  view.rerender(
    <ChatTranscript
      entries={[tool(1, "failed")]}
      renderTool={renderTool}
      working
    />,
  );
  const toggle = screen.getByRole("button", { name: "View details" });
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(toggle);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});
