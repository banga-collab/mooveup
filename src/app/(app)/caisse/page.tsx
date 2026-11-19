import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import { addDaysKey, agadirToIso, dayKey } from "@/lib/utils";
import type { Appointment, CatalogItem, Contact, Profile, Sale } from "@/lib/types";
import type { CashSession } from "@/lib/types-finance";
import { DEFAULT_ALERT_QTY, type StockSetting } from "@/lib/types-ops";
import { PageHeader } from "@/components/ui";
import { Checkout } from "@/components/sales/checkout";
import type { CartLine, PosCashMove } from "@/components/sales/pos-types";

export const metadata = { title: "Caisse" };

type CashMoveRow = { id: string; entity_id: string; kind: "depot" | "retrait"; amount_mad: number; reason: string; created_by: string | null; created_at: string };

export default async function CaissePage({ searchParams }: { searchParams: Promise<{ contact?: string; rdv?: string; etab?: string }> }) {
  const [sp, scope, me] = await Promise.all([searchParams, getScope(), getProfile()]);
  const supabase = await createClient();
  const allowedIds = scope.allowed.map((e) => e.id);
  const today = dayKey();

  const [{ data: itemRows }, { data: contactRows }, { data: salesRows }, { data: settingRows }, { data: sessionRows }, { data: lastRows }, { data: moveRows }] = await Promise.all([
    supabase.from("catalog_items").select("*").in("entity_id", allowedIds).eq("active", true).order("name"),
    supabase.from("contacts").select("*").overlaps("entity_ids", allowedIds).order("full_name"),
    supabase
      .from("sales")
      .select("*")
      .in("entity_id", allowedIds)
      .gte("sold_at", agadirToIso(today, "00:00"))
      .lt("sold_at", agadirToIso(addDaysKey(today, 1), "00:00")),
    supabase.from("stock_settings").select("*").in("entity_id", allowedIds),
    supabase.from("cash_sessions").select("*").in("entity_id", allowedIds).eq("day", today),
    supabase.from("cash_sessions").select("*").in("entity_id", allowedIds).eq("status", "cloturee").gte("day", addDaysKey(today, -14)).order("day", { ascending: false }),
    supabase.from("cash_moves").select("*").in("entity_id", allowedIds).eq("day", today).order("created_at", { ascending: false }),
  ]);
  const items = (itemRows ?? []) as (CatalogItem & { barcode?: string | null })[];
  const contacts = (contactRows ?? []) as Contact[];
  const todaySales = ((salesRows ?? []) as Sale[]).filter((s) => s.status !== "remboursee");
  const alertOf = new Map(((settingRows ?? []) as StockSetting[]).map((s) => [s.item_id, Number(s.alert_qty)]));
  const sessions = (sessionRows ?? []) as CashSession[];
  const moves = (moveRows ?? []) as CashMoveRow[];

  // Noms des caissiers (sessions et mouvements du jour)
  const peopleIds = [...new Set([...sessions.map((s) => s.opened_by), ...moves.map((m) => m.created_by)].filter((x): x is string => !!x))];
  const { data: peopleRows } = peopleIds.length ? await supabase.from("profiles").select("*").in("id", peopleIds) : { data: [] };
  const people = byId((peopleRows ?? []) as Profile[]);
  const who = (id: string | null) => (id ? (people.get(id)?.full_name ?? "–") : "–");

  // Dernier fond de caisse par établissement (valeur proposée à l'ouverture)
  const lastFloat: Record<string, number> = {};
  for (const s of (lastRows ?? []) as CashSession[]) if (lastFloat[s.entity_id] === undefined) lastFloat[s.entity_id] = Number(s.opening_float_mad);

  // Rendez-vous à encaisser
  let rdv: Appointment | null = null;
  if (sp.rdv) {
    const { data } = await supabase.from("appointments").select("*").eq("id", sp.rdv).maybeSingle();
    const a = data as Appointment | null;
    if (a && allowedIds.includes(a.entity_id)) rdv = a;
  }

  // Client pré-sélectionné (même s'il n'est pas encore rattaché au périmètre)
  const contactId = rdv?.contact_id ?? sp.contact ?? null;
  if (contactId && !contacts.some((c) => c.id === contactId)) {
    const { data } = await supabase.from("contacts").select("*").eq("id", contactId).maybeSingle();
    if (data) contacts.unshift(data as Contact);
  }
  const preContact = contacts.find((c) => c.id === contactId) ?? null;

  const entityId =
    rdv?.entity_id ??
    (sp.etab && allowedIds.includes(sp.etab as never) ? sp.etab : null) ??
    scope.current?.id ??
    (preContact?.entity_ids.find((e) => allowedIds.includes(e)) || null) ??
    allowedIds[0]!;

  const initialLines: CartLine[] = [];
  if (rdv) {
    const it = items.find((i) => i.id === rdv!.item_id);
    initialLines.push({ key: `rdv-${rdv.id}`, item_id: it?.id ?? null, label: rdv.service, kind: it?.kind ?? "prestation", qty: 1, unit_price: Number(rdv.price_mad || it?.price_mad || 0), disc_pct: 0 });
  }

  return (
    <>
      <PageHeader title="Caisse" subtitle={rdv ? `Encaissement du rendez-vous « ${rdv.service} »` : "Abonnements, prestations et produits · scan, paiement mixte et ticket"} />
      <Checkout
        entities={scope.allowed.map((e) => ({ id: e.id, short: e.short, name: e.name, color: e.color, soft: e.soft, address: e.address ?? "", phone: e.phone ?? "" }))}
        initialEntity={entityId}
        items={items.map((i) => ({
          id: i.id,
          entity_id: i.entity_id,
          kind: i.kind,
          name: i.name,
          category: i.category,
          price: Number(i.price_mad),
          stock: i.kind === "produit" && i.stock !== null ? Number(i.stock) : null,
          alert: alertOf.get(i.id) ?? DEFAULT_ALERT_QTY,
          barcode: i.barcode ?? null,
          duration_min: i.duration_min,
          duration_days: i.duration_days,
          sessions_count: i.sessions_count,
        }))}
        contacts={contacts.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone }))}
        initialContact={preContact?.id ?? null}
        initialLines={initialLines}
        rdvId={rdv?.id ?? null}
        todaySales={todaySales.map((s) => ({ entity_id: s.entity_id, total: Number(s.total_mad), paid: Number(s.paid_mad) }))}
        sessions={sessions.map((s) => ({ id: s.id, entity_id: s.entity_id, status: s.status, float: Number(s.opening_float_mad), opened_at: s.opened_at, opened_by: who(s.opened_by), closed_at: s.closed_at }))}
        moves={moves.map((m): PosCashMove => ({ id: m.id, entity_id: m.entity_id, kind: m.kind, amount: Number(m.amount_mad), reason: m.reason, at: m.created_at, by: who(m.created_by) }))}
        canOpen={me.role !== "staff"}
        lastFloat={lastFloat}
      />
    </>
  );
}
