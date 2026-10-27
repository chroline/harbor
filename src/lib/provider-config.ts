import { supportedProviderId } from "./providers";
import { useEffect, useSyncExternalStore } from "react";
import { call, desktop, json } from "./api";
import { array, options, record, str } from "./protocol";
import type { ProviderDefinition } from "./bindings/ProviderDefinition";
import type { ProviderConfiguration } from "./bindings/ProviderConfiguration";

type Entry = {
  config?: ProviderConfiguration;
  busy: boolean;
  error?: string;
  pending?: Record<string, string | boolean>;
};
const empty: Entry = { busy: false };
const entries = new Map<string, Entry>();
const generations = new Map<string, number>();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
function publish(key: string, value: Entry) {
  entries.set(key, value);
  listeners.forEach((fn) => fn());
}
export function invalidateProviderConfig(providerId: string) {
  for (const key of entries.keys()) {
    if (JSON.parse(key)[0] === providerId) {
      generations.set(key, (generations.get(key) ?? 0) + 1);
      entries.delete(key);
    }
  }
  listeners.forEach((fn) => fn());
}
export function modelControls(config?: ProviderConfiguration) {
  return options(config?.configOptions).filter(
    (o) =>
      ["model", "thought_level", "model_config"].includes(o.category ?? "") ||
      /model|reasoning|effort/i.test(o.id),
  );
}
export function modelSelections(
  config?: ProviderConfiguration,
): Record<string, string | boolean> {
  const result = Object.fromEntries(
    modelControls(config).map((o) => [o.id, o.currentValue]),
  );
  const models = record(config?.models);
  if (
    !modelControls(config).some(
      (o) => o.category === "model" || o.id === "model",
    ) &&
    str(models.currentModelId)
  ) {
    result.__legacy_model = str(models.currentModelId);
  }
  return result;
}
/** Settings shown before launch must survive model changes and reach the session. */
export function configurationSelections(
  config?: ProviderConfiguration,
): Record<string, string | boolean> {
  const mode = record(config?.modes);
  return {
    ...modelSelections(config),
    ...(str(mode.currentModeId) &&
    !options(config?.configOptions).some(
      (o) => o.category === "mode" || o.id === "mode",
    )
      ? { __legacy_mode: str(mode.currentModeId) }
      : {}),
    ...Object.fromEntries(
      options(config?.configOptions).map((o) => [o.id, o.currentValue]),
    ),
  };
}
export function legacyModels(config?: ProviderConfiguration) {
  return array(record(config?.models).availableModels)
    .map(record)
    .map((m) => ({
      value: str(m.modelId),
      label: str(m.name, str(m.modelId)),
    }));
}
async function load(
  key: string,
  provider: ProviderDefinition,
  selections: Record<string, string | boolean>,
) {
  const generation = generations.get(key) ?? 0;
  const previous = entries.get(key);
  if (previous?.busy) {
    publish(key, {
      ...previous,
      pending: { ...previous.pending, ...selections },
    });
    return;
  }
  publish(key, {
    ...previous,
    busy: true,
    error: undefined,
    pending: selections,
  });
  try {
    const config = await call<ProviderConfiguration>(
      "discover_provider_config",
      { providerId: supportedProviderId(provider.id), selections: json(selections) },
    );
    if ((generations.get(key) ?? 0) !== generation) return;
    const pending = entries.get(key)?.pending;
    publish(key, { config, busy: false });
    if (pending && pending !== selections)
      void load(key, provider, {
        ...configurationSelections(config),
        ...pending,
      });
  } catch (error) {
    if ((generations.get(key) ?? 0) !== generation) return;
    publish(key, {
      ...previous,
      pending: entries.get(key)?.pending,
      busy: false,
      error: String(error),
    });
  }
}
type ProviderConfigState = Entry & {
  preview: boolean;
  selections: Record<string, string | boolean>;
  retry: () => void;
  set: (id: string, value: string | boolean) => void;
  cancel?: () => void;
  blocked?: () => boolean;
};
export function useProviderConfig(
  provider?: ProviderDefinition,
  enabled = true,
): ProviderConfigState {
  const key = provider
    ? JSON.stringify([provider.id, provider.command, provider.args])
    : "";
  const entry = useSyncExternalStore(
    subscribe,
    () => entries.get(key) ?? empty,
  );
  useEffect(() => {
    if (desktop && enabled && provider && !entries.has(key))
      void load(key, provider, {});
  }, [key, enabled, entry]);
  return {
    ...entry,
    preview: !desktop,
    selections: configurationSelections(entry.config),
    retry: () => {
      if (provider)
        void load(key, provider, {
          ...configurationSelections(entry.config),
          ...entry.pending,
        });
    },
    cancel: () => {
      if (!entries.get(key)?.busy)
        publish(key, { config: entry.config, busy: false });
    },
    blocked: () => {
      const s = entries.get(key);
      return !!s?.busy || !!(s?.error && s?.pending);
    },
    set: (id: string, value: string | boolean) => {
      if (provider)
        void load(key, provider, {
          ...configurationSelections(entries.get(key)?.config),
          ...entries.get(key)?.pending,
          [id]: value,
        });
    },
  };
}

export function missingModelMessage(config: ProviderConfiguration): string {
  const info = record(config.agentInfo);
  const name = str(info.title, str(info.name, "The connected agent"));
  const version = str(info.version);
  return `${name}${version ? ` ${version}` : ""} returned no model options. Check the executable version and provider sign-in, then retry.`;
}
