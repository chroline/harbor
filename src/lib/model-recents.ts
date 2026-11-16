import { array, options, record, str, values } from "./protocol";
import type { SessionRecord } from "./bindings/SessionRecord";

export type RecentModel = {
  providerId: string;
  /** Config option that selects the model, or `__legacy_model`. */
  optionId: string;
  value: string;
  name: string;
};

/** The model a session last ran, read from its persisted configuration. */
export function sessionModel(session: SessionRecord): RecentModel | undefined {
  const option = options(session.configOptions).find(
    (o) => o.category === "model" || o.id === "model",
  );
  if (option) {
    const value = str(option.currentValue);
    if (!value) return;
    const choice = values(option).find((c) => c.value === value);
    return {
      providerId: session.providerId,
      optionId: option.id,
      value,
      name: choice?.name ?? value,
    };
  }
  const models = record(session.models);
  const value = str(models.currentModelId);
  if (!value) return;
  const choice = array(models.availableModels)
    .map(record)
    .find((m) => str(m.modelId) === value);
  return {
    providerId: session.providerId,
    optionId: "__legacy_model",
    value,
    name: str(choice?.name, value),
  };
}

/** Distinct agent + model pairs used in a workspace, most recent first. */
export function workspaceRecentModels(
  sessions: SessionRecord[],
  workspaceId: string | null,
  providerIds: string[],
  limit = 5,
): RecentModel[] {
  const seen = new Set<string>();
  const result: RecentModel[] = [];
  for (const session of [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)) {
    if (session.workspaceId !== workspaceId || session.isOrchestrator) continue;
    if (!providerIds.includes(session.providerId)) continue;
    const model = sessionModel(session);
    if (!model) continue;
    const key = JSON.stringify([model.providerId, model.value]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(model);
    if (result.length >= limit) break;
  }
  return result;
}
