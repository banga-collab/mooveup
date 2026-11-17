import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDaysKey, agadirToIso, dayKey } from "@/lib/utils";
import type { Appointment, CatalogItem, Contact, Sale } from "@/lib/types";
import { PageHeader } from "@/components/ui";
import { Checkout, type CartLine } from "@/components/sales/checkout";

export const metadata = { title: "Caisse" };

export default async function CaissePage({ searchParams }: { searchParams: Promise<{ contact?: string; rdv?: string; etab?: string }> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const supabase = await createClient();
  const allowedIds = scope.allowed.map((e) => e.id);
  const today = dayKey();

  const [{ data: itemRows }, { data: contactRows }, { data: salesRows }] = await Promise.all([
    supabase.from("catalog_items").select("*").in("entity_id", allowedIds).eq("active", true).order("name"),
    supabase.from("contacts").select("*").overlaps("entity_ids", allowedIds).order("full_name"),
    supabase
      .from("sales")
      .select("*")
      .in("entity_id", allowedIds)
      .gte("sold_at", agadirToIso(today, "00:00"))
      .lt("sold_at", agadirToIso(addDaysKey(today, 1), "00:00")),
  ]);
  const items = (itemRows ?? []) as CatalogItem[];
  const contacts = (contactRows ?? []) as Contact[];
  const todaySales = ((salesRows ?? []) as Sale[]).filter((s) => s.status !== "remboursee");

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
    initialLines.push({ key: `rdv-${rdv.id}`, item_id: it?.id ?? null, label: rdv.service, kind: it?.kind ?? "prestation", qty: 1, unit_price: Number(rdv.price_mad || it?.price_mad || 0) });
  }

  return (
    <>
      <PageHeader title="Caisse" subtitle={rdv ? `Encaissement du rendez-vous « ${rdv.service} »` : "Encaissez un abonnement, une prestation ou un produit"} />
      <Checkout
        entities={scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color, soft: e.soft }))}
        initialEntity={entityId}
        items={items.map((i) => ({ id: i.id, entity_id: i.entity_id, kind: i.kind, name: i.name, category: i.category, price: Number(i.price_mad), stock: i.stock, duration_min: i.duration_min, duration_days: i.duration_days, sessions_count: i.sessions_count }))}
        contacts={contacts.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone }))}
        initialContact={preContact?.id ?? null}
        initialLines={initialLines}
        rdvId={rdv?.id ?? null}
        todaySales={todaySales.map((s) => ({ entity_id: s.entity_id, total: Number(s.total_mad), paid: Number(s.paid_mad) }))}
      />
    </>
  );
}
