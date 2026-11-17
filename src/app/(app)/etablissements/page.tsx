import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, CalendarDays, CircleDollarSign, CreditCard, Filter, LogIn, Users } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { monthKey } from "@/lib/data";
import { KIND_LABEL } from "@/lib/entities";
import type { Appointment, Contact, Lead, Sale, Subscription } from "@/lib/types";
import { addDaysKey, agadirToIso, dayKey, mad, madShort } from "@/lib/utils";
import { setScope } from "../scope-actions";
import { SolidTile } from "@/components/stat-tile";
import { PageHeader } from "@/components/ui";
import { EntityIcon } from "@/components/entity-icon";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Établissements" };

async function openInCrm(id: string) {
  "use server";
  await setScope(id);
  redirect("/");
}

export default async function EntitiesPage() {
  const scope = await getScope();
  const ids = scope.allowed.map((e) => e.id);
  const supabase = await createClient();
  const today = dayKey();
  const month = monthKey(new Date());

  const [{ data: salesRaw }, { data: contactsRaw }, { data: subsRaw }, { data: apptRaw }, { data: leadsRaw }] = await Promise.all([
    supabase.from("sales").select("*").in("entity_id", ids).gte("sold_at", agadirToIso(`${month}-01`, "00:00")),
    supabase.from("contacts").select("*").overlaps("entity_ids", ids).eq("status", "client"),
    supabase.from("subscriptions").select("*").in("entity_id", ids).eq("status", "actif"),
    supabase.from("appointments").select("*").in("entity_id", ids).gte("starts_at", agadirToIso(today, "00:00")).lt("starts_at", agadirToIso(addDaysKey(today, 1), "00:00")),
    supabase.from("leads").select("*").in("entity_id", ids).in("stage", ["nouveau", "contacte", "essai", "offre"]),
  ]);
  const sales = ((salesRaw ?? []) as Sale[]).filter((s) => s.status !== "remboursee");
  const contacts = (contactsRaw ?? []) as Contact[];
  const subs = (subsRaw ?? []) as Subscription[];
  const appts = ((apptRaw ?? []) as Appointment[]).filter((a) => a.status !== "annule");
  const leads = (leadsRaw ?? []) as Lead[];

  const total = sales.reduce((a, s) => a + Number(s.total_mad), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Établissements" subtitle={`Le groupe Moov'Up à Agadir · ${scope.allowed.length} établissement${scope.allowed.length > 1 ? "s" : ""}`} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile tone="brand" label="Établissements" value={scope.allowed.length} sub={[...new Set(scope.allowed.map((e) => KIND_LABEL[e.kind]))].join(" · ")} icon={<Building2 />} watermark={<Building2 />} />
        <SolidTile tone="accent" label="CA du mois" value={madShort(total)} sub="Tous établissements confondus" icon={<CircleDollarSign />} watermark={<CircleDollarSign />} />
        <SolidTile tone="violet" label="Clients" value={contacts.length} sub={`${subs.length} abonnements actifs`} icon={<Users />} watermark={<Users />} />
        <SolidTile tone="green" label="RDV aujourd'hui" value={appts.length} sub={`${leads.length} prospects en cours`} icon={<CalendarDays />} watermark={<CalendarDays />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        {scope.allowed.map((e, i) => {
          const kpis = [
            { icon: <CircleDollarSign className="size-4" />, label: "CA du mois", value: mad(sales.filter((s) => s.entity_id === e.id).reduce((a, s) => a + Number(s.total_mad), 0)) },
            { icon: <Users className="size-4" />, label: "Clients", value: contacts.filter((c) => c.entity_ids.includes(e.id)).length },
            { icon: <CreditCard className="size-4" />, label: "Abonnés actifs", value: subs.filter((s) => s.entity_id === e.id).length },
            { icon: <CalendarDays className="size-4" />, label: "RDV du jour", value: appts.filter((a) => a.entity_id === e.id).length },
            { icon: <Filter className="size-4" />, label: "Prospects ouverts", value: leads.filter((l) => l.entity_id === e.id).length },
          ];
          const isCurrent = scope.current?.id === e.id;
          return (
            <article key={e.id} className="group overflow-hidden rounded-3xl border border-line bg-white shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-pop animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
              <div className="relative overflow-hidden p-5 text-white sm:p-6" style={{ background: `linear-gradient(135deg, ${e.color}, ${e.color}c4)` }}>
                <EntityIcon id={e.id} className="pointer-events-none absolute -bottom-8 -right-6 size-40 text-white/15 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" />
                <div className="relative flex items-start gap-3.5">
                  <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur-sm">
                    <EntityIcon id={e.id} className="size-7" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-white/80">
                      {KIND_LABEL[e.kind]} · {e.audience}
                    </p>
                    <h2 className="font-display text-xl font-extrabold leading-tight sm:text-2xl">{e.name}</h2>
                    <p className="mt-0.5 text-sm text-white/85">{e.tagline}</p>
                  </div>
                  {isCurrent && <span className="ml-auto shrink-0 rounded-full bg-white/25 px-2.5 py-1 text-[11px] font-bold ring-1 ring-white/30">Affiché</span>}
                </div>
                <div className="relative mt-4 flex flex-wrap gap-1.5">
                  {e.activities.map((a) => (
                    <span key={a} className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold ring-1 ring-white/20">
                      {a}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-5">
                {kpis.map((k, idx) => (
                  <div key={k.label} className={idx === 0 ? "col-span-2 bg-white px-4 py-3 sm:col-span-1" : "bg-white px-4 py-3"}>
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                      <span style={{ color: e.color }}>{k.icon}</span>
                      <span className="truncate">{k.label}</span>
                    </p>
                    <p className="mt-0.5 truncate font-display text-lg font-extrabold" style={{ color: idx === 0 ? e.color : undefined }}>
                      {k.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3.5">
                <Link href={`/etablissements/${e.id}`} className="inline-flex items-center gap-1.5 text-sm font-semibold transition hover:underline" style={{ color: e.color }}>
                  Voir la fiche <ArrowRight className="size-4" />
                </Link>
                <form action={openInCrm.bind(null, e.id)}>
                  <SubmitButton variant="brand" pendingText="Ouverture…" className="h-9">
                    <LogIn className="size-4" /> Ouvrir dans le CRM
                  </SubmitButton>
                </form>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
