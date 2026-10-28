import { reconcileStorage } from "./reconcile-storage";
import { pruneDraftFiles } from "./attachments";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AutoReconnect } from "./auto-reconnect";
import { SessionConfiguration } from "./session-configuration";
import { listen } from "@tauri-apps/api/event";
import { call, desktop, browserBootstrap } from "./api";
import { emptyTranscript, reduceEvent, type Transcript } from "./protocol";
import {
  pruneTranscriptCache,
  readTranscriptCache,
  writeTranscriptCache,
} from "./transcript-cache";
import type { Bootstrap } from "./bindings/Bootstrap";
import type { SessionRecord } from "./bindings/SessionRecord";
import type { SessionEvent } from "./bindings/SessionEvent";
import type { RecentEvents } from "./bindings/RecentEvents";
type Store = {
  data: Bootstrap;
  ready: boolean;
  refresh: () => Promise<void>;
  transcripts: Record<string, Transcript>;
  loadedTranscripts: ReadonlySet<string>;
  visibleTranscripts: ReadonlySet<string>;
  loadTranscript: (id: string) => Promise<void>;
  setActiveSession: (id: string | null) => void;
  error: string | null;
  setError: (error: string | null) => void;
  updateSession: (s: SessionRecord) => void;
  configuration: SessionConfiguration;
};
const Context = createContext<Store | null>(null);
export function StoreProvider({
  children,
  autoReconnect = true,
}: {
  children: ReactNode;
  autoReconnect?: boolean;
}) {
  const [ready, setReady] = useState(!desktop);
  const [data, setData] = useState<Bootstrap>(browserBootstrap);
  const [transcripts, setTranscripts] = useState<Record<string, Transcript>>(
    {},
  );
  const cached = useRef<Record<string, Transcript>>({});
  // Live events can create partial entries for unopened chats. Only histories
  // read from the beginning are safe checkpoints for incremental loading.
  const hydrated = useRef(new Set<string>());
  const visible = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<SessionEvent[]>([]);
  const loading = useRef(new Set<string>());
  const live = useRef<Record<string, SessionEvent[]>>({});
  const active = useRef("");
  const [activeSessionId, setActiveSession] = useState<string | null>(null);
  const reconnect = useRef(new AutoReconnect());
  const [, configurationChanged] = useState(0);
  const configurationRef = useRef<SessionConfiguration | null>(null);
  const bound = (cache: Record<string, Transcript>) => {
    const keys = Object.keys(cache)
      .filter((k) => k !== active.current)
      .sort((a, b) => cache[b].lastSequence - cache[a].lastSequence)
      .slice(0, 5);
    if (cache[active.current]) keys.push(active.current);
    for (const id of hydrated.current)
      if (!keys.includes(id)) hydrated.current.delete(id);
    for (const id of visible.current)
      if (!keys.includes(id)) visible.current.delete(id);
    return Object.fromEntries(keys.map((k) => [k, cache[k]]));
  };
  const publishTranscripts = (cache: Record<string, Transcript>) => {
    cached.current = bound(cache);
    setTranscripts(cached.current);
  };
  const updateSession = (s: SessionRecord) => {
    configurationRef.current?.observe(s);
    setData((d) => ({
      ...d,
      sessions: d.sessions.some((x) => x.id === s.id)
        ? d.sessions.map((x) => (x.id === s.id ? s : x))
        : [...d.sessions, s],
    }));
  };
  if (!configurationRef.current)
    configurationRef.current = new SessionConfiguration({
      apply: (sessionId, configId, value) =>
        call<SessionRecord>("set_config", { sessionId, configId, value }),
      update: updateSession,
      changed: () => configurationChanged((v) => v + 1),
      hold: desktop ? (sessionId, blocked) => call<void>("hold_prompt_queue", {sessionId, blocked}) : undefined,
    });
  const configuration = configurationRef.current;
  const refresh = async () => {
    if (desktop) {
      const next = await call<Bootstrap>("bootstrap");
      const ids = new Set(next.sessions.map((s) => s.id));
      try { reconcileStorage(localStorage, ids); } catch { /* Storage may be unavailable. */ }
      pruneDraftFiles(ids);
      void pruneTranscriptCache(ids);
      setData(next);
    }
    setReady(true);
  };
  const loadTranscript = async (id: string) => {
    active.current = id;
    if (loading.current.has(id)) return;
    loading.current.add(id);
    live.current[id] = [];
    try {
      const memory = hydrated.current.has(id) && cached.current[id];
      let t = memory || (await readTranscriptCache(id)) || emptyTranscript();
      if (!memory && t.lastSequence > 0) {
        const boundary = await call<SessionEvent[]>("get_events", {
          sessionId: id,
          after: t.lastSequence - 1,
          limit: 1,
        });
        // A restored/replaced event log may be older than the local cache.
        if (boundary[0]?.sequence !== t.lastSequence) t = emptyTranscript();
      }
      let after = t.lastSequence;
      const replay = async (events: SessionEvent[]) => {
        let started = performance.now();
        for (let i = 0; i < events.length; i++) {
          if (performance.now() - started >= 8) {
            // A resolved promise only yields to microtasks. Use a task boundary
            // so WebKit can paint and process chat switches during cold replay.
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            started = performance.now();
          }
          t = reduceEvent(t, events[i]);
        }
      };
      let needsReplay = true;
      if (!memory) {
        const checkpoint = t;
        if (checkpoint.lastSequence > 0) {
          visible.current.add(id);
          publishTranscripts({ ...cached.current, [id]: checkpoint });
        }
        const recent = await call<RecentEvents>("get_recent_events", { sessionId: id });
        needsReplay = recent.hasEarlier &&
          (recent.events.at(-1)?.sequence ?? 0) > checkpoint.lastSequence;
        if (needsReplay) {
          t = emptyTranscript();
          await replay(recent.events);
          await replay(live.current[id] ?? []);
          visible.current.add(id);
          publishTranscripts({ ...cached.current, [id]: t });
          // Let the newest turns paint before rebuilding the older prefix.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          t = checkpoint;
          after = checkpoint.lastSequence;
        } else await replay(recent.events);
      }
      while (needsReplay) {
        const events = await call<SessionEvent[]>("get_events", {
          sessionId: id,
          after,
          limit: 5000,
        });
        await replay(events);
        if (events.length < 5000) break;
        after = events.at(-1)!.sequence;
      }
      await replay(live.current[id] ?? []);
      const wasHydrated = hydrated.current.has(id);
      hydrated.current.add(id);
      visible.current.add(id);
      if (!wasHydrated || cached.current[id] !== t)
        publishTranscripts({ ...cached.current, [id]: t });
      // Persist after publishing so opening the chat never waits for a write.
      void writeTranscriptCache(id, t);
    } catch (e) {
      setError(String(e));
    } finally {
      loading.current.delete(id);
      delete live.current[id];
    }
  };
  useEffect(() => {
    let disposed = false;
    const off: (() => void)[] = [];
    if (desktop) {
      (async () => {
        for (const [name, handler] of [
          [
            "session-changed",
            (payload: SessionRecord) => updateSession(payload),
          ],
          [
            "session-event",
            (payload: SessionEvent) => {
              pending.current.push(payload);
              if (loading.current.has(payload.sessionId))
                live.current[payload.sessionId]?.push(payload);
            },
          ],
          [
            "storage-error",
            (payload: string) => setError(`Storage error: ${payload}`),
          ],
        ] as const) {
          const stop = await listen(name, (e) => handler(e.payload as never));
          if (disposed) stop();
          else off.push(stop);
        }
        await refresh();
      })().catch((e) => setError(String(e)));
    }
    const timer = setInterval(() => {
      if (!pending.current.length) return;
      const events = pending.current.splice(0);
      const next = { ...cached.current };
      let changed = false;
      for (const event of events) {
        if (loading.current.has(event.sessionId) && !visible.current.has(event.sessionId)) continue;
        const previous = next[event.sessionId];
        const transcript = reduceEvent(previous ?? emptyTranscript(), event);
        if (transcript === previous) continue;
        next[event.sessionId] = transcript;
        changed = true;
      }
      if (changed) publishTranscripts(next);
    }, 50);
    return () => {
      disposed = true;
      off.forEach((f) => f());
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    for (const session of data.sessions) configuration.observe(session);
  }, [data.sessions, configuration]);
  useEffect(() => {
    if (!desktop || !ready || !autoReconnect) return;
    // Opening the app should not launch an agent for every saved chat.
    const session = data.sessions.find((s) => s.id === activeSessionId);
    if (session) {
      void reconnect.current.restore(session, async (sessionId) => {
        updateSession(await call<SessionRecord>("reconnect", { sessionId }));
      });
    }
  }, [ready, data.sessions, autoReconnect, activeSessionId]);
  return (
    <Context.Provider
      value={{
        data,
        ready,
        refresh,
        transcripts,
        loadedTranscripts: new Set(hydrated.current),
        visibleTranscripts: new Set(visible.current),
        loadTranscript,
        setActiveSession,
        error,
        setError,
        updateSession,
        configuration,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useStore() {
  const value = useContext(Context);
  if (!value) throw new Error("Missing store");
  return value;
}
