import type { SessionRecord } from "./bindings/SessionRecord";
import { array, options, record, values } from "./protocol";

type Change = { id: string; value: string | boolean };
export type ConfigurationState = {
  busy: boolean;
  pending: Change[];
  error?: string;
};
const empty: ConfigurationState = { busy: false, pending: [] };

/** One queue per session, owned by the app rather than the mounted chat. */
export class SessionConfiguration {
  private sessions = new Map<string, SessionRecord>();
  private states = new Map<string, ConfigurationState>();
  private gates = new Map<string, Promise<void>>();
  constructor(
    private deps: {
      apply: (
        sessionId: string,
        id: string,
        value: string | boolean,
      ) => Promise<SessionRecord>;
      update: (session: SessionRecord) => void;
      changed: () => void;
      hold?: (id: string, blocked: boolean) => Promise<void>;
    },
  ) {}

  get(id: string) {
    return this.states.get(id) ?? empty;
  }
  blocked(id: string) {
    // Only chat creation waits for confirmation. Existing chats keep their
    // composer and selectors interactive while this queue syncs in the background.
    const s = this.get(id);
    return s.busy || s.pending.length > 0 || !!s.error;
  }
  observe(session: SessionRecord) {
    this.sessions.set(session.id, session);
    if (session.archived) {
      this.put(session.id, empty);
      this.states.delete(session.id);
      return;
    }
    void this.drain(session.id);
  }
  select(session: SessionRecord, id: string, value: string | boolean) {
    if (!this.sessions.has(session.id)) this.sessions.set(session.id, session);
    const state = this.get(session.id);
    const change = { id, value };
    this.put(session.id, {
      ...state,
      error: undefined,
      pending: [...state.pending.filter((p) => p.id !== id), change],
    });
    void this.drain(session.id);
  }
  retry(id: string) {
    this.put(id, { ...this.get(id), error: undefined });
    void this.drain(id);
  }
  cancel(id: string) {
    if (this.get(id).busy) return;
    this.put(id, empty);
  }
  private put(id: string, state: ConfigurationState) {
    const wasBlocked = this.blocked(id);
    const retrying = !!this.get(id).error && !state.error;
    this.states.set(id, state);
    if (this.deps.hold && (wasBlocked !== this.blocked(id) || retrying)) {
      const previous = this.gates.get(id) ?? Promise.resolve();
      const blocked = this.blocked(id);
      this.gates.set(
        id,
        previous.catch(() => {}).then(() => this.deps.hold!(id, blocked)),
      );
    }
    this.deps.changed();
  }
  private async drain(id: string) {
    try {
      const gate = this.gates.get(id);
      if (gate) await gate;
    } catch (error) {
      this.put(id, { ...this.get(id), busy: false, error: String(error) });
      return;
    }
    const state = this.get(id);
    const session = this.sessions.get(id);
    if (
      !session ||
      session.archived ||
      state.busy ||
      state.error ||
      !state.pending.length
    )
      return;
    const change = state.pending[0];
    const option = options(session.configOptions).find(
      (o) => o.id === change.id,
    );
    const legacy = record(
      change.id === "__legacy_mode" ? session.modes : session.models,
    );
    const current =
      option?.currentValue ??
      legacy[
        change.id === "__legacy_mode" ? "currentModeId" : "currentModelId"
      ];
    // Cycling back to the confirmed mode cancels an unapplied selection, even mid-turn.
    if (current === change.value) {
      this.put(id, { ...state, pending: state.pending.slice(1) });
      void this.drain(id);
      return;
    }
    if (
      session.mode !== "gui" ||
      !["idle", "completed"].includes(session.status)
    )
      return;
    const valid = option
      ? option.type === "boolean"
        ? typeof change.value === "boolean"
        : values(option).some((v) => v.value === change.value)
      : array(
          legacy[
            change.id === "__legacy_mode" ? "availableModes" : "availableModels"
          ],
        ).some(
          (v) =>
            record(v)[change.id === "__legacy_mode" ? "id" : "modelId"] ===
            change.value,
        );
    if (!valid) {
      this.put(id, {
        ...state,
        error:
          "The selected setting is no longer available. Choose another value or cancel the change.",
      });
      return;
    }
    this.put(id, { ...state, busy: true });
    try {
      const updated = await this.deps.apply(id, change.id, change.value);
      if (
        updated.id !== session.id ||
        updated.acpSessionId !== session.acpSessionId
      ) {
        throw new Error(
          "Configuration response belongs to a different conversation. Reconnect before retrying.",
        );
      }
      const confirmed =
        options(updated.configOptions).find((o) => o.id === change.id)
          ?.currentValue ??
        (change.id === "__legacy_mode"
          ? record(updated.modes).currentModeId
          : change.id === "__legacy_model"
            ? record(updated.models).currentModelId
            : undefined);
      if (confirmed !== change.value) {
        throw new Error(
          "The provider did not confirm the selected setting. Retry or cancel the change.",
        );
      }
      this.sessions.set(id, updated);
      this.deps.update(updated);
      const latest = this.get(id);
      this.put(id, {
        ...latest,
        busy: false,
        pending: latest.pending.filter((p) => p !== change),
      });
      void this.drain(id);
    } catch (error) {
      this.put(id, { ...this.get(id), busy: false, error: String(error) });
    }
  }
}
