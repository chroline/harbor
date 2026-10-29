// @vitest-environment jsdom
import { fillEditor } from "./test/editor";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import App from "./App";
import { browserBootstrap } from "./lib/api";
import type { Project } from "./lib/bindings/Project";
import type { SessionRecord } from "./lib/bindings/SessionRecord";
import type { Workspace } from "./lib/bindings/Workspace";
import { SIDEBAR_ORDER_KEY, NO_WORKSPACE_ID } from "./lib/sidebar-order";
import { PINNED_CHATS_KEY } from "./lib/pinned-chats";

const mocks = vi.hoisted(() => ({
  call: vi.fn(),
  openFolder: vi.fn(),
  addedWorkspace: null as Workspace | null,
  refresh: vi.fn().mockResolvedValue(undefined),
  setError: vi.fn(),
  initialSessions: [] as SessionRecord[],
  addedProject: null as Project | null,
  isGitRoot: true,
  available: true,
  extraProjects: [] as Project[],
  extraWorkspaces: [] as Workspace[],
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.openFolder }));
vi.mock("./lib/api", async (original) => ({
  ...(await original<typeof import("./lib/api")>()),
  call: mocks.call,
}));
vi.mock("./lib/provider-config", () => ({
  useProviderConfig: () => ({
    busy: false,
    selections: {
      model: "chosen-model",
      effort: "high",
      mode: "read-only",
      collaboration_mode: "plan",
      "fast-mode": false,
    },
  }),
}));
vi.mock("./components/ModelMenu", () => ({
  DiscoveryModelMenu: () => <button>Choose model</button>,
}));
vi.mock("./components/BackgroundProcesses", () => ({ BackgroundProcesses: () => null }));
vi.mock("./components/Chat", () => ({
  Chat: ({ session }: { session: SessionRecord }) => (
    <div aria-label="Active chat">
      {session.title}
      <textarea aria-label="Chat draft" value={session.draft} readOnly />
    </div>
  ),
}));
vi.mock("./components/Settings", () => ({
  Settings: () => <div>Settings page</div>,
}));
vi.mock("./components/Worktrees", () => ({
  Worktrees: () => <div>Worktrees page</div>,
}));
vi.mock("./lib/store", () => ({
  useStore: () => {
    const [sessions, setSessions] = useState(mocks.initialSessions);
    const [projects, setProjects] = useState<Project[]>([
      {
        id: "repo",
        name: "Harbor",
        workspaceId: "workspace",
        icon: "folder",
        color: "gray",
      },
      ...mocks.extraProjects,
    ]);
    const [workspaces, setWorkspaces] = useState<Workspace[]>([
      {
        id: "workspace",
        name: "repo",
        path: "/repo",
        lastUsedAt: 0,
        available: mocks.available,
        isGitRoot: mocks.isGitRoot,
      },
      ...mocks.extraWorkspaces,
    ]);
    return {
      data: {
        ...browserBootstrap,
        sessions,
        projects,
        workspaces,
      },
      ready: true,
      error: null,
      refresh: async () => {
        await mocks.refresh();
        if (mocks.addedWorkspace)
          setWorkspaces((current) => [
            ...current.filter((w) => w.id !== mocks.addedWorkspace!.id),
            mocks.addedWorkspace!,
          ]);
        if (mocks.addedProject)
          setProjects((current) => [
            ...current.filter((p) => p.id !== mocks.addedProject!.id),
            mocks.addedProject!,
          ]);
      },
      setError: mocks.setError,
      updateSession: (session: SessionRecord) =>
        setSessions((items) => [
          ...items.filter((item) => item.id !== session.id),
          session,
        ]),
    };
  },
}));

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  window.scrollTo = vi.fn();
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query.includes("reduced-motion"),
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
});
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem(PINNED_CHATS_KEY);
  localStorage.removeItem(SIDEBAR_ORDER_KEY);
  mocks.call.mockResolvedValue(undefined);
  mocks.initialSessions = [];
  mocks.addedProject = null;
  mocks.addedWorkspace = null;
  mocks.openFolder.mockResolvedValue(null);
  mocks.isGitRoot = true;
  mocks.available = true;
  mocks.extraProjects = [];
  mocks.extraWorkspaces = [];
});
afterEach(cleanup);
const session = {
  id: "new-chat",
  title: "Inspect the handler",
  providerId: "codex",
  projectId: null,
  workspaceId: null,
  status: "idle",
  draft: "",
  archived: false,
} as SessionRecord;

