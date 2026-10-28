// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StoreProvider, useStore } from "./store";
import type { SessionEvent } from "./bindings/SessionEvent";
import type { SessionRecord } from "./bindings/SessionRecord";
import { emptyTranscript, reduceEvent } from "./protocol";

const mock = vi.hoisted(() => ({
  call: vi.fn(),
  handlers: new Map<string, (event: { payload: unknown }) => void>(),
  readCache: vi.fn(),
  writeCache: vi.fn(),
}));
vi.mock("./transcript-cache", () => ({
  readTranscriptCache: mock.readCache,
  writeTranscriptCache: mock.writeCache,
  pruneTranscriptCache: vi.fn(),
}));
vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  desktop: true,
  call: mock.call,
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name, handler) => {
    mock.handlers.set(name, handler);
    return () => mock.handlers.delete(name);
  }),
}));

const event = (sessionId: string, sequence: number): SessionEvent => ({
  sessionId,
  sequence,
  kind: "user_message",
  payload: { text: `message ${sequence}` },
  timestamp: sequence,
});
let history: SessionEvent[];
let sessions: SessionRecord[];
beforeEach(() => {
  history = [];
  sessions = [];
  mock.readCache.mockReset().mockResolvedValue(null);
  mock.writeCache.mockReset().mockResolvedValue(undefined);
  mock.call.mockReset().mockImplementation(async (command, args) => {
    if (command === "bootstrap")
      return { sessions, providers: [], projects: [], workspaces: [] };
    if (command === "reconnect")
      return {
        ...sessions.find((s) => s.id === args.sessionId),
        status: "idle",
      };
    if (command === "get_events")
      return history
        .filter(
          (e) => e.sessionId === args.sessionId && e.sequence > args.after,
        )
        .slice(0, args.limit ?? 5000);
    if (command === "get_recent_events") {
      const events = history.filter((e) => e.sessionId === args.sessionId);
      const users = events.filter((e) => e.kind === "user_message");
      const start = users.length >= 3 ? users.at(-3)!.sequence : 0;
      return {
        events: events.filter((e) => e.sequence >= start),
        hasEarlier: events.some((e) => e.sequence < start),
      };
    }
    throw new Error(`Unexpected command: ${command}`);
  });
});
afterEach(() => {
  cleanup();
  mock.handlers.clear();
});
async function setup(autoReconnect = false) {
  const hook = renderHook(useStore, {
    wrapper: ({ children }) => (
      <StoreProvider autoReconnect={autoReconnect}>{children}</StoreProvider>
    ),
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
}

it("does not reconnect saved chats or read their histories on startup", async () => {
  sessions = ["a", "b", "c"].map(
    (id) =>
      ({
        id,
        acpSessionId: `saved-${id}`,
        status: "disconnected",
        mode: "gui",
        archived: false,
      }) as SessionRecord,
  );
  await setup(true);
  expect(mock.call.mock.calls.map(([command]) => command)).toEqual([
    "bootstrap",
  ]);
});

it("reconnects only the open chat and stops recovery when it closes", async () => {
  sessions = ["a", "b", "c"].map(
    (id) =>
      ({
        id,
        acpSessionId: `saved-${id}`,
        status: "disconnected",
        mode: "gui",
        archived: false,
      }) as SessionRecord,
  );
  const { result } = await setup(true);
  act(() => result.current.setActiveSession("a"));
  await waitFor(() =>
    expect(result.current.data.sessions[0].status).toBe("idle"),
  );
  expect(mock.call.mock.calls.filter(([name]) => name === "reconnect")).toEqual(
    [["reconnect", { sessionId: "a" }]],
  );
  act(() => result.current.setActiveSession("b"));
  await waitFor(() =>
    expect(result.current.data.sessions[1].status).toBe("idle"),
  );
  mock.call.mockClear();
  act(() => result.current.setActiveSession(null));
  act(() => mock.handlers.get("session-changed")!({ payload: sessions[1] }));
  await act(() => result.current.refresh());
  expect(mock.call.mock.calls.map(([command]) => command)).toEqual([
    "bootstrap",
  ]);
});

it("keeps automatic recovery disabled in detached windows", async () => {
  sessions = [
    {
      id: "a",
      acpSessionId: "saved-a",
      status: "disconnected",
      mode: "gui",
      archived: false,
    } as SessionRecord,
  ];
  const { result } = await setup(false);
  act(() => result.current.setActiveSession("a"));
  expect(mock.call.mock.calls.map(([command]) => command)).toEqual([
    "bootstrap",
  ]);
});

it("reuses complete history when switching back and fetches only newer events", async () => {
  history = [event("a", 1), event("b", 2)];
  const { result } = await setup();
  await act(() => result.current.loadTranscript("a"));
  await act(() => result.current.loadTranscript("b"));
  const cached = result.current.transcripts.a;
  mock.call.mockClear();
  await act(() => result.current.loadTranscript("a"));
  expect(mock.call).toHaveBeenCalledWith("get_events", {
    sessionId: "a",
    after: 1,
    limit: 5000,
  });
  expect(result.current.transcripts.a).toBe(cached);
  history.push(event("a", 3));
  await act(() => result.current.loadTranscript("a"));
  expect(result.current.transcripts.a.messages.map((m) => m.text)).toEqual([
    "message 1",
    "message 3",
  ]);
});

it("does not mistake a background stream fragment for complete history", async () => {
  history = [event("a", 1), event("a", 2)];
  const { result } = await setup();
  act(() => mock.handlers.get("session-event")!({ payload: history[1] }));
  await waitFor(() =>
    expect(result.current.transcripts.a?.lastSequence).toBe(2),
  );
  await act(() => result.current.loadTranscript("a"));
  expect(result.current.transcripts.a.messages.map((m) => m.text)).toEqual([
    "message 1",
    "message 2",
  ]);
});

it("loads every page while allowing the event loop to run during replay", async () => {
  history = Array.from({ length: 10001 }, (_, i) => event("a", i + 1));
  const { result } = await setup();
  let clock = 0;
  const now = vi
    .spyOn(performance, "now")
    .mockImplementation(() => (clock += 0.01));
  let finished = false;
  let yielded = false;
  const timer = setTimeout(() => {
    yielded = !finished;
  }, 0);
  await act(async () => {
    await result.current.loadTranscript("a");
    finished = true;
  });
  clearTimeout(timer);
  now.mockRestore();
  expect(yielded).toBe(true);
  expect(result.current.transcripts.a.lastSequence).toBe(10001);
  expect(result.current.transcripts.a.messages).toHaveLength(10001);
  expect(result.current.transcripts.a.messages[0].text).toBe("message 1");
  const reads = mock.call.mock.calls.filter(([name]) => name === "get_events");
  expect(reads.map(([, args]) => args.after)).toEqual([0, 5000, 10000]);
});

it("shows newest turns before older history and keeps that preview live without caching it as complete", async () => {
  history = Array.from({ length: 10 }, (_, i) => event("a", i + 1));
  const older = [...history];
  const { result } = await setup();
  const read = mock.call.getMockImplementation()!;
  let finish!: (events: SessionEvent[]) => void;
  mock.call.mockImplementation((command, args) =>
    command === "get_events"
      ? new Promise<SessionEvent[]>((resolve) => {
          finish = resolve;
        })
      : read(command, args),
  );
  let loading!: Promise<void>;
  act(() => {
    loading = result.current.loadTranscript("a");
  });
  await waitFor(() =>
    expect(result.current.visibleTranscripts.has("a")).toBe(true),
  );
  expect(result.current.loadedTranscripts.has("a")).toBe(false);
  expect(result.current.transcripts.a.messages.map((m) => m.text)).toEqual([
    "message 8",
    "message 9",
    "message 10",
  ]);
  expect(mock.writeCache).not.toHaveBeenCalled();
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  act(() => mock.handlers.get("session-event")!({ payload: event("a", 11) }));
  await waitFor(() =>
    expect(result.current.transcripts.a.lastSequence).toBe(11),
  );
  await act(async () => {
    finish(older);
    await loading;
  });
  expect(result.current.loadedTranscripts.has("a")).toBe(true);
  expect(result.current.transcripts.a.messages.map((m) => m.text)).toEqual(
    Array.from({ length: 11 }, (_, i) => `message ${i + 1}`),
  );
  expect(mock.writeCache).toHaveBeenCalledWith(
    "a",
    result.current.transcripts.a,
  );
});

it("adds newest turns to a persisted checkpoint without duplicating its messages", async () => {
  history = [event("a", 1), event("a", 2), event("a", 3)];
  const checkpoint = reduceEvent(
    reduceEvent(emptyTranscript(), history[0]),
    history[1],
  );
  mock.readCache.mockResolvedValue(checkpoint);
  const { result } = await setup();
  await act(() => result.current.loadTranscript("a"));
  expect(mock.call).toHaveBeenCalledWith("get_recent_events", {
    sessionId: "a",
  });
  expect(result.current.transcripts.a.messages.map((m) => m.text)).toEqual([
    "message 1",
    "message 2",
    "message 3",
  ]);
  expect(mock.writeCache).toHaveBeenCalledWith(
    "a",
    result.current.transcripts.a,
  );
  expect(result.current.loadedTranscripts.has("a")).toBe(true);
});

it("marks an unchanged persisted checkpoint fully loaded after its recent read", async () => {
  history = [event("a", 1), event("a", 2)];
  mock.readCache.mockResolvedValue(
    history.reduce(reduceEvent, emptyTranscript()),
  );
  const { result } = await setup();
  await act(() => result.current.loadTranscript("a"));
  expect(result.current.loadedTranscripts.has("a")).toBe(true);
  expect(result.current.visibleTranscripts.has("a")).toBe(true);
});

it("discards a checkpoint ahead of the authoritative event log", async () => {
  history = [event("a", 1), event("a", 2)];
  mock.readCache.mockResolvedValue(
    reduceEvent(emptyTranscript(), event("a", 99)),
  );
  const { result } = await setup();
  await act(() => result.current.loadTranscript("a"));
  expect(mock.call).toHaveBeenCalledWith("get_recent_events", {
    sessionId: "a",
  });
  expect(result.current.transcripts.a.messages.map((m) => m.text)).toEqual([
    "message 1",
    "message 2",
  ]);
});

it("retains live events received during hydration without duplicating them", async () => {
  history = [event("a", 1)];
  const { result } = await setup();
  const read = mock.call.getMockImplementation()!;
  let finish!: (events: SessionEvent[]) => void;
  mock.call.mockImplementation((command, args) =>
    command === "get_recent_events"
      ? new Promise((resolve) => {
          finish = (events) => resolve({ events, hasEarlier: false });
        })
      : read(command, args),
  );
  let loading!: Promise<void>;
  act(() => {
    loading = result.current.loadTranscript("a");
  });
  await waitFor(() => expect(finish).toBeTypeOf("function"));
  act(() => mock.handlers.get("session-event")!({ payload: event("a", 2) }));
  await act(async () => {
    finish(history);
    await loading;
  });
  expect(result.current.transcripts.a.messages.map((m) => m.text)).toEqual([
    "message 1",
    "message 2",
  ]);
  await act(() => new Promise((resolve) => setTimeout(resolve, 70)));
  expect(result.current.transcripts.a.messages).toHaveLength(2);
});

it("marks a chat ready only after full history hydration, including an empty history", async () => {
  history = [event("a", 1), event("a", 2)];
  const { result } = await setup();
  act(() => mock.handlers.get("session-event")!({ payload: history[1] }));
  await waitFor(() =>
    expect(result.current.transcripts.a?.lastSequence).toBe(2),
  );
  expect(result.current.loadedTranscripts.has("a")).toBe(false);
  await act(() => result.current.loadTranscript("a"));
  expect(result.current.loadedTranscripts.has("a")).toBe(true);
  await act(() => result.current.loadTranscript("empty"));
  expect(result.current.loadedTranscripts.has("empty")).toBe(true);
});

it("rebuilds evicted histories even if a new live event creates a partial entry", async () => {
  history = Array.from({ length: 7 }, (_, i) => event(String(i), i + 1));
  const { result } = await setup();
  for (let i = 0; i < 7; i++)
    await act(() => result.current.loadTranscript(String(i)));
  expect(result.current.transcripts["0"]).toBeUndefined();
  const latest = event("0", 8);
  history.push(latest);
  act(() => mock.handlers.get("session-event")!({ payload: latest }));
  await waitFor(() =>
    expect(result.current.transcripts["0"]?.lastSequence).toBe(8),
  );
  await act(() => result.current.loadTranscript("0"));
  expect(result.current.transcripts["0"].messages.map((m) => m.text)).toEqual([
    "message 1",
    "message 8",
  ]);
});

it("keeps independently loading chats and retries a failed history read", async () => {
  history = [event("a", 1), event("b", 2)];
  const { result } = await setup();
  mock.call.mockRejectedValueOnce(new Error("read failed"));
  await act(() => result.current.loadTranscript("a"));
  expect(result.current.error).toBe("Error: read failed");
  await act(async () => {
    await Promise.all([
      result.current.loadTranscript("a"),
      result.current.loadTranscript("a"),
      result.current.loadTranscript("b"),
    ]);
  });
  expect(result.current.transcripts.a.messages[0].text).toBe("message 1");
  expect(result.current.transcripts.b.messages[0].text).toBe("message 2");
  expect(
    mock.call.mock.calls.filter(([name]) =>
      ["get_events", "get_recent_events"].includes(name),
    ),
  ).toHaveLength(3);
});
