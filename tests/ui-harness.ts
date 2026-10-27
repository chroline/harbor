import { planRequests, reviewText } from "./providers/plan-reviews";
import { supportedProviders } from "../src/lib/bindings/supported-providers";
// Deterministic browser-only IPC fixture. Not included in the production entry or bundle.
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import type { Bootstrap } from "../src/lib/bindings/Bootstrap";
import type { SessionRecord } from "../src/lib/bindings/SessionRecord";
import type { SessionEvent } from "../src/lib/bindings/SessionEvent";
import { populateShowcase } from "./showcase-fixture";
const showcase = new URLSearchParams(location.search).has("showcase");
const data: Bootstrap = {
  projects: [
    {
      id: "fixture-project",
      name: "UI test repository",
      workspaceId: "fixture-workspace",
      icon: "rocket",
      color: "purple",
    },
  ],
  workspaces: [
    {
      id: "fixture-workspace",
      name: "repository",
      path: "/fixture/repository",
      lastUsedAt: 2,
      available: true,
      isGitRoot: true,
    },
    {
      id: "notes-workspace",
      name: "notes",
      path: "/fixture/notes",
      lastUsedAt: 1,
      available: true,
      isGitRoot: false,
    },
  ],
  providers: supportedProviders.map((p) => ({...p, command:"fixture-agent", nativeCommand:"", installHint:"Deterministic UI fixture"})),
  sessions: [],
  archives: [],
  worktrees: [],
  settings: { theme: "dark", notifications: false },
};
if (showcase) populateShowcase(data);
const archiveAlignment = new URLSearchParams(location.search).has("archive-alignment");
if (archiveAlignment && showcase) {
  data.sessions[0].title = "Explore OliverSpec";
  data.sessions[0].worktreeId = "fixture-owned-worktree";
  data.settings.theme = "light";
}
if (new URLSearchParams(location.search).has("empty")) data.projects = [];
const modeId = "collaboration_mode";
const modeValues = ["default", "plan"];
const fastModel = "fast";
const deepModel = "deep";
const pickerCatalog = new URLSearchParams(location.search).has("picker");
const fixtureCommands = pickerCatalog
  ? [
      {
        name: "status",
        description: "Show chat ID, context usage, and rate limits",
      },
      { name: "usage", description: "Open usage and billing settings" },
      {
        name: "$agentation",
        description:
          "Add Agentation visual feedback toolbar to a Next.js project",
      },
      {
        name: "$agents",
        description: "Build with the Agents API or Agents SDK",
      },
      {
        name: "$agents-sdk",
        description: "Build AI agents on Cloudflare Workers",
      },
      {
        name: "$ai-elements",
        description: "Build AI chat interfaces using ai-elements components",
      },
      {
        name: "$ai-sdk",
        description:
          "Answer questions about the AI SDK and help build AI-powered features",
      },
      {
        name: "$analytics-dashboard",
        description:
          "Create spreadsheets with charts and interactive dashboards",
      },
      {
        name: "$annual-impact-report",
        description: "Create an annual impact report from your team's work",
      },
      {
        name: "$atomic-commits",
        description: "Create atomic git commits by logical concern",
      },
      {
        name: "$canvas-html-export",
        description: "Export analysis as a self-contained HTML document",
      },
      { name: "$cloudflare", description: "Build on the Cloudflare platform" },
    ]
  : [
      {
        name: "review",
        description: "Review changes",
        input: { hint: "branch or instructions" },
      },
      { name: "$build", description: "Build the project" },
      { name: "skill:check", description: "Check the workspace" },
    ];