it("pins a workspace conversation without selecting it and restores pins after remount", async () => {
  const workspaceChat = { ...session, workspaceId: "workspace" };
  mocks.initialSessions = [workspaceChat];
  const { unmount } = render(<App />);
  const workspace = screen.getByRole("region", { name: "Workspaces" });
  const row = within(workspace).getByRole("button", { name: session.title });
  fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Pin conversation" }),
  );
  const pinned = await screen.findByRole("region", { name: "Pinned" });
  expect(
    within(pinned).getByRole("button", { name: session.title }),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Active chat")).toBeNull();
  expect(
    within(workspace).getByRole("button", { name: session.title }),
  ).toBeTruthy();
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem(PINNED_CHATS_KEY)!)).toEqual([
      session.id,
    ]),
  );
  unmount();
  render(<App />);
  fireEvent.click(
    within(screen.getByRole("region", { name: "Pinned" })).getByRole("button", {
      name: session.title,
    }),
  );
  expect(screen.getByLabelText("Active chat").textContent).toContain(
    session.title,
  );
});

it("unpins from the pinned section using the keyboard context menu", async () => {
  mocks.initialSessions = [session];
  localStorage.setItem(PINNED_CHATS_KEY, JSON.stringify([session.id]));
  render(<App />);
  const row = within(screen.getByRole("region", { name: "Pinned" })).getByRole(
    "button",
    { name: session.title },
  );
  row.focus();
  fireEvent.keyDown(row, { key: "F10", shiftKey: true });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Unpin conversation" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull(),
  );
  expect(
    within(screen.getByRole("region", { name: "Workspaces" })).getByRole(
      "button",
      {
        name: session.title,
      },
    ),
  ).toBeTruthy();
  await waitFor(() =>
    expect(localStorage.getItem(PINNED_CHATS_KEY)).toBe("[]"),
  );
});

it("ignores archived and missing pinned chats and tolerates invalid saved preferences", () => {
  mocks.initialSessions = [{ ...session, archived: true }];
  localStorage.setItem(
    PINNED_CHATS_KEY,
    JSON.stringify([session.id, "missing-chat"]),
  );
  const { unmount } = render(<App />);
  expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull();
  unmount();
  mocks.initialSessions = [session];
  localStorage.setItem(PINNED_CHATS_KEY, "invalid json");
  render(<App />);
  expect(screen.queryByRole("region", { name: "Pinned" })).toBeNull();
  expect(screen.getByRole("button", { name: session.title })).toBeTruthy();
});
const typePrompt = () =>
  fillEditor(
    screen.getByRole("textbox", { name: "Describe a new task" }),
    "Inspect the handler",
  );

async function selectSidebarAction(row: HTMLElement, action: string) {
  fireEvent.contextMenu(row, { clientX: 100, clientY: 100 });
  fireEvent.click(await screen.findByRole("menuitem", { name: action }));
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="context-menu-content"]'),
    ).toBeNull(),
  );
}

it("keeps projects in their own sidebar group with their workspace association", async () => {
  mocks.extraProjects = [
    {
      id: "release",
      name: "Release",
      workspaceId: "workspace",
      icon: "code",
      color: "blue",
    },
  ];
  mocks.call.mockResolvedValue(session);
  render(<App />);
  const projects = within(screen.getByRole("region", { name: "Projects" }));
  const workspaces = within(screen.getByRole("region", { name: "Workspaces" }));
  expect(
    projects.getByRole("button", { name: "Harbor" }).getAttribute("title"),
  ).toContain("/repo");
  expect(
    projects.getByRole("button", { name: "Release" }).getAttribute("title"),
  ).toContain("/repo");
  expect(projects.getByRole("button", { name: "Create project" })).toBeTruthy();
  expect(
    workspaces.queryByRole("button", { name: "Create project" }),
  ).toBeNull();
  expect(workspaces.getByRole("button", { name: "repo" })).toBeTruthy();
  expect(workspaces.queryByRole("button", { name: "Harbor" })).toBeNull();
  fireEvent.click(projects.getByRole("button", { name: "Release" }));
  typePrompt();
  fireEvent.click(screen.getByRole("button", { name: "Start task" }));
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith(
      "create_session",
      expect.objectContaining({ workspaceId: "workspace", newWorktree: true }),
    ),
  );
});

it("opens the project editor from its sidebar group using the project's workspace", async () => {
  render(<App />);
  const projects = within(screen.getByRole("region", { name: "Projects" }));
  await selectSidebarAction(
    projects.getByRole("button", { name: "Harbor" }),
    "Edit project…",
  );
  const dialog = within(
    await screen.findByRole("dialog", { name: "Edit project" }),
  );
  expect(
    (dialog.getByRole("textbox", { name: "Project name" }) as HTMLInputElement)
      .value,
  ).toBe("Harbor");
  expect(
    dialog.getByRole("button", { name: "Choose workspace" }).textContent,
  ).toContain("repo");
});

