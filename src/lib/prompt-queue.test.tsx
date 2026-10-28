// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { QueueSnapshot } from "./bindings/QueueSnapshot";
const mock = vi.hoisted(() => ({
  call: vi.fn(),
  listen: vi.fn(),
  handlers: [] as ((e: { payload: unknown }) => void)[],
}));
vi.mock("./api", () => ({ desktop: true, call: mock.call }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mock.listen }));
import { newerQueue, usePromptQueue } from "./prompt-queue";
const snapshot = (
  revision: number,
  childId: string | null = null,
): QueueSnapshot => ({
  sessionId: "chat",
  childId,
  revision,
  items: [
    {
      id: "pending",
      text: "Next task",
      attachments: ["notes.md"],
      intent: "send",
      editing: false,
    },
  ],
  paused: false,
  error: null,
  steering: false,
});
afterEach(() => {
  cleanup();
  mock.handlers.length = 0;
  vi.resetAllMocks();
});
it("ignores older snapshots for the same conversation", () => {
  expect(newerQueue(snapshot(5), snapshot(2)).revision).toBe(5);
  expect(newerQueue(snapshot(5), snapshot(1, "worker")).revision).toBe(1);
});
it("subscribes before reading and ignores a stale initial fetch", async () => {
  let resolve!: (value: QueueSnapshot) => void;
  mock.call.mockReturnValue(new Promise<QueueSnapshot>((r) => (resolve = r)));
  mock.listen.mockImplementation((_name, handler) => {
    mock.handlers.push(handler);
    return Promise.resolve(vi.fn());
  });
  const { result } = renderHook(() => usePromptQueue("chat", null, vi.fn()));
  await waitFor(() => expect(mock.call).toHaveBeenCalled());
  act(() => mock.handlers[0]({ payload: snapshot(4) }));
  await act(async () => resolve(snapshot(1)));
  expect(result.current.snapshot.revision).toBe(4);
});
it("unmounted chats recover the backend queue and two views receive the same changes", async () => {
  mock.call.mockResolvedValue(snapshot(1));
  mock.listen.mockImplementation((_name, handler) => {
    mock.handlers.push(handler);
    return Promise.resolve(vi.fn());
  });
  const first = renderHook(() => usePromptQueue("chat", null, vi.fn()));
  const second = renderHook(() => usePromptQueue("chat", null, vi.fn()));
  await waitFor(() => expect(first.result.current.snapshot.revision).toBe(1));
  await waitFor(() => expect(second.result.current.snapshot.revision).toBe(1));
  act(() =>
    mock.handlers.forEach((handler) => handler({ payload: snapshot(7) })),
  );
  expect(first.result.current.snapshot).toEqual(second.result.current.snapshot);
  first.unmount();
  mock.call.mockResolvedValue(snapshot(7));
  const remounted = renderHook(() => usePromptQueue("chat", null, vi.fn()));
  await waitFor(() =>
    expect(remounted.result.current.snapshot.revision).toBe(7),
  );
});
it("a late submission response cannot replace another worker's queue", async () => {
  mock.call.mockResolvedValue(snapshot(1));
  mock.listen.mockImplementation(() => Promise.resolve(vi.fn()));
  const { result, rerender } = renderHook(
    ({ child }) => usePromptQueue("chat", child, vi.fn()),
    { initialProps: { child: null as string | null } },
  );
  await waitFor(() => expect(result.current.snapshot.revision).toBe(1));
  const oldAccept = result.current.accept;
  mock.call.mockResolvedValue(snapshot(2, "worker"));
  rerender({ child: "worker" });
  await waitFor(() => expect(result.current.snapshot.revision).toBe(2));
  act(() => oldAccept(snapshot(10)));
  expect(result.current.snapshot.childId).toBe("worker");
  expect(result.current.snapshot.revision).toBe(2);
});
