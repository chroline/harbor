import { useEffect, useId, useRef } from "react";
import type { SessionRecord } from "../lib/bindings/SessionRecord";
import { sessionNeedsAttention } from "../lib/protocol";
import { Toaster, toast, type ToastOptions } from "./ui/toaster";

interface AppNotificationsProps {
  error: string | null;
  onDismissError: () => void;
  sessions: SessionRecord[];
  ready: boolean;
  activeSessionId?: string;
  onOpenSession?: (id: string) => void;
}

/** Bridge application events to Affect UI's original toaster store. */
export function AppNotifications({
  error,
  onDismissError,
  sessions,
  ready,
  activeSessionId,
  onOpenSession,
}: AppNotificationsProps) {
  const id = useId();
  const previous = useRef<Map<string, string> | null>(null);
  const dismissError = useRef(onDismissError);
  dismissError.current = onDismissError;
  const openSession = useRef(onOpenSession);
  openSession.current = onOpenSession;
  const sessionToasts = useRef(new Set<string>());

  const latestError = useRef(error);
  latestError.current = error;
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      toast.dismiss(`${id}:error`);
      for (const toastId of sessionToasts.current) toast.dismiss(toastId);
      sessionToasts.current.clear();
    };
  }, [id]);

  useEffect(() => {
    const errorId = `${id}:error`;
    if (!error) {
      toast.dismiss(errorId);
      return;
    }
    toast.error("Something went wrong", {
      id: errorId,
      description: error,
      duration: Infinity,
      onDismiss: () => {
        if (mounted.current && latestError.current === error)
          dismissError.current();
      },
    });
  }, [error, id]);

  useEffect(() => {
    if (!ready) return;
    const next = new Map(
      sessions.filter((s) => !s.archived).map((s) => [s.id, s.status]),
    );
    const before = previous.current;
    previous.current = next;
    // Seed the first snapshot; opening Harbor must not replay old notifications.
    if (!before) return;
    for (const session of sessions) {
      const was = before.get(session.id);
      const toastId = `${id}:session:${session.id}`;
      if (
        session.archived ||
        session.id === activeSessionId ||
        (was !== session.status && !sessionNeedsAttention(session.status))
      ) {
        if (sessionToasts.current.has(toastId)) {
          toast.dismiss(toastId);
          sessionToasts.current.delete(toastId);
        }
      }
      if (
        session.archived ||
        !was ||
        was === session.status ||
        session.id === activeSessionId
      )
        continue;
      const options: ToastOptions = {
        id: toastId,
        description: session.title,
        ...(openSession.current
          ? {
              action: {
                label: "Open chat",
                onClick: () => openSession.current?.(session.id),
              },
            }
          : {}),
      };
      if (session.status === "completed" && was === "working") {
        toast.success("Task finished", options);
      } else if (session.status === "error") {
        toast.error("Task interrupted", {
          ...options,
          description: session.error
            ? `${session.title} · ${session.error}`
            : session.title,
          duration: 8000,
        });
      } else if (
        session.status === "needs_input" ||
        session.status === "cleanup_pending"
      ) {
        toast.info(
          session.status === "needs_input"
            ? "Agent needs your input"
            : "Worktree cleanup needed",
          { ...options, duration: 8000 },
        );
      } else continue;
      sessionToasts.current.add(toastId);
    }
    for (const toastId of sessionToasts.current) {
      const sessionId = toastId.slice(`${id}:session:`.length);
      if (!next.has(sessionId)) {
        toast.dismiss(toastId);
        sessionToasts.current.delete(toastId);
      }
    }
  }, [sessions, ready, activeSessionId, id]);

  return (
    <Toaster position="top-right" offset={24} className="harbor-toaster" />
  );
}
