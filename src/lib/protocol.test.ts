import { describe, it, expect } from "vitest";
import {
  emptyTranscript,
  reduceEvent,
  options,
  values,
  timeline,
  sessionIsLoading,
  sessionNeedsAttention,
  summarizeSessionMarks,
} from "./protocol";
import type { SessionEvent } from "./bindings/SessionEvent";
let sequence = 0;
const event = (kind: string, payload: unknown): SessionEvent => ({
  sequence: ++sequence,
  sessionId: "chat",
  kind,
  payload: payload as SessionEvent["payload"],
  timestamp: Date.now(),
});
const update = (u: unknown, id = "root") =>
  event("session/update", { sessionId: id, update: u });

it("keeps recent message IDs stable when older turns are filled in", () => {
  const older = [
    event("user_message", { text: "Older" }),
    event("turn_complete", {}),
  ];
  const recent = [
    event("user_message", { text: "Recent" }),
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Reply" },
    }),
  ];
  const preview = recent.reduce(reduceEvent, emptyTranscript());
  const full = [...older, ...recent].reduce(reduceEvent, emptyTranscript());
  expect(full.messages.slice(-2).map((m) => m.id)).toEqual(
    preview.messages.map((m) => m.id),
  );
});

it("retains older tool calls and worker identities in a full conversation", () => {
  let t = emptyTranscript();
  for (let i = 0; i < 150; i++) {
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "tool_call",
        toolCallId: `tool-${i}`,
        title: `Read ${i}`,
        status: "completed",
        kind: "read",
        content: [],
      }),
    );
  }
  for (let i = 0; i < 300; i++) {
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "subagent_update",
        sessionId: `worker-${i}`,
        title: `Worker ${i}`,
        state: { type: "completed" },
      }),
    );
  }
  expect(Object.keys(t.tools)).toHaveLength(150);
  expect(t.tools["root:tool-0"].title).toBe("Read 0");
  expect(Object.keys(t.children)).toHaveLength(300);
  expect(t.children["worker-0"].title).toBe("Worker 0");
});

it("bounds terminal output while retaining the trailing error", () => {
  const t = reduceEvent(
    emptyTranscript(),
    event("tool_terminal", {
      terminalId: "large",
      output: "x".repeat(40000) + "\nfatal: trailing error",
      exitStatus: { exitCode: 2 },
    }),
  );
  expect(t.terminals.large.output.length).toBe(32768);
  expect(t.terminals.large.output.endsWith("fatal: trailing error")).toBe(true);
  expect(t.terminals.large.truncated).toBe(true);
});

it("retains terminal errors before the tool reference arrives and across history replay", () => {
  let t = reduceEvent(
    emptyTranscript(),
    event("tool_terminal", {
      terminalId: "exec-1",
      output: "fatal: bad revision",
      exitStatus: { exitCode: 128 },
      truncated: false,
    }),
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "tool_call",
      toolCallId: "exec",
      content: [{ type: "terminal", terminalId: "exec-1" }],
      status: "failed",
    }),
  );
  t = reduceEvent(t, event("history_reset", {}));
  expect(t.terminals["exec-1"]).toEqual({
    output: "fatal: bad revision",
    exitCode: 128,
    truncated: false,
  });
  // A late reader snapshot must not erase the process's recorded exit status.
  t = reduceEvent(
    t,
    event("tool_terminal", {
      terminalId: "exec-1",
      output: "fatal: bad revision\n",
      truncated: false,
    }),
  );
  expect(t.terminals["exec-1"].exitCode).toBe(128);
});

