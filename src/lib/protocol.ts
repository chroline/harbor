import {
  commandList,
  commandRanges,
  type AvailableCommand,
  type CommandRange,
} from "./commands";
import type { SessionEvent } from "./bindings/SessionEvent";
import type { SubagentRecord } from "./bindings/SubagentRecord";
export type ConfigValue = { value: string; name: string; description?: string };
export type ConfigOption = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  type: "select" | "boolean";
  currentValue: string | boolean;
  options?: (
    ConfigValue | { group: string; name: string; options: ConfigValue[] }
  )[];
};
export type Tool = {
  id: string;
  sequence: number;
  sessionId: string;
  title: string;
  status: string;
  kind: string;
  content: unknown[];
  rawInput: unknown;
  rawOutput: unknown;
  timestamp?: number;
  updatedAt?: number;
  turn?: number;
  workCompletedAt?: number;
};
export type Message = {
  attachments?: {
    name: string;
    mimeType: string;
    size: number;
    previewUrl?: string;
  }[];
  commandRanges?: CommandRange[];
  id: string;
  streamId: string;
  sequence: number;
  role: "user" | "assistant" | "thought" | "system";
  text: string;
  label?: string;
  childId?: string;
  timestamp: number;
  updatedAt?: number;
  turn?: number;
  workCompletedAt?: number;
};
export type Interaction = {
  id: string | number;
  method: string;
  params: Record<string, unknown>;
};
export type ToolTerminalOutput = {
  output: string;
  truncated: boolean;
  exitCode?: number;
};
export type Transcript = {
  commands: AvailableCommand[];
  childCommands: Record<string, AvailableCommand[]>;
  trimmed: boolean;
  messages: Message[];
  tools: Record<string, Tool>;
  terminals: Record<string, ToolTerminalOutput>;
  replayToolDetails: Record<string, Pick<Tool, "content" | "rawInput">>;
  attachmentMetadata: {
    text: string;
    childId?: string;
    attachments: NonNullable<Message["attachments"]>;
  }[];
  children: Record<string, SubagentRecord>;
  requests: Interaction[];
  plan: unknown[];
  diagnostics: string[];
  lastSequence: number;
  turn: number;
  childTurns: Record<string, number>;
  authMethods: { id: string; name: string; description?: string }[];
};
export const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
export const str = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : fallback;
export const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const sameWorker = (candidate: string | undefined, worker: string) =>
  candidate === worker ||
  (candidate?.startsWith(`${worker}:generation:`) === true &&
    /^\d+$/.test(candidate.slice(`${worker}:generation:`.length)));
