import { expect, it, vi } from "vitest";
import { SessionConfiguration } from "./session-configuration";
import type { SessionRecord } from "./bindings/SessionRecord";

const session = (status = "idle", current = "agent"): SessionRecord => ({
  id: "chat",
  title: "Chat",
  projectId: null,
  workspaceId: null,
  isGit: false,
  cwd: "/tmp",
  acpSessionId: "wire-chat",
  nativeSessionId: null,
  worktreeId: null,
  createdAt: 0,
  updatedAt: 0,
  modes: null,
  models: null,
  error: null,
  draft: "",
  scrollTop: 0,
  reviewOpen: false,
  capabilities: {
    loadSession: true,
    resumeSession: false,
    configOptions: true,
    nativeHandoff: false,
    nativeHandoffReason: "",
    raw: {},
  },
  providerId: "cursor",
  status,
  mode: "gui",
  archived: false,
  configOptions: [
    {
      id: "mode",
      category: "mode",
      type: "select",
      currentValue: current,
      options: ["agent", "plan", "ask"].map((value) => ({
        value,
        name: value,
      })),
    },
  ],
});
function harness() {
  const apply = vi.fn(
    async (_sid: string, _id: string, value: string | boolean) =>
      session("idle", String(value)),
  );
  const update = vi.fn();
  const queue = new SessionConfiguration({ apply, update, changed: vi.fn() });
  return { queue, apply, update };
}

it.each(["working", "needs_input"])(
  "keeps only the latest mode during %s and applies after completion",
  async (status) => {
    const { queue, apply } = harness();
    queue.observe(session(status));
    queue.select(session(status), "mode", "plan");
    queue.select(session(status), "mode", "ask");
    expect(apply).not.toHaveBeenCalled();
    expect(queue.blocked("chat")).toBe(true);
    queue.observe(session("completed"));
    expect(apply).toHaveBeenCalledExactlyOnceWith("chat", "mode", "ask");
    await vi.waitFor(() => expect(queue.blocked("chat")).toBe(false));
  },
);

it("cancels a queued change when cycling back to the confirmed mode", () => {
  const { queue, apply } = harness();
  queue.select(session("working"), "mode", "plan");
  queue.select(session("working"), "mode", "agent");
  expect(queue.blocked("chat")).toBe(false);
  queue.observe(session());
  expect(apply).not.toHaveBeenCalled();
});

it("serializes rapid changes and blocks sending through the final acknowledgment", async () => {
  const { queue, apply } = harness();
  let resolve!: (s: SessionRecord) => void;
  apply.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  queue.select(session(), "mode", "plan");
  queue.select(session(), "mode", "ask");
  expect(apply).toHaveBeenCalledTimes(1);
  expect(queue.blocked("chat")).toBe(true);
  resolve(session("idle", "plan"));
  await vi.waitFor(() => expect(queue.blocked("chat")).toBe(false));
  expect(apply.mock.calls.map((c) => c[2])).toEqual(["plan", "ask"]);
});

it("retains errors and pending changes until an explicit retry or cancellation", async () => {
  const { queue, apply } = harness();
  apply.mockRejectedValueOnce(new Error("Provider refused"));
  queue.select(session(), "mode", "plan");
  await vi.waitFor(() =>
    expect(queue.get("chat").error).toContain("Provider refused"),
  );
  queue.observe(session());
  expect(apply).toHaveBeenCalledTimes(1);
  expect(queue.blocked("chat")).toBe(true);
  queue.retry("chat");
  await vi.waitFor(() => expect(queue.blocked("chat")).toBe(false));
  queue.observe(session("working", "plan"));
  queue.select(session("working", "plan"), "mode", "ask");
  await vi.waitFor(() => expect(queue.get("chat").busy).toBe(false));
  queue.cancel("chat");
  expect(queue.blocked("chat")).toBe(false);
});

it("survives navigation, waits through disconnects, and revalidates after reconnect", async () => {
  const { queue, apply } = harness();
  queue.select(session("working"), "mode", "plan");
  queue.observe({ ...session(), id: "other" });
  queue.observe(session("disconnected"));
  expect(apply).not.toHaveBeenCalled();
  queue.observe({ ...session(), configOptions: [] });
  expect(queue.get("chat").error).toContain("no longer available");
  queue.cancel("chat");
  queue.observe(session());
  queue.select(session(), "mode", "ask");
  await vi.waitFor(() => expect(queue.blocked("chat")).toBe(false));
});

it("applies a queued choice after acknowledged cancellation and ignores archived chats", async () => {
  const { queue, apply } = harness();
  queue.select(session("working"), "mode", "plan");
  queue.observe(session("idle"));
  await vi.waitFor(() => expect(queue.blocked("chat")).toBe(false));
  expect(apply).toHaveBeenCalledOnce();
  queue.observe(session("working", "plan"));
  queue.select(session("working", "plan"), "mode", "ask");
  queue.observe({ ...session(), archived: true });
  expect(queue.blocked("chat")).toBe(false);
  expect(apply).toHaveBeenCalledOnce();
});
