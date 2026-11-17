/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SeedDB, SeedHelpers } from "./index";

type Row = Record<string, any>;

/** Vues enregistrées de démonstration (une poignée par compte) + lectures de notifications (vide) */
export function seedShell(db: SeedDB, h: SeedHelpers): SeedDB {
  const { uid, at } = h;
  const profiles = db.profiles ?? [];
  const VIEWS: Record<string, [string, string][]> = {
    direction: [
      ["Ventes impayées", "/ventes?statut=impayee"],
      ["Abonnements qui expirent", "/abonnements?filtre=expire-bientot"],
    ],
    manager: [["Prospects Instagram", "/prospects?source=instagram"]],
    reception: [["Clients actifs", "/contacts?statut=client"]],
  };
  const saved_views: Row[] = [];
  for (const p of profiles) {
    for (const [label, href] of VIEWS[p.role] ?? []) {
      saved_views.push({ id: uid(), user_id: p.id, label, href, icon: null, created_at: at(-7, "10:00") });
    }
  }
  return { saved_views, notification_reads: [] };
}