it("renders adapter terminal output chunks and their final exit status, including replay", () => {
  let t = emptyTranscript();
  const replay = () => {
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "tool_call",
        toolCallId: "exec-2",
        kind: "execute",
        content: [{ type: "terminal", terminalId: "exec-2" }],
        _meta: { terminal_info: { terminal_id: "exec-2" } },
      }),
    );
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "tool_call_update",
        toolCallId: "exec-2",
        _meta: { terminal_output: { terminal_id: "exec-2", data: "fatal: " } },
      }),
    );
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "tool_call_update",
        toolCallId: "exec-2",
        _meta: {
          terminal_output_delta: {
            terminal_id: "exec-2",
            data: "bad revision\n",
          },
          terminal_exit: { terminal_id: "exec-2", exit_code: 1 },
        },
        status: "failed",
      }),
    );
  };
  replay();
  expect(t.terminals["exec-2"]).toEqual({
    output: "fatal: bad revision\n",
    truncated: false,
    exitCode: 1,
  });
  t = reduceEvent(t, event("history_reset", {}));
  replay();
  expect(t.terminals["exec-2"].output).toBe("fatal: bad revision\n");
});
it("keeps attachments on file-only user messages and subsequent streamed text", () => {
  const attachments = [{ name: "notes.txt", mimeType: "text/plain", size: 5 }];
  let t = reduceEvent(
    emptyTranscript(),
    event("user_message", { text: "", attachments }),
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "user_message_chunk",
      content: { type: "text", text: "echo" },
    }),
  );
  expect(t.messages[0]).toMatchObject({
    role: "user",
    attachments,
    text: "echo",
  });
});
it("replays inline image data as a preview before bounding message text", () => {
  const data = "aGVsbG8=".repeat(12000);
  let t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "user_message_chunk",
      content: {
        type: "text",
        text: `Review this screenshot\n[@image](data:image/png;base64,${data})`,
      },
    }),
  );
  expect(t.messages[0]).toMatchObject({
    role: "user",
    text: "Review this screenshot",
    attachments: [{ name: "Image", mimeType: "image/png" }],
  });
  expect(t.trimmed).toBe(false);
  expect(t.messages[0].text).not.toContain(data);
  expect(t.messages[0].attachments?.[0].previewUrl).toBe(
    `data:image/png;base64,${data}`,
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "user_message_chunk",
      content: { type: "text", text: "\nKeep the caption." },
    }),
  );
  expect(t.messages[0].text).toBe("Review this screenshot\nKeep the caption.");
  expect(t.messages[0].attachments).toHaveLength(1);
});

