import { useSyncExternalStore } from "react";
import type { RecentModel } from "./model-recents";

export const FAVORITE_MODELS_KEY = "harbor.favorite-models.v1";

const key = (m: Pick<RecentModel, "providerId" | "value">) =>
  JSON.stringify([m.providerId, m.value]);

function read(): RecentModel[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(FAVORITE_MODELS_KEY) ?? "[]",
    );
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.filter((m): m is RecentModel => {
      const valid =
        !!m &&
        typeof m.providerId === "string" &&
        typeof m.optionId === "string" &&
        typeof m.value === "string" &&
        typeof m.name === "string" &&
        !seen.has(key(m));
      if (valid) seen.add(key(m));
      return valid;
    });
  } catch {
    return [];
  }
}

// One shared snapshot so every open menu reflects a toggle immediately.
let favorites: RecentModel[] | undefined;
const listeners = new Set<() => void>();
const snapshot = () => (favorites ??= read());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export function isFavoriteModel(
  list: RecentModel[],
  model: Pick<RecentModel, "providerId" | "value">,
) {
  return list.some((m) => key(m) === key(model));
}

export function toggleFavoriteModel(model: RecentModel) {
  const current = snapshot();
  favorites = isFavoriteModel(current, model)
    ? current.filter((m) => key(m) !== key(model))
    : [...current, model];
  try {
    localStorage.setItem(FAVORITE_MODELS_KEY, JSON.stringify(favorites));
  } catch {
    /* Keep favorites usable for this session when storage is unavailable. */
  }
  listeners.forEach((fn) => fn());
}

/** Favorite agent + model pairs, shared across workspaces, in the order added. */
export function useFavoriteModels() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Test-only: forget the cached snapshot so storage is read again. */
export function resetFavoriteModelsForTest() {
  favorites = undefined;
}
