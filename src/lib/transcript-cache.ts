import type { Transcript } from "./protocol";

// Bump when reducer semantics or the Transcript shape change. The event log
// remains authoritative; this is only a disposable checkpoint for cold opens.
const VERSION = 4;
const DATABASE = "harbor-transcript-cache";
const STORE = "transcripts";

async function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE)) db.deleteObjectStore(STORE);
      db.createObjectStore(STORE).createIndex("savedAt", "savedAt");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Transcript cache is blocked"));
  });
}

export async function readTranscriptCache(
  id: string,
): Promise<Transcript | null> {
  if (typeof indexedDB === "undefined") return null;
  let db: IDBDatabase | undefined;
  try {
    db = await openCache();
    return await new Promise<Transcript | null>((resolve, reject) => {
      const request = db!
        .transaction(STORE, "readonly")
        .objectStore(STORE)
        .get(id);
      request.onsuccess = () => resolve(request.result?.transcript ?? null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

export async function writeTranscriptCache(
  id: string,
  transcript: Transcript,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  let db: IDBDatabase | undefined;
  try {
    db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      store.put({ transcript, savedAt: Date.now() }, id);
      const keys = store.index("savedAt").getAllKeys();
      keys.onsuccess = () => {
        for (const key of keys.result.slice(0, -24)) store.delete(key);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    // Private browsing, quota limits, or a failed cache must never prevent
    // opening a conversation from its event log.
  } finally {
    db?.close();
  }
}

export async function pruneTranscriptCache(
  ids: ReadonlySet<string>,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  let db: IDBDatabase | undefined;
  try {
    db = await openCache();
    await new Promise<void>((resolve, reject) => {
      const transaction = db!.transaction(STORE, "readwrite");
      const store = transaction.objectStore(STORE);
      const keys = store.getAllKeys();
      keys.onsuccess = () => {
        for (const key of keys.result)
          if (typeof key !== "string" || !ids.has(key)) store.delete(key);
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    // Cache maintenance is best-effort, just like reads and writes.
  } finally {
    db?.close();
  }
}
