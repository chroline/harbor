// @vitest-environment jsdom
import { fillEditor } from "../test/editor";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  cleanup,
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
  openModel: vi.fn(),
  update: vi.fn(),
  load: vi.fn().mockResolvedValue(undefined),
  call: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../lib/api", () => ({
  call: mock.call,
  json: (value: unknown) => value,
}));
vi.mock("./NativeTerminal", () => ({ NativeTerminal: () => null }));
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
        authMethods: [
          { id: "chatgpt", name: "ChatGPT" },
          { id: "api-key", name: "API Key" },
        ],
      },
    },
    loadTranscript: mock.load,
    updateSession: mock.update,
    setError: vi.fn(),
    configuration: {
      get: () => ({ busy: false, pending: [] }),
      blocked: () => false,
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
afterEach(() => {
  setDraftFiles("chat:root", []);
  mock.children = {};
  cleanup();
  document.querySelectorAll(".test-chat-actions").forEach((el) => el.remove());
  vi.clearAllMocks();
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
    expect(mock.call).toHaveBeenCalledWith("send_prompt", {
      sessionId: "chat",
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
    command === "send_prompt"
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
    expect(mock.call).toHaveBeenCalledWith("send_prompt", expect.anything()),
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox").textContent).toBe("Review this"),
  );
  expect(screen.getByRole("button", { name: "Remove retry.txt" })).toBeTruthy();
  mock.call.mockResolvedValue(undefined);
});
it.each([
  "prime",
  "codex",
  "claude",
  "cursor",
  "pi",
  "opencode",
  "grok",
  "custom",
])(
  "opens and messages a %s worker without sending to its parent",
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
    await waitFor(() =>
      expect(mock.call).toHaveBeenCalledWith("open_subagent", {
        sessionId: "chat",
        childId: "worker",
      }),
    );
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
    expect(mock.call).toHaveBeenCalledWith("send_subagent_prompt", {
      sessionId: "chat",
      childId: "worker",
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
    screen.getByRole("heading", { name: "Continue your task" }),
  ).toBeTruthy();
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
