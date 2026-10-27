const key = (session: string) => `harbor.task-tab-selection.${session}`;

export function readTaskTabSelection(session: string): string {
  try {
    return localStorage.getItem(key(session)) || "parent";
  } catch {
    return "parent";
  }
}

export function saveTaskTabSelection(session: string, tab: string) {
  try {
    localStorage.setItem(key(session), tab);
  } catch {}
}
