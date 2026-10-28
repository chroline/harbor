import { expect, it } from "vitest";
import { resultText, toolPresentation } from "./tool-presentation";
import type { Tool } from "./protocol";
const tool = (patch: Partial<Tool> = {}): Tool => ({
  id: "root:tool",
  sequence: 1,
  sessionId: "root",
  title: "Tool",
  kind: "other",
  status: "completed",
  content: [],
  rawInput: null,
  rawOutput: null,
  ...patch,
});
const content = (text: string) => ({
  type: "content",
  content: { type: "text", text },
});
it("uses command descriptions and displays the output only once", () => {
  const result = toolPresentation(
    tool({
      name: "Bash",
      kind: "execute",
      title: "cat wiki.md",
      rawInput: {
        command: "cat wiki.md",
        description: "Read the architecture",
      },
      content: [
        content("```console\nArchitecture\n```"),
        content("Architecture"),
      ],
      rawOutput: "Architecture",
    }),
  );
  expect(result.title).toBe("Read the architecture");
  expect(result.command).toBe("cat wiki.md");
  expect(result.output).toEqual(["Architecture"]);
});
it("shows read paths and ranges from input and locations", () => {
  expect(
    toolPresentation(
      tool({
        name: "Read",
        rawInput: { file_path: "src/workflow.ts", offset: 20, limit: 8 },
      }),
    ).location,
  ).toBe("src/workflow.ts:20–27");
  expect(
    toolPresentation(
      tool({ name: "Read", locations: [{ path: "src/a.ts", line: 5 }] }),
    ).location,
  ).toBe("src/a.ts:5");
});
it("unwraps supported text and error envelopes and preserves structured results as JSON", () => {
  expect(
    resultText({
      role: "toolResult",
      content: [{ type: "text", text: "result" }],
    }),
  ).toEqual(["result"]);
  expect(resultText({ error: { message: "Permission denied" } })).toEqual([
    "Permission denied",
  ]);
  expect(resultText('{"internalId":"secret","routing":{}}')).toEqual([
    '{"internalId":"secret","routing":{}}',
  ]);
  expect(resultText({ arbitrary: "hidden" })).toEqual([
    '{"arbitrary":"hidden"}',
  ]);
});
it("uses worker response metadata without transport details", () => {
  const result = toolPresentation(
    tool({
      name: "Agent",
      claudeCode: {
        toolResponse: {
          description: "Map validator flows",
          prompt: "Investigate confirmation",
          isAsync: true,
          agentId: "hidden",
        },
      },
      rawOutput: "agentId: hidden",
    }),
  );
  expect(result.title).toBe("Map validator flows");
  expect(result.task).toBe("Investigate confirmation");
  expect(result).not.toHaveProperty("summary");
  expect(result.output).toEqual([]);
});
it.each(["Skill", "ToolSearch", "SubagentHandback", "custom_tool"])(
  "preserves the provider title for %s without inventing a label",
  (name) => {
    const result = toolPresentation(
      tool({
        name,
        title: name,
        rawInput: {
          skill: "frontend-design",
          query: "linear issue create",
          message: "Report",
        },
      }),
    );
    expect(result.title).toBe(
      name === "Skill"
        ? "Skill frontend-design"
        : `${name} linear issue create`,
    );
    expect(result).not.toHaveProperty("summary");
  },
);
it("uses supplied descriptions verbatim for any tool, with title and name fallbacks", () => {
  expect(
    toolPresentation(
      tool({
        title: "custom_tool",
        rawInput: { description: "Provider authored description" },
      }),
    ).title,
  ).toBe("Provider authored description");
  expect(
    toolPresentation(tool({ title: "Provider title", name: "custom_tool" }))
      .title,
  ).toBe("Provider title");
  expect(toolPresentation(tool({ title: "", name: "custom_tool" })).title).toBe(
    "custom_tool",
  );
});
it("keeps failures for bookkeeping tools instead of a success summary", () => {
  for (const name of [
    "Skill",
    "ScheduleWakeup",
    "ToolSearch",
    "SubagentHandback",
    "Agent",
  ]) {
    const result = toolPresentation(
      tool({ name, status: "failed", rawOutput: { error: "Request failed" } }),
    );
    expect(result.output).toEqual(["Request failed"]);
    expect(result).not.toHaveProperty("summary");
  }
});
it("preserves provider tool references verbatim without generating a summary", () => {
  const result = toolPresentation(
    tool({
      name: "ToolSearch",
      rawInput: { query: "linear issue" },
      rawOutput: [
        { type: "tool_reference", tool_name: "mcp__linear__create_issue" },
      ],
    }),
  );
  expect(result).not.toHaveProperty("summary");
  expect(result.context).toBeUndefined();
  expect(result.title).toBe("Tool linear issue");
  expect(result.output).toEqual([]);
  expect(result.references).toEqual(["mcp__linear__create_issue"]);
});
it("retains useful results and a readable fallback title for unknown tools", () => {
  expect(
    toolPresentation(
      tool({
        title: "inspect_resource",
        rawOutput: [{ type: "text", text: "Resource found" }],
      }),
    ),
  ).toMatchObject({ title: "inspect_resource", output: ["Resource found"] });
});

