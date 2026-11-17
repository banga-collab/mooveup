"use client";

/**
 * Poste d'accueil résistant aux coupures : détecte le réseau, garde l'instantané des droits à jour
 * (toutes les 10 min), contrôle les entrées sans réseau et renvoie la file au retour de la connexion.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { accessSnapshot, importOfflineCheckins, type DeskResult } from "@/actions/access";
import { enqueueCheckin, listQueue, loadSnapshot, QUEUE_EVENT, removeFromQueue, saveSnapshot } from "./store";
import { findOffline, verdictOffline } from "./match";
import type { ImportResult, QueuedCheckin } from "./types";

const SNAPSHOT_EVERY = 10 * 60_000;
const SYNC_EVERY = 30_000;

export type OfflineDesk = ReturnType<typeof useOfflineDesk>;

export function useOfflineDesk(desk: string, t: (key: string, vars?: Record<string, string | number>) => string) {
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedCheckin[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [snapAt, setSnapAt] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<ImportResult | null>(null);
  const busy = useRef(false);

  const refreshCount = useCallback(async () => setQueue(await listQueue()), []);

  /** Envoie la file d'attente au serveur (par lots, sans doublon) */
  const sync = useCallback(async () => {
    if (busy.current) return;
    const items = await listQueue();
    if (!items.length) return;
    busy.current = true;
    setSyncing(true);
    try {
      const total: ImportResult = { done: [], imported: 0, skipped: 0, failed: 0 };
      for (let i = 0; i < items.length; i += 50) {
        const r = await importOfflineCheckins(items.slice(i, i + 50));
        await removeFromQueue(r.done);
        total.done.push(...r.done);
        total.imported += r.imported;
        total.skipped += r.skipped;
        total.failed += r.failed;
      }
      setOnline(true);
      setLastSync(total);
    } catch {
      setOnline(false);
    } finally {
      busy.current = false;
      setSyncing(false);
      void refreshCount();
    }
  }, [refreshCount]);

  /** Télécharge l'instantané des cartes / abonnements actifs du poste */
  const refreshSnapshot = useCallback(async () => {
    try {
      const s = await accessSnapshot(desk);
      if (!s) return;
      await saveSnapshot(s);
      setSnapAt(s.at);
    } catch {
      /* hors ligne : on garde l'instantané précédent */
    }
  }, [desk]);

  useEffect(() => {
    let alive = true;
    const isOnline = () => typeof navigator === "undefined" || navigator.onLine;
    void loadSnapshot(desk).then((s) => alive && setSnapAt(s?.at ?? null));
    void refreshCount();
    const first = setTimeout(() => {
      if (!alive) return;
      setOnline(isOnline());
      if (isOnline()) {
        void refreshSnapshot();
        void sync();
      }
    }, 0);
    const up = () => {
      setOnline(true);
      void sync();
      void refreshSnapshot();
    };
    const down = () => setOnline(false);
    const count = () => void refreshCount();
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    window.addEventListener(QUEUE_EVENT, count);
    const syncTimer = setInterval(() => isOnline() && void sync(), SYNC_EVERY);
    const snapTimer = setInterval(() => isOnline() && document.visibilityState === "visible" && void refreshSnapshot(), SNAPSHOT_EVERY);
    return () => {
      alive = false;
      clearTimeout(first);
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      window.removeEventListener(QUEUE_EVENT, count);
      clearInterval(syncTimer);
      clearInterval(snapTimer);
    };
  }, [desk, refreshCount, refreshSnapshot, sync]);

  /** Contrôle sans réseau (recherche puis verdict ; l'entrée autorisée est mise en file) */
  const lookupOffline = useCallback(
    async (query: string, viaScan = false): Promise<DeskResult> => {
      const snap = await loadSnapshot(desk);
      if (!snap) return { kind: "error", message: t("acces.offline.nosnap") };
      const found = findOffline(snap, query);
      if (found.kind === "none") return { kind: "none", query };
      if (found.kind === "many") return { kind: "choices", hits: found.hits };
      const { result, entry } = verdictOffline(snap, found.member, await listQueue(), found.scan || viaScan ? "qr" : "recherche");
      if (entry) await enqueueCheckin(entry);
      return result;
    },
    [desk, t],
  );

  const checkinOffline = useCallback(
    async (contactId: string): Promise<DeskResult> => {
      const snap = await loadSnapshot(desk);
      const member = snap?.members.find((m) => m.id === contactId);
      if (!snap || !member) return { kind: "error", message: t("acces.offline.nosnap") };
      const { result, entry } = verdictOffline(snap, member, await listQueue(), "recherche");
      if (entry) await enqueueCheckin(entry);
      return result;
    },
    [desk, t],
  );

  return {
    online,
    pending: queue.length,
    queue,
    syncing,
    snapAt,
    lastSync,
    sync,
    lookupOffline,
    checkinOffline,
    markOnline: useCallback(() => setOnline(true), []),
    markOffline: useCallback(() => setOnline(false), []),
  };
}
