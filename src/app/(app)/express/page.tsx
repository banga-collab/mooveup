import Link from "next/link";
import { CalendarClock, CheckCircle2, Receipt, UserRound } from "lucide-react";
import { getScope, type Scope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getContacts, getTeam } from "@/lib/data";
import { PAY_LABEL, SALE_STATUS_LABEL, addDaysKey, agadirToIso, dayKey, fmtDate, fmtTime, mad } from "@/lib/utils";
import type { Appointment, CatalogItem, Contact, Sale, SaleItem } from "@/lib/types";
import { Badge, Card, DescList, Empty, PageHeader } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ContactLink } from "@/components/quick-view/contact-link";
import { ExpressDesk, type DeskBusy, type DeskContact, type DeskEntity, type DeskItem, type DeskStaff } from "@/components/express/express-desk";
import { NextClient } from "@/components/express/next-client";

export const metadata = { title: "Accueil express" };

type SP = { ok?: string; client?: string; vente?: string; rdv?: string; nouveau?: string; contact?: string };

export default async function ExpressPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  if (sp.ok && sp.client) return <Done sp={sp} scope={scope} />;

  const supabase = await createClient();
  const allowedIds = scope.allowed.map((e) => e.id);
  const wide: Scope = { ...scope, current: null, ids: allowedIds };
  const today = dayKey();

  const [contacts, team, { data: itemRows }, { data: apptRows }] = await Promise.all([
    getContacts(wide),
    getTeam(wide),
    supabase.from("catalog_items").select("*").in("entity_id", allowedIds).eq("active", true).order("name"),
    supabase
      .from("appointments")
      .select("*")
      .in("entity_id", allowedIds)
      .gte("starts_at", agadirToIso(today, "00:00"))
      .lt("starts_at", agadirToIso(addDaysKey(today, 60), "00:00")),
  ]);

  let deskContacts: DeskContact[] = contacts.map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone, entity_ids: c.entity_ids }));
  if (sp.contact && !deskContacts.some((c) => c.id === sp.contact)) {
    const { data } = await supabase.from("contacts").select("*").eq("id", sp.contact).maybeSingle();
    const c = data as Contact | null;
    if (c) deskContacts = [{ id: c.id, full_name: c.full_name, phone: c.phone, entity_ids: c.entity_ids }, ...deskContacts];
  }
  const entities: DeskEntity[] = scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color, kind: e.kind }));
  const items: DeskItem[] = ((itemRows ?? []) as CatalogItem[]).map((i) => ({
    id: i.id,
    entity_id: i.entity_id,
    kind: i.kind,
    name: i.name,
    category: i.category,
    price_mad: Number(i.price_mad),
    duration_min: i.duration_min,
    duration_days: i.duration_days,
    sessions_count: i.sessions_count,
    stock: i.stock === null ? null : Number(i.stock),
  }));
  const staff: DeskStaff[] = team
    .filter((p) => p.role === "staff")
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"))
    .map((p) => ({ id: p.id, full_name: p.full_name, entity_ids: p.entity_ids, job_title: p.job_title }));
  const busy: DeskBusy[] = ((apptRows ?? []) as Appointment[])
    .filter((a) => a.staff_id && a.status !== "annule" && a.status !== "absent")
    .map((a) => ({ staff_id: a.staff_id!, starts_at: a.starts_at, duration_min: a.duration_min, service: a.service }));

  if (!entities.length)
    return (
      <Card>
        <Empty icon={<UserRound />} title="Aucun établissement autorisé" text="Demandez à la direction de vous rattacher à un établissement." />
      </Card>
    );

  return (
    <div>
      <PageHeader
        title="Accueil express"
        subtitle="Client, rendez-vous ou abonnement, paiement : tout en un seul écran."
        actions={
          <Link href="/agenda" className="text-[13px] font-medium text-brand-600 hover:underline">
            Ouvrir l&apos;agenda
          </Link>
        }
      />
      <ExpressDesk
        contacts={deskContacts}
        entities={entities}
        items={items}
        staff={staff}
        busy={busy}
        defaultEntity={scope.current?.id ?? entities[0]!.id}
        today={today}
        initialContactId={sp.contact ?? null}
      />
    </div>
  );
}

