import { createRoot } from "react-dom/client";
import { ChatTranscript } from "../src/components/ChatTranscript";
import { ChatTranscript as ChatTranscriptBefore } from "./chat-transcript-before";
import { ToolCard } from "../src/components/Chat";
import { ToolCardBefore } from "./tool-card-before";
import {
  emptyTranscript,
  reduceEvent,
  timeline,
  type Tool,
} from "../src/lib/protocol";
import "../src/styles.css";
import "./tool-presentation-fixture.css";
import codexEvents from "./fixtures/codex-tool-events.json";
import type { SessionEvent } from "../src/lib/bindings/SessionEvent";

// Sanitized, shortened versions of recorded ACP sequences from
// "Issue extraction pipeline flow chart". No live agent or database access.
const text = (text: string) => ({
  type: "content",
  content: { type: "text", text },
});
const savedIssue = {
  id: "ENG-1642",
  uuid: "fixture-issue-id",
  title:
    "Add interactive issue pipeline map built from YAML, and require pipeline changes to update it",
  description:
    "## Context\nNothing shows the issue pipeline end to end.\n\n## Acceptance criteria\nKeep the map current when the pipeline changes.",
  state: "Done",
};
const calls = [
  {
    name: "Bash",
    title:
      "cat openwiki/quickstart.md | head -80 && find openwiki -name '*.md'",
    kind: "execute",
    rawInput: {
      command:
        "cat openwiki/quickstart.md | head -80 && find openwiki -name '*.md'",
      description: "Read wiki quickstart and find extraction pages",
    },
    content: [
      text(
        "```console\n# Lemma Platform — OpenWiki Quickstart\nopenwiki/architecture/issue-extraction.md\n```",
      ),
    ],
    rawOutput:
      "# Lemma Platform — OpenWiki Quickstart\nopenwiki/architecture/issue-extraction.md",
  },
  {
    name: "Read",
    title: "Read File",
    kind: "read",
    rawInput: {
      file_path: "services/core/src/flows/confirm-issue/workflow.ts",
      offset: 20,
      limit: 8,
    },
    locations: [
      { path: "services/core/src/flows/confirm-issue/workflow.ts", line: 20 },
    ],
    content: [
      text(
        "```ts\nexport async function confirmIssueWorkflow() {\n  return runConfirmation();\n}\n```",
      ),
    ],
  },
  {
    name: "Write",
    title: "Write issue-pipeline-flowchart.md",
    kind: "edit",
    rawInput: {
      file_path: "issue-pipeline-flowchart.md",
      content:
        "# Issue pipeline\n\nIngest → Extract → Group → Confirm → Notify\n",
    },
    rawOutput:
      "File created successfully at: /workspace/issue-pipeline-flowchart.md (file state is current in your context — no need to Read it back)",
  },
  {
    name: "Agent",
    title: "Agent",
    kind: "other",
    rawInput: null,
    claudeCode: {
      toolResponse: {
        agentId: "worker-internal-id",
        description: "Map validator and severity flows",
        prompt:
          "Investigate confirmation and severity workflows. Report their triggers, inputs, and outputs.",
        isAsync: true,
        outputFile: "/private/tmp/tasks/worker.output",
        canContinueAgent: true,
      },
    },
    rawOutput: [
      {
        type: "text",
        text: "Worker started. agentId: worker-internal-id; outputFile: /private/tmp/tasks/worker.output",
      },
    ],
  },
  {
    name: "SubagentHandback",
    title: "SubagentHandback",
    kind: "other",
    rawInput: {
      message:
        "## Findings\nConfirmation and severity run per issue after grouping assigns or creates an issue.",
    },
    content: [
      text('{"success":true,"message":"Report delivered to your caller."}'),
    ],
    rawOutput: [
      {
        type: "text",
        text: '{"success":true,"message":"Report delivered to your caller."}',
      },
    ],
  },
  {
    name: "Skill",
    title: "Load skill",
    kind: "other",
    rawInput: { skill: "frontend-design" },
    rawOutput: "Launching skill: frontend-design",
  },
  {
    name: "ScheduleWakeup",
    title: "ScheduleWakeup",
    kind: "other",
    rawInput: { delaySeconds: 1200 },
    content: [
      text(
        "Next wakeup scheduled for 12:06:00. If you owe the user a status update this tick, write it now as ordinary response text; then end the turn — the harness re-invokes you when the wakeup fires.",
      ),
    ],
  },
  {
    name: "ToolSearch",
    title: "ToolSearch",
    kind: "other",
    rawInput: { query: "linear issue create" },
    content: [text("Tool: mcp__linear__create_issue")],
    rawOutput: [
      { type: "tool_reference", tool_name: "mcp__linear__create_issue" },
    ],
  },
  {
    name: "Bash",
    title: "git show missing-ref",
    kind: "execute",
    status: "failed",
    rawInput: {
      command: "git show missing-ref",
      description: "Inspect the previous pipeline revision",
    },
    content: [{ type: "terminal", terminalId: "failed-terminal" }],
  },
  {
    name: "mcp__linear-server__save_issue",
    title: "mcp__linear-server__save_issue",
    kind: "other",
    rawInput: { id: "ENG-1642", state: "Done" },
    content: [text(JSON.stringify(savedIssue))],
    rawOutput: [{ type: "text", text: JSON.stringify(savedIssue) }],
  },
  {
    name: "UnknownTool",
    title: "Inspect external resource",
    kind: "other",
    rawInput: { routingId: "internal-route" },
    rawOutput: { internalId: "transport-id" },
  },
];
let transcript = emptyTranscript();
let sequence = 0;
for (const [index, call] of calls.entries()) {
  const { name, claudeCode, status, ...fields } = call;
  for (const update of [
    {
      sessionUpdate: "tool_call",
      toolCallId: `fixture-${index}`,
      title: call.title,
      kind: call.kind,
      status: "pending",
      _meta: { claudeCode: { toolName: name } },
    },
    {
      sessionUpdate: "tool_call_update",
      toolCallId: `fixture-${index}`,
      ...fields,
      _meta: { claudeCode: { toolName: name, ...claudeCode } },
    },
    {
      sessionUpdate: "tool_call_update",
      toolCallId: `fixture-${index}`,
      status: status || "completed",
    },
  ])
    transcript = reduceEvent(transcript, {
      sequence: ++sequence,
      sessionId: "fixture",
      kind: "session/update",
      timestamp: 1000 + sequence * 500,
      payload: { sessionId: "root", update },
    });
}
transcript.terminals["failed-terminal"] = {
  output: "fatal: invalid object name 'missing-ref'.\n",
  exitCode: 128,
  truncated: true,
};
// The baseline reducer discarded metadata but kept the same input/output/content.
const params = new URLSearchParams(location.search);
const codex = params.get("provider") === "codex";
if (codex)
  transcript = (codexEvents as SessionEvent[]).reduce(
    reduceEvent,
    emptyTranscript(),
  );
