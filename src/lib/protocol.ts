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
export type RecordedInteraction = Interaction & {
  sequence: number;
  timestamp: number;
  childId?: string;
  prompt?: { id: string; text: string; occurrence: number };
  status: "pending" | "answered" | "interrupted";
  result?: unknown;
};
export type Message = {
  planReview?: RecordedInteraction;
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
  interactions: RecordedInteraction[];
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
  interactions: [],
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
  const interruptInteractions = (
    matches: (entry: RecordedInteraction) => boolean,
  ) => {
    t.interactions = t.interactions.map((entry) =>
      entry.status === "pending" && matches(entry)
        ? { ...entry, status: "interrupted" }
        : entry,
    );
  };
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
    interruptInteractions((entry) => entry.childId === targetChild);
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
      interruptInteractions((entry) => entry.childId === targetChild);
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
      // Request/answer events remain authoritative when native history is replayed.
      interactions: t.interactions.map((entry) =>
        !entry.childId && entry.status === "pending"
          ? { ...entry, status: "interrupted" }
          : entry,
      ),
      requests: t.requests.filter(
        (request) => !!str(request.params._harborChildId),
      ),
      commands: t.commands,
      childCommands: t.childCommands,
      // Terminal snapshots belong to persisted calls, including provider replays.
      terminals: t.terminals,
      attachmentMetadata: t.attachmentMetadata,
      // Parent replay cannot replace a child's independently imported history.
      // Only an explicit child replay resets that conversation.
      children: t.children,
      childTurns: t.childTurns,
      messages: t.messages.filter((m) => !!m.childId),
      tools: Object.fromEntries(
        Object.entries(t.tools).filter(
          ([, tool]) => !!t.children[tool.sessionId],
        ),
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
    const interactionBoundary =
      last &&
      t.interactions.some(
        (entry) => entry.sequence > last.sequence && entry.childId === childId,
      );
    if (
      last?.streamId === streamId &&
      last.role === role &&
      !toolBoundary &&
      !interactionBoundary
    ) {
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
    const request: Interaction = {
      id: p.id as string | number,
      method: str(p.method),
      params: record(p.params),
    };
    const wire = str(request.params.sessionId);
    const childId =
      str(request.params._harborChildId) ||
      (t.children[wire] ? wire : undefined);
    const prompts = t.messages.filter(
      (message) => message.role === "user" && message.childId === childId,
    );
    const prompt = prompts.at(-1);
    t.requests = [
      ...t.requests.filter((entry) => entry.id !== request.id),
      request,
    ];
    // A retransmitted pending ID replaces that request, rather than leaving two
    // actionable cards. IDs may be reused after an answer or a reconnection.
    const previousRequest = t.interactions.find(
      (entry) => entry.status === "pending" && entry.id === request.id,
    );
    t.interactions = [
      ...t.interactions.filter((entry) => entry !== previousRequest),
      {
        ...request,
        sequence: previousRequest?.sequence ?? event.sequence,
        timestamp: previousRequest?.timestamp ?? event.timestamp,
        childId,
        status: "pending" as const,
        ...(prompt
          ? {
              prompt: {
                id: prompt.id,
                text: prompt.text,
                occurrence: prompts.filter(
                  (message) => message.text === prompt.text,
                ).length,
              },
            }
          : {}),
      },
    ].slice(-200);
  }
  if (event.kind === "answered") {
    t.requests = t.requests.filter((request) => request.id !== p.id);
    // Update only the latest occurrence; native request IDs are not global IDs.
    let index = t.interactions.length - 1;
    while (index >= 0 && t.interactions[index].id !== p.id) index--;
    t.interactions = t.interactions.map((entry, i) =>
      i === index ? { ...entry, status: "answered", result: p.result } : entry,
    );
  }
  if (event.kind === "disconnected") {
    interruptInteractions(() => true);
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
    interruptInteractions((entry) =>
      targetChild ? entry.childId === targetChild : !entry.childId,
    );
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
    if (["session_message", "session_message_chunk"].includes(type)) {
      const messageId = str(u.messageId);
      const blocks = Array.isArray(u.content) ? u.content : [u.content];
      const text = blocks
        .map(record)
        .filter((block) => block.type === "text")
        .map((block) => str(block.text))
        .join("");
      const incoming = str(u.recipientSessionId) === wireId;
      const label = incoming
        ? childId
          ? "Message from parent"
          : "Message from worker"
        : childId
          ? "Message to parent"
          : "Message to worker";
      if (
        text &&
        !(
          type === "session_message" &&
          messageId &&
          t.messages.some(
            (message) =>
              message.streamId === messageId && message.childId === childId,
          )
        )
      )
        append(
          incoming ? "user" : "assistant",
          text,
          childId,
          messageId || undefined,
          label,
        );
    }
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

const SESSION_LOADING = new Set(["working", "connecting", "archiving"]);
const SESSION_ATTENTION = new Set(["needs_input", "error", "cleanup_pending"]);

/** Agent is in progress — the sidebar shows a spinner, not a settled row. */
export function sessionIsLoading(status: string) {
  return SESSION_LOADING.has(status);
}

/** The user has to act. Same set as the notification bell. */
export function sessionNeedsAttention(status: string) {
  return SESSION_ATTENTION.has(status);
}

export interface SessionMark {
  loading?: string;
  attention?: string;
  /** Errors are danger; a request or cleanup is warning. */
  attentionTone?: "warning" | "danger";
  /** A finished turn the user has not opened yet. */
  unseen?: string;
}

/** One conversation, or a collapsed parent's summary of hidden children.
 *  Attention wins over loading, and both win over an unseen finish: a row
 *  that needs the user is the one to open. */
export function summarizeSessionMarks(
  statuses: string[],
  unseenCount = 0,
): SessionMark {
  const attention = statuses.filter(sessionNeedsAttention);
  if (attention.length === 1) {
    return {
      attention: statusLabel(attention[0]),
      attentionTone: attention[0] === "error" ? "danger" : "warning",
    };
  }
  if (attention.length > 1) {
    return {
      attention: `${attention.length} need attention`,
      attentionTone: attention.some((status) => status === "error")
        ? "danger"
        : "warning",
    };
  }
  const loading = statuses.filter(sessionIsLoading);
  if (loading.length === 1) return { loading: statusLabel(loading[0]) };
  if (loading.length > 1) return { loading: `${loading.length} loading` };
  if (unseenCount === 1) return { unseen: "Unread" };
  if (unseenCount > 1) return { unseen: `${unseenCount} unread` };
  return {};
}
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