const calls: { command: string; args: any }[] = [];
const failures = new Map<string, string>();
const pausedCommands = new Map<string, { wait: Promise<void>; release: () => void }>();
if (archiveAlignment) {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  pausedCommands.set("delete_session", { wait, release });
}
let branches = ["main", "develop", "fix/retry", "origin/main"];
let sequence = 0;
const events: SessionEvent[] = [];
const config = (model = fastModel, provider = "codex") => [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: model,
    options: [
      { value: fastModel, name: showcase ? "GPT-6.1 Sol" : "Fast fixture" },
      { value: deepModel, name: showcase ? "GPT-6 Astra" : "Deep fixture" },
    ],
  },
  {
    id: "effort",
    name: "Reasoning effort",
    category: "thought_level",
    type: "select",
    currentValue: model === deepModel ? "high" : "low",
    options: (model === deepModel ? ["medium", "high"] : ["low", "medium"]).map(
      (value) => ({ value, name: value }),
    ),
  },
  ...[
        {
          id: modeId,
          name: "Mode",
          category: modeId,
          type: "select",
          currentValue: modeValues[0],
          options: modeValues.map((value) => ({
            value,
            name: value[0].toUpperCase() + value.slice(1),
          })),
        },
      ],
].filter((o) => provider !== "grok" || o.category === "model").map((o) => o.id === modeId && provider === "claude" ? {
  ...o, id:"mode", category:"mode", options:[{value:"default",name:"Manual"},{value:"acceptEdits",name:"Accept edits"},{value:"plan",name:"Plan"}],
} : o);
const grokModes = (currentModeId = "default") => ({currentModeId, availableModes:[{id:"default",name:"Default"},{id:"plan",name:"Plan"}]});
async function changed(s: SessionRecord) {
  s.updatedAt = Date.now();
  await emit("session-changed", structuredClone(s));
}
async function event(s: SessionRecord, kind: string, payload: any) {
  const e = {
    sequence: ++sequence,
    sessionId: s.id,
    kind,
    payload,
    timestamp: Date.now(),
  };
  events.push(e);
  await emit("session-event", e);
}
mockWindows("main");
const shellTerminals = new Map<
  string,
  { id: string; owner: string; title: string; alive: boolean; bytes: number[] }
