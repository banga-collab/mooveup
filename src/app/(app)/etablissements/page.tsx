import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CalendarDays, ChevronRight, CircleDollarSign, LogIn, Plus, RotateCcw, Users } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { loadEstablishments } from "@/lib/establishments";
import { toggleEstablishment } from "@/actions/establishments";
import { EntityMark } from "@/components/entity-icon";
import { createClient } from "@/lib/supabase/server";
import { monthKey } from "@/lib/data";
import { KIND_LABEL, type EntityKind } from "@/lib/entities";
import type { Appointment, Contact, Lead, Sale, Subscription } from "@/lib/types";
import { addDaysKey, agadirToIso, dayKey, mad, madShort } from "@/lib/utils";
import { setScope } from "../scope-actions";
import { SolidTile } from "@/components/stat-tile";
import { Badge, Card, LinkButton, PageHeader, tableClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { SortTh } from "@/components/reports/sort-th";
import { NoResults, ResultCount, clearHref, readSort, sortRows } from "@/components/reports/list-kit";

export const metadata = { title: "Établissements" };

async function openInCrm(id: string) {
  "use server";
  await setScope(id);
  redirect("/");
}

const SORTS = ["nom", "ca", "clients", "abonnes", "rdv", "prospects"] as const;

export default async function EntitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [sp, scope, me, all] = await Promise.all([searchParams, getScope(), getProfile(), loadEstablishments()]);
  const isDirection = me.role === "direction";
  const inactive = isDirection ? all.filter((e) => e.active === false) : [];
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

  // Agrégats par établissement en un seul passage
  const rows = scope.allowed.map((e) => ({
    e,
    rev: 0,
    clients: 0,
    subs: 0,
    rdv: 0,
    leads: 0,
  }));
  const idx = new Map(rows.map((r) => [r.e.id as string, r]));
  for (const s of sales) idx.get(s.entity_id)!.rev += Number(s.total_mad);
  for (const c of contacts) for (const id of c.entity_ids) if (idx.has(id)) idx.get(id)!.clients++;
  for (const s of subs) idx.get(s.entity_id)!.subs++;
  for (const a of appts) idx.get(a.entity_id)!.rdv++;
  for (const l of leads) idx.get(l.entity_id)!.leads++;

  // Recherche, filtre par type et tri
  const q = one(sp.q);
  const kind = one(sp.type) as EntityKind | undefined;
  const kinds = [...new Set(scope.allowed.map((e) => e.kind))];
  const sort = readSort(sp, SORTS, "nom");
  const sortVal = (r: (typeof rows)[number]) =>
    sort.key === "ca" ? r.rev : sort.key === "clients" ? r.clients : sort.key === "abonnes" ? r.subs : sort.key === "rdv" ? r.rdv : sort.key === "prospects" ? r.leads : sp.tri ? r.e.name : null;
  const filtered = !!(q || kind);
  const shown = sortRows(
    rows.filter((r) => (!kind || r.e.kind === kind) && matchesQuery(q, r.e.name, r.e.short, r.e.tagline, r.e.audience, KIND_LABEL[r.e.kind])),
    (r) => sortVal(r) ?? rows.indexOf(r),
    sort.dir,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Établissements"
        subtitle={`Le groupe Moov'Up à Agadir · ${scope.allowed.length} établissement${scope.allowed.length > 1 ? "s" : ""}`}
        actions={
          isDirection ? (
            <LinkButton href="/etablissements/nouveau" variant="brand">
              <Plus /> Ajouter un établissement
            </LinkButton>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Établissements" value={scope.allowed.length} sub={[...new Set(scope.allowed.map((e) => KIND_LABEL[e.kind]))].join(" · ")} icon={<Building2 />} />
        <SolidTile label="CA du mois" value={madShort(total)} sub="Tous établissements" icon={<CircleDollarSign />} />
        <SolidTile label="Clients" value={contacts.length} sub={`${subs.length} abonnements actifs`} icon={<Users />} />
        <SolidTile label="RDV aujourd'hui" value={appts.length} sub={`${leads.length} prospects en cours`} icon={<CalendarDays />} />
      </div>

      <ListToolbar
        className="mb-0"
        placeholder="Nom, activité, public…"
        filters={kinds.length > 1 ? [{ param: "type", label: "Tous types", options: kinds.map((k) => ({ value: k, label: KIND_LABEL[k], count: scope.allowed.filter((e) => e.kind === k).length })) }] : []}
        right={<ResultCount shown={shown.length} total={rows.length} filtered={filtered} unit="établissement" />}
      />

      <Card className="overflow-hidden">
        {!shown.length && <NoResults q={q} href={clearHref("/etablissements", sp, ["q", "type"])} what="établissement" />}
        {/* Bureau */}
        <div className={shown.length ? "hidden overflow-x-auto md:block" : "hidden"}>
          <table className={tableClass}>
            <thead>
              <tr>
                <SortTh col="nom" label="Établissement" />
                <SortTh col="ca" label="CA du mois" align="right" first="desc" />
                <SortTh col="clients" label="Clients" align="right" first="desc" />
                <SortTh col="abonnes" label="Abonnés" align="right" first="desc" />
                <SortTh col="rdv" label="RDV du jour" align="right" first="desc" />
                <SortTh col="prospects" label="Prospects" align="right" first="desc" />
                <th className="w-px">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ e, ...r }) => {
                const isCurrent = scope.current?.id === e.id;
                return (
                  <tr key={e.id}>
                    <td className="min-w-[240px]">
                      <Link href={`/etablissements/${e.id}`} className="group flex items-start gap-2.5">
                        <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: e.color }} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 font-medium text-ink group-hover:text-brand-600 group-hover:underline">
                            {e.name}
                            {isCurrent && <Badge tone="brand">Affiché</Badge>}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {KIND_LABEL[e.kind]} · {e.tagline}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{mad(r.rev)}</td>
                    <td className="text-right tabular-nums text-slate-600">{r.clients}</td>
                    <td className="text-right tabular-nums text-slate-600">{r.subs}</td>
                    <td className="text-right tabular-nums text-slate-600">{r.rdv}</td>
                    <td className="text-right tabular-nums text-slate-600">{r.leads}</td>
                    <td className="!py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {!isCurrent && (
                          <form action={openInCrm.bind(null, e.id)}>
                            <SubmitButton variant="secondary" pendingText="Ouverture…" className="h-8 px-2.5">
                              <LogIn /> Ouvrir
                            </SubmitButton>
                          </form>
                        )}
                        <Link
                          href={`/etablissements/${e.id}`}
                          className="grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink"
                          aria-label={`Voir la fiche ${e.name}`}
                        >
                          <ChevronRight className="size-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile */}
        <ul className="divide-y divide-line md:hidden">
          {shown.map(({ e, ...r }) => (
            <li key={e.id}>
              <Link href={`/etablissements/${e.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50">
                <span className="size-2 shrink-0 rounded-full" style={{ background: e.color }} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    <span className="truncate">{e.short}</span>
                    {scope.current?.id === e.id && <Badge tone="brand">Affiché</Badge>}
                  </span>
                  <span className="block truncate text-xs tabular-nums text-muted">
                    {r.clients} clients · {r.rdv} RDV · {r.leads} prospects
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{madShort(r.rev)}</span>
                <ChevronRight className="size-4 shrink-0 text-slate-300" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {inactive.length > 0 && (
        <details className="group rounded-xl border border-line bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
            Établissements désactivés
            <span className="text-xs font-normal tabular-nums text-muted">{inactive.length}</span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {inactive.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-2.5">
                <EntityMark id={e.id} size={30} />
                <Link href={`/etablissements/${e.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-600 hover:text-brand-600">
                  {e.name}
                </Link>
                <form action={toggleEstablishment.bind(null, e.id)}>
                  <SubmitButton variant="secondary" pendingText="Réactivation…" className="h-8 px-2.5">
                    <RotateCcw /> Réactiver
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
