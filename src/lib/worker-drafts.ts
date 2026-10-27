import { useCallback, useEffect, useRef, useState } from "react";

export const workerDraftKey = (sessionId: string) => `harbor.worker-drafts.${sessionId}`;
export function readWorkerDrafts(sessionId: string): Record<string, string> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(workerDraftKey(sessionId)) ?? "{}");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch { return {}; }
}

/** Persist before returning from an edit, including when a worker lives in a detached window. */
export function useWorkerDrafts(sessionId: string, initial?: Record<string, string>) {
  const [drafts, setDrafts] = useState(() => ({ ...readWorkerDrafts(sessionId), ...initial }));
  const current = useRef(drafts);
  const initialRef = useRef(initial);
  useEffect(() => {
    const next = { ...readWorkerDrafts(sessionId), ...initialRef.current };
    current.current = next;
    setDrafts(next);
    if (initialRef.current) {
      try { localStorage.setItem(workerDraftKey(sessionId), JSON.stringify(next)); } catch { /* In-memory drafts still work. */ }
    }
    const sync = (event: StorageEvent) => {
      if (event.key !== workerDraftKey(sessionId)) return;
      current.current = readWorkerDrafts(sessionId);
      setDrafts(current.current);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [sessionId]);
  const setDraft = useCallback((childId: string, value: string | ((previous: string) => string)) => {
    // Read the latest cross-window values so editing one worker cannot replace another's draft.
    const previous = { ...current.current, ...readWorkerDrafts(sessionId) };
    const text = typeof value === "function" ? value(previous[childId] ?? "") : value;
    const next = { ...previous, [childId]: text };
    current.current = next;
    try { localStorage.setItem(workerDraftKey(sessionId), JSON.stringify(next)); } catch { /* In-memory drafts still work. */ }
    setDrafts(next);
  }, [sessionId]);
  return [drafts, setDraft] as const;
}