it("groups chats once by their saved workspace, independent of their project", () => {
  mocks.extraProjects = [
    {
      id: "shared",
      name: "Shared project",
      workspaceId: "workspace",
      icon: "folder",
      color: "gray",
    },
    {
      id: "moved",
      name: "Moved project",
      workspaceId: "workspace",
      icon: "folder",
      color: "gray",
    },
  ];
  mocks.extraWorkspaces = [
    {
      id: "old",
      name: "Old folder",
      path: "/old",
      lastUsedAt: 0,
      available: false,
      isGitRoot: false,
    },
  ];
  mocks.initialSessions = [
    {
      ...session,
      id: "one",
      title: "First project chat",
      projectId: "repo",
      workspaceId: "workspace",
    },
    {
      ...session,
      id: "two",
      title: "Shared workspace chat",
      projectId: "shared",
      workspaceId: "workspace",
    },
    {
      ...session,
      id: "old",
      title: "Original workspace chat",
      projectId: "moved",
      workspaceId: "old",
    },
    {
      ...session,
      id: "detached",
      title: "Detached project chat",
      projectId: "deleted",
      workspaceId: "workspace",
    },
    { ...session, id: "free", title: "Freeform chat" },
    {
      ...session,
      id: "missing",
      title: "Missing workspace chat",
      projectId: "deleted",
      workspaceId: "missing",
    },
    {
      ...session,
      id: "archived",
      title: "Archived chat",
      workspaceId: "workspace",
      archived: true,
    },
  ];
  render(<App />);
  const workspaceChats = within(
    screen.getByRole("list", { name: "Chats in repo" }),
  );
  for (const title of [
    "First project chat",
    "Shared workspace chat",
    "Detached project chat",
  ])
    expect(workspaceChats.getByRole("button", { name: title })).toBeTruthy();
  expect(
    workspaceChats.queryByRole("button", { name: "Original workspace chat" }),
  ).toBeNull();
  expect(
    within(screen.getByRole("list", { name: "Chats in Old folder" })).getByRole(
      "button",
      { name: "Original workspace chat" },
    ),
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole("list", { name: "Chats in No workspace" }),
    ).getByRole("button", { name: "Freeform chat" }),
  ).toBeTruthy();
  expect(
    within(
      screen.getByRole("list", { name: "Chats in No workspace" }),
    ).getByRole("button", { name: "Missing workspace chat" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Archived chat" })).toBeNull();
  for (const chat of mocks.initialSessions.filter((s) => !s.archived))
    expect(screen.getAllByRole("button", { name: chat.title })).toHaveLength(1);
});

it("shows No workspace alongside the other workspaces and starts freeform tasks there", async () => {
  mocks.call.mockResolvedValue(session);
  render(<App />);
  expect(
    within(
      screen.getByRole("list", { name: "Chats in No workspace" }),
    ).getByRole("button", { name: "Start a conversation" }),
  ).toBeTruthy();
  fireEvent.click(
    within(screen.getByRole("region", { name: "Projects" })).getByRole(
      "button",
      { name: "Harbor" },
    ),
  );
  const noWorkspace = screen.getByRole("button", { name: "No workspace" });
  const workspace = screen.getByRole("button", { name: "repo" });
  expect(noWorkspace.closest('[data-sidebar="menu-item"]')?.parentElement).toBe(
    workspace.closest('[data-sidebar="menu-item"]')?.parentElement,
  );
  expect(screen.queryByRole("button", { name: "Home" })).toBeNull();
  await selectSidebarAction(noWorkspace, "New task");
  typePrompt();
  fireEvent.click(screen.getByRole("button", { name: "Start task" }));
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith(
      "create_session",
      expect.objectContaining({ workspaceId: null, newWorktree: false }),
    ),
  );
});

it("starts a chat in the workspace selected from the sidebar", async () => {
  mocks.call.mockResolvedValue({
    ...session,
    projectId: "repo",
    workspaceId: "workspace",
  });
  render(<App />);
  await selectSidebarAction(
    screen.getByRole("button", { name: "repo" }),
    "New task",
  );
  typePrompt();
  fireEvent.click(screen.getByRole("button", { name: "Start task" }));
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith(
      "create_session",
      expect.objectContaining({ workspaceId: "workspace", newWorktree: true }),
    ),
  );
  expect(
    within(screen.getByRole("list", { name: "Chats in repo" })).getByRole(
      "button",
      { name: session.title },
    ),
  ).toBeTruthy();
});

