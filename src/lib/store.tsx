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
import type { Bootstrap } from "./bindings/Bootstrap";
import type { SessionRecord } from "./bindings/SessionRecord";
import type { SessionEvent } from "./bindings/SessionEvent";
type Store = {
  data: Bootstrap;
  ready: boolean;
  refresh: () => Promise<void>;
  transcripts: Record<string, Transcript>;
  loadTranscript: (id: string) => Promise<void>;
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
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<SessionEvent[]>([]);
  const loading = useRef(new Set<string>());
  const live = useRef<Record<string, SessionEvent[]>>({});
  const active = useRef("");
  const reconnect = useRef(new AutoReconnect());
  const [, configurationChanged] = useState(0);
  const configurationRef = useRef<SessionConfiguration | null>(null);
  const bound = (cache: Record<string, Transcript>) => {
    const keys = Object.keys(cache)
      .filter((k) => k !== active.current)
      .sort((a, b) => cache[b].lastSequence - cache[a].lastSequence)
      .slice(0, 5);
    if (cache[active.current]) keys.push(active.current);
    return Object.fromEntries(keys.map((k) => [k, cache[k]]));
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
    });
  const configuration = configurationRef.current;
  const refresh = async () => {
    if (desktop) setData(await call<Bootstrap>("bootstrap"));
    setReady(true);
  };
  const loadTranscript = async (id: string) => {
    active.current = id;
    if (loading.current.has(id)) return;
    loading.current.add(id);
    live.current[id] = [];
    try {
      let t = emptyTranscript();
      let after = 0;
      for (;;) {
        const events = await call<SessionEvent[]>("get_events", {
          sessionId: id,
          after,
        });
        for (const e of events) t = reduceEvent(t, e);
        if (events.length < 5000) break;
        after = events.at(-1)!.sequence;
      }
      for (const e of live.current[id] ?? []) t = reduceEvent(t, e);
      setTranscripts((prev) => bound({ ...prev, [id]: t }));
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
      setTranscripts((prev) => {
        const next = { ...prev };
        for (const event of events) {
          if (loading.current.has(event.sessionId)) continue;
          next[event.sessionId] = reduceEvent(
            next[event.sessionId] ?? emptyTranscript(),
            event,
          );
        }
        return bound(next);
      });
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
    for (const session of data.sessions) {
      void reconnect.current.restore(session, async (sessionId) => {
        updateSession(await call<SessionRecord>("reconnect", { sessionId }));
      });
    }
  }, [ready, data.sessions, autoReconnect]);
  return (
    <Context.Provider
      value={{
        data,
        ready,
        refresh,
        transcripts,
        loadTranscript,
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
