import { useEffect, useState, useCallback } from "react";
import { cssLengthToPixels } from "./units";
export const WINDOW_GUTTER = 4;
export const SIDEBAR_PREFERENCE_KEY = "harbor.sidebar.v1";
export const DEFAULT_SIDEBAR_WIDTH = 256;
/** Pinned lights, sidebar toggle, and search. History starts after this. */
export const SIDEBAR_CHROME_PINNED_WIDTH = 160;
/** Back and forward (4rem) plus the 0.375rem inset that matches the space
 *  above those controls in the top bar. Keep in sync with .topbar-history. */
export const SIDEBAR_HISTORY_RESERVE = 70;
/** Narrower than this, and the history buttons leave the sidebar card. */
export const MIN_SIDEBAR_WIDTH =
  SIDEBAR_CHROME_PINNED_WIDTH + SIDEBAR_HISTORY_RESERVE;
/** Full width of the conversation column. Matches `--chat-column-max-width`. */
export const CONVERSATION_COLUMN_MAX = "51.25rem";

/** The conversation's designed width, read from the page when it is mounted. */
export function conversationColumnWidth(): number {
  if (typeof document !== "undefined") {
    const column = document.querySelector(".chat-main");
    const raw = column
      ? getComputedStyle(column)
          .getPropertyValue("--chat-column-max-width")
          .trim()
      : "";
    const parsed = raw ? cssLengthToPixels(raw) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return cssLengthToPixels(CONVERSATION_COLUMN_MAX);
}

/** Widest sidebar that still leaves the conversation at its full column width. */
export function sidebarWidthCeiling(viewportWidth: number): number {
  return Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.round(viewportWidth - conversationColumnWidth()),
  );
}

function clampSidebarWidth(width: number, viewportWidth: number): number {
  return Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(sidebarWidthCeiling(viewportWidth), Math.round(width)),
  );
}
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
          ? Math.max(MIN_SIDEBAR_WIDTH, Math.round(value.width))
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
  const [viewport, setViewport] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerWidth,
  );
  if (preferences.width < MIN_SIDEBAR_WIDTH) {
    setPreferences((current) => ({
      ...current,
      width: Math.max(MIN_SIDEBAR_WIDTH, current.width),
    }));
  }
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_PREFERENCE_KEY, JSON.stringify(preferences));
    } catch {
      /* A restricted web preview may not allow local storage. */
    }
  }, [preferences]);
  useEffect(() => {
    const sync = () => setViewport(window.innerWidth);
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);
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
        width: clampSidebarWidth(parsed, window.innerWidth),
      }));
  }, []);
  const width = clampSidebarWidth(
    preferences.width,
    viewport ||
      (typeof window === "undefined" ? preferences.width : window.innerWidth),
  );
  return {
    sidebar: preferences.open,
    setSidebar,
    width,
    setWidth,
  };
}