it("collapses Fluid sections independently and retains nested workspace state", () => {
  mocks.initialSessions = [{ ...session, title: "Freeform chat" }];
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Freeform chat" }));
  const workspace = screen.getByRole("button", { name: "No workspace" });
  fireEvent.click(workspace);
  const projects = screen.getByRole("button", { name: "Projects" });
  const workspaces = screen.getByRole("button", { name: "Workspaces" });
  const projectRows = within(screen.getByRole("region", { name: "Projects" }));
  fireEvent.click(projects);
  expect(projects.getAttribute("aria-expanded")).toBe("false");
  expect(screen.getByRole("button", { name: "Create project" })).toBeTruthy();
  expect(projectRows.queryByRole("button", { name: "Harbor" })).toBeNull();
  fireEvent.click(workspaces);
  expect(screen.queryByRole("button", { name: "No workspace" })).toBeNull();
  expect(workspace.closest("[inert]")).toBeTruthy();
  expect(screen.getByLabelText("Active chat").textContent).toBe(
    "Freeform chat",
  );
  fireEvent.click(projects);
  expect(projectRows.getByRole("button", { name: "Harbor" })).toBeTruthy();
  expect(workspaces.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(workspaces);
  expect(workspace.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: "Freeform chat" })).toBeNull();
  fireEvent.click(workspace);
  expect(screen.getByRole("button", { name: "Freeform chat" })).toBeTruthy();
});

it("collapses workspaces independently without navigating away from the active chat", () => {
  mocks.initialSessions = [
    { ...session, title: "Freeform chat" },
    {
      ...session,
      id: "repo-chat",
      title: "Workspace chat",
      workspaceId: "workspace",
      projectId: "repo",
    },
  ];
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Workspace chat" }));
  const workspace = screen.getByRole("button", { name: "repo" });
  const noWorkspace = screen.getByRole("button", { name: "No workspace" });
  expect(workspace.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(workspace);
  expect(workspace.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: "Workspace chat" })).toBeNull();
  expect(screen.getByRole("button", { name: "Freeform chat" })).toBeTruthy();
  expect(screen.getByLabelText("Active chat").textContent).toBe(
    "Workspace chat",
  );
  fireEvent.click(noWorkspace);
  expect(noWorkspace.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("button", { name: "Freeform chat" })).toBeNull();
  fireEvent.click(workspace);
  expect(screen.getByRole("button", { name: "Workspace chat" })).toBeTruthy();
  expect(noWorkspace.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(noWorkspace);
  expect(screen.getByRole("button", { name: "Freeform chat" })).toBeTruthy();
});

it.each([null, "repo"])(
  "deletes a sidebar chat in project %s without switching away from another chat",
  async (projectId) => {
    mocks.initialSessions = [
      { ...session, status: "working", projectId, workspaceId: projectId ? "workspace" : null },
      {
        ...session,
        id: "other-chat",
        title: "Another task",
        projectId,
        workspaceId: projectId ? "workspace" : null,
      },
    ];
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Another task" }));
    const chatRow = screen.getByRole("button", { name: `${session.title}, Working` });
    await selectSidebarAction(chatRow, "Archive conversation…");
    expect(
      screen.getByRole("dialog", { name: `Archive “${session.title}”?` }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Active chat").textContent).toBe(
      "Another task",
    );
    expect(mocks.call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep chat" }));
    expect(mocks.call).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await selectSidebarAction(chatRow, "Archive conversation…");
    fireEvent.click(
      await screen.findByRole("button", { name: "Archive and delete" }),
    );
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith("delete_session", {
      sessionId: session.id,
    });
    expect(screen.getByLabelText("Active chat").textContent).toBe(
      "Another task",
    );
  },
);

it.each([null, "workspace"])(
  "archives an inactive ordinary chat in workspace %s without checking Git or confirming",
  async (workspaceId) => {
    mocks.initialSessions = [{ ...session, workspaceId }];
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: session.title }));
    await selectSidebarAction(screen.getByRole("button", { name: session.title }), "Archive conversation…");
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.call).toHaveBeenCalledExactlyOnceWith("delete_session", { sessionId: session.id });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Active chat")).toBeNull();
  },
);

it.each(["working", "connecting", "needs_input"].flatMap((status) =>
  [null, "tree"].map((worktreeId) => ({ status, worktreeId })),
))(
  "requires confirmation for a $status agent with worktree $worktreeId",
  async ({ status, worktreeId }) => {
    mocks.initialSessions = [{ ...session, status, worktreeId }];
    render(<App />);
    await selectSidebarAction(screen.getByRole("button", { name: new RegExp(`^${session.title}`) }), "Archive conversation…");
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mocks.call).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Keep chat" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.call).not.toHaveBeenCalled();
  },
);

it.each([false, true])("checks a worktree's changes before archiving (dirty=%s)", async (dirty) => {
  mocks.initialSessions = [{ ...session, worktreeId: "tree" }, { ...session, id: "other", title: "Another task" }];
  mocks.call.mockImplementation((command) => Promise.resolve(command === "session_has_uncommitted_changes" ? dirty : undefined));
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Another task" }));
  const row = screen.getByRole("button", { name: session.title });
  await selectSidebarAction(row, "Archive conversation…");
  await waitFor(() => expect(mocks.call).toHaveBeenCalledWith("session_has_uncommitted_changes", { sessionId: session.id }));
  if (dirty) {
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mocks.call).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Keep chat" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mocks.call).toHaveBeenCalledTimes(1);
    await selectSidebarAction(row, "Archive conversation…");
    fireEvent.click(await screen.findByRole("button", { name: "Archive and delete" }));
  }
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(mocks.call).toHaveBeenCalledWith("delete_session", { sessionId: session.id });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByLabelText("Active chat").textContent).toBe("Another task");
});