>();
let nextTerminal = 0;
const detachedTabs = new Map<string, any>();
mockIPC(
  async (command, args: any) => {
    calls.push({ command, args: structuredClone(args) });
    const paused = pausedCommands.get(command);
    if (paused) await paused.wait;
    const failure = failures.get(command);
    if (failure) {
      failures.delete(command);
      throw new Error(failure);
    }
    const s = data.sessions.find((s) => s.id === args?.sessionId);
    switch (command) {
      case "plugin:window|set_theme":
      case "plugin:window|set_title":
        return;
      case "bootstrap":
        return structuredClone(data);
      case "list_editors":
        return [
          { value: "/Applications/Zed.app", label: "Zed" },
          { value: "/Applications/Visual Studio Code.app", label: "Visual Studio Code" },
        ];
      case "save_provider": {
        const index = data.providers.findIndex((p) => p.id === args.provider.id);
        if (index < 0) data.providers.push(structuredClone(args.provider));
        else data.providers[index] = structuredClone(args.provider);
        return;
      }
      case "discover_commands":
        return fixtureCommands;
      case "discover_provider_config": {
        const controls = config(args.selections?.model ?? fastModel, args.providerId);
        for (const control of controls) {
          if (control.options.some((o) => o.value === args.selections?.[control.id])) control.currentValue = args.selections[control.id];
        }
        return {
          agentInfo: { name: args.providerId, version: "fixture" },
          configOptions: controls,
          modes: args.providerId === "grok" ? grokModes(args.selections?.__legacy_mode) : null,
          models: null,
        };
      }
      case "save_project": {
        const project = {
          id: args.projectId ?? "added-project",
          name: args.name,
          workspaceId: data.workspaces.find(
            (w) => w.path === args.workspacePath,
          )!.id,
          icon: args.icon,
          color: args.color,
        };
        data.projects = [
          ...data.projects.filter((p) => p.id !== project.id),
          project,
        ];
        return project;
      }
      case "create_session": {
        const session: SessionRecord = {
          id: "fixture-" + Date.now(),
          title: args.title,
          projectId: null,
          workspaceId: args.workspaceId,
          isGit: !!data.workspaces.find((w) => w.id === args.workspaceId)
            ?.isGitRoot,
          providerId: args.providerId,
          cwd: args.workspaceId
            ? data.workspaces.find((w) => w.id === args.workspaceId)!.path
            : "/fixture/conversations/freeform",
          acpSessionId: "wire-root",
          nativeSessionId: null,
          worktreeId: null,
          status: "idle",
          mode: "gui",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          configOptions: config(args.initialConfig?.model ?? fastModel, args.providerId).map(
            (o) => ({
              ...o,
              currentValue: args.initialConfig?.[o.id] ?? o.currentValue,
            }),
          ),
          models: null,
          modes: args.providerId === "grok" ? grokModes(args.initialConfig?.__legacy_mode) : null,
          capabilities: {
            loadSession: true,
            resumeSession: false,
            configOptions: true,
            nativeHandoff: false,
            nativeHandoffReason: "Browser fixture has no native CLI",
            raw: {},
          },
          error: null,
          draft: "",
          scrollTop: 0,
          reviewOpen: false,
          archived: false,
        };
        data.sessions.push(session);
        await changed(session);
        await event(session, "session/update", {
          sessionId: "wire-root",
          update: {
            sessionUpdate: "available_commands_update",
            availableCommands: fixtureCommands,
          },
        });
        return structuredClone(session);
      }
      case "set_config":
        if (args.configId === "__legacy_mode") s!.modes = grokModes(args.value);
        else if (args.configId === "model") s!.configOptions = config(args.value, s!.providerId);
        else
          (s!.configOptions as any[]).find(
            (o) => o.id === args.configId,
          ).currentValue = args.value;
        await changed(s!);
        return structuredClone(s);
      case "send_prompt":
        s!.status = "working";
        await changed(s!);
        await event(s!, "user_message", {
          text: args.text,
          attachments: (args.attachments ?? []).map(
            (file: { name: string; mimeType: string; data: string }) => ({
              name: file.name,
              mimeType: file.mimeType,
              size: atob(file.data).length,
            }),
          ),
        });
        await event(s!, "session/update", {
          sessionId: "wire-root",
          update: {
            sessionUpdate: "subagent_update",
            sessionId: "wire-child",
            title: "Lighthouse",
            description: "Review the retry implementation",
            state: { type: "working" },
            capabilities: {},
          },
        });
        await event(s!, "session/update", {
          sessionId: "wire-child",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "Worker report: the idempotency check handles retries.",
            },
          },
        });
        await event(s!, "session/update", {
          sessionId: "wire-root",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: "Ready for review.\n\n```typescript\nconst existing = await orders.find(key);\nif (existing) return existing;\n```",
            },
          },
        });
        await event(s!, "turn_complete", { stopReason: "end_turn" });
        s!.status = "completed";
        await changed(s!);
        return;
      case "reconnect":
        s!.status = "connecting";
        await changed(s!);
        s!.status = "idle";
        await changed(s!);
        return structuredClone(s);
      case "get_events":
        return events.filter(
          (e) => e.sessionId === args.sessionId && e.sequence > args.after,
        ).slice(0, args.limit ?? 5000);
      case "open_subagent":
        await event(s!, "child_connected", {
          childId: args.childId,
          viaParent: true,
        });
        return;
      case "answer_request":
        {
          const routed = args.requestId;
          const original =
            typeof routed === "object" && routed
              ? ([...events].reverse().find((e) => {
                  const payload = e.payload as any;
                  return (
                    e.kind === "request" &&
                    payload.params?._harborChildId === routed.childId &&
                    payload.params?._harborRequestId === routed.requestId
                  );
                })?.payload as any)
              : undefined;
          await event(s!, "answered", { id: original?.id ?? routed, result:args.result });
          s!.status = "idle";
          await changed(s!);
        }
        return;
      case "cancel_turn":
        s!.status = "idle";
        await changed(s!);
        return;
      case "save_session_ui":
        Object.assign(s!, {
          draft: args.draft,
          scrollTop: args.scrollTop,
          reviewOpen: args.reviewOpen,
        });
        return;
      case "create_shell_terminal": {
        const terminal = {
          id: `shell:${args.sessionId}:${++nextTerminal}`,
          owner: args.sessionId,
          title: "repository — zsh",
          alive: true,
          bytes: [],
        };
        shellTerminals.set(terminal.id, terminal);
        return structuredClone(terminal);
      }
      case "list_detached_tabs":
        return [...detachedTabs.values()]
          .filter((tab) => tab.sessionId === args.sessionId)
          .map((tab) => tab.tabId);
      case "detach_task_tab":
        detachedTabs.set(args.tabId, structuredClone(args));
        await emit("task-tabs-changed", args.sessionId);
        return;
      case "focus_task_tab":
        return;
      case "get_detached_tab":
        return [...detachedTabs.values()][0];
      case "list_shell_terminals":
        return [...shellTerminals.values()]
          .filter((t) => t.owner === args.sessionId)
          .map((t) => structuredClone(t));
      case "close_shell_terminal":
        shellTerminals.delete(args.terminalId);
        return;
      case "terminal_status":
        return structuredClone(shellTerminals.get(args.sessionId));
      case "terminal_input":
      case "terminal_resize":
        return;
      case "terminal_snapshot": {
        const bytes = shellTerminals.get(args.sessionId)?.bytes ?? [];
        return { bytes, end: bytes.length };
      }
      case "get_review":
        return {
          files: ["src/retry.ts"],
          status: " M src/retry.ts",
          diff: "diff --git a/src/retry.ts b/src/retry.ts\n--- a/src/retry.ts\n+++ b/src/retry.ts\n@@ -1 +1,2 @@\n-const order = createOrder();\n+const existing = await orders.find(key);\n+if (existing) return existing;",
        };
      case "read_file":
        return "const existing = await orders.find(key);\nif (existing) return existing;";
      case "save_settings":
        data.settings = args.settings;
        return;
      case "delete_session":
        s!.archived = true;
        s!.status = "archived";
        await changed(s!);
        return;
      case "list_branches":
        return branches;
      case "list_worktrees":
        return [
          { path: data.workspaces.find((w) => w.id === args.workspaceId)?.path ?? "/fixture/repository", branch: "main", is_main: true },
          {
            path: `${data.workspaces.find((w) => w.id === args.workspaceId)?.path ?? "/fixture/repository"}/../worktrees/retry`,
            branch: "fix/retry",
            is_main: false,
          },
        ];
      case "probe_provider":
        return { status: "ready", message:"Connected and authenticated", path:"/fixture/agent", nativePath:null, version: "fixture", worktrunk: true, agentInfo:{}, authMethods:[] };
      default:
        throw new Error("Unimplemented fixture command: " + command);
    }
  },
  { shouldMockEvents: true },
);
(globalThis as typeof globalThis & { isTauri: boolean }).isTauri = true;
if (new URLSearchParams(location.search).has("launch"))
  await import("./launch-dialog-harness");
