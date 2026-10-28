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

const nativeDismissedKey = (session: string) => `harbor.native-terminal-dismissed.${session}`;
export function readNativeTerminalDismissed(session: string): boolean {
  try { return localStorage.getItem(nativeDismissedKey(session)) === "true"; }
  catch { return false; }
}
export function saveNativeTerminalDismissed(session: string, dismissed: boolean) {
  try { localStorage.setItem(nativeDismissedKey(session), String(dismissed)); }
  catch { /* The current tab still closes when storage is unavailable. */ }
}