export const emptyTranscript = (): Transcript => ({
  commands: [],
  childCommands: {},
  trimmed: false,
  messages: [],
  tools: {},
  terminals: {},
  replayToolDetails: {},
  attachmentMetadata: [],
  children: {},
  requests: [],
  plan: [],
  diagnostics: [],
  lastSequence: 0,
  turn: 0,
  childTurns: {},
  authMethods: [],
});
export function options(v: unknown): ConfigOption[] {
  return array(v).filter((x) =>
    ["select", "boolean"].includes(str(record(x).type)),
  ) as ConfigOption[];
}
export function values(option: ConfigOption): ConfigValue[] {
  return (option.options ?? []).flatMap((v) =>
    "group" in v ? v.options : [v],
  );
}
export function reduceEvent(
  previous: Transcript,
  event: SessionEvent,
): Transcript {
  if (event.sequence <= previous.lastSequence) return previous;
  let t = { ...previous, lastSequence: event.sequence };
  const p = record(event.payload);
  const targetChild = str(p.childId) || undefined;
  const setTerminalOutput = (
    id: string,
    output: string,
    exitCode: unknown,
    truncated = false,
  ) => {
    t.terminals = Object.fromEntries(
      Object.entries({
        ...t.terminals,
        [id]: {
          output: output.slice(-32768),
          truncated: truncated || output.length > 32768,
          exitCode:
            typeof exitCode === "number" ? exitCode : t.terminals[id]?.exitCode,
        },
      }).slice(-100),
    );
  };
  if (event.kind === "tool_terminal" && typeof p.terminalId === "string") {
    setTerminalOutput(
      p.terminalId,
      str(p.output),
      record(p.exitStatus).exitCode,
      p.truncated === true,
    );
  }
  if (event.kind === "child_history_reset" && targetChild) {
    t.messages = t.messages.filter((m) => m.childId !== targetChild);
    t.tools = Object.fromEntries(
      Object.entries(t.tools).filter(
        ([, tool]) => tool.sessionId !== targetChild,
      ),
    );
  }
  if (
    targetChild &&
    t.children[targetChild] &&
    ["child_connected", "child_disconnected", "child_status"].includes(
      event.kind,
    )
  ) {
    const old = t.children[targetChild];
    t.children = {
      ...t.children,
      [targetChild]: {
        ...old,
        ...(event.kind === "child_status"
          ? { state: { type: str(p.state), error: str(p.error) } }
          : event.kind === "child_disconnected"
            ? { state: { type: "unknown" } }
            : {}),
        capabilities: {
          ...record(old.capabilities),
          ...(event.kind === "child_connected"
            ? { harborViaParent: p.viaParent === true }
            : {}),
          harborConnected:
            event.kind === "child_connected"
              ? true
              : event.kind === "child_disconnected"
                ? false
                : record(old.capabilities).harborConnected === true,
        },
      },
    };
    if (event.kind === "child_disconnected")
      t.childCommands = { ...t.childCommands, [targetChild!]: [] };
    if (event.kind === "child_disconnected")
      t.requests = t.requests.filter(
        (r) => str(r.params.sessionId) !== targetChild,
      );
  }
  if (event.kind === "history_reset")
    return {
      ...emptyTranscript(),
      lastSequence: event.sequence,
      authMethods: t.authMethods,
      commands: t.commands,
      childCommands: t.childCommands,
      // Terminal snapshots belong to persisted calls, including provider replays.
      terminals: t.terminals,
      attachmentMetadata: t.attachmentMetadata,
      // A parent replay does not contain Harbor's worker-composer input or
      // relayed replies. Only an explicit child replay may replace those.
      children: t.children,
      childTurns: t.childTurns,
      messages: t.messages.filter(
        (m) =>
          m.childId &&
          (m.role === "system" ||
            (m.role === "user" && m.streamId.startsWith(`${m.childId}:user:`))),
      ),
      // Some providers replay edit receipts without the original input/diff.
      // Keep bounded details off the timeline until that exact call is replayed.
      replayToolDetails: Object.fromEntries(
        Object.entries({
          ...t.replayToolDetails,
          ...Object.fromEntries(
            Object.entries(t.tools)
              .filter(([, tool]) => tool.kind === "edit")
              .map(([id, tool]) => [
                id,
                { content: tool.content, rawInput: tool.rawInput },
              ]),
          ),
        }).slice(-100),
      ),
    };
  if (event.kind === "connected") {
    t.replayToolDetails = {};
    t.children = Object.fromEntries(
      Object.entries(t.children).map(([id, child]) => [
        id,
        {
          ...child,
          capabilities: {
            ...record(child.capabilities),
            harborConnected: false,
          },
        },
      ]),
    );
  }
  const append = (
    role: Message["role"],
    text: string,
    childId?: string,
    messageId?: string,
    label?: string,
  ) => {
    const attachments: NonNullable<Message["attachments"]> = [];
    // Some ACP adapters replay attached images as Markdown data links. Extract
    // their image source before the text limit can cut the link into raw base64.
    if (role === "user") {
      text = text.replace(
        /!?\[([^\]\n]*)\]\(data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)\)/gi,
        (_link, name: string, mimeType: string, data: string) => {
          const bytes = data.replace(/[\r\n]/g, "");
          attachments.push({
            name: name && name !== "@image" ? name : "Image",
            mimeType,
            previewUrl: `data:${mimeType};base64,${bytes}`,
            size:
              Math.floor((bytes.length * 3) / 4) -
              (bytes.match(/=+$/)?.[0].length ?? 0),
          });
          return "";
        },
      );
      if (attachments.length) text = text.trim();
    }
    const messageTurn = childId ? (t.childTurns[childId] ?? 0) : t.turn;
    const streamId = messageId ?? `${childId ?? "root"}:${role}:${messageTurn}`;
    let lastIndex = t.messages.length - 1;
    while (lastIndex >= 0 && t.messages[lastIndex].childId !== childId)
      lastIndex--;
    const last = t.messages[lastIndex];
    if (attachments.length) {
      const promptText =
        (last?.streamId === streamId && last.role === role ? last.text : "") +
        text;
      const saved = [...t.attachmentMetadata]
        .reverse()
        .find(
          (entry) =>
            entry.childId === childId &&
            entry.text.trim() === promptText.trim(),
        );
      const remaining = [...(saved?.attachments ?? [])];
      for (const attachment of attachments) {
        const index = remaining.findIndex(
          (file) =>
            file.mimeType === attachment.mimeType &&
            file.size === attachment.size,
        );
        if (index >= 0) {
          const [file] = remaining.splice(index, 1);
          if (attachment.name === "Image") attachment.name = file.name;
        }
      }
    }
    // A tool starts a new prose segment. Later tool updates stay at the call's
    // original position and must not split an ongoing text stream.
    const toolBoundary =
      last &&
      Object.values(t.tools).some(
        (tool) =>
          tool.sequence > last.sequence &&
          (childId ? tool.sessionId === childId : !t.children[tool.sessionId]),
      );
    if (last?.streamId === streamId && last.role === role && !toolBoundary) {
      t.messages = t.messages.map((message, index) =>
        index === lastIndex
          ? {
              ...message,
              text: message.text + text,
              ...(attachments.length
                ? {
                    attachments: [
                      ...(message.attachments ?? []),
                      ...attachments,
                    ],
                  }
                : {}),
              ...(role === "user"
                ? {
                    commandRanges: commandRanges(
                      message.text + text,
                      childId ? (t.childCommands[childId] ?? []) : t.commands,
                    ),
                  }
                : {}),
              updatedAt: event.timestamp,
            }
          : message,
      );
    } else {
      t.messages = [
        ...t.messages,
        {
          id: `${streamId}:${event.sequence}`,
          streamId,
          sequence: event.sequence,
          role,
          text,
          ...(attachments.length ? { attachments } : {}),
          ...(role === "user"
            ? {
                commandRanges: commandRanges(
                  text,
                  childId ? (t.childCommands[childId] ?? []) : t.commands,
                ),
              }
            : {}),
          ...(label ? { label } : {}),
          childId,
          timestamp: event.timestamp,
          updatedAt: event.timestamp,
          turn: messageTurn,
        },
      ];
    }
  };
  if (event.kind === "user_message") {
    if (targetChild)
      t.childTurns = {
        ...t.childTurns,
        [targetChild]: (t.childTurns[targetChild] ?? 0) + 1,
      };
    else t.turn++;
    append("user", str(p.text), targetChild);
    if (array(p.attachments).length) {
      const last = t.messages.at(-1)!;
      t.messages = t.messages.map((message) =>
        message === last
          ? {
              ...message,
              attachments: array(p.attachments).map((file) => ({
                name: str(record(file).name),
                mimeType: str(record(file).mimeType),
                size: Number(record(file).size) || 0,
              })),
            }
          : message,
      );
      t.attachmentMetadata = [
        ...t.attachmentMetadata,
        {
          text: str(p.text),
          childId: targetChild,
          attachments: t.messages.at(-1)!.attachments!,
        },
      ].slice(-200);
    }
  }
  if (event.kind === "parent_relay_chunk" && targetChild)
    append("system", str(p.text), targetChild, str(p.messageId) || undefined);
  if (event.kind === "initialized") {
    t.authMethods = array(p.authMethods).map((v) => {
      const a = record(v);
      return {
        id: str(a.id),
        name: str(a.name),
        description: str(a.description),
      };
    });
  }
  if (event.kind === "request") {
    t.requests = [
      ...t.requests,
      {
        id: p.id as string | number,
        method: str(p.method),
        params: record(p.params),
      },
    ];
  }
  if (event.kind === "answered")
    t.requests = t.requests.filter((r) => r.id !== p.id);
  if (event.kind === "disconnected") {
    t.commands = [];
    t.childCommands = {};
    t.requests = [];
    t.tools = Object.fromEntries(
      Object.entries(t.tools).map(([key, tool]) => [
        key,
        ["pending", "in_progress"].includes(tool.status)
          ? { ...tool, status: "interrupted" }
          : tool,
      ]),
    );
    t.children = Object.fromEntries(
      Object.entries(t.children).map(([k, v]) => [
        k,
        {
          ...v,
          state: { type: "unknown" },
          capabilities: { ...record(v.capabilities), harborConnected: false },
        },
      ]),
    );
  }
  if (event.kind === "diagnostic")
    t.diagnostics = [...t.diagnostics, str(p.message)].slice(-100);
  if (event.kind === "turn_complete") {
    t.messages = t.messages.map((message) =>
      (targetChild ? message.childId === targetChild : !message.childId) &&
      message.workCompletedAt === undefined
        ? { ...message, workCompletedAt: event.timestamp }
        : message,
    );
    t.tools = Object.fromEntries(
      Object.entries(t.tools).map(([id, tool]) => [
        id,
        (targetChild
          ? tool.sessionId === targetChild
          : !t.children[tool.sessionId]) && tool.workCompletedAt === undefined
          ? { ...tool, workCompletedAt: event.timestamp }
          : tool,
      ]),
    );
    if (targetChild)
      t.childTurns = {
        ...t.childTurns,
        [targetChild]: (t.childTurns[targetChild] ?? 0) + 1,
      };
    else t.turn++;
    t.requests = targetChild
      ? t.requests.filter((r) => str(r.params.sessionId) !== targetChild)
      : t.requests.filter((r) => !!t.children[str(r.params.sessionId)]);
  }
  if (event.kind === "session/update") {
    const u = record(p.update);
    const type = str(u.sessionUpdate);
    const reportedWireId = str(p.sessionId);
    const wireId =
      Object.keys(t.children).find((id) => sameWorker(reportedWireId, id)) ??
      reportedWireId;
    const childId = t.children[wireId] ? wireId : undefined;
    if (type === "available_commands_update") {
      const commands = commandList(u.availableCommands);
      if (childId)
        t.childCommands = { ...t.childCommands, [childId]: commands };
      else t.commands = commands;
    }
    if (type === "agent_communication") {
      const messageId = str(u.messageId);
      const content = record(u.content);
      if (
        messageId &&
        content.type === "text" &&
        !t.messages.some(
          (m) => m.streamId === messageId && m.childId === childId,
        )
      )
        append(
          u.direction === "received" ? "user" : "assistant",
          str(content.text),
          childId,
          messageId,
          str(u.label),
        );
    }
    if (
      [
        "agent_message_chunk",
        "user_message_chunk",
        "agent_thought_chunk",
      ].includes(type)
    ) {
      const content = record(u.content);
      if (content.type === "text")
        append(
          type === "agent_thought_chunk"
            ? "thought"
            : type === "user_message_chunk"
              ? "user"
              : "assistant",
          str(content.text),
          childId,
          str(u.messageId) || undefined,
        );
    }
    if (type === "tool_call" || type === "tool_call_update") {
      const id = `${wireId}:${str(u.toolCallId)}`;
      const old = t.tools[id];
      const meta = record(u._meta);
      const terminalInfo = record(meta.terminal_info);
      const terminalDelta = record(
        meta.terminal_output ?? meta.terminal_output_delta,
      );
      const terminalExit = record(meta.terminal_exit);
      const terminalId =
        str(terminalDelta.terminal_id) ||
        str(terminalExit.terminal_id) ||
        str(terminalInfo.terminal_id);
      if (terminalId) {
        // A replay starts a fresh stream instead of appending to cached output.
        if (!old && type === "tool_call" && terminalInfo.terminal_id) {
          t.terminals = {
            ...t.terminals,
            [terminalId]: { output: "", truncated: false },
          };
        }
        const terminal = t.terminals[terminalId];
        setTerminalOutput(
          terminalId,
          (terminal?.output ?? "") + str(terminalDelta.data),
          terminalExit.exit_code,
          terminal?.truncated,
        );
      }
      const details = old ?? t.replayToolDetails[id];
      const boundValue = (v: unknown) => {
        const text = JSON.stringify(v);
        if (text && text.length > 32768) {
          t.trimmed = true;
          return (
            text.slice(0, 32768) + "\n[… full output saved in transcript …]"
          );
        }
        return v;
      };
      let nextContent = u.content ?? details?.content ?? [];
      if (
        terminalId &&
        typeof terminalDelta.data === "string" &&
        !array(nextContent).some((c) => record(c).type === "terminal")
      ) {
        nextContent = [...array(nextContent), { type: "terminal", terminalId }];
      }
      // A replayed success receipt must not discard the recorded file contents.
      if (!array(nextContent).some((c) => record(c).type === "diff")) {
        const diffs =
          details?.content.filter((c) => record(c).type === "diff") ?? [];
        if (diffs.length) nextContent = [...array(nextContent), ...diffs];
      }
      const content = boundValue(nextContent);
      t.tools = {
        ...t.tools,
        [id]: {
          id,
          sequence: old?.sequence ?? event.sequence,
          sessionId: wireId,
          title: str(u.title, old?.title ?? "Working"),
          status: str(u.status, old?.status ?? "in_progress"),
          kind: str(u.kind, old?.kind ?? "other"),
          content:
            typeof content === "string"
              ? [{ type: "content", content: { type: "text", text: content } }]
              : array(content),
          rawInput: boundValue(u.rawInput ?? details?.rawInput),
          rawOutput: boundValue(u.rawOutput ?? old?.rawOutput),
          timestamp: old?.timestamp ?? event.timestamp,
          updatedAt: event.timestamp,
          turn: old?.turn ?? (childId ? (t.childTurns[childId] ?? 0) : t.turn),
          workCompletedAt: old?.workCompletedAt,
        },
      };
    }
    if (type === "plan") t.plan = array(u.entries);
    if (type === "subagent_update") {
      const announcedId = str(u.sessionId);
      const id =
        Object.keys(t.children).find((id) => sameWorker(announcedId, id)) ??
        announcedId;
      const old = t.children[id];
      // Parent identity is immutable; reject malformed cycles and reparenting.
      let ancestor = wireId;
      const seen = new Set<string>([id]);
      let cycle = false;
      while (ancestor) {
        if (seen.has(ancestor)) {
          cycle = true;
          break;
        }
        seen.add(ancestor);
        ancestor = t.children[ancestor]?.parentId ?? "";
      }
      if (id && !cycle && (!old || old.parentId === wireId))
        t.children = {
          ...t.children,
          [id]: {
            sessionId: id,
            parentId: wireId,
            title:
              u.title === undefined
                ? (old?.title ?? "Subagent")
                : str(u.title, "Subagent"),
            description:
              u.description === undefined || announcedId !== id
                ? (old?.description ?? null)
                : typeof u.description === "string"
                  ? u.description
                  : null,
            state:
              u.state === undefined
                ? (old?.state ?? { type: "unknown" })
                : (u.state as SubagentRecord["state"]),
            capabilities:
              u.capabilities === undefined
                ? (old?.capabilities ?? {})
                : record(old?.capabilities).harborConnected === true
                  ? {
                      ...record(u.capabilities),
                      harborConnected: true,
                      harborViaParent:
                        record(old?.capabilities).harborViaParent === true,
                    }
                  : (u.capabilities as SubagentRecord["capabilities"]),
          },
        };
    }
    if (type === "session_info_update") {
      const prime = record(record(u._meta)["ai.primeintellect.prime-agent"]);
      for (const raw of array(prime.subagents)) {
        const child = record(raw);
        const id = str(child.id);
        if (id)
          t.children = {
            ...t.children,
            [id]: {
              sessionId: id,
              parentId: t.children[id]?.parentId ?? wireId,
              title: str(child.sessionName, "Prime worker"),
              description: null,
              state: { type: str(child.status, "unknown") },
              capabilities: t.children[id]?.capabilities ?? {},
            },
          };
      }
    }
    if (["session_message", "session_message_chunk"].includes(type)) {
      const c = record(u.content);
      if (c.type === "text")
        append(
          "assistant",
          str(c.text),
          childId,
          str(u.messageId) || undefined,
        );
    }
  }
  if (event.kind === "cursor/task") {
    const id = str(p.agentId, str(p.toolCallId));
    if (id)
      t.children = {
        ...t.children,
        [id]: {
          sessionId: id,
          parentId: str(p.sessionId),
          title: str(p.description, "Cursor task"),
          description: str(p.prompt),
          state: { type: p.durationMs ? "idle" : "unknown" },
          capabilities: t.children[id]?.capabilities ?? {},
        },
      };
  }
  if (event.kind === "cursor/update_todos") {
    t.plan = array(p.todos);
  }
  // The complete event log remains in SQLite; this is a bounded rendering window.
  if (t.messages.length > 200) {
    t.messages = t.messages.slice(-200);
    t.trimmed = true;
  }
  const last = t.messages.at(-1);
  if (last && last.text.length > 65536) {
    const notice = "[… earlier content saved in transcript …]\n";
    const removed = last.text.length - 60000;
    t.messages = [
      ...t.messages.slice(0, -1),
      {
        ...last,
        text: notice + last.text.slice(-60000),
        ...(last.commandRanges
          ? {
              commandRanges: last.commandRanges
                .filter((range) => range.start >= removed)
                .map((range) => ({
                  start: range.start - removed + notice.length,
                  end: range.end - removed + notice.length,
                })),
            }
          : {}),
      },
    ];
    t.trimmed = true;
  }
  if (Object.keys(t.tools).length > 100) {
    t.tools = Object.fromEntries(Object.entries(t.tools).slice(-100));
    t.trimmed = true;
  }
  if (Object.keys(t.children).length > 256) {
    t.children = Object.fromEntries(Object.entries(t.children).slice(-256));
    t.trimmed = true;
  }
  return t;
}
export const statusLabel = (s: string) =>
  ({
    idle: "Ready",
    working: "Working",
    needs_input: "Needs you",
    completed: "Finished",
    error: "Interrupted",
    disconnected: "Disconnected",
    connecting: "Connecting",
    terminal: "In terminal",
    cleanup_pending: "Cleanup needed",
    archiving: "Archiving",
    archived: "Archived",
  })[s] ?? s;
export function elapsed(since: number) {
  const minutes = Math.max(0, Math.floor((Date.now() - since) / 60000));
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes}m`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
        : `${Math.floor(minutes / 1440)}d`;
}

export type TimelineEntry =
  | { type: "message"; sequence: number; message: Message }
  | { type: "tool"; sequence: number; tool: Tool };

export function timeline(
  transcript: Transcript,
  childId?: string | null,
): TimelineEntry[] {
  return [
    ...transcript.messages
      .filter((message) =>
        childId ? sameWorker(message.childId, childId) : !message.childId,
      )
      .map((message): TimelineEntry => ({
        type: "message",
        sequence: message.sequence,
        message,
      })),
    ...Object.values(transcript.tools)
      .filter((tool) =>
        childId
          ? sameWorker(tool.sessionId, childId)
          : !transcript.children[tool.sessionId],
      )
      .map((tool): TimelineEntry => ({
        type: "tool",
        sequence: tool.sequence,
        tool,
      })),
  ].sort((a, b) => a.sequence - b.sequence);
}
