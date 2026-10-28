import { readSavedView } from "./navigation";

/** Bootstrap is authoritative; remove UI references to chats deleted by migration. */
export function reconcileStorage(storage: Storage, sessions: ReadonlySet<string>) {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i)!);
  for (const key of keys) {
    for (const prefix of ["harbor.task-tabs.", "harbor.task-tab-selection.", "harbor.worker-drafts.", "harbor.root-draft.", "harbor.native-terminal-dismissed."]) {
      if (key.startsWith(prefix) && !sessions.has(key.slice(prefix.length))) storage.removeItem(key);
    }
  }
  const view = readSavedView(storage.getItem("harbor.last-view"));
  if (typeof view !== "string" && !sessions.has(view.session)) storage.setItem("harbor.last-view", JSON.stringify("home"));
  for (const key of ["harbor.pinned-chats.v1", "harbor.unseen-turns.v1"]) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    try {
      const ids: unknown = JSON.parse(raw);
      storage.setItem(key, JSON.stringify(Array.isArray(ids) ? ids.filter((id) => typeof id === "string" && sessions.has(id)) : []));
    } catch { storage.removeItem(key); }
  }
  const key = "harbor.sidebar-order.v1";
  const raw = storage.getItem(key);
  if (raw !== null) {
    try {
      const orders = JSON.parse(raw);
      if (!orders || typeof orders !== "object" || Array.isArray(orders)) { storage.removeItem(key); return; }
      for (const group of Object.keys(orders)) {
        if (group === "pinned" || group.startsWith("chats:")) orders[group] = Array.isArray(orders[group]) ? orders[group].filter((id: unknown) => typeof id === "string" && sessions.has(id)) : [];
      }
      storage.setItem(key, JSON.stringify(orders));
    } catch { storage.removeItem(key); }
  }
}
