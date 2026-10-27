import { supportedProviderId, defaultProvider } from "../lib/providers";
import { prepareAttachments, restoreDraftFiles } from "../lib/attachments";
import {
  normalizeCommandAliases,
  type AvailableCommand,
} from "../lib/commands";
import { DiscoveryModelMenu, SessionModelMenu } from "./ModelMenu";
import { ProviderConnectionButton } from "./ProviderConnectionButton";
import { useCommandCatalog } from "../lib/command-catalog";
import { useProviderConfig } from "../lib/provider-config";
import { json } from "../lib/api";
import { discoveryMode, useSessionMode } from "./ModePicker";
import { TaskComposer } from "./TaskComposer";
import { WorkspacePicker } from "./WorkspacePicker";
import { WorktreePicker } from "./WorktreePicker";
import { InputCopy } from "./ui/input-copy";
import { Banner, BannerDescription } from "./ui/banner";
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { Button } from "./ui/button";

import { useStore } from "../lib/store";
import { call } from "../lib/api";
import type { SessionRecord } from "../lib/bindings/SessionRecord";
export function LaunchDialog({
  open,
  onClose,
  initialPrompt,
  initialProvider,
  initialWorkspace,
  onCreated,
  onAddWorkspace,
}: {
  open: boolean;
  onClose: () => void;
  initialPrompt: string;
  initialProvider: string;
  initialWorkspace: string;
  onCreated: (id: string) => void;
  onAddWorkspace: () => Promise<void>;
}) {
  const {
    data,
    ready,
    refresh,
    setError,
    updateSession,
    configuration,
    transcripts,
  } = useStore();
  const [workspaceId, setWorkspace] = useState(initialWorkspace);
  const workspace = data.workspaces.find((w) => w.id === workspaceId);
  const canWorktree = !!workspace?.isGitRoot;
  const [provider, setProvider] = useState(defaultProvider(initialProvider));
  const modelState = useProviderConfig(
    data.providers.find((p) => p.id === provider),
    open && ready,
  );
  const [prompt, setPrompt] = useState(initialPrompt);
  const [files, setFiles] = useState<File[]>([]);
  const [tree, setTree] = useState(true);
  const [branch, setBranch] = useState("");
  const [base, setBase] = useState("HEAD");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setLocalError] = useState("");
  const beforeAdd = useRef<Set<string> | null>(null);
  const session = data.sessions.find((s) => s.id === sessionId);
  const sessionMode = useSessionMode(session, busy);
  const discoveredCatalog = useCommandCatalog(
    data.providers.find((p) => p.id === provider),
    session?.cwd ?? workspace?.path ?? null,
    open && ready && !session,
  );
  const discoverySnapshot = useRef<{
    key: string;
    commands: AvailableCommand[];
  }>({ key: "", commands: [] });
  const catalogKey = JSON.stringify([provider, workspaceId]);
  if (!session && discoveredCatalog.status === "ready")
    discoverySnapshot.current = {
      key: catalogKey,
      commands: discoveredCatalog.commands,
    };
  const catalog = session
    ? {
        commands: transcripts[session.id]?.commands ?? [],
        status: "ready" as const,
      }
    : discoveredCatalog;
  useEffect(() => {
    if (open) {
      setPrompt(initialPrompt);
      setFiles([]);
      setProvider(defaultProvider(initialProvider));
      setWorkspace(initialWorkspace);
      setBranch(`harbor/task-${Date.now().toString(36).slice(-5)}`);
      setSessionId(null);
      setLocalError("");
      beforeAdd.current = null;
    }
  }, [open]);
  useEffect(() => {
    const added =
      beforeAdd.current &&
      data.workspaces.find((p) => !beforeAdd.current!.has(p.id));
    if (added) {
      setWorkspace(added.id);
      beforeAdd.current = null;
      return;
    }
  }, [data.workspaces]);
  const connect = async () => {
    setBusy(true);
    setLocalError("");
    try {
      if (workspaceId && !workspace?.available)
        throw new Error(
          "This workspace folder is unavailable. Choose another folder in the workspace picker.",
        );
      if (!prompt.trim() && !files.length)
        throw new Error("Enter a task before connecting.");
      if (canWorktree && tree && !branch.trim())
        throw new Error("Enter a branch name.");
      const s = await call<SessionRecord>("create_session", {
        workspaceId: workspaceId || null,
        providerId: supportedProviderId(provider),
        title: prompt.trim() || files[0]?.name || "New conversation",
        newWorktree: canWorktree && tree,
        branch,
        base,
        initialConfig: json(modelState.selections),
      });
      updateSession(s);
      setSessionId(s.id);
      await refresh();
    } catch (e) {
      setLocalError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (sessionId) {
        await call("delete_session", { sessionId });
        await refresh();
      }
      onClose();
    } catch (e) {
      setLocalError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const launch = async () => {
    if (!sessionId || (!prompt.trim() && !files.length) || busy) return;
    setBusy(true);
    try {
      const attachments = files.length ? await prepareAttachments(files) : [];
      const pendingFiles = files;
      onCreated(sessionId);
      onClose();
      void call("send_prompt", {
        sessionId,
        text: normalizeCommandAliases(
          prompt,
          catalog.commands.length
            ? catalog.commands
            : discoverySnapshot.current.key === catalogKey
              ? discoverySnapshot.current.commands
              : [],
        ),
        ...(attachments.length ? { attachments } : {}),
      }).catch((e) => {
        restoreDraftFiles(`${sessionId}:root`, pendingFiles);
        if (session) updateSession({ ...session, draft: prompt });
        setError(String(e));
      });
    } catch (error) {
      setLocalError(String(error));
    } finally {
      setBusy(false);
    }
  };
  const canSubmit =
    !busy &&
    !modelState.busy &&
    !(modelState.error && modelState.pending) &&
    (!session || !configuration.blocked(session.id)) &&
    !session?.error &&
    (!!prompt.trim() || !!files.length) &&
    (!canWorktree || !tree || !!branch.trim()) &&
    (!workspaceId || !!workspace?.available) &&
    session?.status !== "error";
  const submit = () => {
    if (
      !canSubmit ||
      modelState.blocked?.() ||
      (session && configuration.blocked(session.id))
    )
      return;
    if (session) void launch();
    else void connect();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) void cancel();
      }}
    >
      <DialogContent
        className="launch-dialog"
        size="xl"
        showCloseButton={!busy}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            (e.metaKey || e.ctrlKey) &&
            !e.nativeEvent.isComposing
          ) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <DialogHeader className="launch-header">
          <DialogTitle>New task</DialogTitle>
          <DialogDescription className="sr-only">
            Choose an agent and model. Select a workspace folder for the task.
          </DialogDescription>
        </DialogHeader>

        <div className="launch-body">
          <TaskComposer
            catalog={catalog}
            files={files}
            onFilesChange={setFiles}
            value={prompt}
            onValueChange={setPrompt}
            placeholder="Describe what you want to work on…"
            disabled={busy}
            onSubmit={submit}
            actionLabel={
              busy ? "Connecting…" : session ? "Start task" : "Connect"
            }
            actionDisabled={!canSubmit}
            modePicker={session ? sessionMode : discoveryMode(modelState, busy)}
            busy={busy}
            textareaProps={{ "aria-label": "Task", autoFocus: true }}
            context={
              <>
                <WorkspacePicker
                  label="Workspace"
                  workspaces={data.workspaces}
                  value={workspaceId}
                  disabled={busy || !!session}
                  onValueChange={setWorkspace}
                  onAddWorkspace={() => {
                    beforeAdd.current = new Set(
                      data.workspaces.map((w) => w.id),
                    );
                    void onAddWorkspace().catch((e) =>
                      setLocalError(String(e)),
                    );
                  }}
                />
                {canWorktree && (
                  <WorktreePicker
                    workspaceId={workspaceId}
                    tree={tree}
                    onTreeChange={setTree}
                    branch={branch}
                    onBranchChange={setBranch}
                    base={base}
                    onBaseChange={setBase}
                    disabled={busy || !!session}
                  />
                )}
              </>
            }
            modelMenu={
              session ? (
                <SessionModelMenu session={session} disabled={busy} />
              ) : (
                <DiscoveryModelMenu
                  state={modelState}
                  provider={provider}
                  onProviderChange={(id) => setProvider(defaultProvider(id))}
                  disabled={busy}
                />
              )
            }
            configurationAction={
              <ProviderConnectionButton providerId={provider} disabled={busy} />
            }
          />

          {session && (
            <section
              className="launch-configuration"
              aria-label="Agent configuration"
            >
              <div className="launch-configuration-heading">
                <h3>Configuration</h3>
                <span>
                  {session.status === "error"
                    ? "Connection failed"
                    : "Connected"}
                </span>
              </div>

              {session.workspaceId && (
                <InputCopy value={session.cwd} label="Working directory" />
              )}
              {session.status === "error" && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void call<SessionRecord>("reconnect", {
                      sessionId: session.id,
                    })
                      .then((s) => {
                        updateSession(s);
                        setLocalError(s.error ?? "");
                      })
                      .catch((e) => setLocalError(String(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  Retry connection
                </Button>
              )}
            </section>
          )}
          {(session?.error || error) && (
            <Banner status="error">
              <BannerDescription>{session?.error || error}</BannerDescription>
            </Banner>
          )}
        </div>

        <footer className="launch-footer">
          <div className="launch-shortcuts">
            <span>
              <kbd>↵</kbd> {session ? "Start task" : "Connect"}
            </span>
            <span>
              <kbd>esc</kbd> Close
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void cancel()}
          >
            Cancel
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