const before = params.get("view") === "before";
const entries = timeline(transcript).map((entry) =>
  entry.type === "tool" && before
    ? {
        ...entry,
        tool: {
          ...entry.tool,
          name: undefined,
          locations: undefined,
          claudeCode: undefined,
        },
      }
    : entry,
);
const Transcript = before ? ChatTranscriptBefore : ChatTranscript;
const Card = before ? ToolCardBefore : ToolCard;
document.documentElement.classList.add("dark");
document.title = `${before ? "Before" : "After"} · ${codex ? "Codex" : "Claude"} tool activity`;
createRoot(document.getElementById("root")!).render(
  <main className="fixture-main conversation-content">
    <header>
      <p>HARBOR · TOOL ACTIVITY</p>
      <h1>{before ? "Before" : "After"}</h1>
      <p>
        {codex
          ? "Private Git repo with Cloudflare CI · sanitized recorded Codex events"
          : "Issue extraction pipeline flow chart · sanitized recorded examples"}
      </p>
      <nav>
        <a href={`?view=before${codex ? "&provider=codex" : ""}`}>Before</a>
        <a href={`?view=after${codex ? "&provider=codex" : ""}`}>After</a>
      </nav>
    </header>
    <Transcript
      entries={entries}
      renderTool={(tool: Tool) => (
        <Card detailsOnly tool={tool} terminals={transcript.terminals} />
      )}
    />
  </main>,
);
