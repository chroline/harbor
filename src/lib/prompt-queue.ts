import { useEffect, useState, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { call, desktop } from "./api";
import type { QueueSnapshot } from "./bindings/QueueSnapshot";

export function newerQueue(
  current: QueueSnapshot,
  next: QueueSnapshot,
): QueueSnapshot {
  return current.sessionId === next.sessionId &&
    current.childId === next.childId &&
    current.revision > next.revision
    ? current
    : next;
}
export function usePromptQueue(
  sessionId: string,
  childId: string | null,
  onError: (error: string) => void,
) {
  const activeTarget = useRef({ sessionId, childId });
  activeTarget.current = { sessionId, childId };
  const [snapshot, setSnapshot] = useState<QueueSnapshot>({
    sessionId,
    childId,
    revision: 0,
    items: [],
    paused: false,
    steering: false,
    error: null,
  });
  useEffect(() => {
    let disposed = false;
    let off: (() => void) | undefined;
    const receive = (next: QueueSnapshot) => {
      if (!disposed && next.sessionId === sessionId && next.childId === childId)
        setSnapshot((previous) => newerQueue(previous, next));
    };
    setSnapshot({
      sessionId,
      childId,
      revision: 0,
      items: [],
      paused: false,
      steering: false,
      error: null,
    });
    if (desktop)
      void (async () => {
        off = await listen<QueueSnapshot>("prompt-queue-changed", (event) =>
          receive(event.payload),
        );
        if (disposed) {
          off();
          return;
        }
        receive(
          await call<QueueSnapshot>("get_prompt_queue", { sessionId, childId }),
        );
      })().catch((error) => {
        if (!disposed) onError(String(error));
      });
    return () => {
      disposed = true;
      off?.();
    };
  }, [sessionId, childId]);
  const accept = (next: QueueSnapshot) => {
    if (
      next.sessionId === activeTarget.current.sessionId &&
      next.childId === activeTarget.current.childId
    )
      setSnapshot((previous) => newerQueue(previous, next));
  };
  return {
    snapshot:
      snapshot.sessionId === sessionId && snapshot.childId === childId
        ? snapshot
        : { ...snapshot, items: [], paused: false, error: null },
    accept,
    remove: (id: string) =>
      void call<QueueSnapshot>("remove_queued_prompt", {
        sessionId,
        childId,
        id,
      })
        .then(accept)
        .catch((error) => onError(String(error))),
    resume: () =>
      void call<QueueSnapshot>("resume_prompt_queue", { sessionId, childId })
        .then(accept)
        .catch((error) => onError(String(error))),
  };
}
