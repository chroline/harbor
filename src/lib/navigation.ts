export type View = "home" | "worktrees" | "settings" | { session: string };
export type NavigationHistory = { entries: View[]; index: number };
export const initialHistory: NavigationHistory = {
  entries: ["home"],
  index: 0,
};
export const viewKey = (view: View) =>
  typeof view === "string" ? view : `chat:${view.session}`;
export function visit(
  history: NavigationHistory,
  next: View,
): NavigationHistory {
  if (viewKey(history.entries[history.index]) === viewKey(next)) return history;
  const entries = [...history.entries.slice(0, history.index + 1), next].slice(
    -100,
  );
  return { entries, index: entries.length - 1 };
}
export function travel(
  history: NavigationHistory,
  direction: -1 | 1,
): NavigationHistory {
  const index = Math.max(
    0,
    Math.min(history.entries.length - 1, history.index + direction),
  );
  return index === history.index ? history : { ...history, index };
}
export function pruneHistory(
  history: NavigationHistory,
  sessionIds: ReadonlySet<string>,
): NavigationHistory {
  const entries: View[] = [];
  let index = 0;
  history.entries.forEach((entry, oldIndex) => {
    if (typeof entry !== "string" && !sessionIds.has(entry.session)) return;
    if (
      !entries.length ||
      viewKey(entries[entries.length - 1]) !== viewKey(entry)
    )
      entries.push(entry);
    if (oldIndex <= history.index) index = entries.length - 1;
  });
  if (!entries.length) return initialHistory;
  if (entries.length === history.entries.length && index === history.index)
    return history;
  return { entries, index };
}
