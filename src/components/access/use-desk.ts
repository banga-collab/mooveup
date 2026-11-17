"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deskCheckin, deskForce, deskLookup, type DeskResult } from "@/actions/access";
import { useOfflineDesk } from "@/lib/offline/use-offline-desk";
import { useT } from "@/lib/i18n/client";
import { beep } from "./sound";

/**
 * Logique commune du poste d'accueil (/acces) et de la tablette (/tablette) :
 * recherche / scan, verdict, bip, retour au repos, bascule automatique hors ligne.
 */
export function useDesk(desk: string, idleAfter = 25_000) {
  const t = useT();
  const offline = useOfflineDesk(desk, t);
  const [result, setResult] = useState<DeskResult | null>(null);
  const [pending, start] = useTransition();
  const { online, lookupOffline, checkinOffline, markOnline, markOffline, lastSync } = offline;
  const router = useRouter();

  // Entrées hors ligne envoyées : la liste du jour se met à jour
  useEffect(() => {
    if (lastSync?.imported) router.refresh();
  }, [lastSync, router]);

  const show = useCallback((r: DeskResult) => {
    setResult(r);
    if (r.kind === "result") beep(r.v.ok);
  }, []);

  /** Appel serveur, sinon contrôle local si le réseau est tombé */
  const withFallback = useCallback(
    (remote: () => Promise<DeskResult>, local: () => Promise<DeskResult>) =>
      start(async () => {
        if (!online) {
          show(await local());
          return;
        }
        try {
          const r = await remote();
          markOnline();
          show(r);
        } catch {
          markOffline();
          show(await local());
        }
      }),
    [online, show, markOnline, markOffline],
  );

  const lookup = useCallback(
    (value: string, scan = false) => {
      if (!value.trim()) return;
      withFallback(
        () => deskLookup(value, desk, scan),
        () => lookupOffline(value, scan),
      );
    },
    [desk, withFallback, lookupOffline],
  );

  const checkin = useCallback(
    (contactId: string) =>
      withFallback(
        () => deskCheckin(contactId, desk),
        () => checkinOffline(contactId),
      ),
    [desk, withFallback, checkinOffline],
  );

  const force = useCallback(
    (contactId: string, entityId: string, reason: string) =>
      start(async () => {
        try {
          show(await deskForce(contactId, entityId, reason));
        } catch {
          markOffline();
          show({ kind: "error", message: t("acces.offline.noforce") });
        }
      }),
    [show, markOffline, t],
  );

  // L'écran revient au repos après une entrée autorisée
  useEffect(() => {
    if (result?.kind !== "result" || !result.v.ok) return;
    const timer = setTimeout(() => setResult(null), idleAfter);
    return () => clearTimeout(timer);
  }, [result, idleAfter]);

  return { result, setResult, pending, lookup, checkin, force, offline };
}