else await import("../src/main");
const label = document.createElement("div");
label.textContent = "UI TEST FIXTURE · simulated IPC";
label.style.cssText =
  "position:fixed;bottom:3px;left:50%;z-index:9999;font:13px monospace;color:#999;pointer-events:none";
if (!showcase) document.body.append(label);

Object.assign(window, {
  __harborFixture: {
    failNext: (command: string, message: string) => failures.set(command, message),
    pauseNext: (command: string) => {
      let release!: () => void;
      const wait = new Promise<void>((resolve) => { release = resolve; });
      pausedCommands.set(command, { wait, release });
    },
    resume: (command: string) => {
      pausedCommands.get(command)?.release();
      pausedCommands.delete(command);
    },
    terminalOutput: async (id: string, text: string) => {
      const terminal = shellTerminals.get(id)!;
      const bytes = Array.from(new TextEncoder().encode(text));
      terminal.bytes.push(...bytes);
      await emit("terminal-data", {
        sessionId: id,
        bytes,
        end: terminal.bytes.length,
      });
    },
    terminalStatus: (id: string, title: string, alive = true) => {
      Object.assign(shellTerminals.get(id)!, { title, alive });
    },
    showPlan: async (provider: string, text = reviewText) => {
      const request = JSON.parse(JSON.stringify(planRequests[provider]).replaceAll(JSON.stringify(reviewText).slice(1,-1), JSON.stringify(text).slice(1,-1)));
      const s = data.sessions.at(-1)!;
      await event(s, "disconnected", {});
      await event(s, "user_message", {text:"Review this plan"});
      if (provider === "codex") await event(s, "session/update", {sessionId:"wire-root",update:{sessionUpdate:"agent_message_chunk",content:{type:"text",text}}});
      await event(s, "request", request);
      s.status="needs_input";
      await changed(s);
    },
    restore: async (saved: {data: Bootstrap; events: SessionEvent[]}) => {
      Object.assign(data,structuredClone(saved.data));
      events.splice(0,events.length,...structuredClone(saved.events));
      sequence=Math.max(0,...events.map(e=>e.sequence));
      for (const session of data.sessions) await changed(session);
    },
    snapshot: () => structuredClone({ data, calls, events }),
    branches: (count: number) => {
      branches = Array.from(
        { length: count },
        (_, index) => `branch-${String(index).padStart(4, "0")}`,
      );
    },
    sidebarSessions: async (count = 45) => {
      const source = data.sessions.filter((s) => !s.archived).at(-1)!;
      for (let i = 0; i < count; i++) {
        const session = {
          ...structuredClone(source),
          id: `sidebar-stress-${i}`,
          title: `Sidebar conversation ${i + 1}${i === 0 ? " with a long title to verify truncation and action spacing" : ""}`,
          createdAt: source.createdAt - i - 1,
          updatedAt: source.updatedAt - i - 1,
        };
        data.sessions.push(session);
        await changed(session);
      }
    },
    status: async (status: string) => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      s.status = status;
      await changed(s);
    },
    userMessage: async (text: string) => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      s.status = "working";
      await changed(s);
      await event(s, "user_message", { text });
    },
    chunk: async (text: string) => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      await event(s, "session/update", {
        sessionId: "wire-root",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text },
        },
      });
    },
    configuration: async (configOptions: SessionRecord["configOptions"]) => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      s.configOptions = configOptions;
      await changed(s);
    },
    notification: async (message: string) => emit("storage-error", message),
    disconnect: async () => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      await event(s, "disconnected", { message: "Fixture disconnect" });
      s.status = "disconnected";
      await changed(s);
    },
    request: async (method: string, params: any, id = 100) => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      await event(s, "request", { id, method, params });
      s.status = "needs_input";
      await changed(s);
    },
    interleaved: async () => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      await event(s, "user_message", { text: "Check the retry handler" });
      const update = (u: any) =>
        event(s, "session/update", { sessionId: "wire-root", update: u });
      const message = (text: string) =>
        update({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text },
        });
      await message("I’ll inspect the handler.");
      await update({
        sessionUpdate: "tool_call",
        toolCallId: "read-inline",
        title: "Read retry.ts",
        status: "in_progress",
      });
      await message("The retry check needs a guard.");
      await update({
        sessionUpdate: "tool_call_update",
        toolCallId: "read-inline",
        status: "completed",
      });
      await update({
        sessionUpdate: "tool_call",
        toolCallId: "edit-inline",
        title: "Edit retry.ts",
        status: "completed",
      });
      await message("Added the guard.");
      await event(s, "turn_complete", { stopReason: "end_turn" });
    },
    tool: async (tool: any) => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      await event(s, "session/update", {
        sessionId: "wire-root",
        update: { sessionUpdate: "tool_call", ...tool },
      });
    },
    plan: async () => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      await event(s, "session/update", {
        sessionId: "wire-root",
        update: {
          sessionUpdate: "plan",
          entries: [
            { content: "Inspect retries", status: "completed" },
            { content: "Check edge cases", status: "in_progress" },
            { content: "Run the test suite", status: "pending" },
          ],
        },
      });
    },
    update: async (update: any, wireId = "wire-root") => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      await event(s, "session/update", { sessionId: wireId, update });
    },
    complete: async () => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      await event(s, "turn_complete", { stopReason: "end_turn" });
      s.status = "completed";
      await changed(s);
    },
    longTranscript: async ({ image = false } = {}) => {
      const s = data.sessions.filter((s) => !s.archived).at(-1)!;
      for (let i = 0; i < 120; i++) {
        await event(s, "user_message", {
          text: (image
            ? "![No name.png](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=)\n\n"
            : "") + "Review case " + i,
        });
        await event(s, "session/update", {
          sessionId: "wire-root",
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text:
                "Case " +
                i +
                "\n\n" +
                "A line of streamed analysis. ".repeat(24),
            },
          },
        });
        await event(s, "turn_complete", { stopReason: "end_turn" });
      }
    },
  },
});
