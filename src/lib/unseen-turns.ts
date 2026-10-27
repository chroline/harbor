import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { desktop } from "./api";
import { record, str } from "./protocol";
import type { SessionEvent } from "./bindings/SessionEvent";

export const UNSEEN_TURNS_KEY = "harbor.unseen-turns.v1";

export type SessionStatus = {
  id: string;
  status: string;
  archived?: boolean;
};

export function readUnseenTurns(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter((id): id is string => typeof id === "string" && !!id),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

/** A parent turn finishing while this chat is not open. The first observation
 *  is a baseline, so chats that were already finished at startup stay quiet. */
export function applySessionStatuses(
  unseen: ReadonlySet<string>,
  previous: ReadonlyMap<string, string>,
  sessions: SessionStatus[],
  activeId: string | undefined,
): { unseen: Set<string>; previous: Map<string, string> } {
  const next = new Set(unseen);
  const statuses = new Map<string, string>();
  const live = new Set<string>();
  for (const session of sessions) {
    if (session.archived) continue;
    live.add(session.id);
    statuses.set(session.id, session.status);
    const before = previous.get(session.id);
    if (
      before !== undefined &&
      before !== "completed" &&
      session.status === "completed" &&
      session.id !== activeId
    ) {
      next.add(session.id);
    }
    if (session.id === activeId) next.delete(session.id);
  }
  for (const id of next) if (!live.has(id)) next.delete(id);
  return {
    unseen: sameIds(unseen, next) ? new Set(unseen) : next,
    previous: statuses,
  };
}

/** A worker turn finishing in a chat the user does not have open. */
export function noteFinishedTurn(
  unseen: ReadonlySet<string>,
  sessionId: string,
  activeId: string | undefined,
) {
  if (!sessionId || sessionId === activeId || unseen.has(sessionId))
    return unseen;
  const next = new Set(unseen);
  next.add(sessionId);
  return next;
}

function loadUnseen() {
  try {
    return new Set(readUnseenTurns(localStorage.getItem(UNSEEN_TURNS_KEY)));
  } catch {
    return new Set<string>();
  }
}

export function useUnseenTurns(
  sessions: SessionStatus[],
  activeId: string | undefined,
) {
  const [unseen, setUnseen] = useState<ReadonlySet<string>>(loadUnseen);
  const previous = useRef(new Map<string, string>());
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  useEffect(() => {
    setUnseen((current) => {
      const applied = applySessionStatuses(
        current,
        previous.current,
        sessions,
        activeId,
      );
      previous.current = applied.previous;
      return sameIds(current, applied.unseen) ? current : applied.unseen;
    });
  }, [sessions, activeId]);

  useEffect(() => {
    try {
      localStorage.setItem(UNSEEN_TURNS_KEY, JSON.stringify([...unseen]));
    } catch {
      /* The dot still works for this visit if storage is unavailable. */
    }
  }, [unseen]);

  useEffect(() => {
    if (!desktop) return;
    let stop: (() => void) | undefined;
    let disposed = false;
    listen<SessionEvent>("session-event", (event) => {
      const payload = event.payload;
      if (payload.kind !== "turn_complete") return;
      // Parent completions arrive as status "completed". This is the worker
      // path, which does not change the parent status.
      if (!str(record(payload.payload).childId)) return;
      setUnseen((current) =>
        noteFinishedTurn(current, payload.sessionId, activeRef.current),
      );
    })
      .then((unlisten) => {
        if (disposed) unlisten();
        else stop = unlisten;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);

  return unseen;
}