it("preserves JSON file contents supplied as a text result", () => {
  expect(
    toolPresentation(
      tool({
        name: "Read",
        content: [content('{"version":1,"enabled":true}')],
      }),
    ).output,
  ).toEqual(['{"version":1,"enabled":true}']);
});
it("keeps an error from raw output even when formatted content contains progress text", () => {
  expect(
    toolPresentation(
      tool({
        status: "failed",
        content: [content("Connecting…")],
        rawOutput: { error: "Connection refused" },
      }),
    ).output,
  ).toEqual(["Connecting…", "Connection refused"]);
});

it("keeps the provider skill title and supplied skill name together without duplicating details", () => {
  for (const title of [
    "Load skill",
    "Load skill frontend-design",
    "Load skill: frontend-design",
  ]) {
    const result = toolPresentation(
      tool({ name: "Skill", title, rawInput: { skill: "frontend-design" } }),
    );
    expect(result.title).toBe(
      title === "Load skill" ? "Load skill frontend-design" : title,
    );
    expect(result.context).toBeUndefined();
    expect(result.parameters).toEqual({});
  }
});

it("includes the actual filename in generic read titles without inventing a tool label", () => {
  expect(
    toolPresentation(
      tool({
        name: "Read",
        title: "Read File",
        kind: "read",
        rawInput: {
          file_path: "services/core/src/flows/confirm-issue/workflow.ts",
        },
      }),
    ).title,
  ).toBe("Read workflow.ts");
  expect(
    toolPresentation(
      tool({
        name: "Read",
        title: "Read src/workflow.ts",
        kind: "read",
        rawInput: { file_path: "src/workflow.ts" },
      }),
    ).title,
  ).toBe("Read src/workflow.ts");
  expect(
    toolPresentation(
      tool({
        name: "Read",
        title: "Read File",
        kind: "read",
        rawInput: {
          file_path: "src/workflow.ts",
          description: "Inspect confirmation flow",
        },
      }),
    ).title,
  ).toBe("Inspect confirmation flow workflow.ts");
});

it("special-cases wakeups without inventing a time or hiding failures", () => {
  expect(
    toolPresentation(
      tool({
        name: "ScheduleWakeup",
        rawInput: { delaySeconds: 1200 },
        rawOutput:
          "Next wakeup scheduled for 12:06:00 (in 1233s). Internal instructions.",
      }),
    ).wakeup,
  ).toEqual({ title: "Wakeup scheduled for 12:06:00", delay: "20 min delay" });
  expect(
    toolPresentation(
      tool({
        name: "ScheduleWakeup",
        rawInput: { delaySeconds: 90 },
        status: "in_progress",
      }),
    ).wakeup,
  ).toEqual({ title: "Scheduling wakeup", delay: "1 min 30 sec delay" });
  expect(
    toolPresentation(
      tool({
        name: "ScheduleWakeup",
        rawInput: { delaySeconds: -1 },
        rawOutput: "Changed receipt format",
      }),
    ).wakeup,
  ).toEqual({ title: "Wakeup scheduled", delay: undefined });
  const failed = toolPresentation(
    tool({
      name: "ScheduleWakeup",
      status: "failed",
      rawOutput: { error: "Scheduling unavailable" },
    }),
  );
  expect(failed.wakeup).toBeUndefined();
  expect(failed.output).toEqual(["Scheduling unavailable"]);
});