/** Écran de fin : récapitulatif, ticket, client suivant */
async function Done({ sp, scope }: { sp: SP; scope: Scope }) {
  const supabase = await createClient();
  const allowed = scope.allowed.map((e) => e.id);
  const [{ data: c }, { data: s }, { data: r }] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", sp.client!).maybeSingle(),
    sp.vente ? supabase.from("sales").select("*").eq("id", sp.vente).in("entity_id", allowed).maybeSingle() : Promise.resolve({ data: null }),
    sp.rdv ? supabase.from("appointments").select("*").eq("id", sp.rdv).in("entity_id", allowed).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const contact = c as Contact | null;
  const sale = s as Sale | null;
  const rdv = r as Appointment | null;
  const { data: lineRows } = sale ? await supabase.from("sale_items").select("*").eq("sale_id", sale.id) : { data: [] };
  const lines = (lineRows ?? []) as SaleItem[];
  const { data: subRows } = sale && contact ? await supabase.from("subscriptions").select("*").eq("contact_id", contact.id).gte("created_at", new Date(new Date(sale.created_at).getTime() - 60_000).toISOString()) : { data: [] };
  const subs = (subRows ?? []) as { id: string; name: string; end_date: string; sessions_left: number | null }[];
  let staffName: string | null = null;
  if (rdv?.staff_id) {
    const { data } = await supabase.from("profiles").select("full_name").eq("id", rdv.staff_id).maybeSingle();
    staffName = (data as { full_name: string } | null)?.full_name ?? null;
  }

  const items: [React.ReactNode, React.ReactNode][] = [];
  if (contact)
    items.push([
      "Client",
      <span key="c" className="inline-flex items-center gap-1.5">
        <ContactLink id={contact.id} name={contact.full_name} />
        {sp.nouveau && <Badge tone="brand">Nouveau</Badge>}
      </span>,
    ]);
  if (rdv)
    items.push([
      "Rendez-vous",
      <span key="r" className="inline-flex flex-col items-end">
        <span>{rdv.service}</span>
        <span className="text-xs font-normal capitalize text-muted">
          {fmtDate(rdv.starts_at, { weekday: "long", day: "numeric", month: "long" })} à {fmtTime(rdv.starts_at)}
          {staffName ? ` · ${staffName}` : ""}
        </span>
      </span>,
    ]);
  for (const sub of subs)
    items.push([
      "Abonnement",
      <span key={sub.id} className="inline-flex flex-col items-end">
        <span>{sub.name}</span>
        <span className="text-xs font-normal text-muted">
          jusqu&apos;au {fmtDate(sub.end_date, { day: "numeric", month: "long", year: "numeric" })}
          {sub.sessions_left !== null ? ` · ${sub.sessions_left} séances` : ""}
        </span>
      </span>,
    ]);
  if (sale) {
    if (!rdv && !subs.length)
      items.push(["Articles", <span key="l">{lines.map((l) => (l.qty > 1 ? `${l.qty} × ${l.label}` : l.label)).join(", ") || "—"}</span>]);
    items.push([
      "Payé",
      <span key="p" className="tabular-nums">
        {mad(Number(sale.paid_mad))} · {PAY_LABEL[sale.method]}
      </span>,
    ]);
    if (Number(sale.paid_mad) < Number(sale.total_mad))
      items.push([
        "Reste à payer",
        <span key="rest" className="tabular-nums text-amber-700">
          {mad(Number(sale.total_mad) - Number(sale.paid_mad))}
        </span>,
      ]);
  } else if (rdv) items.push(["Paiement", <span key="np">À régler le jour du rendez-vous ({mad(Number(rdv.price_mad))})</span>]);

  return (
    <div className="mx-auto max-w-lg">
      <Card className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-ink">C&apos;est enregistré</h1>
            <p className="mt-0.5 text-[13px] text-muted">
              {sale ? (
                <>
                  Vente <span className="font-medium tabular-nums text-ink">{sale.number}</span> · {SALE_STATUS_LABEL[sale.status]} · <EntityBadge id={sale.entity_id} />
                </>
              ) : rdv ? (
                <EntityBadge id={rdv.entity_id} />
              ) : null}
            </p>
          </div>
          {sale && <span className="text-xl font-semibold tabular-nums text-ink">{mad(Number(sale.total_mad))}</span>}
        </div>
        <div className="mt-4">
          <DescList items={items} />
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          {rdv && (
            <Link href={`/agenda?date=${dayKey(rdv.starts_at)}&sel=${rdv.id}`} className="mr-auto inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
              <CalendarClock className="size-4" /> Voir dans l&apos;agenda
            </Link>
          )}
          {!rdv && contact && (
            <Link href={`/contacts/${contact.id}`} className="mr-auto inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:underline">
              <Receipt className="size-4" /> Fiche client
            </Link>
          )}
          <NextClient ticketHref={sale ? `/ventes/${sale.id}` : null} />
        </div>
      </Card>
    </div>
  );
}
