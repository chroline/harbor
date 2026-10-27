import { useCallback, useEffect, useRef, useState } from "react";

export const rootDraftKey = (sessionId: string) => `harbor.root-draft.${sessionId}`;
export function readRootDraft(sessionId: string): string | undefined {
  try { return localStorage.getItem(rootDraftKey(sessionId)) ?? undefined; }
  catch { return undefined; }
}

/** The database save is debounced; keep unsent text safe even on immediate quit. */
export function useRootDraft(sessionId: string, fallback: string) {
  const [draft, update] = useState(() => readRootDraft(sessionId) ?? fallback);
  const current = useRef(draft);
  const set = useCallback((value: string | ((previous: string) => string)) => {
    const next = typeof value === "function" ? value(current.current) : value;
    current.current = next;
    try { localStorage.setItem(rootDraftKey(sessionId), next); } catch { /* Database persistence remains available. */ }
    update(next);
  }, [sessionId]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== rootDraftKey(sessionId)) return;
      const next = readRootDraft(sessionId);
      if (next !== undefined) { current.current = next; update(next); }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [sessionId]);
  return [draft, set] as const;
}
