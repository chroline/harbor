import { ThinkingIndicatorGlyph } from "./ui/thinking-indicator";
import { PromptQueue } from "./PromptQueue";
import { usePromptQueue } from "../lib/prompt-queue";
import type { QueueSnapshot } from "../lib/bindings/QueueSnapshot";
import type { PromptAttachment } from "../lib/bindings/PromptAttachment";
import { WakeupTool } from "./WakeupTool";
import { ToolResult } from "./ToolResult";
import { ToolCode, ToolJson } from "./ToolJson";
import { toolActivityKind, toolPresentation } from "../lib/tool-presentation";
import type { SupportedProviderId } from "../lib/bindings/SupportedProviderId";
import { PlanReview } from "./PlanReview";
import {
  planReview,
  planReviewEntries,
  planReviewStatus,
} from "../lib/plan-review";
import { readRootDraft, useRootDraft } from "../lib/root-draft";
import { useWorkerDrafts } from "../lib/worker-drafts";
import { ElicitationForm } from "./ElicitationForm";
import { SkylineScene } from "./SkylineBackground";
import { skylineCity } from "@/lib/skyline-city";
import {
  prepareAttachments,
  useDraftFiles,
  getDraftFiles,
  setDraftFiles,
} from "../lib/attachments";
import { normalizeCommandAliases } from "../lib/commands";
import { rem } from "@/lib/units";
import { SessionModelMenu } from "./ModelMenu";
import { ChatScroller, TranscriptRow } from "./ChatScroller";
import { ChatLoadingSkeleton } from "./ChatLoadingSkeleton";
import { PlanTrace, ToolGlyph } from "./AgentTrace";
import { Marker, MarkerContent } from "./ui/marker";
import { FileChange, FileRead } from "./FileDiff";
import { chatMinimapItems } from "./chat-minimap";
import { ChatTranscript } from "./ChatTranscript";
import { MessageImage, MessageImageContext } from "./MessageImage";
import { useSessionMode } from "./ModePicker";
import { useTerminalTabs } from "../hooks/use-terminal-tabs";
import { useTaskTabs, orderTaskTabs } from "../hooks/use-task-tabs";
import {
  readTaskTabSelection,
  saveTaskTabSelection,
  readNativeTerminalDismissed,
  saveNativeTerminalDismissed,
} from "../lib/task-tab-selection";
import { TaskComposer } from "./TaskComposer";
import * as Tabs from "@radix-ui/react-tabs";
import { ThinkingIndicator } from "./ui/thinking-indicator";
import { Card } from "./ui/card";
import { Disclosure } from "./fluid";
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  CircleAlert,
  TerminalSquare,
  ChevronRight,
  Check,
  RefreshCw,
  ShieldCheck,
  Plus,
  X,
  ExternalLink,
} from "@/lib/icons";
import { Button } from "./ui/button";
import { RichText, IconButton, ChatLink } from "./shared";
import { Review } from "./Review";
import { NativeTerminal } from "./NativeTerminal";
import { useStore } from "../lib/store";
import { call, json } from "../lib/api";
import {
  toolImageSource,
  emptyTranscript,
  timeline,
  record,
  str,
  array,
  sameWorker,
  type Interaction,
  type Tool,
  type ToolTerminalOutput,
} from "../lib/protocol";
import type { SessionRecord } from "../lib/bindings/SessionRecord";
export function Chat({
  session,
  tabsTarget,
  onTabDividerChange,
  standaloneTab,
  initialDraft,
}: {
  session: SessionRecord;
  tabsTarget?: HTMLDivElement | null;
  onTabDividerChange?: (visible: boolean) => void;
  standaloneTab?: string;
  initialDraft?: string;
}) {
  const {
    data,
    transcripts,
    loadedTranscripts,
    loadTranscript,
    setActiveSession,
    setError,
    updateSession,
  } = useStore();
  const [initialTab] = useState(
    () => standaloneTab ?? readTaskTabSelection(session.id),
  );
  const terminals = useTerminalTabs(
    session.id,
    setError,
    !standaloneTab && initialTab.startsWith("shell:")
      ? initialTab.slice(6)
      : null,
  );
  const transcript = transcripts[session.id] ?? emptyTranscript();
  const [draft, setDraft] = useRootDraft(
    session.id,
    initialDraft ?? session.draft,
  );
  const [review, setReview] = useState(session.reviewOpen);
  const initialChild = initialTab.startsWith("worker:")
    ? initialTab.slice(7)
    : null;
  const [child, setChild] = useState<string | null>(initialChild);
  const [nativeTerminal, setNativeTerminal] = useState(
    session.mode === "terminal",
  );
  const [nativeTerminalDismissed, setNativeTerminalDismissed] = useState(
    () => readNativeTerminalDismissed(session.id),
  );
  const historyLoaded = loadedTranscripts.has(session.id);
  const conversation = useMemo(
    () =>
      historyLoaded &&
      !nativeTerminal &&
      !terminals.active &&
      session.mode === "gui"
        ? { sessionId: session.id, child }
        : null,
    [
      session.id,
      child,
      historyLoaded,
      nativeTerminal,
      terminals.active,
      session.mode,
    ],
  );
  // Commit tab selection with a blank pane first. Mounting a saved transcript
  // can be expensive, so let React prepare it at interruptible priority.
  const deferredConversation = useDeferredValue(conversation, null);
  const conversationReady =
    !!conversation && deferredConversation === conversation;
  const [childDrafts, setChildDraft] = useWorkerDrafts(
    session.id,
    initialChild && initialDraft !== undefined
      ? { [initialChild]: initialDraft }
      : undefined,
  );
  const [childOpeningState, setChildOpeningState] = useState<
    Record<string, boolean>
  >({});
  const [childSendingState, setChildSendingState] = useState<
    Record<string, boolean>
  >({});
  const [childErrors, setChildErrors] = useState<Record<string, string | null>>(
    {},
  );
  const activeSession = useRef(session.id);
  activeSession.current = session.id;
  const activeTarget = useRef(child);
  activeTarget.current = child;
  const worker = child ? transcript.children[child] : undefined;
  const workerConnected = record(worker?.capabilities).harborConnected === true;
  const childOpening = !!child && !workerConnected && !!childOpeningState[child];
  const childError = child && !workerConnected ? childErrors[child] : null;
  const workerViaParent = record(worker?.capabilities).harborViaParent === true;
  const workerState = str(
    record(worker?.state).type,
    str(record(worker?.state).state),
  );
  const workerWorking =
    (child ? !!childSendingState[child] : false) ||
    ["working", "running", "queued", "needs_input", "requires_action"].includes(
      workerState,
    );
  const fileKey = `${session.id}:${child ?? "root"}`;
  const [files, setFiles] = useDraftFiles(fileKey);
  const [preparing, setPreparing] = useState(false);
  const preparingRef = useRef(false);
  const activeDraft = child ? (childDrafts[child] ?? "") : draft;
  const [busy, setBusy] = useState(false);
  const nativeHandoffPending = useRef(false);
  const modePicker = useSessionMode(session, !!child);
  const conversationHeights = useRef<Record<string, Map<string, number>>>({});
  const composer = useRef<HTMLDivElement>(null);
  const draftRef = useRef(draft);
  const reviewRef = useRef(review);
  const scrollRef = useRef(session.scrollTop);
  const taskTabs = useTaskTabs(
    session.id,
    async (id, x, y) => {
      const workerId = id.startsWith("worker:") ? id.slice(7) : null;
      const conversation = id === "parent" || !!workerId;
      const attachments = conversation
        ? await prepareAttachments(
            getDraftFiles(`${session.id}:${workerId ?? "root"}`),
          )
        : [];
      if (id === "parent")
        await call("save_session_ui", {
          sessionId: session.id,
          draft: draftRef.current,
          scrollTop: scrollRef.current,
          reviewOpen: reviewRef.current,
        });
      await call("detach_task_tab", {
        sessionId: session.id,
        tabId: id,
        draft: workerId
          ? (childDrafts[workerId] ?? "")
          : id === "parent"
            ? draftRef.current
            : null,
        attachments,
        x,
        y,
      });
      if (conversation)
        setDraftFiles(`${session.id}:${workerId ?? "root"}`, []);
    },
    setError,
  );
  const ownsParent = standaloneTab
    ? standaloneTab === "parent"
    : !taskTabs.detached.includes("parent");
  const ownsParentRef = useRef(ownsParent);
  ownsParentRef.current = ownsParent;
  const parentWasDetached = useRef(false);
  useEffect(() => {
    if (!ownsParent && !standaloneTab)
      setDraft(readRootDraft(session.id) ?? session.draft);
  }, [session.draft, ownsParent, standaloneTab]);
  useEffect(() => {
    if (
      !standaloneTab &&
      parentWasDetached.current &&
      !taskTabs.detached.includes("parent")
    )
      setDraft(readRootDraft(session.id) ?? session.draft);
    parentWasDetached.current = taskTabs.detached.includes("parent");
  }, [taskTabs.detached, standaloneTab]);
  const working = ["working", "needs_input"].includes(session.status);
  const connected =
    ["idle", "working", "needs_input", "completed"].includes(session.status) &&
    session.mode === "gui";
  useEffect(() => {
    setActiveSession(session.id);
    return () => setActiveSession(null);
  }, [session.id, setActiveSession]);
  useEffect(() => {
    void loadTranscript(session.id);
    scrollRef.current = session.scrollTop;
    setDraft(initialDraft ?? readRootDraft(session.id) ?? session.draft);
    setReview(session.reviewOpen);
    setChild(initialChild);
    setChildErrors({});
    setChildOpeningState({});
    setChildSendingState({});
  }, [session.id]);
  useEffect(() => {
    draftRef.current = draft;
    reviewRef.current = review;
    if (!ownsParent) return;
    updateSession({
      ...session,
      draft,
      reviewOpen: review,
      scrollTop: scrollRef.current,
    });
    const timer = setTimeout(() => {
      void call("save_session_ui", {
        sessionId: session.id,
        draft,
        scrollTop: scrollRef.current,
        reviewOpen: review,
      }).catch((e) => setError(String(e)));
    }, 350);
    return () => clearTimeout(timer);
  }, [draft, review, session.id, ownsParent]);
  useEffect(
    () => () => {
      if (!ownsParentRef.current) return;
      void call("save_session_ui", {
        sessionId: session.id,
        draft: draftRef.current,
        scrollTop: scrollRef.current,
        reviewOpen: reviewRef.current,
      }).catch(() => {});
    },
    [session.id],
  );
  const openWorker = async (id: string) => {
    const root = session.id;
    setChildOpeningState((previous) => ({ ...previous, [id]: true }));
    setChildErrors((previous) => ({ ...previous, [id]: null }));
    try {
      await call("open_subagent", { sessionId: root, childId: id });
    } catch (error) {
      if (activeSession.current === root)
        setChildErrors((previous) => ({ ...previous, [id]: String(error) }));
    } finally {
      if (activeSession.current === root)
        setChildOpeningState((previous) => ({ ...previous, [id]: false }));
    }
  };
  useEffect(() => {
    // Connection events own readiness. Selecting an attached worker must not
    // start a redundant request or block its composer waiting for that request.
    if (!child || !connected || workerConnected) return;
    void openWorker(child);
  }, [child, connected, workerConnected, session.id]);
  const promptQueue = usePromptQueue(session.id, child, setError);
  const [queuedEdit, setQueuedEdit] = useState<{ sessionId: string; childId: string | null; id: string; text: string; files: File[] } | null>(null);
  const editRef = useRef(queuedEdit);
  editRef.current = queuedEdit;
  const edit = queuedEdit?.sessionId === session.id && queuedEdit.childId === child ? queuedEdit : null;
  const composerText = edit ? edit.text : activeDraft;
  const composerFiles = edit ? edit.files : files;
  useEffect(() => {
    setQueuedEdit(previous => previous && (previous.sessionId !== session.id || previous.childId !== child) ? null : previous);
  }, [session.id, child]);
  useEffect(() => {
    const root = session.id, targetChild = child;
    return () => {
      const current = editRef.current;
      if (current?.sessionId === root && current.childId === targetChild) {
        editRef.current = null;
        void call("end_queued_edit", { sessionId: root, childId: targetChild, id: current.id, text: null, attachments: null, steer: false }).catch(() => {});
      }
    };
  }, [session.id, child]);
  const beginQueuedEdit = async (id: string) => {
    if (preparingRef.current || edit) return;
    const root = session.id, targetChild = child;
    preparingRef.current = true; setPreparing(true);
    let reserved = false;
    try {
      const result = await call<{text: string; attachments: PromptAttachment[]}>("begin_queued_edit", { sessionId: root, childId: targetChild, id });
      reserved = true;
      const loadedFiles = result.attachments.map((attachment) => {
        const bytes = Uint8Array.from(atob(attachment.data), (c) => c.charCodeAt(0));
        return new File([bytes], attachment.name, { type: attachment.mimeType });
      });
      if (activeSession.current !== root || activeTarget.current !== targetChild) {
        await call("end_queued_edit", { sessionId: root, childId: targetChild, id, text: null, attachments: null, steer: false });
        reserved = false;
        return;
      }
      const next = { sessionId: root, childId: targetChild, id, text: result.text, files: loadedFiles };
      editRef.current = next; setQueuedEdit(next);
      requestAnimationFrame(() => composer.current?.querySelector<HTMLElement>('[role="textbox"]')?.focus());
    } catch (error) {
      if (reserved) void call("end_queued_edit", { sessionId: root, childId: targetChild, id, text: null, attachments: null, steer: false }).catch(() => {});
      setError(String(error));
    }
    finally { preparingRef.current = false; setPreparing(false); }
  };
  const cancelQueuedEdit = async () => {
    if (!edit || preparingRef.current) return;
    preparingRef.current = true; setPreparing(true);
    try {
      const result = await call<QueueSnapshot>("end_queued_edit", { sessionId: edit.sessionId, childId: edit.childId, id: edit.id, text: null, attachments: null, steer: false });
      promptQueue.accept(result); editRef.current = null; setQueuedEdit(null);
    } catch (error) { setError(String(error)); }
    finally { preparingRef.current = false; setPreparing(false); }
  };
  const send = async (intent: "send" | "steer" = "send") => {
    if (
      preparingRef.current ||
      (!composerText.trim() && !composerFiles.length) ||
      !connected ||
      (child
        ? !workerConnected ||
          childOpening
        : false)
    )
      return;
    const root = session.id;
    const id = child;
    const text = composerText;
    const pendingFiles = composerFiles;
    const restoreFiles = setFiles;
    preparingRef.current = true;
    setPreparing(true);
    try {
      const attachments = pendingFiles.length
        ? await prepareAttachments(pendingFiles)
        : [];
      if (activeSession.current !== root) return;
      const textToSend = normalizeCommandAliases(text, id ? workerViaParent ? [] : (transcript.childCommands[id] ?? []) : transcript.commands);
      if (edit) {
        const accepted = await call<QueueSnapshot>("end_queued_edit", { sessionId: root, childId: id, id: edit.id, text: textToSend, attachments, steer: intent === "steer" });
        promptQueue.accept(accepted);
        editRef.current = null; setQueuedEdit(null);
        return;
      }
      const accepted = await call<QueueSnapshot>("submit_prompt", {
        sessionId: root, childId: id, text: textToSend, attachments, intent,
      });
      promptQueue.accept(accepted);
      if (id) setChildDraft(id, previous => previous === text ? "" : previous);
      else setDraft(previous => previous === text ? "" : previous);
      restoreFiles([]);
    } catch (error) {
      setError(String(error));
    } finally {
      preparingRef.current = false;
      setPreparing(false);
    }
  };
  const reconnect = async () => {
    setBusy(true);
    try {
      updateSession(
        await call<SessionRecord>("reconnect", { sessionId: session.id }),
      );
      await loadTranscript(session.id);
      return true;
    } catch (e) {
      setError(String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const enterNativeTerminal = async () => {
    if (nativeHandoffPending.current) return;
    const root = session.id;
    nativeHandoffPending.current = true;
    setBusy(true);
    try {
      if (session.mode !== "terminal")
        await call("enter_terminal", { sessionId: root });
      if (activeSession.current !== root) return;
      terminals.setActive(null);
      setChild(null);
      setNativeTerminalDismissed(false);
      saveNativeTerminalDismissed(root, false);
      setNativeTerminal(true);
    } catch (error) {
      if (activeSession.current === root) setError(String(error));
    } finally {
      nativeHandoffPending.current = false;
      if (activeSession.current === root) setBusy(false);
    }
  };
  const closeNativeTerminal = async () => {
    if (nativeHandoffPending.current || busy) return;
    if (session.mode === "terminal" && !(await reconnect())) return;
    setNativeTerminal(false);
    setNativeTerminalDismissed(true);
    saveNativeTerminalDismissed(session.id, true);
  };
  const toggleTerminal = () => {
    if (nativeTerminal) {
      setNativeTerminal(false);
      void reconnect();
    } else if (session.capabilities.nativeHandoff) {
      void enterNativeTerminal();
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        (e.metaKey || (e.ctrlKey && !/Mac/.test(navigator.platform))) &&
        !e.shiftKey &&
        !e.altKey
      ) {
        if (e.key.toLowerCase() === "t") {
          if (standaloneTab) return;
          e.preventDefault();
          void terminals.create();
          return;
        }
        if (
          e.key.toLowerCase() === "w" &&
          terminals.active &&
          !taskTabs.detached.includes(`shell:${terminals.active}`)
        ) {
          e.preventDefault();
          void terminals.close(terminals.active);
          return;
        }
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "t"
      ) {
        e.preventDefault();
        toggleTerminal();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [session, terminals, standaloneTab, taskTabs.detached]);
  const messages = useMemo(
    () =>
      conversationReady
        ? transcript.messages.filter((m) =>
            child ? sameWorker(m.childId, child) : !m.childId,
          )
        : [],
    [transcript, child, conversationReady],
  );
  const entries = useMemo(
    () =>
      conversationReady
        ? planReviewEntries(
            timeline(transcript, child),
            transcript.interactions,
            child,
          )
        : [],
    [transcript, child, conversationReady],
  );
  const minimapItems = useMemo(() => chatMinimapItems(entries), [entries]);
  const configurationError =
    connected &&
    !!session.error &&
    /selected .+ unavailable/i.test(session.error);
  const needsAuthentication =
    !connected &&
    !!session.error &&
    /auth|sign.?in|log.?in|credential/i.test(session.error);
  const activeTab = terminals.active
    ? `shell:${terminals.active}`
    : nativeTerminal
      ? "terminal"
      : child
        ? `worker:${child}`
        : "parent";
  useEffect(() => {
    // Wait for both sources before validating a saved selection. Otherwise
    // the initial empty tab list would overwrite it during startup.
    if (standaloneTab || !terminals.loaded || !historyLoaded) return;
    if (child && !transcript.children[child]) {
      setChild(null);
      return;
    }
    saveTaskTabSelection(session.id, activeTab);
  }, [
    session.id,
    activeTab,
    child,
    terminals.loaded,
    historyLoaded,
    transcript,
    standaloneTab,
  ]);
  const detachedActive =
    !standaloneTab && taskTabs.detached.includes(activeTab);
  const tabItems = orderTaskTabs(
    [
      { id: "parent", title: session.title, status: "", shellId: "" },
      ...Object.values(transcript.children).map((c) => ({
        id: `worker:${c.sessionId}`,
        title: c.title,
        status: str(
          record(c.state).type,
          str(record(c.state).state, "unknown"),
        ),
        shellId: "",
      })),
      ...((session.capabilities.nativeHandoff && !nativeTerminalDismissed) ||
      nativeTerminal ||
      session.mode === "terminal"
        ? [
            {
              id: "terminal",
              title: "Native terminal",
              status: "",
              shellId: "",
            },
          ]
        : []),
      ...terminals.tabs.map((tab) => ({
        id: `shell:${tab.id}`,
        title: tab.title,
        status: "",
        shellId: tab.id,
      })),
    ],
    taskTabs.order,
  );
  const tabIds = tabItems.map((tab) => tab.id);
  const tabList = useRef<HTMLDivElement>(null);
  const firstTabId = tabItems[0]?.id;
  useLayoutEffect(() => {
    const list = tabList.current;
    if (!list) return;
    const update = () => {
      const remaining = Math.max(
        0,
        list.scrollWidth - list.clientWidth - list.scrollLeft,
      );
      list.style.setProperty("--task-tabs-overflow", `${remaining}px`);
      onTabDividerChange?.(activeTab !== firstTabId || list.scrollLeft > 0.5);
    };
    update();
    list.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => {
      list.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [activeTab, firstTabId, tabItems.length, tabsTarget, onTabDividerChange]);

  useEffect(() => {
    const list = tabList.current;
    if (!list) return;
    const reveal = () =>
      list
        .querySelector<HTMLElement>('[data-state="active"]')
        ?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeTab, tabsTarget]);
  // Draft edits do not change conversation content. Reuse the history tree
  // so typing never reconciles every saved message and tool disclosure.
  const renderedTranscript = useMemo(
    () => (
      <ChatTranscript
        entries={entries}
        renderPlan={(interaction) =>
          interaction.status === "pending" &&
          connected &&
          transcript.requests.some(
            (request) => request.id === interaction.id,
          ) ? (
            <RequestCard
              request={interaction}
              sessionId={session.id}
              childName={
                transcript.children[str(interaction.params.sessionId)]?.title
              }
            />
          ) : (
            <div className="request-card request-card-plan">
              <PlanReview
                review={planReview(interaction)!}
                busy={false}
                status={planReviewStatus(interaction)}
              />
            </div>
          )
        }
        renderTool={(tool) => (
          <ToolCard tool={tool} terminals={transcript.terminals} detailsOnly />
        )}
        working={
          (child ? workerWorking : session.status === "working") &&
          !transcript.requests.length
        }
      >
        {!child && transcript.plan.length > 0 && (
          <TranscriptRow id="plan">
            <PlanTrace entries={transcript.plan} />
          </TranscriptRow>
        )}
        {connected &&
          transcript.requests
            .filter(
              (r) =>
                !entries.some(
                  (entry) =>
                    entry.type === "message" &&
                    entry.message.planReview?.status === "pending" &&
                    entry.message.planReview.id === r.id,
                ),
            )
            .map((r) => (
              <TranscriptRow key={String(r.id)} id={`request:${r.id}`}>
                <RequestCard
                  request={r}
                  sessionId={session.id}
                  childName={
                    transcript.children[str(r.params.sessionId)]?.title
                  }
                />
              </TranscriptRow>
            ))}
        {session.status === "needs_input" && !transcript.requests.length && (
          <TranscriptRow id="waiting-for-response">
            <Marker>
              <MarkerContent>
                <ThinkingIndicator label="Waiting for your response" />
              </MarkerContent>
            </Marker>
          </TranscriptRow>
        )}
      </ChatTranscript>
    ),
    [
      entries,
      transcript,
      child,
      workerWorking,
      session.status,
      session.id,
      connected,
    ],
  );
  const imageContext = useMemo(() => ({ sessionId: session.id, childId: child }), [session.id, child]);
  return (
    <Tabs.Root
      asChild
      activationMode="manual"
      value={activeTab}
      onValueChange={(value) => {
        if (taskTabs.detached.includes(value)) {
          taskTabs.focus(value);
          return;
        }
        if (value.startsWith("shell:")) {
          terminals.setActive(value.slice("shell:".length));
          return;
        }
        if (value === "terminal") {
          void enterNativeTerminal();
        } else {
          terminals.setActive(null);
          setNativeTerminal(false);
          setChild(value === "parent" ? null : value.slice("worker:".length));
          if (session.mode === "terminal" || nativeTerminal) void reconnect();
        }
      }}
    >
      <div className="chat-layout">
        {tabsTarget &&
          createPortal(
            <div className="task-tabs-toolbar">
              <Tabs.List
                ref={tabList}
                className="task-tab-list"
                aria-label="Task conversations"
              >
                {tabItems.map((tab) => {
                  const detached = taskTabs.detached.includes(tab.id);
                  const floating = taskTabs.dragging === tab.id;
                  const surface = (
                    <div
                      className={`task-tab-surface${floating ? " topbar task-tab-floating" : ""}`}
                      {...taskTabs.surfaceProps(tab.id)}
                    >
                      <Tabs.Trigger
                        value={tab.id}
                        title={
                          detached
                            ? `${tab.title} · Open in standalone window`
                            : tab.id === "parent"
                              ? "Parent conversation"
                              : tab.title
                        }
                        asChild
                      >
                        <Button
                          variant={activeTab === tab.id ? "primary" : "ghost"}
                          size="compact"
                          className="task-tab"
                          onClick={() => {
                            if (detached) taskTabs.focus(tab.id);
                          }}
                        >
                          {detached ? (
                            <ExternalLink size={rem(14)} aria-hidden="true" />
                          ) : tab.shellId ? (
                            <TerminalSquare size={rem(14)} aria-hidden="true" />
                          ) : null}
                          <span className="task-tab-label">
                            {detached ? "Open in standalone window" : tab.title}
                          </span>
                          {!detached && tab.status && (
                            <span
                              className="task-tab-status"
                              data-status={tab.status}
                              aria-hidden="true"
                            />
                          )}
                        </Button>
                      </Tabs.Trigger>
                      {(!!tab.shellId || tab.id === "terminal") && !detached && (
                        <IconButton
                          label={`Close ${tab.title}`}
                          size="icon-compact"
                          className="terminal-tab-close"
                          disabled={tab.id === "terminal" && busy}
                          onClick={() => void (tab.id === "terminal"
                            ? closeNativeTerminal()
                            : terminals.close(tab.shellId))}
                        >
                          <X size={rem(12)} />
                        </IconButton>
                      )}
                    </div>
                  );
                  return (
                    <div
                      className={`task-tab-item${tab.shellId ? " terminal-tab" : ""}`}
                      key={tab.id}
                      {...taskTabs.props(tab.id, tab.title, tabIds)}
                    >
                      {floating
                        ? createPortal(surface, document.body)
                        : surface}
                    </div>
                  );
                })}
              </Tabs.List>
              <IconButton
                label="New terminal tab"
                size="icon-compact"
                disabled={terminals.creating}
                onClick={() => void terminals.create()}
              >
                <Plus size={rem(15)} />
              </IconButton>
            </div>,
            tabsTarget,
          )}
        <Tabs.Content
          value={terminals.active ? "conversation" : activeTab}
          forceMount
          asChild
        >
          <SkylineScene
            variant="chat"
            city={skylineCity(record(data.settings).skylineCity)}
            style={
              terminals.active || detachedActive
                ? { display: "none" }
                : undefined
            }
          >
            {nativeTerminal &&
              session.mode === "terminal" &&
              (!taskTabs.detached.includes("terminal") || !!standaloneTab) && (
                <NativeTerminal
                  sessionId={session.id}
                  visible={!terminals.active}
                />
              )}
            {nativeTerminal && session.mode === "terminal" && (
              <div className="terminal-caption">
                Native CLI · Exit with <code>/exit</code>, then select a
                conversation to restore the conversation.
              </div>
            )}
            {!conversationReady && !nativeTerminal && !terminals.active &&
              !detachedActive && session.mode === "gui" && <ChatLoadingSkeleton />}
            {conversationReady && (
              <>
                <ChatScroller
                  key={`${session.id}:${activeTab}`}
                  ready
                  heightCache={
                    (conversationHeights.current[
                      `${session.id}:${child ?? "root"}`
                    ] ??= new Map<string, number>())
                  }
                  minimapItems={minimapItems}
                  onScrollPosition={(top) => {
                    if (!child) scrollRef.current = top;
                  }}
                  requestId={
                    connected && transcript.requests.length
                      ? `request:${transcript.requests.at(-1)!.id}`
                      : undefined
                  }
                >
                  {!messages.length && child && (
                    <TranscriptRow id="worker-waiting">
                      <Marker className="conversation-waiting">
                        <MarkerContent>
                          Waiting for this worker’s transcript…
                        </MarkerContent>
                      </Marker>
                    </TranscriptRow>
                  )}
                  <MessageImageContext.Provider value={imageContext}>
                    {renderedTranscript}
                  </MessageImageContext.Provider>
                </ChatScroller>
                <div className="chat-composer-wrap" ref={composer}>
                  {session.error && (
                    <div className="chat-notice" role="alert">
                      <CircleAlert size={rem(15)} aria-hidden="true" />
                      <div className="chat-notice-content">
                        <p>{session.error}</p>
                        {configurationError && (
                          <span>
                            Your message is saved. Review the model settings,
                            then send again.
                          </span>
                        )}
                        <div className="chat-notice-actions">
                          {configurationError ? (
                            <Button
                              variant="ghost"
                              size="compact"
                              onClick={() =>
                                composer.current
                                  ?.querySelector<HTMLButtonElement>(
                                    ".model-menu-trigger",
                                  )
                                  ?.click()
                              }
                            >
                              Model settings
                            </Button>
                          ) : (
                            !connected && (
                              <Button
                                variant="ghost"
                                size="compact"
                                leadingIcon={RefreshCw}
                                disabled={busy}
                                onClick={() => void reconnect()}
                              >
                                Retry connection
                              </Button>
                            )
                          )}
                          {needsAuthentication &&
                            transcript.authMethods.map((method) => (
                              <Button
                                key={method.id}
                                variant="ghost"
                                size="compact"
                                disabled={busy}
                                onClick={() => {
                                  setBusy(true);
                                  void call<SessionRecord>("authenticate", {
                                    sessionId: session.id,
                                    methodId: method.id,
                                  })
                                    .then((s) => {
                                      updateSession(s);
                                      void loadTranscript(s.id);
                                    })
                                    .catch((e) => setError(String(e)))
                                    .finally(() => setBusy(false));
                                }}
                              >
                                {method.name}
                              </Button>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {child && childError && (
                    <div className="chat-notice" role="alert">
                      <p>{childError}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={childOpening || !connected}
                        onClick={() => void openWorker(child)}
                      >
                        Retry worker connection
                      </Button>
                    </div>
                  )}
                  {edit && <div className="prompt-queue-status"><span>Editing queued message</span><Button variant="ghost" size="compact" disabled={preparing} onClick={() => void cancelQueuedEdit()}>Cancel</Button></div>}
                  <div className="prompt-composer-stack">
                  <PromptQueue queue={promptQueue.snapshot} onRemove={promptQueue.remove} editing={!!edit || preparing} onEdit={(id) => void beginQueuedEdit(id)} onSteer={(id) => void call<QueueSnapshot>("steer_queued_prompt", { sessionId: session.id, childId: child, id }).then(promptQueue.accept).catch((error) => setError(String(error)))}/>
                  <TaskComposer
                    key={`${session.id}:${child ?? "root"}`}
                    catalog={{
                      commands: child
                        ? workerViaParent
                          ? []
                          : (transcript.childCommands[child] ?? [])
                        : transcript.commands,
                      status: "ready",
                    }}
                    files={composerFiles}
                    onFilesChange={(value) => edit ? setQueuedEdit(previous => previous ? { ...previous, files: value } : previous) : setFiles(value)}
                    busy={preparing}
                    value={composerText}
                    onValueChange={(value) =>
                      edit ? setQueuedEdit(previous => previous ? { ...previous, text: value } : previous) : child ? setChildDraft(child, value) : setDraft(value)
                    }
                    onSubmit={(intent) => void send(intent)}
                    actionLabel={edit ? "Save changes" : (child ? workerWorking || (workerViaParent && working) : working) ? "Queue message" : "Send message"}
                    actionDisabled={
                      (!composerText.trim() && !composerFiles.length) ||
                      preparing ||
                      !connected ||
                      (child
                        ? !workerConnected ||
                          childOpening
                        : false)
                    }
                    modePicker={modePicker}
                    placeholder={
                      child
                        ? childOpening
                          ? "Connecting to worker…"
                          : workerWorking
                            ? "Queue a message, or ⌘Enter to steer…"
                            : `Message ${worker?.title ?? "this worker"}…`
                        : session.status === "connecting"
                          ? "Reconnecting to your agent…"
                          : session.status === "needs_input"
                            ? "Answer the question above to continue"
                            : working
                              ? "Queue a message, or ⌘Enter to steer…"
                              : "Ask a follow-up or describe the next step…"
                    }
                    textareaProps={{
                      "aria-label": child
                        ? `Message ${worker?.title ?? "worker"}`
                        : "Message your agent",
                      readOnly: preparing,
                    }}
                    modelMenu={
                      child ? (
                        <span className="task-project">{worker?.title}</span>
                      ) : (
                        <SessionModelMenu
                          session={session}
                          disabled={!connected}
                        />
                      )
                    }
                    onStop={
                      (
                        child
                          ? workerWorking && workerConnected && !workerViaParent
                          : working
                      )
                        ? () =>
                            void call("cancel_turn", {
                              sessionId: session.id,
                              childId: child,
                            }).catch((e) => setError(String(e)))
                        : undefined
                    }
                  />
                  </div>
                </div>
              </>
            )}
          </SkylineScene>
        </Tabs.Content>
        {detachedActive && (
          <section className="chat-main detached-tab-placeholder">
            <Button
              variant="secondary"
              onClick={() => taskTabs.focus(activeTab)}
            >
              <ExternalLink size={rem(15)} />
              Open in standalone window
            </Button>
          </section>
        )}
        {terminals.tabs
          .filter(
            (tab) =>
              !standaloneTab && !taskTabs.detached.includes(`shell:${tab.id}`),
          )
          .map((tab) => (
            <Tabs.Content
              key={tab.id}
              value={`shell:${tab.id}`}
              forceMount
              asChild
            >
              <section
                className="chat-main shell-terminal-pane"
                style={{
                  display: terminals.active === tab.id ? "flex" : "none",
                }}
              >
                <NativeTerminal
                  sessionId={tab.id}
                  visible={terminals.active === tab.id}
                  onStatus={(status) => terminals.update(tab.id, status)}
                />
                {!tab.alive && (
                  <div className="terminal-caption">
                    Shell exited. Open a new terminal tab to start another
                    shell.
                  </div>
                )}
              </section>
            </Tabs.Content>
          ))}
        {review &&
          session.isGit &&
          conversationReady &&
          !terminals.active &&
          !detachedActive && (
            <Review sessionId={session.id} onClose={() => setReview(false)} />
          )}
      </div>
    </Tabs.Root>
  );
}
export function ToolCard({
  tool,
  detailsOnly = false,
  terminals = {},
}: {
  tool: Tool;
  detailsOnly?: boolean;
  terminals?: Record<string, ToolTerminalOutput>;
}) {
  const presentation = toolPresentation(tool);
  if (presentation.wakeup) return <WakeupTool tool={tool} />;
  const hasTerminal = tool.content.some(
    (block) => record(block).type === "terminal",
  );
  const diffs = tool.content
    .map(record)
    .filter(
      (c) =>
        c.type === "diff" &&
        (typeof c.newText === "string" ||
          typeof c.oldText === "string" ||
          c.newText === null),
    );
  const input = record(tool.rawInput);
  const files =
    tool.status !== "completed"
      ? []
      : diffs.length
        ? diffs
        : (tool.name || tool.title).toLowerCase() === "write" &&
            typeof (input.file_path ?? input.path) === "string" &&
            typeof input.content === "string"
          ? [{ path: input.file_path ?? input.path, newText: input.content }]
          : [];
  const readSnapshot =
    tool.kind === "read" &&
    tool.status === "completed" &&
    presentation.path &&
    presentation.output.length > 0 &&
    !tool.content.some(toolImageSource);
  const details = (
    <div className="tool-detail">
      {presentation.url && (
        <p>
          <ChatLink href={presentation.url}>{presentation.url}</ChatLink>
        </p>
      )}
      {presentation.location && !files.length && !readSnapshot && (
        <p className="tool-location">{presentation.location}</p>
      )}
      {presentation.command && !presentation.commandInTitle && (
        <ToolCode heading="Input" language="sh" text={presentation.command} />
      )}
      {presentation.task && <RichText text={presentation.task} />}
      {presentation.context && (
        <p className="tool-context">{presentation.context}</p>
      )}
      {!!Object.keys(presentation.parameters).filter(
        (key) => !(files.length && key === "content"),
      ).length && (
        <ToolJson
          heading="Input"
          value={Object.fromEntries(
            Object.entries(presentation.parameters).filter(
              ([key]) => !(files.length && key === "content"),
            ),
          )}
        />
      )}

      {files.length ? (
        files.map((file, i) => (
          <FileChange
            key={i}
            filename={str(file.path)}
            before={
              typeof file.oldText === "string" || file.oldText === null
                ? file.oldText
                : undefined
            }
            after={
              typeof file.newText === "string" || file.newText === null
                ? file.newText
                : undefined
            }
          />
        ))
      ) : (
        <>
          {tool.content.map((c, i) => {
            const v = record(c);
            const imageSource = toolImageSource(c);
            if (imageSource) {
              return (
                <MessageImage
                  key={i}
                  src={imageSource}
                  alt={tool.title}
                />
              );
            }
            if (v.type === "terminal") {
              const terminal = terminals[str(v.terminalId)];
              return (
                <ToolResult
                  key={i}
                  code
                  text={
                    terminal?.output ||
                    presentation.output.join("\n\n") ||
                    (["pending", "in_progress"].includes(tool.status) &&
                    terminal?.exitCode === undefined
                      ? "Waiting for terminal output…"
                      : terminal
                        ? "No terminal output was recorded."
                        : "Terminal output was not captured for this call.")
                  }
                />
              );
            }
            if (v.type === "diff")
              return (
                <FileChange
                  key={i}
                  filename={str(v.path)}
                  before={
                    typeof v.oldText === "string" || v.oldText === null
                      ? v.oldText
                      : undefined
                  }
                  after={
                    typeof v.newText === "string" || v.newText === null
                      ? v.newText
                      : undefined
                  }
                />
              );
            return null;
          })}
          {!!presentation.references.length && (
            <div className="tool-references">
              {presentation.references.map((reference) => (
                <code key={reference}>{reference}</code>
              ))}
            </div>
          )}
          {!hasTerminal &&
            presentation.output.map((text, index) =>
              readSnapshot ? (
                <FileRead
                  key={index}
                  filename={presentation.path!}
                  start={presentation.start}
                  text={text}
                />
              ) : tool.kind === "execute" ? (
                <ToolResult key={index} code text={text} />
              ) : (
                <ToolResult key={index} text={text} />
              ),
            )}
        </>
      )}
    </div>
  );
  if (detailsOnly) return details;
  return (
    <Disclosure
      className="agent-tool"
      title={
        <span className="tool-summary" data-status={tool.status}>
          {tool.status === "in_progress" ? (
            <ThinkingIndicatorGlyph size={rem(14)} />
          ) : (
            <ToolGlyph
              kind={toolActivityKind(tool)}
              name={tool.name || tool.title}
            />
          )}
          <span className="tool-summary-title">{presentation.title}</span>
          <span className="tool-summary-status">
            {tool.status.replaceAll("_", " ")}
          </span>
        </span>
      }
    >
      {details}
    </Disclosure>
  );
}
export function RequestCard({
  request,
  sessionId,
  childName,
  providerId,
}: {
  providerId?: SupportedProviderId;
  request: Interaction;
  sessionId: string;
  childName?: string;
}) {
  const { setError } = useStore();
  const [busy, setBusy] = useState(false);
  const [answerError, setAnswerError] = useState<string>();
  const p = request.params;
  const answer = async (result: unknown) => {
    setBusy(true);
    setAnswerError(undefined);
    try {
      await call("answer_request", {
        sessionId,
        requestId: str(p._harborChildId)
          ? json({ childId: p._harborChildId, requestId: p._harborRequestId })
          : request.id,
        result: json(result),
      });
    } catch (e) {
      setError(String(e));
      setAnswerError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const review = planReview(request, providerId);
  return (
    <Card
      className={`request-card${review ? " request-card-plan" : request.method === "elicitation/create" ? " request-card-question" : ""}`}
    >
      {childName && <p className="request-child-label">{childName}</p>}
      {review ? (
        <PlanReview
          review={review}
          busy={busy}
          error={answerError}
          onSelect={(choice) =>
            void answer({
              outcome: { outcome: "selected", optionId: choice.id },
            })
          }
        />
      ) : (
        <>
          {request.method !== "elicitation/create" && (
            <div className="request-heading">
              <ShieldCheck size={rem(16)} />
              <strong>Your permission is needed</strong>
            </div>
          )}
          {request.method === "elicitation/create" ? (
            <ElicitationForm
              key={JSON.stringify([
                request.id,
                p.toolCallId,
                p.message,
                p.requestedSchema,
              ])}
              params={p}
              busy={busy}
              error={answerError}
              onAnswer={(result) => void answer(result)}
            />
          ) : request.method === "session/request_permission" ? (
            <>
              <p>
                {str(
                  record(p.toolCall).title,
                  "The agent would like to run a tool.",
                )}
              </p>
              {record(p.toolCall).kind === "switch_mode" &&
                array(record(p.toolCall).content).map((raw, index) => {
                  const content = record(record(raw).content);
                  return content.type === "text" ? (
                    <RichText key={index} text={str(content.text)} />
                  ) : null;
                })}
              <div className="request-buttons">
                {array(p.options).map((raw) => {
                  const o = record(raw);
                  return (
                    <Button
                      variant={
                        str(o.kind).startsWith("allow")
                          ? "primary"
                          : "secondary"
                      }
                      key={str(o.optionId)}
                      disabled={busy}
                      onClick={() =>
                        void answer({
                          outcome: {
                            outcome: "selected",
                            optionId: o.optionId,
                          },
                        })
                      }
                    >
                      {str(o.name)}
                    </Button>
                  );
                })}
              </div>
            </>
          ) : (
            <p>This interaction is not supported by the connected provider.</p>
          )}
        </>
      )}
    </Card>
  );
}
