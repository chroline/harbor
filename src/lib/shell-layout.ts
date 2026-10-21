import { useEffect, useState, useCallback } from "react";
import { cssLengthToPixels } from "./units";
export const WINDOW_GUTTER = 4;
export const SIDEBAR_PREFERENCE_KEY = "harbor.sidebar.v1";
export const DEFAULT_SIDEBAR_WIDTH = 256;
export const MIN_SIDEBAR_WIDTH = 160;
export const MAX_SIDEBAR_WIDTH = 360;
export type ShellPreferences = { open: boolean; width: number };
export const defaultShellPreferences: ShellPreferences = {
  open: true,
  width: DEFAULT_SIDEBAR_WIDTH,
};
export function parseShellPreferences(raw: string | null): ShellPreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    return {
      open: typeof value?.open === "boolean" ? value.open : true,
      width:
        typeof value?.width === "number" && Number.isFinite(value.width)
          ? Math.max(
              MIN_SIDEBAR_WIDTH,
              Math.min(MAX_SIDEBAR_WIDTH, value.width),
            )
          : DEFAULT_SIDEBAR_WIDTH,
    };
  } catch {
    return defaultShellPreferences;
  }
}
export function useShellLayout() {
  const [preferences, setPreferences] = useState(() => {
    try {
      return parseShellPreferences(
        localStorage.getItem(SIDEBAR_PREFERENCE_KEY),
      );
    } catch {
      return defaultShellPreferences;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_PREFERENCE_KEY, JSON.stringify(preferences));
    } catch {
      /* A restricted web preview may not allow local storage. */
    }
  }, [preferences]);
  const setSidebar = useCallback(
    (open: boolean | ((previous: boolean) => boolean)) => {
      setPreferences((p) => ({
        ...p,
        open: typeof open === "function" ? open(p.open) : open,
      }));
    },
    [],
  );
  const setWidth = useCallback((width: string) => {
    const parsed = cssLengthToPixels(width);
    if (Number.isFinite(parsed))
      setPreferences((p) => ({
        ...p,
        width: Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, parsed)),
      }));
  }, []);
  return {
    sidebar: preferences.open,
    setSidebar,
    width: preferences.width,
    setWidth,
  };
}
