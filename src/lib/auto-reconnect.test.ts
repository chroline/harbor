import { describe, expect, it, vi } from "vitest";
import { AutoReconnect } from "./auto-reconnect";
import type { SessionRecord } from "./bindings/SessionRecord";
const saved = {
  id: "chat",
  acpSessionId: "same-conversation",
  status: "disconnected",
  mode: "gui",
  archived: false,
} as SessionRecord;
describe("automatic session recovery", () => {
  it("deduplicates concurrent attempts and allows independent chats", async () => {
    const recovery = new AutoReconnect();
    let finish!: () => void;
    const reconnect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const attempt = recovery.restore(saved, reconnect, 0);
    await recovery.restore(saved, reconnect, 0);
    expect(reconnect).toHaveBeenCalledTimes(1);
    const other = vi.fn().mockResolvedValue(undefined);
    await recovery.restore({ ...saved, id: "other" }, other, 0);
    expect(other).toHaveBeenCalledWith("other");
    finish();
    await attempt;
  });
  it("never takes terminal ownership, starts new conversations, or retries explicit failures", async () => {
    const recovery = new AutoReconnect();
    const reconnect = vi.fn();
    for (const patch of [
      { mode: "terminal" },
      { archived: true },
      { acpSessionId: null },
      { status: "error" },
      { status: "cleanup_pending" },
      { status: "working" },
    ]) {
      await recovery.restore({ ...saved, ...patch }, reconnect);
    }
    expect(reconnect).not.toHaveBeenCalled();
  });
  it("bounds crash loops and releases failed attempts", async () => {
    const recovery = new AutoReconnect();
    const reconnect = vi.fn().mockRejectedValue(new Error("Adapter stopped"));
    for (let i = 0; i < 8; i++)
      await recovery.restore(saved, reconnect, i * 1000);
    expect(reconnect).toHaveBeenCalledTimes(3);
    await recovery.restore(saved, reconnect, 61_000);
    expect(reconnect).toHaveBeenCalledTimes(4);
  });
});
