/**
 * Stockage local (IndexedDB) du mode hors ligne : file d'entrées et instantané des droits.
 * Navigateur uniquement.
 */
import type { AccessSnapshot, QueuedCheckin } from "./types";

const DB_NAME = "moovup-offline";
const QUEUE = "queue";
const KV = "kv";
/** Évènement émis à chaque changement de la file (badges, compteurs) */
export const QUEUE_EVENT = "moovup:offline-queue";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB indisponible"));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const emit = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(QUEUE_EVENT));
};

/* ---------- File d'entrées ---------- */

export async function enqueueCheckin(item: QueuedCheckin) {
  await run(QUEUE, "readwrite", (s) => s.put(item));
  emit();
}

export async function listQueue(): Promise<QueuedCheckin[]> {
  try {
    const rows = (await run<QueuedCheckin[]>(QUEUE, "readonly", (s) => s.getAll())) ?? [];
    return rows.sort((a, b) => (a.at < b.at ? -1 : 1));
  } catch {
    return [];
  }
}

export async function removeFromQueue(ids: string[]) {
  if (!ids.length) return;
  await run(QUEUE, "readwrite", (s) => {
    for (const id of ids) s.delete(id);
  });
  emit();
}

/* ---------- Instantané des droits d'accès ---------- */

const snapKey = (desk: string) => `snapshot:${desk}`;

export async function saveSnapshot(snap: AccessSnapshot) {
  await run(KV, "readwrite", (s) => s.put(snap, snapKey(snap.desk)));
}

export async function loadSnapshot(desk: string): Promise<AccessSnapshot | null> {
  try {
    return ((await run<AccessSnapshot>(KV, "readonly", (s) => s.get(snapKey(desk)))) as AccessSnapshot | undefined) ?? null;
  } catch {
    return null;
  }
}