it("retains inline image names and surrounding text without stripping ordinary links", () => {
  const t = reduceEvent(
    emptyTranscript(),
    event("user_message", {
      text: "Before ![screen.png](data:image/png;base64,aGVsbG8=) between [@image](data:image/jpeg;base64,aGVsbG8=) after [docs](https://example.com).",
    }),
  );
  expect(t.messages[0]).toMatchObject({
    text: "Before  between  after [docs](https://example.com).",
    attachments: [
      { name: "screen.png", mimeType: "image/png", size: 5 },
      { name: "Image", mimeType: "image/jpeg", size: 5 },
    ],
  });
});
it("preserves the saved attachment filename across provider history replay", () => {
  let t = reduceEvent(
    emptyTranscript(),
    event("user_message", {
      text: "Review this",
      attachments: [{ name: "No name.png", mimeType: "image/png", size: 5 }],
    }),
  );
  t = reduceEvent(t, event("history_reset", {}));
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "user_message_chunk",
      content: { type: "text", text: "Review this" },
    }),
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "user_message_chunk",
      content: {
        type: "text",
        text: "[@image](data:image/png;base64,aGVsbG8=)",
      },
    }),
  );
  expect(t.messages[0].attachments?.[0]).toMatchObject({
    name: "No name.png",
    previewUrl: "data:image/png;base64,aGVsbG8=",
  });
});
it("retains worker-composer replies when only the parent history is replayed", () => {
  let t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "subagent_update",
      sessionId: "child",
      title: "Worker",
    }),
  );
  t = reduceEvent(t, event("user_message", { text: "Parent question" }));
  t = reduceEvent(
    t,
    event("user_message", { childId: "child", text: "Worker question" }),
  );
  t = reduceEvent(
    t,
    event("parent_relay_chunk", {
      childId: "child",
      messageId: "reply",
      text: "Actual worker reply",
    }),
  );
  t = reduceEvent(t, event("history_reset", {}));
  expect(timeline(t)).toHaveLength(0);
  expect(
    timeline(t, "child").map((e) => e.type === "message" && e.message.text),
  ).toEqual(["Worker question", "Actual worker reply"]);
  expect(t.children.child.title).toBe("Worker");
  t = reduceEvent(t, event("child_history_reset", { childId: "child" }));
  expect(timeline(t, "child")).toHaveLength(0);
});
it("keeps imported worker history and tool results across parent reconnects", () => {
  let t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "subagent_update",
      sessionId: "child",
      title: "Worker",
    }),
  );
  for (const [type, text] of [
    ["user_message_chunk", "Original task"],
    ["agent_message_chunk", "Saved worker reply"],
  ]) {
    t = reduceEvent(
      t,
      update(
        {
          sessionUpdate: type,
          messageId: text,
          content: { type: "text", text },
        },
        "child",
      ),
    );
  }
  t = reduceEvent(
    t,
    update(
      {
        sessionUpdate: "tool_call",
        toolCallId: "read",
        title: "read",
        kind: "read",
        status: "completed",
      },
      "child",
    ),
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Parent reply" },
    }),
  );
  t = reduceEvent(t, event("history_reset", {}));
  expect(t.messages.map((m) => m.text)).toEqual([
    "Original task",
    "Saved worker reply",
  ]);
  expect(t.tools["child:read"].status).toBe("completed");
  expect(timeline(t)).toHaveLength(0);
  t = reduceEvent(t, event("child_history_reset", { childId: "child" }));
  expect(timeline(t, "child")).toHaveLength(0);
});
it("shows actual worker communications once and separately from their summary", () => {
  let t = reduceEvent(
    emptyTranscript(),
    update({ sessionUpdate: "subagent_update", sessionId: "child" }),
  );
  const sent = {
    sessionUpdate: "session_message",
    senderSessionId: "child",
    recipientSessionId: "root",
    messageId: "send-1",
    direction: "sent",
    label: "Message to parent",
    content: [
      { type: "text", text: "CHILD_READY_713\nHARBOR_CHILD_ORIGIN_713" },
    ],
  };
  t = reduceEvent(t, update(sent, "child"));
  t = reduceEvent(
    t,
    update(
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Replied to parent. Standing by." },
      },
      "child",
    ),
  );
  t = reduceEvent(t, update(sent, "child"));
  expect(t.messages).toHaveLength(2);
  expect(t.messages[0]).toMatchObject({
    childId: "child",
    role: "assistant",
    label: "Message to parent",
    text: "CHILD_READY_713\nHARBOR_CHILD_ORIGIN_713",
  });
  expect(t.messages[1].text).toBe("Replied to parent. Standing by.");
  expect(timeline(t)).toHaveLength(0);
});
it("keeps resumed worker generations in the original conversation", () => {
  let t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "subagent_update",
      sessionId: "child",
      description: "Original task",
    }),
  );
  t = reduceEvent(
    t,
    event("child_connected", { childId: "child", viaParent: true }),
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "subagent_update",
      sessionId: "child:generation:2",
      description: "Follow-up",
      state: { type: "working" },
      capabilities: {},
    }),
  );
  t = reduceEvent(
    t,
    update(
      {
        sessionUpdate: "tool_call",
        toolCallId: "resumed-read",
        title: "Worker lookup",
      },
      "child:generation:2",
    ),
  );
  t = reduceEvent(
    t,
    update(
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Retained context" },
      },
      "child:generation:2",
    ),
  );
  t = reduceEvent(t, event("turn_complete", { childId: "child" }));
  t = reduceEvent(
    t,
    event("parent_relay_chunk", {
      childId: "child",
      text: "Deferred reply",
      messageId: "deferred",
    }),
  );
  expect(Object.keys(t.children)).toEqual(["child"]);
  expect(t.children.child).toMatchObject({
    description: "Original task",
    capabilities: { harborConnected: true, harborViaParent: true },
  });
  expect(
    timeline(t, "child").map((e) =>
      e.type === "message" ? e.message.text : "tool",
    ),
  ).toEqual(["tool", "Retained context", "Deferred reply"]);
  expect(timeline(t)).toHaveLength(0);
});
it("labels relayed replies separately and retains the live relay across provider patches", () => {
  let t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "subagent_update",
      sessionId: "child",
      capabilities: {},
    }),
  );
  t = reduceEvent(
    t,
    event("child_connected", { childId: "child", viaParent: true }),
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "subagent_update",
      sessionId: "child",
      capabilities: {},
      state: { type: "idle" },
    }),
  );
  t = reduceEvent(
    t,
    event("parent_relay_chunk", {
      childId: "child",
      text: "Actual reply relayed by parent",
    }),
  );
  expect(t.children.child.capabilities).toMatchObject({
    harborConnected: true,
    harborViaParent: true,
  });
  expect(t.messages[0]).toMatchObject({ role: "system", childId: "child" });
  expect(t.turn).toBe(0);
});
it("isolates child input, replay and completion from the parent", () => {
  let t = reduceEvent(
    emptyTranscript(),
    event("user_message", { text: "parent" }),
  );
  t = reduceEvent(
    t,
    update({ sessionUpdate: "subagent_update", sessionId: "child" }),
  );
  t = reduceEvent(
    t,
    event("user_message", { text: "child question", childId: "child" }),
  );
  t = reduceEvent(
    t,
    update(
      {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "child answer" },
      },
      "child",
    ),
  );
  t = reduceEvent(t, event("turn_complete", { childId: "child" }));
  expect(t.messages.filter((m) => !m.childId).map((m) => m.text)).toEqual([
    "parent",
  ]);
  expect(
    t.messages.filter((m) => m.childId === "child").map((m) => m.text),
  ).toEqual(["child question", "child answer"]);
  expect(t.messages[0].workCompletedAt).toBeUndefined();
  t = reduceEvent(t, event("child_history_reset", { childId: "child" }));
  expect(t.messages.map((m) => m.text)).toEqual(["parent"]);
});
describe("ACP transcript routing", () => {
  it("restores written contents when Pi replays only the tool receipt", () => {
    const input = { path: "/tmp/write.txt", content: "written contents\n" };
    const diff = {
      type: "diff",
      path: input.path,
      newText: input.content,
      oldText: null,
    };
    let t = reduceEvent(
      emptyTranscript(),
      update({
        sessionUpdate: "tool_call",
        toolCallId: "write",
        title: "write",
        kind: "edit",
        status: "pending",
        rawInput: input,
      }),
    );
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "tool_call_update",
        toolCallId: "write",
        status: "completed",
        content: [diff],
      }),
    );
    for (let replay = 0; replay < 2; replay++) {
      t = reduceEvent(t, event("history_reset", {}));
      expect(timeline(t)).toEqual([]);
      // The same tool ID in another session must not inherit this write.
      t = reduceEvent(
        t,
        update(
          {
            sessionUpdate: "tool_call",
            toolCallId: "write",
            title: "write",
            kind: "edit",
            status: "completed",
            rawInput: null,
          },
          "other",
        ),
      );
      expect(t.tools["other:write"].rawInput).toBeUndefined();
      const start = update({
        sessionUpdate: "tool_call",
        toolCallId: "write",
        title: "write",
        kind: "edit",
        status: "completed",
        rawInput: null,
      });
      t = reduceEvent(t, start);
      t = reduceEvent(
        t,
        update({
          sessionUpdate: "tool_call_update",
          toolCallId: "write",
          status: "completed",
          content: [
            {
              type: "content",
              content: { type: "text", text: "Successfully wrote 17 bytes" },
            },
          ],
        }),
      );
      t = reduceEvent(t, event("connected", {}));
      expect(t.tools["root:write"].rawInput).toEqual(input);
      expect(t.tools["root:write"].content).toContainEqual(diff);
      expect(t.tools["root:write"].sequence).toBe(start.sequence);
    }
  });
  it("retains the entire history for the virtualized transcript", () => {
    let t = emptyTranscript();
    for (let i = 0; i < 1000; i++) {
      t = reduceEvent(t, event("user_message", { text: `message ${i}` }));
      t = reduceEvent(
        t,
        update({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "reply" },
        }),
      );
    }
    expect(t.messages.length).toBe(2000);
    expect(t.messages[0].text).toBe("message 0");
    expect(t.messages[1000].text).toBe("message 500");
    expect(t.trimmed).toBe(false);
    expect(t.messages.at(-1)?.text).toBe("reply");
  });
  it("assembles user history chunks and separates worker tools", () => {
    let t = reduceEvent(
      emptyTranscript(),
      update({
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "Hello" },
      }),
    );
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: " world" },
      }),
    );
    expect(t.messages[0].text).toBe("Hello world");
    t = reduceEvent(
      t,
      update(
        { sessionUpdate: "tool_call", toolCallId: "tool", title: "Read" },
        "child",
      ),
    );
    expect(t.tools["child:tool"].sessionId).toBe("child");
  });
  it("assembles chunks and ignores duplicate event delivery", () => {
    let t = emptyTranscript();
    t = reduceEvent(t, event("user_message", { text: "Hello" }));
    const e = update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hi" },
    });
    t = reduceEvent(t, e);
    t = reduceEvent(t, e);
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: " there" },
      }),
    );
    expect(t.messages.map((m) => m.text)).toEqual(["Hello", "Hi there"]);
  });
  it("routes nested children without reparenting or cycles", () => {
    let t = emptyTranscript();
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "subagent_update",
        sessionId: "child",
        title: "Scout",
      }),
    );
    t = reduceEvent(
      t,
      update(
        {
          sessionUpdate: "subagent_update",
          sessionId: "grandchild",
          title: "Test",
        },
        "child",
      ),
    );
    t = reduceEvent(
      t,
      update(
        {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Child report" },
        },
        "grandchild",
      ),
    );
    expect(t.messages[0].childId).toBe("grandchild");
    t = reduceEvent(
      t,
      update(
        { sessionUpdate: "subagent_update", sessionId: "child" },
        "grandchild",
      ),
    );
    expect(t.children.child.parentId).toBe("root");
  });
  it("applies nullable subagent patches and unknown state on disconnect", () => {
    let t = reduceEvent(
      emptyTranscript(),
      update({
        sessionUpdate: "subagent_update",
        sessionId: "child",
        title: "Scout",
        capabilities: { cancel: {} },
      }),
    );
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "subagent_update",
        sessionId: "child",
        capabilities: null,
      }),
    );
    expect(t.children.child.capabilities).toBe(null);
    t = reduceEvent(t, event("disconnected", {}));
    expect(t.children.child.state).toEqual({ type: "unknown" });
  });
  it("preserves child permission routing and resolves only the matching request", () => {
    let t = reduceEvent(
      emptyTranscript(),
      event("request", {
        id: 1,
        method: "session/request_permission",
        params: { sessionId: "child" },
      }),
    );
    t = reduceEvent(
      t,
      event("request", {
        id: 2,
        method: "elicitation/create",
        params: { message: "Choose a plan" },
      }),
    );
    t = reduceEvent(t, event("answered", { id: 1 }));
    expect(t.requests.map((r) => r.id)).toEqual([2]);
  });
  it("replaces history on successful replay without duplicates", () => {
    let t = reduceEvent(
      emptyTranscript(),
      event("user_message", { text: "Old" }),
    );
    t = reduceEvent(t, event("history_reset", {}));
    t = reduceEvent(
      t,
      update({
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "Restored" },
      }),
    );
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0].text).toBe("Restored");
  });
  it("handles grouped model options and unknown option types", () => {
    const opts = options([
      {
        id: "model",
        type: "select",
        options: [
          {
            group: "best",
            name: "Best",
            options: [{ value: "m", name: "Model" }],
          },
        ],
      },
      { id: "future", type: "unknown" },
    ]);
    expect(opts).toHaveLength(1);
    expect(values(opts[0])[0].value).toBe("m");
  });
});

