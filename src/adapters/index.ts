import type { SupportedProviderId } from "@/lib/bindings/SupportedProviderId";
import type { AdapterRegistry, PlanReview } from "./contract";
import { claudeCode } from "./claude-code";
import { codex } from "./codex";
import { grokBuild } from "./grok-build";
export const adapters = {
  claude: claudeCode,
  codex,
  grok: grokBuild,
} satisfies AdapterRegistry;
export const DEFAULT_ADAPTER_ID = "codex" satisfies SupportedProviderId;
export function isAdapterId(id: string): id is SupportedProviderId {
  return Object.hasOwn(adapters, id);
}
export function getAdapter<Id extends SupportedProviderId>(
  id: Id,
): (typeof adapters)[Id] {
  return adapters[id];
}
/** Only legacy records/presentation boundaries may hold raw, unsupported IDs. */
export function findAdapter(id: string) {
  return isAdapterId(id) ? getAdapter(id) : undefined;
}
export function readPlan(
  request: unknown,
  provider?: SupportedProviderId,
): PlanReview | undefined {
  if (provider) return getAdapter(provider).readPlan(request);
  // Old request snapshots did not carry provider identity. Interpret only a
  // unique declared contract; ambiguous approvals keep their generic UI.
  const matches = Object.values(adapters).flatMap((adapter) => {
    const plan = adapter.readPlan(request);
    return plan ? [plan] : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
}
