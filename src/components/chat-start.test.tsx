// @vitest-environment jsdom
import { fillEditor } from "../test/editor";
import { Suspense } from "react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Chat } from "./Chat";
import { emptyTranscript } from "../lib/protocol";
import { setDraftFiles } from "../lib/attachments";
import type { SessionRecord } from "../lib/bindings/SessionRecord";

const mock = vi.hoisted(() => ({
  children: {} as ReturnType<typeof emptyTranscript>["children"],
  messages: [] as ReturnType<typeof emptyTranscript>["messages"],
  loaded: true,
  pendingRender: null as Promise<void> | null,
  openModel: vi.fn(),
  update: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined),
  setActiveSession: vi.fn(),
  call: vi.fn().mockResolvedValue(undefined),
  configurationBlocked: false,
}));
vi.mock("../lib/api", () => ({
  desktop: false,
  call: mock.call,
  json: (value: unknown) => value,
}));
vi.mock("./NativeTerminal", () => ({ NativeTerminal: () => null }));
vi.mock("./ChatTranscript", async (original) => {
  const { ChatTranscript: Transcript } =
    await original<typeof import("./ChatTranscript")>();
  return {
    ChatTranscript: (props: Parameters<typeof Transcript>[0]) => {
      if (
        mock.pendingRender &&
        props.entries.some(
          (entry) =>
            entry.type === "message" && entry.message.childId === "worker",
        )
      )
        throw mock.pendingRender;
      return <Transcript {...props} />;
    },
  };
});
vi.mock("./ModelMenu", () => ({
  SessionModelMenu: () => (
    <button className="model-menu-trigger" onClick={mock.openModel}>
      Choose model and reasoning
    </button>
  ),
}));
vi.mock("../lib/store", () => ({
  useStore: () => ({
    data: { providers: [{ id: "codex", name: "Codex" }], projects: [] },
    transcripts: {
      chat: {
        ...emptyTranscript(),
        trimmed: true,
        children: mock.children,
        messages: mock.messages,
        authMethods: [
          { id: "chatgpt", name: "ChatGPT" },
          { id: "api-key", name: "API Key" },
        ],
      },
    },
    loadTranscript: mock.load,
    setActiveSession: mock.setActiveSession,
    loadedTranscripts: new Set(mock.loaded ? ["chat"] : []),
    visibleTranscripts: new Set(["chat"]),
    updateSession: mock.update,
    setError: vi.fn(),
    configuration: {
      get: () => ({ busy: false, pending: [] }),
      blocked: () => mock.configurationBlocked,
    },
  }),
}));
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
    addListener() {},
    removeListener() {},
  }));
});
beforeEach(() => {
  mock.call.mockImplementation((command: string, args: {sessionId?: string; childId?: string}) => Promise.resolve(command === "submit_prompt" ? {sessionId: args.sessionId, childId: args.childId ?? null, revision: 1, items: [], paused: false, error: null, steering: false} : undefined));
});
afterEach(() => {
  setDraftFiles("chat:root", []);
  mock.children = {};
  mock.messages = [];
  mock.loaded = true;
  mock.pendingRender = null;
  mock.configurationBlocked = false;
  cleanup();
  localStorage.removeItem("harbor.task-tab-selection.chat");
  localStorage.removeItem("harbor.root-draft.chat");
  localStorage.removeItem("harbor.worker-drafts.chat");
  localStorage.removeItem("harbor.native-terminal-dismissed.chat");
  document.querySelectorAll(".test-chat-actions").forEach((el) => el.remove());
  vi.clearAllMocks();
});
it("allows sending while an existing chat's configuration is syncing or failed", async () => {
  mock.configurationBlocked = true;
  render(<Chat session={session} />);
  fillEditor(screen.getByRole("textbox"), "Continue with this choice");
  const send = screen.getByRole("button", { name: "Send message" });
  expect((send as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(send);
  await waitFor(() =>
    expect(mock.call).toHaveBeenCalledWith("submit_prompt", {
      sessionId: "chat", childId: null, intent: "send", attachments: [],
      text: "Continue with this choice",
    }),
  );
});
it("shows the thinking indicator while keeping partial history hidden until the full chat loads", () => {
  mock.loaded = false;
  mock.messages = [
    {
      id: "partial",
      streamId: "root",
      sequence: 1,
      role: "assistant",
      text: "Partial recent history",
      timestamp: 1,
    },
  ];
  const { rerender } = render(<Chat session={session} />);
  expect(document.querySelector(".chat-main .conversation-scroll")).toBeNull();
  expect(
    screen.getByRole("status", { name: "Loading conversation" }),
  ).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByText("Partial recent history")).toBeNull();
  expect(mock.load).toHaveBeenCalledWith("chat");

  mock.loaded = true;
  rerender(<Chat session={session} />);
  expect(
    screen.queryByRole("status", { name: "Loading conversation" }),
  ).toBeNull();
  expect(screen.getByRole("textbox").textContent).toBe(session.draft);
});

it("limits automatic recovery to the mounted chat", () => {
  const { unmount } = render(<Chat session={session} />);
  expect(mock.setActiveSession).toHaveBeenLastCalledWith(session.id);
  unmount();
  expect(mock.setActiveSession).toHaveBeenLastCalledWith(null);
});

it("selects a worker immediately, shows a loading indicator during rendering, and allows switching away", async () => {
  const tabsTarget = document.createElement("div");
  tabsTarget.className = "test-chat-actions";
  document.body.appendChild(tabsTarget);
  mock.children = {
    worker: {
      sessionId: "worker",
      parentId: "root",
      title: "Worker",
      description: null,
      state: { type: "idle" },
      capabilities: { harborConnected: true },
    },
  };
  mock.messages = [
    {
      id: "worker-message",
      streamId: "worker-message",
      sequence: 1,
      role: "assistant",
      text: "Worker reply",
      childId: "worker",
      timestamp: 1,
    },
  ];
  let finishRender!: () => void;
  mock.pendingRender = new Promise<void>((resolve) => {
    finishRender = resolve;
  });
  render(
    <Suspense fallback={<div>Waiting for rendering</div>}>
      <Chat session={session} tabsTarget={tabsTarget} />
    </Suspense>,
  );
  const select = (name: string) =>
    fireEvent.mouseDown(screen.getByRole("tab", { name }), {
      button: 0,
      ctrlKey: false,
    });
  select("Worker");
  expect(
    screen.getByRole("tab", { name: "Worker" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(document.querySelector(".chat-main .conversation-scroll")).toBeNull();
  expect(screen.queryByText("Waiting for rendering")).toBeNull();

  select(session.title);
  expect(screen.getByRole("textbox").textContent).toBe(session.draft);
  await act(async () => {
    mock.pendingRender = null;
    finishRender();
  });
  expect(
    screen
      .getByRole("tab", { name: session.title })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.queryByText("Worker reply")).toBeNull();
  select("Worker");
  expect(screen.getByText("Worker reply")).toBeTruthy();
});
it("omits the history notice when the rendering window is trimmed", () => {
  render(<Chat session={session} />);
  expect(screen.queryByText(/Showing recent activity/)).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Export full transcript" }),
  ).toBeNull();
});
it("sends attachment-only messages with their encoded bytes and clears the composer", async () => {
  render(<Chat session={{ ...session, draft: "", error: null }} />);
  const file = new File(["hello"], "notes.txt", { type: "text/plain" });
  fireEvent.drop(screen.getByRole("textbox"), {
    dataTransfer: { types: ["Files"], files: [file] },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(mock.call).toHaveBeenCalledWith("submit_prompt", {
      sessionId: "chat", childId: null, intent: "send",
      text: "",
      attachments: [
        { name: "notes.txt", mimeType: "text/plain", data: "aGVsbG8=" },
      ],
    }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Remove notes.txt" }),
    ).toBeNull(),
  );
});

it("restores attachments and text when sending fails", async () => {
  mock.call.mockImplementation((command: string) =>
    command === "submit_prompt"
      ? Promise.reject(new Error("Disconnected"))
      : Promise.resolve(),
  );
  render(<Chat session={{ ...session, draft: "Review this", error: null }} />);
  fireEvent.drop(screen.getByRole("textbox"), {
    dataTransfer: {
      types: ["Files"],
      files: [new File(["hello"], "retry.txt")],
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  await waitFor(() =>
    expect(mock.call).toHaveBeenCalledWith("submit_prompt", expect.anything()),
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox").textContent).toBe("Review this"),
  );
  expect(screen.getByRole("button", { name: "Remove retry.txt" })).toBeTruthy();
  mock.call.mockResolvedValue(undefined);
});
it("stops showing connection progress when the worker connects before the open request settles", async () => {
  mock.children = {
    worker: {
      sessionId: "worker", parentId: "root", title: "Worker", description: null,
      state: { type: "idle" }, capabilities: {},
    },
  };
  mock.messages = [{
    id: "saved-worker-message", streamId: "worker", sequence: 1, timestamp: 1,
    role: "assistant", text: "Saved worker history", childId: "worker",
  }];
  let finishOpening!: () => void;
  const opening = new Promise<void>((resolve) => { finishOpening = resolve; });
  const previousCall = mock.call.getMockImplementation()!;
  mock.call.mockImplementation((command, args) => command === "open_subagent" ? opening : previousCall(command, args));
  const props = { session: { ...session, error: null }, standaloneTab: "worker:worker" };
  const { rerender } = render(<Chat {...props} />);
  expect(screen.getByText("Saved worker history")).toBeTruthy();
  expect(mock.call).toHaveBeenCalledWith("open_subagent", { sessionId: "chat", childId: "worker" });
  expect(screen.getByText("Connecting to worker…")).toBeTruthy();
  mock.children = { worker: { ...mock.children.worker, capabilities: { harborConnected: true } } };
  rerender(<Chat {...props} />);
  expect(screen.queryByText("Connecting to worker…")).toBeNull();
  fillEditor(screen.getByRole("textbox"), "Continue");
  expect((screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement).disabled).toBe(false);
  await act(async () => finishOpening());
});

it.each(["codex", "claude", "grok"])(
  "messages an attached %s worker without reopening it or sending to its parent",
  async (providerId) => {
    const tabsTarget = document.createElement("div");
    tabsTarget.className = "test-chat-actions";
    document.body.appendChild(tabsTarget);
    mock.children = {
      worker: {
        sessionId: "worker",
        parentId: "root",
        title: "Worker",
        description: null,
        state: { type: "idle" },
        capabilities: { harborConnected: true },
      },
    };
    render(
      <Chat
        session={{
          ...session,
          providerId,
          acpSessionId: "root",
          capabilities: {} as SessionRecord["capabilities"],
          error: null,
          draft: "parent draft",
        }}
        tabsTarget={tabsTarget}
      />,
    );
    expect(
      screen.getByRole("tablist", { name: "Task conversations" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: session.title })
        .getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Worker" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(mock.call).not.toHaveBeenCalledWith("open_subagent", expect.anything());
    const input = screen.getByRole("textbox", { name: "Message Worker" });
    fillEditor(input, "worker follow-up");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Send message",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(mock.call).toHaveBeenCalledWith("submit_prompt", {
      sessionId: "chat",
      childId: "worker", intent: "send", attachments: [],
      text: "worker follow-up",
    });
    expect(mock.call).not.toHaveBeenCalledWith(
      "send_prompt",
      expect.anything(),
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: session.title }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      (
        screen.getByRole("textbox", {
          name: "Message your agent",
        }) as HTMLTextAreaElement
      ).textContent,
    ).toBe("parent draft");
  },
);
it("adds tabs for arriving workers without changing the active conversation or drafts", async () => {
  const tabsTarget = document.createElement("div");
  tabsTarget.className = "test-chat-actions";
  document.body.appendChild(tabsTarget);
  const props = {
    session: { ...session, error: null },
    tabsTarget,
  };
  const { rerender } = render(<Chat {...props} />);
  expect(screen.getAllByRole("tab")).toHaveLength(1);
  fillEditor(screen.getByRole("textbox"), "Keep parent draft");
  mock.children = {
    first: {
      sessionId: "first",
      parentId: "root",
      title: "Research",
      description: null,
      state: { type: "running" },
      capabilities: { harborConnected: true },
    },
  };
  rerender(<Chat {...props} />);
  expect(screen.getAllByRole("tab")).toHaveLength(2);
  expect(screen.getByRole("textbox").textContent).toBe("Keep parent draft");
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Research" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(
    screen.getByRole("tab", { name: "Research" }).getAttribute("aria-selected"),
  ).toBe("true");
  mock.children = {
    ...mock.children,
    second: { ...mock.children.first, sessionId: "second", title: "Review" },
  };
  rerender(<Chat {...props} />);
  expect(screen.getAllByRole("tab")).toHaveLength(3);
  expect(
    screen.getByRole("tab", { name: "Research" }).getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
    screen.getByRole("tab", { name: "Research" }).id,
  );
  fireEvent.mouseDown(screen.getByRole("tab", { name: session.title }), {
    button: 0,
    ctrlKey: false,
  });
  expect(screen.getByRole("textbox").textContent).toBe("Keep parent draft");
});

it("shows the divider for another selected tab or tabs scrolled behind its left edge", () => {
  const tabsTarget = document.createElement("div");
  tabsTarget.className = "test-chat-actions";
  document.body.appendChild(tabsTarget);
  const onTabDividerChange = vi.fn();
  mock.children = {
    first: {
      sessionId: "first",
      parentId: "root",
      title: "Research",
      description: null,
      state: { type: "idle" },
      capabilities: { harborConnected: true },
    },
  };
  localStorage.removeItem("harbor.task-tabs.chat");
  render(
    <Chat
      session={session}
      tabsTarget={tabsTarget}
      onTabDividerChange={onTabDividerChange}
    />,
  );
  const list = screen.getByRole("tablist", { name: "Task conversations" });
  expect(onTabDividerChange).toHaveBeenLastCalledWith(false);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Research" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(onTabDividerChange).toHaveBeenLastCalledWith(true);
  fireEvent.mouseDown(screen.getByRole("tab", { name: session.title }), {
    button: 0,
    ctrlKey: false,
  });
  expect(onTabDividerChange).toHaveBeenLastCalledWith(false);
  list.scrollLeft = 80;
  fireEvent.scroll(list);
  expect(onTabDividerChange).toHaveBeenLastCalledWith(true);
  list.scrollLeft = 0;
  fireEvent.scroll(list);
  expect(onTabDividerChange).toHaveBeenLastCalledWith(false);
});

it("uses the first tab in the reordered strip for divider visibility", () => {
  const tabsTarget = document.createElement("div");
  tabsTarget.className = "test-chat-actions";
  document.body.appendChild(tabsTarget);
  const onTabDividerChange = vi.fn();
  mock.children = {
    first: {
      sessionId: "first",
      parentId: "root",
      title: "Research",
      description: null,
      state: { type: "idle" },
      capabilities: { harborConnected: true },
    },
  };
  localStorage.setItem(
    "harbor.task-tabs.chat",
    JSON.stringify(["worker:first", "parent"]),
  );
  render(
    <Chat
      session={session}
      tabsTarget={tabsTarget}
      onTabDividerChange={onTabDividerChange}
    />,
  );
  expect(onTabDividerChange).toHaveBeenLastCalledWith(true);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Research" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(onTabDividerChange).toHaveBeenLastCalledWith(false);
  localStorage.removeItem("harbor.task-tabs.chat");
});

it("does not start native handoff when its tab only receives focus", () => {
  const tabsTarget = document.createElement("div");
  tabsTarget.className = "test-chat-actions";
  document.body.appendChild(tabsTarget);
  render(<Chat session={{ ...session, capabilities: { nativeHandoff: true } as SessionRecord["capabilities"] }} tabsTarget={tabsTarget} />);
  fireEvent.focus(screen.getByRole("tab", { name: "Native terminal" }));
  expect(mock.call).not.toHaveBeenCalledWith("enter_terminal", expect.anything());
  expect(screen.getByRole("textbox", { name: "Message your agent" })).toBeTruthy();
});

it.each(["tab", "shortcut"])("keeps the worker conversation visible when native handoff from %s fails", async (trigger) => {
  const tabsTarget = document.createElement("div");
  tabsTarget.className = "test-chat-actions";
  document.body.appendChild(tabsTarget);
  mock.children = { worker: { sessionId: "worker", parentId: "root", title: "Worker", description: null, state: { type: "idle" }, capabilities: { harborConnected: true } } };
  localStorage.setItem("harbor.task-tab-selection.chat", "worker:worker");
  const previousCall = mock.call.getMockImplementation()!;
  mock.call.mockImplementation((command, args) => command === "enter_terminal" ? Promise.reject(new Error("Finish or stop the current turn and answer pending requests first")) : previousCall(command, args));
  render(<Chat session={{ ...session, status: "working", capabilities: { nativeHandoff: true } as SessionRecord["capabilities"] }} tabsTarget={tabsTarget} />);
  const input = screen.getByRole("textbox", { name: "Message Worker" });
  fillEditor(input, "Keep my worker draft");
  if (trigger === "tab") fireEvent.mouseDown(screen.getByRole("tab", { name: "Native terminal" }), { button: 0, ctrlKey: false });
  else fireEvent.keyDown(window, { key: "T", metaKey: true, shiftKey: true });
  await waitFor(() => expect(mock.call).toHaveBeenCalledWith("enter_terminal", { sessionId: "chat" }));
  await act(async () => {});
  expect(screen.getByRole("tab", { name: "Worker" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByRole("textbox", { name: "Message Worker" }).textContent).toBe("Keep my worker draft");
  expect(localStorage.getItem("harbor.task-tab-selection.chat")).toBe("worker:worker");
});

it("dismisses an unused native terminal tab without a handoff, remembers it, and allows reopening", async () => {
  const tabsTarget = document.createElement("div");
  tabsTarget.className = "test-chat-actions";
  document.body.appendChild(tabsTarget);
  const props = {
    session: { ...session, status: "working", capabilities: { nativeHandoff: true } as SessionRecord["capabilities"] },
    tabsTarget,
  };
  const first = render(<Chat {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Close Native terminal" }));
  expect(screen.queryByRole("tab", { name: "Native terminal" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "Message your agent" })).toBeTruthy();
  expect(mock.call).not.toHaveBeenCalledWith("enter_terminal", expect.anything());
  expect(mock.call).not.toHaveBeenCalledWith("reconnect", expect.anything());
  first.unmount();
  render(<Chat {...props} />);
  expect(screen.queryByRole("tab", { name: "Native terminal" })).toBeNull();
  fireEvent.keyDown(window, { key: "T", metaKey: true, shiftKey: true });
  await waitFor(() => expect(screen.getByRole("tab", { name: "Native terminal" }).getAttribute("aria-selected")).toBe("true"));
});

it("keeps native terminal handoff available as a task tab", async () => {
  const tabsTarget = document.createElement("div");
  tabsTarget.className = "test-chat-actions";
  document.body.appendChild(tabsTarget);
  const props = {
    session: {
      ...session,
      capabilities: { nativeHandoff: true } as SessionRecord["capabilities"],
    },
    tabsTarget,
  };
  const { rerender } = render(<Chat {...props} />);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Native terminal" }), {
    button: 0,
    ctrlKey: false,
  });
  expect(mock.call).toHaveBeenCalledWith("enter_terminal", {
    sessionId: "chat",
  });
  await waitFor(() => expect(
    screen
      .getByRole("tab", { name: "Native terminal" })
      .getAttribute("aria-selected"),
  ).toBe("true"));
  rerender(
    <Chat {...props} session={{ ...props.session, mode: "terminal" }} />,
  );
  expect(
    screen
      .getByRole("tab", { name: "Native terminal" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  mock.call.mockImplementation((command: string) =>
    Promise.resolve(command === "reconnect" ? props.session : undefined),
  );
  fireEvent.mouseDown(screen.getByRole("tab", { name: session.title }), {
    button: 0,
    ctrlKey: false,
  });
  expect(
    screen
      .getByRole("tab", { name: session.title })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(document.querySelector(".chat-main .conversation-scroll")).toBeNull();
  await waitFor(() =>
    expect(mock.call).toHaveBeenCalledWith("reconnect", { sessionId: "chat" }),
  );
  mock.call.mockResolvedValue(undefined);
});

const session = {
  id: "chat",
  providerId: "codex",
  title: "hey!",
  status: "idle",
  mode: "gui",
  draft: "hey!",
  scrollTop: 0,
  reviewOpen: false,
  capabilities: {},
  error:
    "The selected fast-mode is unavailable in this project. Choose a supported value.",
} as SessionRecord;

it("keeps the selected task tab visible when the tab strip is resized", () => {
  const previous = globalThis.ResizeObserver;
  const observed = new Map<Element, () => void>();
  globalThis.ResizeObserver = class implements ResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      observed.set(target, () => this.callback([], this));
    }
    unobserve() {}
    disconnect() {}
  };
  try {
    const target = document.createElement("div");
    target.className = "test-chat-actions";
    document.body.append(target);
    render(<Chat session={session} tabsTarget={target} />);
    const list = screen.getByRole("tablist", { name: "Task conversations" });
    const selected = screen.getByRole("tab", { name: session.title });
    selected.scrollIntoView = vi.fn();
    observed.get(list)!();
    expect(selected.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  } finally {
    globalThis.ResizeObserver = previous;
  }
});

it("keeps configuration recovery by the saved draft without duplicate branding or sign-in buttons", () => {
  render(<Chat session={session} />);
  expect(
    screen.queryByRole("heading", { name: "Continue your task" }),
  ).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "Start a conversation" }),
  ).toBeNull();
  expect(screen.queryByRole("heading", { name: "hey!" })).toBeNull();
  expect(screen.queryByText("Ready")).toBeNull();
  expect(screen.queryByText("No messages yet")).toBeNull();
  expect(screen.queryByRole("button", { name: "API Key" })).toBeNull();
  expect(screen.queryByRole("button", { name: "ChatGPT" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Reconnect|Retry connection/ }),
  ).toBeNull();
  expect(
    (
      screen.getByRole("textbox", {
        name: "Message your agent",
      }) as HTMLTextAreaElement
    ).textContent,
  ).toBe("hey!");
  fireEvent.click(screen.getByRole("button", { name: "Model settings" }));
  expect(mock.openModel).toHaveBeenCalledOnce();
});
it("offers authentication only for a disconnected authentication error", () => {
  render(
    <Chat
      session={{
        ...session,
        status: "error",
        error: "Authentication required",
      }}
    />,
  );
  expect(screen.getByRole("button", { name: "ChatGPT" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retry connection" })).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Send message" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  const input = screen.getByRole("textbox", {
    name: "Message your agent",
  }) as HTMLTextAreaElement;
  expect(input.getAttribute("aria-disabled")).toBe("false");
  fillEditor(input, "Keep my revised draft");
  expect(input.textContent).toBe("Keep my revised draft");
});
it("does not offer sign-in for a process failure", () => {
  render(
    <Chat
      session={{ ...session, status: "error", error: "Agent process exited" }}
    />,
  );
  expect(screen.getByRole("button", { name: "Retry connection" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "ChatGPT" })).toBeNull();
});

it("restores a root draft when quit happens before the database save debounce", () => {
  const first = render(
    <Chat session={{ ...session, draft: "older database draft" }} />,
  );
  fillEditor(screen.getByRole("textbox"), "unsent plan revision before quit");
  first.unmount();
  render(<Chat session={{ ...session, draft: "older database draft" }} />);
  expect(screen.getByRole("textbox").textContent).toBe(
    "unsent plan revision before quit",
  );
});

it("keeps a working chat editable and submits queue versus steer intent", async () => {
  render(<Chat session={{...session, status: "working", draft: "", error: null}}/>);
  const input = screen.getByRole("textbox");
  expect(input.getAttribute("contenteditable")).toBe("true");
  fillEditor(input,"Run this next");
  fireEvent.keyDown(input,{key:"Enter"});
  await waitFor(() => expect(mock.call).toHaveBeenCalledWith("submit_prompt",expect.objectContaining({sessionId:"chat",childId:null,text:"Run this next",intent:"send"})));
  await waitFor(() => expect(input.textContent).toBe(""));
  fillEditor(input,"Change course immediately");
  fireEvent.keyDown(input,{key:"Enter",metaKey:true});
  await waitFor(() => expect(mock.call).toHaveBeenCalledWith("submit_prompt",expect.objectContaining({text:"Change course immediately",intent:"steer"})));
});

it("retains a working chat draft when steering is rejected", async () => {
  mock.call.mockImplementation((command: string) => command === "submit_prompt" ? Promise.reject(new Error("Another conversation is using this agent")) : Promise.resolve());
  render(<Chat session={{...session,status:"working",draft:"Keep my instruction",error:null}}/>);
  const input = screen.getByRole("textbox");
  fireEvent.keyDown(input,{key:"Enter",metaKey:true});
  await waitFor(() => expect(mock.call).toHaveBeenCalledWith("submit_prompt",expect.objectContaining({intent:"steer"})));
  expect(input.textContent).toBe("Keep my instruction");
});