it("invalidates process-bound requests and unfinished tools on disconnect", () => {
  let t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "tool_call",
      toolCallId: "running",
      title: "Question",
      status: "in_progress",
    }),
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "tool_call",
      toolCallId: "done",
      title: "Read",
      status: "completed",
    }),
  );
  t = reduceEvent(
    t,
    event("request", {
      id: 7,
      method: "session/request_permission",
      params: { sessionId: "child" },
    }),
  );
  t = reduceEvent(t, event("disconnected", {}));
  expect(t.requests).toEqual([]);
  expect(t.tools["root:running"].status).toBe("interrupted");
  expect(t.tools["root:done"].status).toBe("completed");
});

it("keeps tools between streamed messages and updates them in place", () => {
  let t = emptyTranscript();
  const message = (text: string, id = "root") =>
    update(
      { sessionUpdate: "agent_message_chunk", content: { type: "text", text } },
      id,
    );
  t = reduceEvent(t, message("Inspecting"));
  t = reduceEvent(t, message(" the file."));
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "tool_call",
      toolCallId: "read",
      title: "Read file",
      status: "in_progress",
    }),
  );
  t = reduceEvent(t, message("Found the issue."));
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "read",
      status: "completed",
    }),
  );
  t = reduceEvent(t, message(" Fixed it."));
  expect(
    timeline(t).map((entry) =>
      entry.type === "message" ? entry.message.text : entry.tool.title,
    ),
  ).toEqual([
    "Inspecting the file.",
    "Read file",
    "Found the issue. Fixed it.",
  ]);
  expect(timeline(t)[1]).toMatchObject({
    type: "tool",
    tool: { status: "completed" },
  });
  expect(new Set(t.messages.map((m) => m.id)).size).toBe(2);
});
it("isolates child tool ordering and rebuilds it from replay", () => {
  let t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "subagent_update",
      sessionId: "child",
      title: "Worker",
    }),
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Parent" },
    }),
  );
  t = reduceEvent(
    t,
    update(
      {
        sessionUpdate: "tool_call",
        toolCallId: "child-read",
        title: "Worker read",
      },
      "child",
    ),
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: " continued" },
    }),
  );
  expect(timeline(t)).toHaveLength(1);
  expect(t.messages[0].text).toBe("Parent continued");
  expect(timeline(t, "child")[0]).toMatchObject({
    type: "tool",
    tool: { title: "Worker read" },
  });
  t = reduceEvent(t, event("history_reset", {}));
  expect(timeline(t)).toEqual([]);
});