it("keeps the chat and reports a failed worktree status check", async () => {
  mocks.initialSessions = [{ ...session, worktreeId: "tree" }];
  mocks.call.mockRejectedValue(new Error("Git status failed"));
  render(<App />);
  await selectSidebarAction(screen.getByRole("button", { name: session.title }), "Archive conversation…");
  await waitFor(() => expect(mocks.setError).toHaveBeenCalledWith("Error: Git status failed"));
  expect(mocks.call).toHaveBeenCalledExactlyOnceWith("session_has_uncommitted_changes", { sessionId: session.id });
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("ignores duplicate archive requests while checking Git and deleting", async () => {
  let finishCheck!: (dirty: boolean) => void;
  let finishDelete!: () => void;
  mocks.initialSessions = [{ ...session, worktreeId: "tree" }];
  mocks.call.mockImplementation((command) => command === "session_has_uncommitted_changes"
    ? new Promise<boolean>((resolve) => { finishCheck = resolve; })
    : new Promise<void>((resolve) => { finishDelete = resolve; }));
  render(<App />);
  const row = screen.getByRole("button", { name: session.title });
  await selectSidebarAction(row, "Archive conversation…");
  await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));
  await selectSidebarAction(row, "Archive conversation…");
  expect(mocks.call).toHaveBeenCalledTimes(1);
  finishCheck(false);
  await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(2));
  await selectSidebarAction(row, "Archive conversation…");
  expect(mocks.call).toHaveBeenCalledTimes(2);
  finishDelete();
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
});

it("preserves navigation made while the worktree status check is pending", async () => {
  let finishCheck!: (dirty: boolean) => void;
  mocks.initialSessions = [{ ...session, worktreeId: "tree" }, { ...session, id: "other", title: "Another task" }];
  mocks.call.mockImplementation((command) => command === "session_has_uncommitted_changes"
    ? new Promise<boolean>((resolve) => { finishCheck = resolve; })
    : Promise.resolve());
  render(<App />);
  const row = screen.getByRole("button", { name: session.title });
  fireEvent.click(row);
  await selectSidebarAction(row, "Archive conversation…");
  await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole("button", { name: "Another task" }));
  finishCheck(false);
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
  expect(screen.getByLabelText("Active chat").textContent).toBe("Another task");
});

it("creates and sends directly from Home once, using the selected model configuration", async () => {
  let finish!: (value: SessionRecord) => void;
  mocks.call.mockImplementation((command) =>
    command === "create_session"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(),
  );
  render(<App />);
  typePrompt();
  const send = screen.getByRole("button", { name: "Start task" });
  fireEvent.click(send);
  fireEvent.click(send);
  fireEvent.keyDown(
    screen.getByRole("textbox", { name: "Describe a new task" }),
    { key: "Enter", metaKey: true },
  );
  expect(mocks.call).toHaveBeenCalledTimes(1);
  expect(mocks.call).toHaveBeenCalledWith(
    "create_session",
    expect.objectContaining({
      workspaceId: null,
      newWorktree: false,
      providerId: "codex",
      initialConfig: {
        model: "chosen-model",
        effort: "high",
        mode: "read-only",
        collaboration_mode: "plan",
        "fast-mode": false,
      },
    }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  finish(session);
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith("send_prompt", {
      sessionId: "new-chat",
      text: "Inspect the handler",
    }),
  );
  expect(screen.getByLabelText("Active chat")).toBeTruthy();
});

it("selects a sidebar project without a modal and starts its worktree with the keyboard", async () => {
  mocks.call.mockResolvedValue(session);
  render(<App />);
  fireEvent.click(
    within(screen.getByRole("region", { name: "Projects" })).getByRole(
      "button",
      { name: "Harbor" },
    ),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Describe a new task" }),
  );
  typePrompt();
  fireEvent.keyDown(
    screen.getByRole("textbox", { name: "Describe a new task" }),
    { key: "Enter", ctrlKey: true },
  );
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith(
      "create_session",
      expect.objectContaining({
        workspaceId: "workspace",
        newWorktree: true,
        branch: expect.stringMatching(/^harbor\/task-/),
        base: "HEAD",
      }),
    ),
  );
});

