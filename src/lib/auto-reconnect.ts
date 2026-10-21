import type { SessionRecord } from "./bindings/SessionRecord";

// A single coordinator survives React effect replays. Never replace a saved
// conversation, take ownership from a terminal, or loop on a crashing adapter.
export class AutoReconnect {
  private pending = new Set<string>();
  private attempts = new Map<string, number[]>();

  async restore(
    session: SessionRecord,
    reconnect: (id: string) => Promise<unknown>,
    now = Date.now(),
  ) {
    if (
      session.archived ||
      session.mode !== "gui" ||
      session.status !== "disconnected" ||
      !session.acpSessionId ||
      this.pending.has(session.id)
    )
      return;
    const recent = (this.attempts.get(session.id) ?? []).filter(
      (time) => now - time < 60_000,
    );
    if (recent.length >= 3) return;
    this.attempts.set(session.id, [...recent, now]);
    this.pending.add(session.id);
    try {
      await reconnect(session.id);
    } catch {
      // Native connection errors are persisted on the chat, with a retry action.
      // Do not duplicate them as global notifications during startup.
    } finally {
      this.pending.delete(session.id);
    }
  }
}