it("records activity timing from persisted events and freezes each finished turn", () => {
  const timed = (e: SessionEvent, timestamp: number) => ({ ...e, timestamp });
  const events = [
    timed(event("user_message", { text: "Inspect the handler" }), 1000),
    timed(
      update({
        sessionUpdate: "tool_call",
        toolCallId: "timed",
        title: "Read handler",
        status: "in_progress",
      }),
      2000,
    ),
    timed(
      update({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "Checking " },
      }),
      3000,
    ),
    timed(
      update({
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text: "retries." },
      }),
      4000,
    ),
    timed(
      update({
        sessionUpdate: "tool_call_update",
        toolCallId: "timed",
        status: "completed",
      }),
      6000,
    ),
    timed(event("turn_complete", {}), 7000),
  ];
  const replay = () => events.reduce(reduceEvent, emptyTranscript());
  const transcript = replay();
  expect(transcript.tools["root:timed"]).toMatchObject({
    timestamp: 2000,
    updatedAt: 6000,
    workCompletedAt: 7000,
  });
  expect(transcript.messages.find((m) => m.role === "thought")).toMatchObject({
    timestamp: 3000,
    updatedAt: 4000,
    workCompletedAt: 7000,
  });
  expect(replay()).toEqual(transcript);
  const nextTurn = reduceEvent(
    reduceEvent(
      transcript,
      timed(event("user_message", { text: "Next task" }), 10000),
    ),
    timed(event("turn_complete", {}), 15000),
  );
  expect(nextTurn.tools["root:timed"].workCompletedAt).toBe(7000);
});

