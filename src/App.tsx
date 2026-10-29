import { ThinkingIndicatorGlyph } from "./components/ui/thinking-indicator";
import { Tooltip } from "./components/ui/tooltip";
import { supportedProviderId, defaultProvider } from "./lib/providers";
import {
  prepareAttachments,
  restoreDraftFiles,
  setDraftFiles,
  useDraftFiles,
} from "./lib/attachments";
import { normalizeCommandAliases } from "./lib/commands";
import { pixelsToRem, rem } from "@/lib/units";
import { MenuItem } from "./components/ui/menu-item";
import {
  SidebarProvider,
  Sidebar,
  SidebarTrigger,
  SidebarGroupAction,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "./components/ui/sidebar";
import {
  CommandMenuDialog,
  CommandMenu,
  CommandMenuInput,
  CommandMenuList,
  CommandMenuEmpty,
} from "./components/ui/command-menu";
import { discoveryMode } from "./components/ModePicker";
import { TaskComposer } from "./components/TaskComposer";
import { HomeScene, SkylineScene } from "./components/SkylineBackground";
import { skylineCity } from "./lib/skyline-city";
import { skylineTimeOfDay } from "./lib/skyline-period";
import { WorkspacePicker } from "./components/WorkspacePicker";
import { WorktreePicker } from "./components/WorktreePicker";
import { AppNotifications } from "./components/AppNotifications";
import {
  DropdownMenu,
  DropdownTrigger,
  DropdownContent,
  DropdownLabel,
} from "./components/ui/dropdown";
import {
  useEffect,
  useState,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Settings2,
  Plus,
  SquarePen,
  Search,
  FolderOpen,
  Folder,
  CheckCheck,
  Command,
  X,
  Bell,
  Archive,
  Pin,
  PinOff,
} from "@/lib/icons";
import { Button } from "./components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./components/ui/dialog";
import {
  ProviderIcon,
  Status,
  IconButton,
  providerGlyph,
} from "./components/shared";
import { DiscoveryModelMenu } from "./components/ModelMenu";
import { ProviderConnectionButton } from "./components/ProviderConnectionButton";
import { useCommandCatalog } from "./lib/command-catalog";
import { useProviderConfig } from "./lib/provider-config";
import { Chat } from "./components/Chat";
import { Settings } from "./components/Settings";
import { Worktrees } from "./components/Worktrees";
import { useStore } from "./lib/store";
import { call, desktop, json } from "./lib/api";
import {
  record,
  str,
  sessionNeedsAttention,
  summarizeSessionMarks,
} from "./lib/protocol";
import type { SessionRecord } from "./lib/bindings/SessionRecord";
import {
  restoreHistory,
  pruneHistory,
  travel,
  visit,
  type View,
} from "./lib/navigation";
import { useShellLayout, WINDOW_GUTTER } from "./lib/shell-layout";
import { NO_WORKSPACE_ID, useSidebarOrder } from "./lib/sidebar-order";
import { usePinnedChats } from "./lib/pinned-chats";
import { useUnseenTurns } from "./lib/unseen-turns";
import { transitionPage } from "./lib/page-transition";
import { SidebarKeyboardShortcut } from "./components/SidebarKeyboardShortcut";
import {
  ChromeSidebarDivider,
  ChromeSidebarTrack,
} from "./components/ChromeSidebarTrack";
import { TopbarHistory } from "./components/TopbarHistory";
import { SidebarRowMenu } from "./components/SidebarRowMenu";
import { open as openFolder } from "@tauri-apps/plugin-dialog";
import type { Workspace } from "./lib/bindings/Workspace";
export default function App() {
  const { data, ready, refresh, error, setError, updateSession } = useStore();
  const [history, setHistory] = useState(restoreHistory);
  const view = history.entries[history.index];
  const {
    sidebar,
    setSidebar,
    width: sidebarWidth,
    setWidth: setSidebarWidth,
  } = useShellLayout();
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [tree, setTree] = useState(true);
  const [branch, setBranch] = useState("");
  const [base, setBase] = useState("HEAD");
  const [focusComposer, setFocusComposer] = useState(0);
  const taskComposer = useRef<HTMLElement>(null);
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useDraftFiles("home");
  const [provider, setProvider] = useState(defaultProvider());
  const modelState = useProviderConfig(
    data.providers.find((p) => p.id === provider),
    ready,
  );
  const [workspace, setWorkspace] = useState("");
  const [addingWorkspace, setAddingWorkspace] = useState(false);
  const [collapsedWorkspaces, setCollapsedWorkspaces] = useState<
    Set<string | null>
  >(() => new Set());
  const selectedWorkspace = data.workspaces.find((w) => w.id === workspace);
  const canWorktree = !!selectedWorkspace?.isGitRoot;
  const catalog = useCommandCatalog(
    data.providers.find((p) => p.id === provider),
    selectedWorkspace?.path ?? null,
    ready && view === "home",
  );
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<SessionRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const archivePending = useRef(false);
  const [notifications, setNotifications] = useState(false);
  const [tabDividerVisible, setTabDividerVisible] = useState(false);
  const [chatTabsTarget, setChatTabsTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const sessions = data.sessions.filter((s) => !s.archived);
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const savedSessionIds = useMemo(() => ready ? new Set(data.sessions.map((s) => s.id)) : undefined, [ready, data.sessions]);
  const { pinnedChatIds, togglePinnedChat } = usePinnedChats(savedSessionIds);
  const sidebarOrder = useSidebarOrder(savedSessionIds);
  const sidebarWorkspaces = sidebarOrder.sort(
    "workspaces",
    [{ id: null, name: "No workspace", path: undefined }, ...data.workspaces],
    (w) => w.id ?? NO_WORKSPACE_ID,
  );
  const pinnedChats = sidebarOrder.sort(
    "pinned",
    pinnedChatIds.flatMap((id) => {
      const session = sessions.find((s) => s.id === id);
      return session ? [session] : [];
    }),
    (s) => s.id,
  );
  const needs = sessions.filter((s) => sessionNeedsAttention(s.status));
  const active =
    typeof view === "object"
      ? sessions.find((s) => s.id === view.session)
      : undefined;
  const activeIdRef = useRef(active?.id);
  activeIdRef.current = active?.id;
  const unseen = useUnseenTurns(sessions, active?.id);
  const go = (next: View) => {
    transitionPage(() => setHistory((current) => visit(current, next)));
    setSearch(false);
    setNotifications(false);
  };
  const newTask = () => {
    go("home");
    setFocusComposer((value) => value + 1);
  };
  useEffect(() => {
    if (view === "home" && !creating)
      taskComposer.current
        ?.querySelector<HTMLElement>('[role="textbox"], textarea')
        ?.focus();
  }, [view, focusComposer, creating]);
  const canCreate =
    ready &&
    (!workspace || !!selectedWorkspace?.available) &&
    !creating &&
    !addingWorkspace &&
    !modelState.busy &&
    !(modelState.error && modelState.pending) &&
    (!!prompt.trim() || !!files.length);
  const createTask = async () => {
    if (!canCreate || creatingRef.current || modelState.blocked?.()) return;
    creatingRef.current = true;
    setCreating(true);
    setError(null);
    const text = prompt;
    const pendingFiles = files;
    try {
      const attachments = pendingFiles.length
        ? await prepareAttachments(pendingFiles)
        : [];
      const session = await call<SessionRecord>("create_session", {
        workspaceId: workspace || null,
        providerId: supportedProviderId(provider),
        title:
          text.trim() || pendingFiles[0]?.name || "New conversation",
        newWorktree: canWorktree && tree,
        branch:
          branch.trim() || `harbor/task-${crypto.randomUUID().slice(0, 8)}`,
        base: base.trim() || "HEAD",
        initialConfig: json(modelState.selections),
      });
      await refresh().catch((e) => setError(String(e)));
      // Failed connections already own a session: keep the prompt there for retry.
      const failed = !!session.error || session.status === "error";
      updateSession({ ...session, draft: failed ? text : session.draft });
      setPrompt("");
      setFiles([]);
      if (failed) setDraftFiles(`${session.id}:root`, pendingFiles);
      setBranch("");
      // Keep the chat the user opened while this worktree/agent was starting.
      transitionPage(() =>
        setHistory((current) =>
          current.entries[current.index] === "home"
            ? visit(current, { session: session.id })
            : current,
        ),
      );
      if (!failed) {
        void call("send_prompt", {
          sessionId: session.id,
          text: normalizeCommandAliases(text, catalog.commands),
          ...(attachments.length ? { attachments } : {}),
        }).catch((e) => {
          restoreDraftFiles(`${session.id}:root`, pendingFiles);
          updateSession({ ...session, draft: text });
          setError(String(e));
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };
  const goBack = () => {
    transitionPage(() => setHistory((current) => travel(current, -1)));
    setSearch(false);
    setNotifications(false);
  };
  const goForward = () => {
    transitionPage(() => setHistory((current) => travel(current, 1)));
    setSearch(false);
    setNotifications(false);
  };
  useEffect(() => {
    if (!ready) return;
    setHistory((current) =>
      pruneHistory(
        current,
        new Set(data.sessions.filter((s) => !s.archived).map((s) => s.id)),
      ),
    );
  }, [ready, data.sessions]);
  useEffect(() => {
    if (
      !ready ||
      (typeof view === "object" && !sessions.some((s) => s.id === view.session))
    )
      return;
    try {
      localStorage.setItem("harbor.last-view", JSON.stringify(view));
    } catch {}
  }, [ready, view, sessions]);
  const theme = str(record(data.settings).theme, "dark");
  useEffect(() => {
    let disposed = false;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      if (disposed) return;
      document.documentElement.classList.add("theme-changing");
      document.documentElement.classList.toggle(
        "dark",
        !(theme === "light" || (theme === "system" && !media.matches)),
      );
      document.documentElement.classList.toggle(
        "light",
        theme === "light" || (theme === "system" && !media.matches),
      );
      requestAnimationFrame(() =>
        document.documentElement.classList.remove("theme-changing"),
      );
    };
    media.addEventListener("change", apply);
    if (desktop) {
      // macOS media queries reflect the app's native appearance. Release the
      // override before reading System, and never force it on media changes.
      void getCurrentWindow()
        .setTheme(
          theme === "system" ? null : theme === "light" ? "light" : "dark",
        )
        .then(apply)
        .catch((error) => {
          console.error("Unable to update window appearance", error);
          apply();
        });
    } else {
      apply();
    }
    return () => {
      disposed = true;
      media.removeEventListener("change", apply);
    };
  }, [theme]);
  useEffect(() => {
    document.title = active ? active.title + " — Harbor" : "Harbor";
  }, [active?.title, view]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        newTask();
      }
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();
        setHistory((current) => travel(current, e.key === "[" ? -1 : 1));
        setSearch(false);
        setNotifications(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const addWorkspace = async () => {
    if (addingWorkspace) return;
    setAddingWorkspace(true);
    try {
      const path = await openFolder({
        directory: true,
        multiple: false,
        title: "Choose a workspace folder",
      });
      if (typeof path !== "string") return;
      const saved = await call<Workspace>("save_workspace", { path });
      await refresh();
      setWorkspace(saved.id);
      newTask();
    } catch (e) {
      setError(String(e));
    } finally {
      setAddingWorkspace(false);
    }
  };
  const archiveChat = async (session: SessionRecord) => {
    await call("delete_session", { sessionId: session.id });
    setDeleting(null);
    if (activeIdRef.current === session.id) go("home");
    await refresh();
  };
  const requestArchive = async (session: SessionRecord) => {
    if (archivePending.current || deleting) return;
    archivePending.current = true;
    setDeleteBusy(true);
    try {
      const isActive = (candidate: SessionRecord) =>
        ["working", "connecting", "needs_input"].includes(candidate.status);
      if (isActive(session)) {
        setDeleting(session);
        return;
      }
      const dirty = session.worktreeId
        ? await call<boolean>("session_has_uncommitted_changes", {
            sessionId: session.id,
          })
        : false;
      const latest = sessionsRef.current.find((s) => s.id === session.id) ?? session;
      if (dirty || isActive(latest)) setDeleting(latest);
      else await archiveChat(latest);
    } catch (e) {
      setError(String(e));
    } finally {
      archivePending.current = false;
      setDeleteBusy(false);
    }
  };
  const deleteChat = async () => {
    if (!deleting || archivePending.current) return;
    archivePending.current = true;
    setDeleteBusy(true);
    try {
      await archiveChat(deleting);
    } catch (e) {
      setError(String(e));
    } finally {
      archivePending.current = false;
      setDeleteBusy(false);
    }
  };
  const searchItems = useMemo(
    () => [
      ...data.workspaces.map((w) => ({
        value: "workspace:" + w.id,
        label: w.name,
        description: w.path,
        group: "Workspaces",
        icon: Folder,
      })),
      ...sessions.map((s) => ({
        value: "session:" + s.id,
        label: s.title,
        description: data.workspaces.find((w) => w.id === s.workspaceId)?.name,
        group: "Conversations",
        icon: providerGlyph(s.providerId),
      })),
    ],
    [data.projects, data.sessions, data.workspaces],
  );
  const workspaceIds = new Set(data.workspaces.map((w) => w.id));
  const noWorkspaceSessions = sessions.filter(
    (s) => !s.workspaceId || !workspaceIds.has(s.workspaceId),
  );
  const chatRows = (items: SessionRecord[], group: string, pinned = false) => {
    items = sidebarOrder.sort(group, items, (s) => s.id);
    const Row = pinned ? SidebarMenuItem : SidebarMenuSubItem;
    const RowButton = pinned ? SidebarMenuButton : SidebarMenuSubButton;
    return items.map((s) => {
      const mark = summarizeSessionMarks(
        [s.status],
        unseen.has(s.id) ? 1 : 0,
      );
      return (
        <Row key={s.id}>
          <SidebarRowMenu
            label={s.title}
            reorder={sidebarOrder.row(
              group,
              s.id,
              s.title,
              items.map((item) => item.id),
            )}
            actions={[
              {
                label: pinnedChatIds.includes(s.id)
                  ? "Unpin conversation"
                  : "Pin conversation",
                icon: pinnedChatIds.includes(s.id) ? PinOff : Pin,
                onSelect: () => togglePinnedChat(s.id),
              },
              {
                label: "Archive conversation…",
                icon: Archive,
                onSelect: () => void requestArchive(s),
                destructive: true,
              },
            ]}
          >
            <RowButton
              asChild
              isActive={active?.id === s.id}
              icon={providerGlyph(s.providerId)}
              title={mark.loading ?? mark.attention ?? mark.unseen}
              loading={mark.loading}
              attention={mark.attention}
              attentionTone={mark.attentionTone}
              unseen={mark.unseen}
            >
              <button onClick={() => go({ session: s.id })}>{s.title}</button>
            </RowButton>
          </SidebarRowMenu>
        </Row>
      );
    });
  };
  const title =
    active?.title ??
    (view === "worktrees"
      ? "Worktrees"
      : view === "settings"
        ? "Settings"
        : "New task");
  return (
    <SidebarProvider
      className={"app-shell " + (!sidebar ? "sidebar-collapsed" : "")}
      style={{ "--window-gutter": `${rem(WINDOW_GUTTER)}` } as CSSProperties}
      open={sidebar}
      onOpenChange={setSidebar}
      persist={false}
      shortcut={null}
      shortcutLabel={
        /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ B" : "Ctrl B"
      }
      width={`${pixelsToRem(sidebarWidth)}`}
      onWidthChange={setSidebarWidth}
      mobileBreakpoint={600}
    >
      <SidebarKeyboardShortcut />
      <header
        className="topbar"
        onMouseDown={(event) => {
          if (
            !desktop ||
            event.button !== 0 ||
            event.detail > 1 ||
            (event.target as Element).closest(
              "button, a, input, [role='button'], [role='menuitem'], [role='separator']",
            )
          )
            return;
          event.preventDefault();
          void getCurrentWindow()
            .startDragging()
            .catch((error) => setError(String(error)));
        }}
      >
        <ChromeSidebarTrack>
          <div className="window-controls" aria-hidden="true">
            {!desktop && (
              <div className="traffic-lights">
                <i />
                <i />
                <i />
              </div>
            )}
          </div>
          <SidebarTrigger size="icon-compact" />
          <TopbarHistory
            canGoBack={history.index > 0}
            canGoForward={history.index < history.entries.length - 1}
            onBack={goBack}
            onForward={goForward}
          />
        </ChromeSidebarTrack>
        <div className="topbar-context">
          <ChromeSidebarDivider visible={!active || tabDividerVisible} />
          {active && typeof view === "object" ? (
            <div ref={setChatTabsTarget} className="topbar-task-tabs" />
          ) : (
            <Tooltip content={title}><span className="topbar-title">
              {title}
            </span></Tooltip>
          )}
        </div>
        <div className="topbar-right">
          {!desktop && <span className="preview-label">Browser preview</span>}
          {view === "home" && (
            <DropdownMenu open={notifications} onOpenChange={setNotifications}>
              <DropdownTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-compact"
                    className="topbar-notification-button"
                    aria-label="Agent notifications"
                  >
                    <Bell size={rem(16)} />
                    {needs.length > 0 && (
                      <span className="notification-count">{needs.length}</span>
                    )}
                  </Button>
                }
              />
              <DropdownContent align="end" className="notification-menu">
                <DropdownLabel>Notifications</DropdownLabel>
                {needs.length ? (
                  needs.map((item, index) => (
                    <MenuItem
                      key={item.id}
                      index={index}
                      icon={providerGlyph(item.providerId)}
                      label={item.title}
                      onSelect={() => go({ session: item.id })}
                    />
                  ))
                ) : (
                  <p className="empty-notifications">
                    No pending notifications.
                  </p>
                )}
              </DropdownContent>
            </DropdownMenu>
          )}
        </div>
      </header>
      <div className="workspace-body">
        <Sidebar
          id="harbor-sidebar"
          className="harbor-sidebar"
          variant="sidebar"
          bordered={false}
        >
          <SidebarContent>
            <span id="sidebar-reorder-help" className="sr-only">
              Drag to rearrange, use Option or Alt plus Up or Down, or open the
              context menu for move actions.
            </span>
            <span role="status" aria-live="polite" className="sr-only">
              {sidebarOrder.announcement}
            </span>
            <SidebarGroup className="pt-0">
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    icon={SquarePen}
                    onClick={() => {
                      newTask();
                    }}
                  >
                    New task<kbd className="ml-auto">⌘ N</kbd>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    icon={Search}
                    onClick={() => setSearch(true)}
                  >
                    Search<kbd className="ml-auto">⌘ K</kbd>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
            {pinnedChats.length > 0 && (
              <SidebarGroup collapsible role="region" aria-label="Pinned">
                <SidebarGroupLabel>Pinned</SidebarGroupLabel>
                <SidebarMenu>
                  {chatRows(pinnedChats, "pinned", true)}
                </SidebarMenu>
              </SidebarGroup>
            )}
            <SidebarGroup collapsible role="region" aria-label="Workspaces">
              <SidebarGroupLabel>Workspaces</SidebarGroupLabel>
              <SidebarGroupAction title={"Add workspace"}
                aria-label="Add workspace"
                aria-disabled={addingWorkspace}
                onClick={() => void addWorkspace()}
              >
                <Plus />
              </SidebarGroupAction>
              <SidebarMenu>
                {sidebarWorkspaces.map((w) => {
                  const workspaceSessions =
                    w.id === null
                      ? noWorkspaceSessions
                      : sessions.filter((s) => s.workspaceId === w.id);
                  const open = !collapsedWorkspaces.has(w.id);
                  const chatsId = `workspace-chats-${w.id ?? "none"}`;
                  // Expanded trees show the mark on each chat. Collapsed, the
                  // parent is the only visible signal that something inside
                  // is working or waiting.
                  const workspaceMark = summarizeSessionMarks(
                    open ? [] : workspaceSessions.map((s) => s.status),
                    open
                      ? 0
                      : workspaceSessions.filter((s) => unseen.has(s.id))
                          .length,
                  );
                  const startWorkspaceTask = () => {
                    setCollapsedWorkspaces((current) => {
                      const next = new Set(current);
                      next.delete(w.id);
                      return next;
                    });
                    setWorkspace(w.id ?? "");
                    newTask();
                  };
                  return (
                    <SidebarMenuItem key={w.id ?? "__no_workspace__"}>
                      <SidebarRowMenu
                        label={w.name}
                        reorder={sidebarOrder.row(
                          "workspaces",
                          w.id ?? NO_WORKSPACE_ID,
                          w.name,
                          sidebarWorkspaces.map(
                            (item) => item.id ?? NO_WORKSPACE_ID,
                          ),
                        )}
                        actions={[
                          {
                            label: "New task",
                            icon: Plus,
                            onSelect: startWorkspaceTask,
                          },
                        ]}
                      >
                        <SidebarMenuButton
                          icon={open ? FolderOpen : Folder}
                          style={
                            {
                              "--row-gutter": "var(--row-gutter-hover)",
                            } as CSSProperties
                          }
                          title={
                            [
                              w.path,
                              workspaceMark.attention ??
                                workspaceMark.loading ??
                                workspaceMark.unseen,
                            ]
                              .filter(Boolean)
                              .join(" · ") || undefined
                          }
                          loading={workspaceMark.loading}
                          attention={workspaceMark.attention}
                          attentionTone={workspaceMark.attentionTone}
                          unseen={workspaceMark.unseen}
                          aria-expanded={open}
                          aria-controls={chatsId}
                          onClick={() =>
                            setCollapsedWorkspaces((current) => {
                              const next = new Set(current);
                              if (open) next.add(w.id);
                              else next.delete(w.id);
                              return next;
                            })
                          }
                        >
                          {w.name}
                        </SidebarMenuButton>
                      </SidebarRowMenu>
                      <SidebarMenuSub
                        id={chatsId}
                        open={open}
                        className="ml-0 border-l-0 pl-0"
                        aria-label={`Chats in ${w.name}`}
                      >
                        {chatRows(
                          workspaceSessions,
                          `chats:${w.id ?? NO_WORKSPACE_ID}`,
                        )}
                        {!workspaceSessions.length && (
                          <SidebarMenuSubItem>
                            <SidebarMenuSubButton asChild>
                              <button onClick={startWorkspaceTask}>
                                Start a conversation
                              </button>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        )}
                      </SidebarMenuSub>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  icon={Settings2}
                  isActive={view === "settings"}
                  onClick={() => go("settings")}
                >
                  Settings
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </Sidebar>
        <div className="main-shell workspace-frame">
          <SkylineScene
            frame
            role="main"
            className="main-content"
            city={skylineCity(record(data.settings).skylineCity)}
            timeOfDay={skylineTimeOfDay(record(data.settings).skylineTimeOfDay)}
            variant={view === "home" ? "home" : "chat"}
            active={view === "home" || !!active}
          >
            {view === "home" ? (
              <HomeScene city={skylineCity(record(data.settings).skylineCity)}>
                <div className="home-content chat-composer-wrap">
                  <section
                    ref={taskComposer}
                    className="home-message-card"
                    aria-label="New task composer"
                  >
                    {workspace && !selectedWorkspace?.available && (
                      <p className="workspace-unavailable">
                        This workspace folder is unavailable. Choose another
                        workspace.
                      </p>
                    )}
                    <TaskComposer
                      catalog={catalog}
                      files={files}
                      onFilesChange={setFiles}
                      value={prompt}
                      onValueChange={setPrompt}
                      placeholder="Describe what you want to work on…"
                      onSubmit={() => void createTask()}
                      actionLabel={creating ? "Starting task…" : "Start task"}
                      actionDisabled={!canCreate}
                      modePicker={discoveryMode(modelState, creating)}
                      configurationAction={
                        <ProviderConnectionButton
                          providerId={provider}
                          disabled={creating}
                        />
                      }
                      disabled={creating}
                      busy={creating}
                      textareaProps={{
                        "aria-label": "Describe a new task",
                      }}
                      context={
                        <div className="home-composer-heading">
                          <header className="home-welcome">
                            <h1>What would you like to work on?</h1>
                          </header>
                          <div className="task-location">
                            <WorkspacePicker
                              workspaces={data.workspaces}
                              value={workspace}
                              disabled={creating || addingWorkspace}
                              onValueChange={setWorkspace}
                              onAddWorkspace={() => void addWorkspace()}
                            />
                            {canWorktree && (
                              <WorktreePicker
                                workspaceId={workspace}
                                tree={tree}
                                onTreeChange={setTree}
                                branch={branch}
                                onBranchChange={setBranch}
                                base={base}
                                onBaseChange={setBase}
                                disabled={creating}
                              />
                            )}
                          </div>
                        </div>
                      }
                      modelMenu={
                        <DiscoveryModelMenu
                          state={modelState}
                          provider={provider}
                          onProviderChange={(id) => setProvider(defaultProvider(id))}
                          disabled={creating}
                        />
                      }
                    />

                  </section>
                </div>
              </HomeScene>
            ) : view === "settings" ? (
              <Settings />
            ) : view === "worktrees" ? (
              <Worktrees
                onSession={(id) => go({ session: id })}
                onNew={newTask}
              />
            ) : active ? (
              <Chat
                key={active.id}
                session={active}
                tabsTarget={chatTabsTarget}
                onTabDividerChange={setTabDividerVisible}
              />
            ) : (
              <div className="large-empty">
                <Archive size={rem(30)} />
                <h2>This conversation is archived</h2>
                <Button onClick={() => go("worktrees")}>View archives</Button>
              </div>
            )}
          </SkylineScene>
        </div>
      </div>
      <CommandMenuDialog
        open={search}
        onOpenChange={setSearch}
        shortcut={null}
        title="Search"
        description="Find workspaces and conversations."
      >
        <CommandMenu
          items={searchItems}
          onSelect={(item) => {
            const [kind, id] = item.value.split(":");
            if (kind === "workspace") {
              setWorkspace(id);
              go("home");
            } else go({ session: id });
          }}
        >
          <CommandMenuInput placeholder="Search workspaces and conversations…" />
          <CommandMenuList>
            <CommandMenuEmpty>
              No matching workspaces or conversations.
            </CommandMenuEmpty>
          </CommandMenuList>
        </CommandMenu>
      </CommandMenuDialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(v) => {
          if (!v && !deleteBusy) setDeleting(null);
        }}
      >
        <DialogContent className="archive-dialog">
          <DialogHeader>
            <DialogTitle>Archive “{deleting?.title}”?</DialogTitle>
            <DialogDescription>
              The agent will stop. Its conversation will be archived.
              {deleting?.worktreeId
                ? " Its owned worktree will be backed up and removed once no other chat uses it."
                : " Its working files will be kept."}
            </DialogDescription>
          </DialogHeader>
          {deleting?.worktreeId && (
            <p className="archive-explainer">
              <Archive size={rem(17)} />
              <span>
                Tracked, untracked, and ignored files are preserved before
                removal.
              </span>
            </p>
          )}
          <div className="dialog-footer">
            <Button
              variant="ghost"
              disabled={deleteBusy}
              onClick={() => setDeleting(null)}
            >
              Keep chat
            </Button>
            <Button
              className="primary-button"
              disabled={deleteBusy}
              onClick={() => void deleteChat()}
            >
              {deleteBusy && <ThinkingIndicatorGlyph size={rem(14)} />}
              Archive and delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <AppNotifications
        error={error}
        onDismissError={() => setError(null)}
        sessions={data.sessions}
        ready={ready}
        activeSessionId={active?.id}
        onOpenSession={(id) => go({ session: id })}
      />
    </SidebarProvider>
  );
}