it("lets another chat stay open while a new worktree starts in the background", async () => {
  mocks.initialSessions = [
    { ...session, id: "other-chat", title: "Another task" },
  ];
  let finish!: (value: SessionRecord) => void;
  mocks.call.mockImplementation((command) =>
    command === "create_session"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(),
  );
  render(<App />);
  fireEvent.click(
    within(screen.getByRole("region", { name: "Projects" })).getByRole(
      "button",
      { name: "Harbor" },
    ),
  );
  typePrompt();
  fireEvent.click(screen.getByRole("button", { name: "Start task" }));
  fireEvent.click(screen.getByRole("button", { name: "Another task" }));
  expect(screen.getByLabelText("Active chat").textContent).toBe("Another task");
  finish(session);
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith("send_prompt", {
      sessionId: session.id,
      text: "Inspect the handler",
    }),
  );
  expect(screen.getByLabelText("Active chat").textContent).toBe("Another task");
  // The completed task is still available in the sidebar.
  fireEvent.click(screen.getByRole("button", { name: session.title }));
  expect(screen.getByLabelText("Active chat").textContent).toBe(session.title);
});

it("keeps the home draft after creation fails so submission can be retried", async () => {
  mocks.call.mockRejectedValueOnce(new Error("Worktree failed"));
  render(<App />);
  typePrompt();
  fireEvent.click(screen.getByRole("button", { name: "Start task" }));
  await waitFor(() =>
    expect(mocks.setError).toHaveBeenCalledWith("Error: Worktree failed"),
  );
  expect(
    (
      screen.getByRole("textbox", {
        name: "Describe a new task",
      }) as HTMLDivElement
    ).textContent,
  ).toBe("Inspect the handler");
  expect(mocks.call).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByRole("button", { name: "Start task" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

it("opens an existing failed connection with its prompt preserved instead of sending", async () => {
  mocks.call.mockResolvedValue({
    ...session,
    status: "error",
    error: "Sign in required",
  });
  render(<App />);
  typePrompt();
  fireEvent.click(screen.getByRole("button", { name: "Start task" }));
  await waitFor(() =>
    expect(screen.getByLabelText("Active chat")).toBeTruthy(),
  );
  expect(
    (screen.getByRole("textbox", { name: "Chat draft" }) as HTMLTextAreaElement)
      .value,
  ).toBe("Inspect the handler");
  expect(mocks.call).toHaveBeenCalledTimes(1);
});

it("New task and its shortcut return to and focus the home composer", () => {
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.keyDown(window, { key: "n", metaKey: true });
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Describe a new task" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: /^New task⌘/ }));
  expect(document.activeElement).toBe(
    screen.getByRole("textbox", { name: "Describe a new task" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("selects the workspace of a newly created project in the composer", async () => {
  render(<App />);
  fireEvent.click(screen.getAllByRole("button", { name: "Create project" })[0]);
  fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
    target: { value: "Release" },
  });
  // Radix dropdown triggers open on pointerdown.
  const user = (await import("@testing-library/user-event")).default.setup();
  await user.click(screen.getByRole("button", { name: "Choose workspace" }));
  await user.click(screen.getByRole("menuitemradio", { name: /^repo/ }));
  mocks.call.mockImplementation(async (command) => {
    if (command === "save_project") {
      mocks.addedProject = {
        id: "new-project",
        name: "Release",
        workspaceId: "workspace",
        icon: "folder",
        color: "gray",
      };
      return mocks.addedProject;
    }
    if (command === "create_session") return session;
  });
  await user.click(
    within(screen.getByRole("dialog", { name: "Create project" })).getByRole(
      "button",
      { name: "Create project" },
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  typePrompt();
  fireEvent.click(screen.getByRole("button", { name: "Start task" }));
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith(
      "create_session",
      expect.objectContaining({ workspaceId: "workspace" }),
    ),
  );
});
it("uses an ordinary workspace without worktree controls", async () => {
  mocks.isGitRoot = false;
  mocks.call.mockResolvedValue(session);
  render(<App />);
  fireEvent.click(screen.getAllByRole("button", { name: "Harbor" })[0]);
  expect(
    screen.queryByRole("button", { name: "Working directory" }),
  ).toBeNull();
  expect(screen.queryByText("Branch settings")).toBeNull();
  typePrompt();
  fireEvent.click(screen.getByRole("button", { name: "Start task" }));
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith(
      "create_session",
      expect.objectContaining({ workspaceId: "workspace", newWorktree: false }),
    ),
  );
});
it("blocks launching a workspace with an unavailable folder", () => {
  mocks.available = false;
  render(<App />);
  fireEvent.click(screen.getAllByRole("button", { name: "Harbor" })[0]);
  typePrompt();
  expect(
    screen.getByRole("button", { name: "Start task" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByText(/This workspace folder is unavailable/)).toBeTruthy();
});

it("reorders projects, workspaces, workspace chats and pins independently and restores them", async () => {
  mocks.extraProjects = [
    {
      id: "second",
      name: "Second project",
      workspaceId: "workspace",
      icon: "folder",
      color: "gray",
    },
  ];
  mocks.initialSessions = [
    session,
    { ...session, id: "second-chat", title: "Second chat" },
  ];
  localStorage.setItem(
    PINNED_CHATS_KEY,
    JSON.stringify([session.id, "second-chat"]),
  );
  const { unmount } = render(<App />);
  const group = (name: string) => screen.getByRole("region", { name });
  const ids = (name: string) =>
    [...group(name).querySelectorAll<HTMLElement>("[data-reorder-id]")].map(
      (row) => row.dataset.reorderId,
    );

  await selectSidebarAction(
    within(group("Projects")).getByRole("button", { name: "Second project" }),
    "Move up",
  );
  expect(ids("Projects")).toEqual(["second", "repo"]);
  expect(screen.queryByLabelText("Active chat")).toBeNull();
  await selectSidebarAction(
    within(group("Workspaces")).getByRole("button", { name: "repo" }),
    "Move up",
  );
  expect(ids("Workspaces").slice(0, 2)).toEqual(["workspace", NO_WORKSPACE_ID]);
  expect(
    screen.getByRole("button", { name: "repo" }).getAttribute("aria-expanded"),
  ).toBe("true");

  const secondChat = within(group("Workspaces")).getByRole("button", {
    name: "Second chat",
  });
  secondChat.focus();
  fireEvent.keyDown(secondChat, { key: "ArrowUp", altKey: true });
  expect(ids("Workspaces").slice(2)).toEqual(["second-chat", session.id]);
  expect(document.activeElement).toBe(secondChat);
  expect(ids("Pinned")).toEqual([session.id, "second-chat"]);
  await selectSidebarAction(
    within(group("Pinned")).getByRole("button", { name: session.title }),
    "Move down",
  );
  expect(ids("Pinned")).toEqual(["second-chat", session.id]);
  expect(
    within(document.getElementById("harbor-sidebar")!).getByRole("status")
      .textContent,
  ).toContain("position 2 of 2");
  expect(mocks.call).not.toHaveBeenCalled();

  unmount();
  render(<App />);
  expect(ids("Projects")).toEqual(["second", "repo"]);
  expect(ids("Workspaces")).toEqual([
    "workspace",
    NO_WORKSPACE_ID,
    "second-chat",
    session.id,
  ]);
  expect(ids("Pinned")).toEqual(["second-chat", session.id]);
});

it("drags a chat without navigating, rejects another group and cancels with Escape", () => {
  mocks.initialSessions = [
    session,
    { ...session, id: "second-chat", title: "Second chat" },
  ];
  render(<App />);
  const row = screen.getByRole("button", { name: session.title });
  const target = screen.getByRole("button", { name: "Second chat" });
  const elementFromPoint = vi.fn().mockReturnValue(target);
  vi.stubGlobal("PointerEvent", MouseEvent);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: elementFromPoint,
  });
  const ids = () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-reorder-group="chats:__no_workspace__"]',
      ),
    ].map((row) => row.dataset.reorderId);
  fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(window, { clientX: 10, clientY: 30 });
  expect(target.getAttribute("data-reorder-drop")).toBe("after");
  fireEvent.keyDown(window, { key: "Escape" });
  const now = Date.now();
  const clock = vi.spyOn(Date, "now").mockReturnValue(now + 1000);
  fireEvent.pointerUp(window);
  fireEvent.click(row, { detail: 1 });
  expect(screen.queryByLabelText("Active chat")).toBeNull();
  clock.mockRestore();
  expect(ids()).toEqual([session.id, "second-chat"]);
  expect(target.hasAttribute("data-reorder-drop")).toBe(false);

  elementFromPoint.mockReturnValue(
    screen.getByRole("button", { name: "repo" }),
  );
  fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(window, { clientX: 10, clientY: 30 });
  fireEvent.pointerUp(window);
  expect(ids()).toEqual([session.id, "second-chat"]);

  elementFromPoint.mockReturnValue(target);
  fireEvent.pointerDown(row, { button: 0, clientX: 10, clientY: 10 });
  fireEvent.pointerMove(window, { clientX: 10, clientY: 30 });
  fireEvent.pointerUp(window);
  fireEvent.click(row, { detail: 1 });
  expect(ids()).toEqual(["second-chat", session.id]);
  expect(screen.queryByLabelText("Active chat")).toBeNull();
  vi.unstubAllGlobals();
});

it("marks working chats with a spinner and chats that need you with an attention dot", () => {
  mocks.initialSessions = [
    {
      ...session,
      id: "busy",
      title: "Running task",
      status: "working",
      workspaceId: "workspace",
    },
    {
      ...session,
      id: "ask",
      title: "Waiting on you",
      status: "needs_input",
    },
    {
      ...session,
      id: "broken",
      title: "Failed task",
      status: "error",
    },
    session,
  ];
  render(<App />);
  const running = screen.getByRole("button", { name: /Running task,\s*Working/ });
  expect(running.getAttribute("aria-busy")).toBe("true");
  expect(running.getAttribute("title")).toBe("Working");
  expect(
    running.querySelector('[data-sidebar="menu-status"][data-state="loading"]'),
  ).toBeTruthy();
  expect(running.querySelector('[data-icon="LoaderCircle"]')).toBeTruthy();

  const waiting = screen.getByRole("button", {
    name: /Waiting on you,\s*Needs you/,
  });
  expect(waiting.getAttribute("aria-busy")).toBeNull();
  expect(waiting.getAttribute("title")).toBe("Needs you");
  expect(
    waiting.querySelector(
      '[data-sidebar="menu-status"][data-state="attention"][data-tone="warning"]',
    ),
  ).toBeTruthy();

  const failed = screen.getByRole("button", {
    name: /Failed task,\s*Interrupted/,
  });
  expect(failed.getAttribute("title")).toBe("Interrupted");
  expect(
    failed.querySelector('[data-state="attention"][data-tone="danger"]'),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: session.title })
      .querySelector('[data-sidebar="menu-status"]'),
  ).toBeNull();
  expect(document.querySelector(".notification-count")?.textContent).toBe("2");

  fireEvent.click(screen.getByRole("button", { name: "repo" }));
  const collapsed = screen.getByRole("button", { name: /repo,\s*Working/ });
  expect(collapsed.getAttribute("aria-expanded")).toBe("false");
  expect(collapsed.getAttribute("title")).toBe("/repo · Working");
  expect(
    collapsed.querySelector('[data-state="loading"]'),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Running task/ })).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "No workspace" }));
  expect(
    screen.getByRole("button", { name: /No workspace,\s*2 need attention/ }),
  ).toBeTruthy();
});