it("replaces command catalogs, isolates workers, and preserves sent highlighting across updates and replay", () => {
  const rootCommands = [{ name: "review", description: "Review" }];
  const workerCommands = [{ name: "$build", description: "Build" }];
  let t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "available_commands_update",
      availableCommands: rootCommands,
    }),
  );
  t = reduceEvent(
    t,
    update({ sessionUpdate: "subagent_update", sessionId: "child" }),
  );
  t = reduceEvent(
    t,
    update(
      {
        sessionUpdate: "available_commands_update",
        availableCommands: workerCommands,
      },
      "child",
    ),
  );
  expect(t.commands).toEqual(rootCommands);
  expect(t.childCommands.child).toEqual(workerCommands);
  t = reduceEvent(t, event("user_message", { text: "/review changes" }));
  t = reduceEvent(
    t,
    event("user_message", { childId: "child", text: "$build now" }),
  );
  expect(t.messages.map((m) => m.commandRanges)).toEqual([
    [{ start: 0, end: 7 }],
    [{ start: 0, end: 6 }],
  ]);
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "available_commands_update",
      availableCommands: [],
    }),
  );
  expect(t.commands).toEqual([]);
  expect(t.messages[0].commandRanges).toEqual([{ start: 0, end: 7 }]);
  t = reduceEvent(t, event("history_reset", {}));
  expect(t.childCommands.child).toEqual(workerCommands);
  t = reduceEvent(t, event("child_disconnected", { childId: "child" }));
  expect(t.childCommands.child).toEqual([]);
});

