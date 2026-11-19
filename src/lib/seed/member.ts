import type { SeedDB, SeedHelpers } from "./index";

/** Identifiants fixes des comptes adhérents de démonstration (cookie « demo_member ») */
export const DEMO_MEMBER_LADY = "00000000-0000-4000-8100-000000000001";
export const DEMO_MEMBER_EVOLVE = "00000000-0000-4000-8100-000000000002";

/**
 * Espace adhérent : deux comptes de démonstration rattachés à de vrais clients de la démo
 * (une adhérente Lady Moov'Up avec abonnement actif et points, un client Evolve Hommes).
 * N'utilise pas les helpers aléatoires pour ne pas décaler les données des autres modules.
 */
export function seedMember(db: SeedDB, h: SeedHelpers): SeedDB {
  const today = h.day(0);
  const contacts = db.contacts ?? [];
  const subs = db.subscriptions ?? [];
  const ledger = db.loyalty_ledger ?? [];
  const appts = db.appointments ?? [];
  const sales = db.sales ?? [];

  const points = new Map<string, number>();
  for (const r of ledger) points.set(r.contact_id, (points.get(r.contact_id) ?? 0) + Number(r.points));
  // Nombre de lignes par client, calculé une fois (le tri ci-dessous l'appelle à chaque comparaison)
  const tally = (rows: SeedDB[string]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.contact_id, (m.get(r.contact_id) ?? 0) + 1);
    return m;
  };
  const counts = new Map([[sales, tally(sales)], [appts, tally(appts)]]);
  const count = (rows: SeedDB[string], id: string) => counts.get(rows)?.get(id) ?? 0;

  const ladyActive = new Set(subs.filter((s) => s.entity_id === "lady" && s.status === "actif" && s.start_date <= today && s.end_date >= today).map((s) => s.contact_id));
  const lady = contacts
    .filter((c) => ladyActive.has(c.id) && c.status === "client")
    .sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0) || count(sales, b.id) - count(sales, a.id))[0];

  const evolve = contacts
    .filter((c) => c.entity_ids?.includes("evolve") && c.status === "client" && c.id !== lady?.id)
    .sort((a, b) => count(appts, b.id) + count(sales, b.id) - (count(appts, a.id) + count(sales, a.id)))[0];

  const member_accounts = [
    lady && { id: "00000000-0000-4000-8200-000000000001", user_id: DEMO_MEMBER_LADY, contact_id: lady.id, email: lady.email, phone: lady.phone, last_login_at: null, created_at: h.at(-20, "18:30") },
    evolve && { id: "00000000-0000-4000-8200-000000000002", user_id: DEMO_MEMBER_EVOLVE, contact_id: evolve.id, email: evolve.email, phone: evolve.phone, last_login_at: null, created_at: h.at(-8, "12:10") },
  ].filter(Boolean) as SeedDB[string];

  return { member_accounts, member_requests: [] };
}
