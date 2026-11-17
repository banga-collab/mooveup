import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BarChart3, CalendarDays, ChevronRight, CircleDollarSign, Clock, CreditCard, Filter, LogIn, Package, Phone, UserPlus, Users } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, lastMonths, monthKey } from "@/lib/data";
import { KIND_LABEL } from "@/lib/entities";
import type { Appointment, CatalogItem, CatalogKind, Contact, Lead, Profile, Sale, Subscription } from "@/lib/types";
import { APPT_STATUS_LABEL, CATALOG_KIND_LABEL, CONTACT_STATUS_LABEL, ROLE_LABEL, addDaysKey, agadirToIso, dayKey, fmtDate, fmtTime, mad, madShort } from "@/lib/utils";
import { setScope } from "../../scope-actions";
import { Avatar, Card, CardHeader, Empty } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { EntityIcon } from "@/components/entity-icon";
import { SubmitButton } from "@/components/submit-button";
import { MonthBars } from "@/components/reports/charts";

export const metadata = { title: "Établissement" };

async function openInCrm(id: string) {
  "use server";
  await setScope(id);
  redirect("/");
}

const KINDS: CatalogKind[] = ["abonnement", "prestation", "pack", "produit"];

export default async function EntityPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, scope] = await Promise.all([params, getScope()]);
  const e = scope.allowed.find((x) => x.id === id);
  if (!e) notFound();
  const supabase = await createClient();
  const today = dayKey();
  const months = lastMonths(6);
  const nowIso = new Date().toISOString();

  const [{ data: salesRaw }, { count: clients }, { data: subsRaw }, { count: rdvToday }, { data: leadsRaw }, { data: teamRaw }, { data: catalogRaw }, { data: latestRaw }, { data: nextRaw }] = await Promise.all([
    supabase.from("sales").select("*").eq("entity_id", e.id).gte("sold_at", agadirToIso(`${months[0]!.key}-01`, "00:00")),
    supabase.from("contacts").select("id", { count: "exact", head: true }).overlaps("entity_ids", [e.id]).eq("status", "client"),
    supabase.from("subscriptions").select("*").eq("entity_id", e.id).eq("status", "actif"),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("entity_id", e.id).neq("status", "annule").gte("starts_at", agadirToIso(today, "00:00")).lt("starts_at", agadirToIso(addDaysKey(today, 1), "00:00")),
    supabase.from("leads").select("*").eq("entity_id", e.id).in("stage", ["nouveau", "contacte", "essai", "offre"]),
    supabase.from("profiles").select("*").eq("active", true).order("full_name"),
    supabase.from("catalog_items").select("*").eq("entity_id", e.id).eq("active", true).order("price_mad"),
    supabase.from("contacts").select("*").overlaps("entity_ids", [e.id]).order("created_at", { ascending: false }).limit(6),
    supabase.from("appointments").select("*").eq("entity_id", e.id).neq("status", "annule").gte("starts_at", nowIso).order("starts_at").limit(8),
  ]);
  const sales = ((salesRaw ?? []) as Sale[]).filter((s) => s.status !== "remboursee");
  const subs = (subsRaw ?? []) as Subscription[];
  const leads = (leadsRaw ?? []) as Lead[];
  const team = ((teamRaw ?? []) as Profile[]).filter((p) => p.entity_ids.includes(e.id));
  const catalog = (catalogRaw ?? []) as CatalogItem[];
  const latest = (latestRaw ?? []) as Contact[];
  const next = (nextRaw ?? []) as Appointment[];
  const { data: apptContacts } = next.length ? await supabase.from("contacts").select("*").in("id", next.map((a) => a.contact_id)) : { data: [] };
  const contactById = byId(apptContacts as Contact[]);

  const byMonth = months.map((m) => ({ label: m.label, value: sales.filter((s) => monthKey(s.sold_at) === m.key).reduce((a, s) => a + Number(s.total_mad), 0) }));
  const revMonth = byMonth.at(-1)!.value;
  const revPrev = byMonth.at(-2)!.value;
  const total6 = byMonth.reduce((a, m) => a + m.value, 0);
  const pipeline = leads.reduce((a, l) => a + Number(l.value_mad), 0);
  const isCurrent = scope.current?.id === e.id;

  const kpis = [
    { icon: <CircleDollarSign className="size-5" />, label: "CA du mois", value: mad(revMonth), sub: revPrev ? `${Math.round((revMonth / revPrev) * 100)} % du mois dernier` : "Premier mois" },
    { icon: <Users className="size-5" />, label: "Clients", value: clients ?? 0, sub: `${latest.length ? `Dernier : ${latest[0]!.full_name.split(" ")[0]}` : "Aucun client"}` },
    { icon: <CreditCard className="size-5" />, label: "Abonnés actifs", value: subs.length, sub: `${subs.filter((s) => s.end_date <= addDaysKey(today, 7)).length} à renouveler sous 7 j` },
    { icon: <CalendarDays className="size-5" />, label: "RDV du jour", value: rdvToday ?? 0, sub: next[0] ? `Prochain à ${fmtTime(next[0].starts_at)}` : "Rien de prévu" },
    { icon: <Filter className="size-5" />, label: "Prospects ouverts", value: leads.length, sub: `${madShort(pipeline)} MAD potentiels` },
  ];

  return (
    <div className="space-y-6">
      <BackLink href="/etablissements" label="Établissements" />

      {/* Bandeau */}
      <section className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl animate-fade-up sm:p-8" style={{ background: `linear-gradient(135deg, ${e.color}, ${e.color}bb)` }}>
        <EntityIcon id={e.id} className="pointer-events-none absolute -bottom-10 -right-8 size-56 text-white/15" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
              <EntityIcon id={e.id} className="size-8" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider text-white/80">
                {KIND_LABEL[e.kind]} · Public {e.audience.toLowerCase()}
              </p>
              <h1 className="font-display text-2xl font-extrabold leading-tight sm:text-[32px]">{e.name}</h1>
              <p className="mt-1 text-sm text-white/85">{e.tagline}</p>
            </div>
          </div>
          {isCurrent ? (
            <span className="rounded-full bg-white/25 px-3 py-1.5 text-xs font-bold ring-1 ring-white/30">Établissement affiché dans le CRM</span>
          ) : (
            <form action={openInCrm.bind(null, e.id)}>
              <SubmitButton variant="secondary" pendingText="Ouverture…">
                <LogIn className="size-4" /> Ouvrir dans le CRM
              </SubmitButton>
            </form>
          )}
        </div>
        <div className="relative mt-5 flex flex-wrap gap-1.5">
          {e.activities.map((a) => (
            <span key={a} className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/20">
              {a}
            </span>
          ))}
        </div>
      </section>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0">
        {kpis.map((k, i) => (
          <div key={k.label} className={i === 0 ? "col-span-2 rounded-3xl border border-line bg-white p-4 shadow-card md:col-span-1" : "rounded-3xl border border-line bg-white p-4 shadow-card"}>
            <span className="grid size-10 place-items-center rounded-xl text-white shadow-sm" style={{ background: e.color }}>
              {k.icon}
            </span>
            <p className="mt-3 truncate font-display text-2xl font-extrabold" style={{ color: i === 0 ? e.color : undefined }}>
              {k.value}
            </p>
            <p className="text-[13px] font-semibold text-slate-600">{k.label}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader title="Chiffre d'affaires" subtitle={`6 derniers mois · ${mad(total6)}`} icon={<BarChart3 className="size-4" />} />
          <div className="px-3 pb-5 sm:px-5">
            <MonthBars data={byMonth} color={e.color} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Équipe" subtitle={`${team.length} membre${team.length > 1 ? "s" : ""} rattaché${team.length > 1 ? "s" : ""}`} icon={<Users className="size-4" />} />
          {team.length ? (
            <ul className="divide-y divide-line px-2 pb-3">
              {team.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                  <Avatar name={p.full_name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.full_name}</p>
                    <p className="truncate text-xs text-muted">
                      {p.job_title ?? ROLE_LABEL[p.role]} · {ROLE_LABEL[p.role]}
                    </p>
                  </div>
                  {p.phone && (
                    <a href={`tel:${p.phone.replace(/\s/g, "")}`} className="grid size-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-canvas hover:text-brand-500" aria-label={`Appeler ${p.full_name}`}>
                      <Phone className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Users className="size-6" />} title="Aucun membre rattaché" text="La direction attribue les établissements depuis la page Équipe." />
          )}
        </Card>
      </div>

      {/* Catalogue */}
      <Card>
        <CardHeader
          title="Catalogue"
          subtitle={`${catalog.length} article${catalog.length > 1 ? "s" : ""} actif${catalog.length > 1 ? "s" : ""}`}
          icon={<Package className="size-4" />}
          action={
            <Link href="/catalogue" className="text-sm font-semibold text-brand-500 hover:underline">
              Catalogue
            </Link>
          }
        />
        <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          {KINDS.map((k) => {
            const list = catalog.filter((c) => c.kind === k);
            if (!list.length) return null;
            const prices = list.map((c) => Number(c.price_mad));
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            return (
              <div key={k} className="rounded-2xl p-4" style={{ background: e.soft }}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-display text-sm font-bold" style={{ color: e.color }}>
                    {CATALOG_KIND_LABEL[k]}
                  </p>
                  <span className="text-xs font-bold text-slate-500">{list.length}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted">{min === max ? mad(min) : `${mad(min)} à ${mad(max)}`}</p>
                <ul className="mt-2.5 space-y-1">
                  {list.slice(0, 4).map((c) => (
                    <li key={c.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="truncate text-slate-700">{c.name}</span>
                      <span className="shrink-0 font-semibold">{madShort(Number(c.price_mad))}</span>
                    </li>
                  ))}
                  {list.length > 4 && <li className="text-xs text-muted">+ {list.length - 4} autres</li>}
                </ul>
              </div>
            );
          })}
          {!catalog.length && <p className="text-sm text-muted">Aucun article dans le catalogue.</p>}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title="Derniers clients" subtitle="Contacts ajoutés récemment" icon={<UserPlus className="size-4" />} />
          {latest.length ? (
            <ul className="divide-y divide-line px-2 pb-3">
              {latest.map((c) => (
                <li key={c.id}>
                  <Link href={`/contacts/${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-canvas">
                    <Avatar name={c.full_name} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{c.full_name}</p>
                      <p className="truncate text-xs text-muted">
                        {CONTACT_STATUS_LABEL[c.status]} · depuis le {fmtDate(c.created_at)}
                      </p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-slate-300" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<Users className="size-6" />} title="Aucun client" />
          )}
        </Card>

        <Card>
          <CardHeader
            title="Prochains rendez-vous"
            subtitle="À partir de maintenant"
            icon={<Clock className="size-4" />}
            action={
              <Link href="/agenda" className="text-sm font-semibold text-brand-500 hover:underline">
                Agenda
              </Link>
            }
          />
          {next.length ? (
            <ul className="divide-y divide-line px-2 pb-3">
              {next.map((a) => (
                <li key={a.id}>
                  <Link href={`/contacts/${a.contact_id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-canvas">
                    <span className="w-14 shrink-0 text-center">
                      <span className="block font-display text-sm font-extrabold" style={{ color: e.color }}>
                        {fmtTime(a.starts_at)}
                      </span>
                      <span className="block text-[10.5px] capitalize text-muted">{dayKey(a.starts_at) === today ? "Aujourd'hui" : fmtDate(a.starts_at, { weekday: "short", day: "numeric" })}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{contactById.get(a.contact_id)?.full_name ?? "Client"}</p>
                      <p className="truncate text-xs text-muted">
                        {a.service} · {a.duration_min} min
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[11px] font-bold text-slate-600">{APPT_STATUS_LABEL[a.status]}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={<CalendarDays className="size-6" />} title="Aucun rendez-vous à venir" />
          )}
        </Card>
      </div>
    </div>
  );
}