it("preserves a complete long user message and its invocation ranges", () => {
  let t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "available_commands_update",
      availableCommands: [
        { name: "review", description: "Review" },
        { name: "$build", description: "Build" },
      ],
    }),
  );
  t = reduceEvent(
    t,
    event("user_message", { text: "/review " + "x".repeat(70000) + " $build" }),
  );
  const message = t.messages[0];
  expect(t.trimmed).toBe(false);
  expect(message.text).toBe("/review " + "x".repeat(70000) + " $build");
  expect(
    message.commandRanges?.map((range) =>
      message.text.slice(range.start, range.end),
    ),
  ).toEqual(["/review", "$build"]);
});

it("classifies sidebar loading and attention, with attention winning a mixed summary", () => {
  expect(sessionIsLoading("working")).toBe(true);
  expect(sessionIsLoading("connecting")).toBe(true);
  expect(sessionIsLoading("archiving")).toBe(true);
  expect(sessionIsLoading("needs_input")).toBe(false);
  expect(sessionNeedsAttention("needs_input")).toBe(true);
  expect(sessionNeedsAttention("error")).toBe(true);
  expect(sessionNeedsAttention("cleanup_pending")).toBe(true);
  expect(sessionNeedsAttention("working")).toBe(false);
  expect(summarizeSessionMarks(["idle", "completed"])).toEqual({});
  expect(summarizeSessionMarks(["connecting"])).toEqual({
    loading: "Connecting",
  });
  expect(summarizeSessionMarks(["working", "archiving"])).toEqual({
    loading: "2 loading",
  });
  expect(summarizeSessionMarks(["error"])).toEqual({
    attention: "Interrupted",
    attentionTone: "danger",
  });
  expect(summarizeSessionMarks(["needs_input", "working"])).toEqual({
    attention: "Needs you",
    attentionTone: "warning",
  });
  expect(
    summarizeSessionMarks(["cleanup_pending", "error", "working"]),
  ).toEqual({
    attention: "2 need attention",
    attentionTone: "danger",
  });
  expect(summarizeSessionMarks(["completed"], 1)).toEqual({ unseen: "Unread" });
  expect(summarizeSessionMarks(["idle"], 2)).toEqual({ unseen: "2 unread" });
  expect(summarizeSessionMarks(["working"], 1)).toEqual({ loading: "Working" });
});

it("renders Claude typed worker-message receipts in their own conversations and deduplicates replay", () => {
  let t = reduceEvent(
    emptyTranscript(),
    update({ sessionUpdate: "subagent_update", sessionId: "child" }),
  );
  const receipt = {
    sessionUpdate: "session_message",
    messageId: "message-1",
    senderSessionId: "root",
    recipientSessionId: "child",
    content: [{ type: "text", text: "Continue the existing task" }],
  };
  t = reduceEvent(t, update(receipt, "child"));
  t = reduceEvent(t, update(receipt, "child"));
  expect(t.messages).toHaveLength(1);
  expect(t.messages[0]).toMatchObject({
    childId: "child",
    role: "user",
    label: "Message from parent",
    text: "Continue the existing task",
  });
});

it("keeps native async questions answerable after final output and history replay", () => {
  const question = {
    id: "harbor:codex-question:thread:call",
    method: "elicitation/create",
    params: {
      sessionId: "root",
      _meta: { harborCodexAsyncQuestion: true },
      requestedSchema: {
        type: "object",
        properties: { color: { type: "string" } },
      },
    },
  };
  let t = reduceEvent(
    emptyTranscript(),
    event("user_message", { text: "Ask a dummy question" }),
  );
  t = reduceEvent(t, event("request", question));
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "I've sent a question." },
    }),
  );
  t = reduceEvent(t, event("turn_complete", {}));
  expect(t.requests).toHaveLength(1);
  expect(t.interactions.at(-1)?.status).toBe("pending");
  t = reduceEvent(t, event("history_reset", {}));
  expect(t.requests).toHaveLength(1);
  t = reduceEvent(
    t,
    event("answered", {
      id: question.id,
      result: { action: "accept", content: { color: "Blue" } },
    }),
  );
  expect(t.requests).toHaveLength(0);
  expect(t.interactions.at(-1)?.status).toBe("answered");
});

