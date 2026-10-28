// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import events from "../../tests/fixtures/codex-tool-events.json";
import type { SessionEvent } from "../lib/bindings/SessionEvent";
import {
  emptyTranscript,
  reduceEvent,
  timeline,
  type Tool,
} from "../lib/protocol";
import { toolActivityKind, toolPresentation } from "../lib/tool-presentation";
import { ChatTranscript } from "./ChatTranscript";
import { ToolCard } from "./Chat";

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
const recorded = events as SessionEvent[];
const replay = () => recorded.reduce(reduceEvent, emptyTranscript());
const calls = () => Object.values(replay().tools);

it("retains recorded Codex locations, commands, terminal output and diffs across updates and replay", () => {
  const original = replay();
  const restarted = reduceEvent(original, {
    sequence: 100,
    sessionId: "codex-fixture",
    timestamp: 10000,
    kind: "history_reset",
    payload: {},
  });
  const restored = recorded.reduce(
    (state, event) =>
      reduceEvent(state, {
        ...event,
        sequence: event.sequence + 100,
        timestamp: event.timestamp + 10000,
      }),
    restarted,
  );
  expect(Object.values(restored.tools).map(toolPresentation)).toEqual(
    Object.values(original.tools).map(toolPresentation),
  );
  expect(restored.terminals).toEqual(original.terminals);
  const read = Object.values(restored.tools).find(
    (tool) => tool.kind === "read",
  )!;
  expect(toolPresentation(read).title).toBe("Read file 'github-cli/SKILL.md'");
  expect(read.locations?.[0].path).toContain("/skills/github-cli/SKILL.md");
  // This provider did not record a read snapshot. Do not manufacture one.
  expect(read.content).toEqual([]);
  const patch = Object.values(restored.tools).find(
    (tool) => tool.kind === "edit",
  )!;
  expect(patch.content).toHaveLength(2);
  expect(toolPresentation(patch).title).toBe(
    "Editing files: deploy.yml, BACKEND.md",
  );
});

it("distinguishes new Codex files from edits using explicit diff metadata", () => {
  const patch = calls().find((tool) => tool.kind === "edit")!;
  expect(toolActivityKind({ ...patch, content: [patch.content[0]] })).toBe(
    "write",
  );
  expect(toolActivityKind({ ...patch, content: [patch.content[1]] })).toBe(
    "edit",
  );
  expect(toolActivityKind(patch)).toBe("edit");
});

it("renders Codex search actions once and keeps guardian rationale without action plumbing", () => {
  const search = calls().find((tool) => tool.title.startsWith("Web search"))!;
  const presentation = toolPresentation(search);
  expect(presentation.title).toBe("Web search");
  expect(presentation.task).toContain("workers ci github actions");
  expect(presentation.parameters).toEqual({});
  const review = calls().find((tool) => tool.title === "Guardian Review")!;
  expect(toolPresentation(review).command).toContain("gh auth status");
  expect(toolPresentation(review).parameters).toEqual({});
  expect(toolPresentation(review).output).toHaveLength(1);
  expect(toolPresentation(review).output[0]).toContain("Rationale:");
});

it("renders all nine recorded calls with collapsed failures and shared output panels", () => {
  const transcript = replay();
  const { container } = render(
    <ChatTranscript
      entries={timeline(transcript)}
      renderTool={(tool: Tool) => (
        <ToolCard detailsOnly tool={tool} terminals={transcript.terminals} />
      )}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^Worked/ }));
  const steps = screen.getAllByRole("button", { name: "View details" });
  expect(steps).toHaveLength(9);
  const failed = container.querySelector(
    '.activity-step[data-status="error"]',
  )!;
  expect(failed.closest("button")?.getAttribute("aria-expanded")).toBe("false");
  expect(failed.textContent).not.toContain("Failed");
  expect(container.querySelector('[data-icon="BookOpen"]')).toBeTruthy();
  expect(container.querySelector('[data-icon="Pencil"]')).toBeTruthy();
  for (const step of steps) fireEvent.click(step);
  expect(
    container.querySelectorAll('[data-slot="file-diff"][data-mode="diff"]'),
  ).toHaveLength(2);
  expect(
    Array.from(container.querySelectorAll("figcaption")).filter(
      (node) => node.textContent === "Output",
    ),
  ).toHaveLength(4);
  const json = container.querySelector("code.language-json");
  expect(JSON.parse(json!.textContent!)).toEqual({ ok: true });
  expect(container.querySelector("h2")).toBeNull();
  expect(container.querySelector(".tool-location")?.textContent).toContain(
    "SKILL.md",
  );
  expect(container.querySelectorAll(".tool-location")).toHaveLength(1);
  expect(
    container.textContent?.match(
      /curl -fsS https:\/\/omniplay.stream\/health/g,
    ),
  ).toHaveLength(1);
  expect(
    container.textContent?.match(/git status --short --branch/g),
  ).toHaveLength(1);
  expect(container.textContent).toContain("The token in default is invalid.");
  expect(container.querySelector("dl")).toBeNull();
  expect(container.textContent).not.toContain("Full output");
  expect(container.textContent).not.toContain("unifiedExec");
  expect(container.textContent).not.toContain("terminal_id");
  expect(container.textContent).not.toContain("Done");
});