it("starts tasks directly in a workspace with no project", async () => {
  mocks.extraWorkspaces = [
    {
      id: "standalone",
      name: "Standalone",
      path: "/standalone",
      lastUsedAt: 0,
      available: true,
      isGitRoot: true,
    },
  ];
  mocks.call.mockResolvedValue({ ...session, workspaceId: "standalone" });
  render(<App />);
  expect(
    screen.getByRole("button", { name: "Workspace for new task" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("combobox", { name: "Project for new task" }),
  ).toBeNull();
  await selectSidebarAction(
    screen.getByRole("button", { name: "Standalone" }),
    "New task",
  );
  typePrompt();
  fireEvent.click(screen.getByRole("button", { name: "Start task" }));
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith(
      "create_session",
      expect.objectContaining({ workspaceId: "standalone", newWorktree: true }),
    ),
  );
  const args = mocks.call.mock.calls.find(
    ([command]) => command === "create_session",
  )![1];
  expect(args).not.toHaveProperty("projectId");
  expect(
    within(screen.getByRole("list", { name: "Chats in Standalone" })).getByRole(
      "button",
      { name: session.title },
    ),
  ).toBeTruthy();
});

it("adds a workspace folder directly and selects it for a new task", async () => {
  const workspace: Workspace = {
    id: "added",
    name: "Notes",
    path: "/notes",
    lastUsedAt: 0,
    available: true,
    isGitRoot: false,
  };
  mocks.openFolder.mockResolvedValue("/notes");
  mocks.call.mockImplementation(async (command) => {
    if (command === "save_workspace") {
      mocks.addedWorkspace = workspace;
      return workspace;
    }
    if (command === "create_session")
      return { ...session, workspaceId: "added" };
  });
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Add workspace" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Workspace for new task",
      }).textContent,
    ).toContain("Notes"),
  );
  expect(mocks.call).toHaveBeenCalledWith("save_workspace", { path: "/notes" });
  expect(
    mocks.call.mock.calls.some(([command]) => command === "save_project"),
  ).toBe(false);
  expect(
    screen.queryByRole("button", { name: "Working directory" }),
  ).toBeNull();
  typePrompt();
  fireEvent.click(screen.getByRole("button", { name: "Start task" }));
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith(
      "create_session",
      expect.objectContaining({ workspaceId: "added", newWorktree: false }),
    ),
  );
});

it("keeps the selected workspace when folder selection is cancelled", async () => {
  render(<App />);
  await selectSidebarAction(
    screen.getByRole("button", { name: "repo" }),
    "New task",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add workspace" }));
  await waitFor(() => expect(mocks.openFolder).toHaveBeenCalled());
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Add workspace" })
        .getAttribute("aria-disabled"),
    ).toBe("false"),
  );
  expect(
    screen.getByRole("button", {
      name: "Workspace for new task",
    }).textContent,
  ).toContain("repo");
  expect(mocks.call).not.toHaveBeenCalled();
});