it("preserves large image read results while bounding accompanying text", () => {
  const image = {
    type: "image",
    mimeType: "image/png",
    data: "a".repeat(40000),
  };
  const t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "tool_call",
      toolCallId: "image-read",
      kind: "read",
      content: [
        { type: "content", content: image },
        { type: "content", content: { type: "text", text: "x".repeat(40000) } },
      ],
    }),
  );
  const content = t.tools["root:image-read"].content;
  expect(content[0]).toEqual({ type: "content", content: image });
  expect(JSON.stringify(content[1]).length).toBeLessThan(33000);
  expect(t.trimmed).toBe(true);
});

it("retains tool identity, locations, descriptions and curated worker metadata across updates and replay", () => {
  let t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "tool_call",
      toolCallId: "metadata",
      title: "Read File",
      rawInput: { file_path: "src/a.ts", description: "Read workflow" },
      locations: [{ path: "src/a.ts", line: 20 }],
      _meta: {
        claudeCode: {
          toolName: "Read",
          toolResponse: {
            description: "Map workflow",
            prompt: "Inspect the flow",
            isAsync: true,
            agentId: "do-not-retain",
          },
        },
      },
    }),
  );
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "tool_call_update",
      toolCallId: "metadata",
      rawInput: { limit: 8 },
      _meta: { claudeCode: { toolResponse: { isAsync: false } } },
    }),
  );
  const saved = t.tools["root:metadata"];
  expect(saved.name).toBe("Read");
  expect(saved.rawInput).toMatchObject({
    file_path: "src/a.ts",
    description: "Read workflow",
    limit: 8,
  });
  expect(saved.claudeCode).toEqual({
    toolResponse: {
      description: "Map workflow",
      prompt: "Inspect the flow",
      isAsync: false,
    },
  });
  t = reduceEvent(t, event("history_reset", {}));
  t = reduceEvent(
    t,
    update({
      sessionUpdate: "tool_call",
      toolCallId: "metadata",
      title: "Read File",
      status: "completed",
      rawInput: null,
    }),
  );
  expect(t.tools["root:metadata"]).toMatchObject({
    name: "Read",
    locations: saved.locations,
    rawInput: saved.rawInput,
    claudeCode: saved.claudeCode,
  });
});

it("preserves command descriptions even when the input payload exceeds the display limit", () => {
  const t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "tool_call",
      toolCallId: "large-command",
      title: "Terminal",
      kind: "execute",
      rawInput: {
        command: "x".repeat(40000),
        description: "Rebuild the pipeline visualization",
      },
      _meta: { claudeCode: { toolName: "Bash" } },
    }),
  );
  expect(t.trimmed).toBe(true);
  expect(t.tools["root:large-command"].description).toBe(
    "Rebuild the pipeline visualization",
  );
  expect(t.tools["root:large-command"].command).toContain(
    "full output saved in transcript",
  );
});

it("bounds large text results without exposing serialized ACP envelopes", () => {
  const t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "tool_call",
      toolCallId: "large-result",
      kind: "execute",
      content: [
        {
          type: "content",
          content: { type: "text", text: "Readable output\n".repeat(4000) },
        },
      ],
    }),
  );
  const block = t.tools["root:large-result"].content[0] as {
    content: { text: string };
  };
  expect(block.content.text.startsWith("Readable output\n")).toBe(true);
  expect(block.content.text).toContain("full output saved in transcript");
  expect(t.trimmed).toBe(true);
});

it("does not invent a tool title when only the provider tool name is available", () => {
  const t = reduceEvent(
    emptyTranscript(),
    update({
      sessionUpdate: "tool_call",
      toolCallId: "provider-name",
      _meta: { claudeCode: { toolName: "SubagentHandback" } },
    }),
  );
  expect(t.tools["root:provider-name"].title).toBe("");
  expect(t.tools["root:provider-name"].name).toBe("SubagentHandback");
});
