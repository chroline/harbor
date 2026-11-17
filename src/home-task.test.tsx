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
  addedSession: null as SessionRecord | null,
  addedProject: null as Project | null,
  isGitRoot: true,
  available: true,
  projectActiveId: null as string | null,
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
  Chat: ({ session, projectChild }: { session: SessionRecord; projectChild?: string | null }) => (
    <div aria-label="Active chat">
      {session.title}
      {projectChild && <span data-testid="selected-project-worker">{projectChild}</span>}
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
        activeOrchestratorSessionId: mocks.projectActiveId,
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
        if(mocks.addedSession) setSessions(items=>[...items.filter(s=>s.id!==mocks.addedSession!.id),mocks.addedSession!]);
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
  localStorage.removeItem("harbor.last-view");
  localStorage.removeItem("harbor.worker-sidebar.v1");
  localStorage.removeItem(SIDEBAR_ORDER_KEY);
  mocks.call.mockResolvedValue(undefined);
  mocks.initialSessions = [];
  mocks.addedSession = null;
  mocks.addedProject = null;
  mocks.addedWorkspace = null;
  mocks.openFolder.mockResolvedValue(null);
  mocks.isGitRoot = true;
  mocks.available = true;
  mocks.projectActiveId = null;
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
      activeOrchestratorSessionId: null,
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
  await waitFor(() => expect(screen.getByLabelText("Active chat")).toBeTruthy());
  expect(mocks.call).toHaveBeenCalledWith("open_project_orchestrator", { projectId: "release" });
  expect(mocks.call.mock.calls.some(([command]) => command === "create_session")).toBe(false);
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
      activeOrchestratorSessionId: null,
      icon: "folder",
      color: "gray",
    },
    {
      id: "moved",
      name: "Moved project",
      workspaceId: "workspace",
      activeOrchestratorSessionId: null,
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

it("starts a project's agent immediately and reopens its existing conversation", async () => {
  const orchestrator = { ...session, title: "Harbor", isOrchestrator: true, projectId: "repo", workspaceId: "workspace" };
  let opened = false;
  mocks.call.mockImplementation(async (command) => {
    if (command === "open_project_orchestrator") return opened ? orchestrator : null;
    if (command === "start_project") { opened = true; return orchestrator; }
  });
  render(<App />);
  const row = within(screen.getByRole("region", { name: "Projects" })).getByRole("button", { name: "Harbor" });
  fireEvent.click(row);
  await screen.findByLabelText("Active chat");
  expect(mocks.call).toHaveBeenCalledWith("start_project", expect.objectContaining({ projectId: "repo", providerId: "codex", fresh: false }));
  expect(mocks.call.mock.calls.some(([command]) => command === "send_prompt" || command === "create_session")).toBe(false);
  expect(screen.queryByRole("textbox", { name: "Describe a new task" })).toBeNull();
  fireEvent.click(row);
  await waitFor(() => expect(mocks.call.mock.calls.filter(([command]) => command === "open_project_orchestrator")).toHaveLength(2));
  expect(mocks.call.mock.calls.filter(([command]) => command === "start_project")).toHaveLength(1);
});

it("keeps startup navigation when the same project is clicked twice", async () => {
  let finish!: (session: SessionRecord) => void;
  mocks.call.mockImplementation((command) => command === "start_project" ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(null));
  render(<App />);
  const row = within(screen.getByRole("region", { name: "Projects" })).getByRole("button", { name: "Harbor" });
  fireEvent.click(row);
  await waitFor(() =>
    expect(
      screen.getAllByRole("status").some((status) => status.textContent?.includes("Starting Harbor")),
    ).toBe(true),
  );
  fireEvent.click(row);
  finish({ ...session, isOrchestrator: true, projectId: "repo", title: "Harbor" });
  await screen.findByLabelText("Active chat");
  expect(mocks.call.mock.calls.filter(([command]) => command === "start_project")).toHaveLength(1);
});

it("surfaces startup errors without leaving a blocked project composer", async () => {
  mocks.call.mockImplementation(async (command) => {
    if (command === "open_project_orchestrator") return null;
    if (command === "start_project") throw new Error("Native continuation is unverified");
  });
  render(<App />);
  fireEvent.click(within(screen.getByRole("region", { name: "Projects" })).getByRole("button", { name: "Harbor" }));
  await waitFor(() => expect(mocks.setError).toHaveBeenCalledWith("Error: Native continuation is unverified"));
  expect(screen.queryAllByText(/Starting Harbor/)).toHaveLength(0);
  typePrompt();
  expect(screen.getByRole("button", { name: "Start task" }).hasAttribute("disabled")).toBe(false);
});

it("starts fresh immediately and retains the old chat when startup fails", async () => {
  const orchestrator = { ...session, isOrchestrator: true, projectId: "repo", workspaceId: "workspace" };
  mocks.initialSessions = [orchestrator];
  mocks.call.mockImplementation(async (command) => {
    if (command === "open_project_orchestrator") return orchestrator;
    if (command === "start_project") throw new Error("Connection failed");
  });
  render(<App />);
  await selectSidebarAction(within(screen.getByRole("region", { name: "Projects" })).getByRole("button", { name: "Harbor" }), "Start fresh conversation");
  await waitFor(() => expect(mocks.call).toHaveBeenCalledWith("start_project", expect.objectContaining({ fresh: true, expectedSessionId: session.id })));
  await waitFor(() => expect(mocks.setError).toHaveBeenCalledWith("Error: Connection failed"));
  await selectSidebarAction(within(screen.getByRole("region", { name: "Projects" })).getByRole("button", { name: "Harbor" }), "Conversation history…");
  const history = within(await screen.findByRole("dialog", { name: "Project conversation history" }));
  expect(history.getByRole("option", { name: new RegExp(session.title) })).toBeTruthy();
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

it("starts a newly created project using its saved instructions", async () => {
  render(<App />);
  fireEvent.click(screen.getAllByRole("button", { name: "Create project" })[0]);
  fireEvent.change(screen.getByRole("textbox", { name: "Project name" }), {
    target: { value: "Release" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Project instructions" }), { target: { value: "Oversee the release process" } });
  // Radix dropdown triggers open on pointerdown.
  const user = (await import("@testing-library/user-event")).default.setup();
  await user.click(screen.getByRole("button", { name: "Choose workspace" }));
  await user.click(screen.getByRole("menuitemradio", { name: /^repo/ }));
  mocks.call.mockImplementation(async (command) => {
    if (command === "save_project") {
      mocks.addedProject = {
        id: "new-project",
        name: "Release",
        instructions: "Oversee the release process",
        workspaceId: "workspace",
        activeOrchestratorSessionId: null,
        icon: "folder",
        color: "gray",
      };
      return mocks.addedProject;
    }
    if (command === "open_project_orchestrator") return null;
    if (command === "project_provider_support") return { verified: true, reason: "Verified" };
    if (command === "start_project") return { ...session, isOrchestrator: true, projectId: "new-project" };
  });
  await user.click(
    within(screen.getByRole("dialog", { name: "Create project" })).getByRole(
      "button",
      { name: "Create project" },
    ),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.call).toHaveBeenCalledWith("save_project", expect.objectContaining({ instructions: "Oversee the release process" }));
  await waitFor(() =>
    expect(mocks.call).toHaveBeenCalledWith(
      "start_project",
      expect.objectContaining({ projectId: "new-project" }),
    ),
  );
});
it("uses an ordinary workspace without worktree controls", async () => {
  mocks.isGitRoot = false;
  mocks.call.mockResolvedValue(session);
  render(<App />);
  await selectSidebarAction(within(screen.getByRole("region", { name: "Workspaces" })).getByRole("button", { name: "repo" }), "New task");
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
it("blocks launching a workspace with an unavailable folder", async () => {
  mocks.available = false;
  render(<App />);
  await selectSidebarAction(within(screen.getByRole("region", { name: "Workspaces" })).getByRole("button", { name: "repo" }), "New task");
  typePrompt();
  expect(
    screen.getByRole("button", { name: "Start task" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByText(/This workspace folder is unavailable/)).toBeTruthy();
});

it("lists projects and workspace chats newest first without manual reordering", () => {
  mocks.extraProjects = [
    {
      id: "second",
      name: "Second project",
      workspaceId: "workspace",
      activeOrchestratorSessionId: null,
      icon: "folder",
      color: "gray",
    },
  ];
  mocks.initialSessions = [
    { ...session, updatedAt: 1000 },
    { ...session, id: "second-chat", title: "Second chat", updatedAt: 2000 },
    {
      ...session,
      id: "second-root",
      title: "Second project conversation",
      isOrchestrator: true,
      projectId: "second",
      updatedAt: 3000,
    },
  ];
  render(<App />);
  const group = (name: string) => screen.getByRole("region", { name });
  const before = (first: HTMLElement, second: HTMLElement) =>
    !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
  const projects = within(group("Projects"));
  expect(
    before(
      projects.getByRole("button", { name: "Second project" }),
      projects.getByRole("button", { name: "Harbor" }),
    ),
  ).toBe(true);
  const workspaces = within(group("Workspaces"));
  expect(
    before(
      workspaces.getByRole("button", { name: "Second chat" }),
      workspaces.getByRole("button", { name: session.title }),
    ),
  ).toBe(true);
  expect(group("Projects").querySelector("[data-reorder-id]")).toBeNull();
  expect(
    document.querySelector('[data-reorder-group^="chats:"]'),
  ).toBeNull();
});

it("drags a pinned chat without navigating, rejects another group and cancels with Escape", () => {
  mocks.initialSessions = [
    session,
    { ...session, id: "second-chat", title: "Second chat" },
  ];
  localStorage.setItem(
    PINNED_CHATS_KEY,
    JSON.stringify([session.id, "second-chat"]),
  );
  render(<App />);
  const pinned = within(screen.getByRole("region", { name: "Pinned" }));
  const row = pinned.getByRole("button", { name: session.title });
  const target = pinned.getByRole("button", { name: "Second chat" });
  const elementFromPoint = vi.fn().mockReturnValue(target);
  vi.stubGlobal("PointerEvent", MouseEvent);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: elementFromPoint,
  });
  const ids = () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        '[data-reorder-group="pinned"]',
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

it("marks working chats with the thinking indicator and chats that need you with an attention dot", () => {
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
  expect(running.querySelector('[data-slot="thinking-indicator-glyph"]')).toBeTruthy();

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
  expect(screen.queryByRole("button", { name: /^Running task/ })).toBeNull();

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

it("nests ordinary project agent sessions and opens the standard chat", async () => {
  const root={...session,id:"project-chat",title:"Project orchestrator",isOrchestrator:true,projectId:"repo",workspaceId:"workspace"};
  const child={...session,id:"worker-a",title:"Billing implementation",parentSessionId:root.id,isOrchestrator:false,projectId:"repo",workspaceId:"workspace",status:"working"};
  mocks.initialSessions=[root,child,{...session,id:"ordinary",title:"Ordinary workspace chat",workspaceId:"workspace"}];mocks.projectActiveId=root.id;mocks.call.mockResolvedValue(root);
  render(<App />);
  const projects=within(screen.getByRole("region",{name:"Projects"}));const workspaces=within(screen.getByRole("region",{name:"Workspaces"}));
  expect(workspaces.queryByRole("button",{name:child.title})).toBeNull();expect(workspaces.queryByRole("button",{name:root.title})).toBeNull();expect(workspaces.getByRole("button",{name:"Ordinary workspace chat"})).toBeTruthy();
  fireEvent.click(projects.getByRole("button",{name:/Billing implementation/}));
  expect(await screen.findByLabelText("Active chat")).toHaveProperty("textContent",child.title);
  expect(document.title).toBe("Billing implementation — Harbor");expect(screen.queryByTestId("selected-project-worker")).toBeNull();
  fireEvent.click(projects.getByRole("button",{name:"Harbor"}));await waitFor(()=>expect(screen.getByLabelText("Active chat").textContent).toBe(root.title));
  fireEvent.click(screen.getByRole("button",{name:/Back ·/}));await waitFor(()=>expect(screen.getByLabelText("Active chat").textContent).toBe(child.title));
});

it("keeps previous orchestrators in project history instead of rendering them as agents", async () => {
  const old = { ...session, id: "old-project-chat", title: "Previous project conversation", isOrchestrator: true, projectId: "repo", workspaceId: "workspace" };
  mocks.initialSessions = [old];
  render(<App />);
  const projects = within(screen.getByRole("region", { name: "Projects" }));
  expect(projects.queryByRole("button", { name: old.title })).toBeNull();
  expect(within(screen.getByRole("region", { name: "Workspaces" })).queryByRole("button", { name: old.title })).toBeNull();
  await selectSidebarAction(projects.getByRole("button", { name: "Harbor" }), "Conversation history…");
  const history = within(await screen.findByRole("dialog", { name: "Project conversation history" }));
  fireEvent.click(history.getByRole("option", { name: new RegExp(old.title) }));
  await waitFor(() => expect(screen.getByLabelText("Active chat").textContent).toBe(old.title));
  expect(mocks.call).not.toHaveBeenCalledWith("start_project", expect.anything());
});

it("shows only actual agents beneath the active project after starting fresh", () => {
  const current = { ...session, id: "current-root", title: "Harbor", isOrchestrator: true, projectId: "repo", workspaceId: "workspace" };
  const previous = { ...current, id: "previous-root" };
  const child = { ...current, id: "actual-agent", title: "Implementation", isOrchestrator: false, parentSessionId: current.id };
  mocks.initialSessions = [current, previous, child];
  mocks.projectActiveId = current.id;
  render(<App />);
  const projects = within(screen.getByRole("region", { name: "Projects" }));
  expect(projects.getAllByRole("button", { name: "Harbor" })).toHaveLength(1);
  expect(within(projects.getByRole("list", { name: "Agents in Harbor" })).getByRole("button", { name: child.title })).toBeTruthy();
  expect(projects.queryByRole("list", { name: "History in Harbor" })).toBeNull();
});

it("confirms project deletion from its right-click menu and can cancel", async () => {
  mocks.call.mockImplementation(async (command) => command === "project_deletion_summary" ? { conversations: 3, agents: 2, worktrees: ["/repo/trees/billing"], preservedWorktrees: [] } : undefined);
  render(<App />);
  const projects = within(screen.getByRole("region", { name: "Projects" }));
  await selectSidebarAction(projects.getByRole("button", { name: "Harbor" }), "Delete project…");
  const dialog = within(await screen.findByRole("dialog", { name: "Delete “Harbor”?" }));
  expect(dialog.queryByText(/Permanently delete/)).toBeNull();
  expect(dialog.queryByText("/repo/trees/billing")).toBeNull();
  expect(mocks.call).not.toHaveBeenCalledWith("delete_project", expect.anything());
  fireEvent.click(dialog.getByRole("button", { name: "Keep project" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.call).not.toHaveBeenCalledWith("delete_project", expect.anything());
});

it("deletes only the selected project and keeps a failed deletion retryable", async () => {
  let attempts = 0;
  mocks.call.mockImplementation(async (command) => {
    if (command === "project_deletion_summary") return { conversations: 1, agents: 1, worktrees: [], preservedWorktrees: [] };
    if (command === "delete_project" && ++attempts === 1) throw new Error("Worktree changed; retry");
  });
  render(<App />);
  const projects = within(screen.getByRole("region", { name: "Projects" }));
  await selectSidebarAction(projects.getByRole("button", { name: "Harbor" }), "Delete project…");
  const dialog = within(await screen.findByRole("dialog", { name: "Delete “Harbor”?" }));
  fireEvent.click(dialog.getByRole("button", { name: "Delete project" }));
  await waitFor(() => expect(mocks.setError).toHaveBeenCalledWith(expect.stringContaining("Worktree changed")));
  expect(screen.getByRole("dialog")).toBeTruthy();
  await waitFor(() => expect(dialog.getByRole("button", { name: "Delete project" }).hasAttribute("disabled")).toBe(false));
  fireEvent.click(dialog.getByRole("button", { name: "Delete project" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mocks.call.mock.calls.filter(([c]) => c === "delete_project")).toEqual([["delete_project", { projectId: "repo" }], ["delete_project", { projectId: "repo" }]]);
});

it("shows pending questions on the ordinary child session", () => {
  const root={...session,id:"question-root",isOrchestrator:true,projectId:"repo",status:"idle"};
  const child={...session,id:"question-child",title:"Question worker",parentSessionId:root.id,isOrchestrator:false,projectId:"repo",status:"needs_input"};
  mocks.initialSessions=[root,child];mocks.projectActiveId=root.id;const view=render(<App />);
  const row=()=>within(screen.getByRole("region",{name:"Projects"})).getByRole("button",{name:/Question worker/});
  expect(row().querySelector('[data-state="attention"]')).not.toBeNull();child.status="completed";view.rerender(<App />);expect(row().querySelector('[data-state="attention"]')).toBeNull();
});
it("uses ordinary conversation menus for project children and keeps pins nested", async () => {
  const root={...session,id:"worker-menu-root",isOrchestrator:true,projectId:"repo",workspaceId:"workspace"};
  const children=["First worker","Second worker"].map((title,index)=>({...session,id:`worker-${index}`,title,parentSessionId:root.id,isOrchestrator:false,projectId:"repo",status:"completed"}));
  mocks.initialSessions=[root,...children];mocks.projectActiveId=root.id;
  mocks.call.mockImplementation(async(command,args)=>{if(command==="delete_session"||command==="restore_chat"){const child=children.find(c=>c.id===args.sessionId)!;child.archived=command==="delete_session";mocks.addedSession=child;}});
  render(<App />);const agents=()=>screen.getByRole("list",{name:"Agents in Harbor"});const row=(name:string)=>within(agents()).getByRole("button",{name});
  await selectSidebarAction(row("First worker"),"Pin conversation");expect(screen.queryByRole("region",{name:"Pinned"})).toBeNull();
  await selectSidebarAction(row("First worker"),"Unpin conversation");
  await selectSidebarAction(row("First worker"),"Archive conversation…");await waitFor(()=>expect(within(agents()).queryByRole("button",{name:"First worker"})).toBeNull());
  expect(mocks.call).toHaveBeenCalledWith("delete_session",{sessionId:"worker-0"});expect(mocks.call.mock.calls.some(([c])=>c==="cancel_turn")).toBe(false);
  await selectSidebarAction(within(screen.getByRole("region",{name:"Projects"})).getByRole("button",{name:"Harbor"}),"Restore archived agents");await waitFor(()=>expect(row("First worker")).toBeTruthy());
});
it("uses the standard archive confirmation for a working project chat", async () => {
  const root={...session,id:"busy-menu-root",isOrchestrator:true,projectId:"repo"};const child={...session,id:"busy-child",title:"Busy worker",parentSessionId:root.id,isOrchestrator:false,projectId:"repo",status:"working"};
  mocks.initialSessions=[root,child];mocks.projectActiveId=root.id;render(<App />);
  await selectSidebarAction(screen.getByRole("button",{name:/Busy worker/}),"Archive conversation…");expect(await screen.findByRole("dialog",{name:"Archive “Busy worker”?"})).toBeTruthy();expect(mocks.call.mock.calls.some(([c])=>c==="cancel_turn"||c==="delete_session")).toBe(false);
});

it("lists a shared workspace once regardless of its associated projects", () => {
  mocks.extraProjects = [{
    id: "release", name: "Release", workspaceId: "workspace", icon: "code", color: "blue",
    activeOrchestratorSessionId: null,
  }];
  render(<App />);
  const workspaces = within(screen.getByRole("region", { name: "Workspaces" }));
  expect(workspaces.getAllByRole("button", { name: "repo" })).toHaveLength(1);
  expect(workspaces.getByRole("button", { name: "repo" }).getAttribute("title")).toContain("/repo");
  expect(workspaces.queryByRole("button", { name: "Harbor" })).toBeNull();
  expect(workspaces.queryByRole("button", { name: "Release" })).toBeNull();
});

it("selects a workspace from an active chat and focuses its new-task composer", async () => {
  mocks.initialSessions = [session];
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: session.title }));
  expect(screen.getByLabelText("Active chat")).toBeTruthy();
  await selectSidebarAction(screen.getByRole("button", { name: "repo" }), "New task");
  expect(screen.queryByLabelText("Active chat")).toBeNull();
  expect(screen.getByRole("button", { name: "Workspace for new task" }).textContent).toContain("repo");
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Describe a new task" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mocks.call).not.toHaveBeenCalled();
});

it("collapses sidebar sections independently and retains nested workspace state", () => {
  mocks.initialSessions = [{ ...session, title: "Freeform chat" }];
  localStorage.setItem(PINNED_CHATS_KEY, JSON.stringify([session.id]));
  render(<App />);
  const chats = within(screen.getByRole("list", { name: "Chats in No workspace" }));
  fireEvent.click(chats.getByRole("button", { name: "Freeform chat" }));
  const workspace = screen.getByRole("button", { name: "No workspace" });
  fireEvent.click(workspace);
  const pinned = screen.getByRole("button", { name: "Pinned" });
  const workspaces = screen.getByRole("button", { name: "Workspaces" });
  const pinnedRows = within(screen.getByRole("region", { name: "Pinned" }));
  fireEvent.click(pinned);
  expect(pinned.getAttribute("aria-expanded")).toBe("false");
  expect(pinnedRows.queryByRole("button", { name: "Freeform chat" })).toBeNull();
  fireEvent.click(workspaces);
  expect(screen.queryByRole("button", { name: "No workspace" })).toBeNull();
  expect(workspace.closest("[inert]")).toBeTruthy();
  expect(screen.getByLabelText("Active chat").textContent).toBe("Freeform chat");
  fireEvent.click(pinned);
  expect(pinnedRows.getByRole("button", { name: "Freeform chat" })).toBeTruthy();
  expect(workspaces.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(workspaces);
  expect(workspace.getAttribute("aria-expanded")).toBe("false");
  expect(chats.queryByRole("button", { name: "Freeform chat" })).toBeNull();
  fireEvent.click(workspace);
  expect(chats.getByRole("button", { name: "Freeform chat" })).toBeTruthy();
});

it("opens only one workspace folder picker while selection is pending", async () => {
  let finish!: (value: string | null) => void;
  mocks.openFolder.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  render(<App />);
  const add = screen.getByRole("button", { name: "Add workspace" });
  fireEvent.click(add);
  expect(add.getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(add);
  expect(mocks.openFolder).toHaveBeenCalledTimes(1);
  finish(null);
  await waitFor(() => expect(add.getAttribute("aria-disabled")).toBe("false"));
  expect(mocks.call).not.toHaveBeenCalled();
});

it("selects a sidebar workspace without a modal and starts its worktree with the keyboard", async () => {
  mocks.call.mockResolvedValue(session);
  render(<App />);
  await selectSidebarAction(
    within(screen.getByRole("region", { name: "Workspaces" })).getByRole("button", { name: "repo" }),
    "New task",
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

it("reorders workspaces and pins independently and restores them", async () => {
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

  expect(screen.queryByLabelText("Active chat")).toBeNull();
  await selectSidebarAction(
    within(group("Workspaces")).getByRole("button", { name: "repo" }),
    "Move up",
  );
  expect(ids("Workspaces").slice(0, 2)).toEqual(["workspace", NO_WORKSPACE_ID]);
  expect(
    screen.getByRole("button", { name: "repo" }).getAttribute("aria-expanded"),
  ).toBe("true");

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
  expect(ids("Workspaces")).toEqual(["workspace", NO_WORKSPACE_ID]);
  expect(ids("Pinned")).toEqual(["second-chat", session.id]);
});
