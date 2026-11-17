import { BellRing, CircleDollarSign, Filter, KanbanSquare, List, Percent, Plus } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getTeam } from "@/lib/data";
import { entity } from "@/lib/entities";
import { addDaysKey, dayKey, fmtDate, mad, madShort, pct, SOURCE_LABEL, STAGE_LABEL, STAGES } from "@/lib/utils";
import type { Contact, Lead, LeadSource, LeadStage } from "@/lib/types";
import { SolidTile } from "@/components/stat-tile";
import { Card, Empty, LinkButton, PageHeader, Segmented } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery, one } from "@/components/data-table/match";
import { NoResults, ResultCount } from "@/components/data-table/no-results";
import { SaveViewButton } from "@/components/data-table/save-view";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { ContactLink } from "@/components/quick-view/contact-link";
import { formatPhone, hrefWith, SOURCES } from "@/components/contacts/helpers";
import { LeadCard, NextAction, StageBadge } from "@/components/leads/lead-card";
import { LeadsTable } from "@/components/leads/leads-table";

export const metadata = { title: "Prospects" };

const RELANCES = ["retard", "aujourdhui", "semaine", "aucune"] as const;
type Relance = (typeof RELANCES)[number];

export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const since30 = addDaysKey(today, -30);

  const vue = one(sp.vue) === "liste" ? "liste" : "kanban";
  const q = one(sp.q)?.slice(0, 80);
  const sourceRaw = one(sp.source);
  const source = SOURCES.some(([k]) => k === sourceRaw) ? (sourceRaw as LeadSource) : undefined;
  const owner = one(sp.responsable);
  const etab = scope.ids.find((e) => e === one(sp.etab));
  const relanceRaw = one(sp.relance) as Relance | undefined;
  const relance = relanceRaw && RELANCES.includes(relanceRaw) ? relanceRaw : undefined;
  const etapeRaw = one(sp.etape) as LeadStage | undefined;
  const etape = vue === "liste" && STAGES.some((s) => s.id === etapeRaw) ? etapeRaw : undefined;

  const [{ data: leadsRaw }, team] = await Promise.all([supabase.from("leads").select("*").in("entity_id", scope.ids).order("updated_at", { ascending: false }), getTeam(scope)]);
  const everything = (leadsRaw ?? []) as Lead[];
  const { data: contactRows } = everything.length ? await supabase.from("contacts").select("*").in("id", [...new Set(everything.map((l) => l.contact_id))]) : { data: [] };
  const contacts = byId(contactRows as Contact[]);
  const people = byId(team);

  const isOpen = (l: Lead) => l.stage !== "gagne" && l.stage !== "perdu";
  const week = addDaysKey(today, 7);
  const all = everything.filter((l) => {
    const c = contacts.get(l.contact_id);
    if (source && l.source !== source) return false;
    if (owner && (owner === "aucun" ? l.owner_id : l.owner_id !== owner)) return false;
    if (etab && l.entity_id !== etab) return false;
    if (etape && l.stage !== etape) return false;
    if (relance && !relanceOk(l)) return false;
    return matchesQuery(
      q,
      c?.full_name,
      c?.phone,
      c?.email,
      l.interest,
      SOURCE_LABEL[l.source],
      STAGE_LABEL[l.stage],
      l.owner_id ? people.get(l.owner_id)?.full_name : null,
      l.lost_reason,
      entity(l.entity_id)?.short,
      l.value_mad,
    );
  });
  function relanceOk(l: Lead) {
    if (!isOpen(l)) return false;
    const d = l.next_action_on;
    if (relance === "aucune") return !d;
    if (!d) return false;
    if (relance === "retard") return d < today;
    if (relance === "aujourdhui") return d === today;
    return d >= today && d <= week;
  }
  const filtered = !!(q || source || owner || etab || relance || etape);

  /* Indicateurs */
  const open = all.filter(isOpen);
  const potential = open.reduce((a, l) => a + Number(l.value_mad), 0);
  const toFollow = open.filter((l) => l.next_action_on && l.next_action_on <= today);
  const late = toFollow.filter((l) => l.next_action_on! < today).length;
  const won30 = all.filter((l) => l.stage === "gagne" && l.updated_at >= since30);
  const closed30 = all.filter((l) => (l.stage === "gagne" || l.stage === "perdu") && l.updated_at >= since30).length;

  // Kanban : prospects ouverts triés par échéance, gagnés / perdus des 30 derniers jours
  const columns = STAGES.map((s) => {
    let rows = all.filter((l) => l.stage === s.id);
    if (s.id === "gagne" || s.id === "perdu") rows = rows.filter((l) => l.updated_at >= since30);
    else rows = rows.sort((a, b) => ((a.next_action_on ?? "9999") < (b.next_action_on ?? "9999") ? -1 : 1));
    return { ...s, rows, value: rows.reduce((a, l) => a + Number(l.value_mad), 0) };
  });

  // Responsables proposés en filtre : ceux qui suivent des prospects (moi en premier)
  const ownerFreq = new Map<string, number>();
  for (const l of everything) if (l.owner_id) ownerFreq.set(l.owner_id, (ownerFreq.get(l.owner_id) ?? 0) + 1);
  const owners = [...ownerFreq.entries()]
    .filter(([id]) => people.has(id))
    .sort((a, b) => (a[0] === me.id ? -1 : b[0] === me.id ? 1 : b[1] - a[1]))
    .slice(0, 6);
  const multi = scope.ids.length > 1;
  const tabHref = (v: "kanban" | "liste") => hrefWith("/prospects", { vue: v === "liste" ? "liste" : null, q, source, responsable: owner, etab, relance });
  const clearHref = vue === "liste" ? "/prospects?vue=liste" : "/prospects";

  /* Vue liste */
  const tableCols: DataColumn[] = [
    { key: "client", label: "Client", card: "title" },
    { key: "telephone", label: "Téléphone", hidden: true, className: "whitespace-nowrap tabular-nums text-slate-600" },
    { key: "interet", label: "Intérêt", card: "subtitle", className: "max-w-[220px] truncate text-slate-600" },
    { key: "etape", label: "Étape" },
    ...(multi ? [{ key: "etab", label: "Établissement" }] : []),
    { key: "source", label: "Source", className: "whitespace-nowrap text-[13px] text-slate-600" },
    { key: "responsable", label: "Responsable", className: "whitespace-nowrap text-[13px] text-slate-600" },
    { key: "relance", label: "Prochaine action" },
    { key: "valeur", label: "Valeur", numeric: true, card: "right", className: "font-semibold text-ink" },
    { key: "cree", label: "Créé le", hidden: true, className: "whitespace-nowrap tabular-nums text-slate-600" },
    { key: "maj", label: "Mis à jour", hidden: true, className: "whitespace-nowrap tabular-nums text-slate-600" },
  ];
  const tableRows: DataRow[] =
    vue === "liste"
      ? all.map((l) => {
          const c = contacts.get(l.contact_id);
          const who = l.owner_id ? (people.get(l.owner_id)?.full_name ?? null) : null;
          return {
            id: l.id,
            href: `/contacts/${l.contact_id}?tab=prospects`,
            cells: {
              client: <ContactLink id={l.contact_id} name={c?.full_name ?? "Contact"} />,
              telephone: formatPhone(c?.phone),
              interet: l.interest || <span className="text-muted">Non précisé</span>,
              etape: <StageBadge stage={l.stage} />,
              etab: <EntityBadge id={l.entity_id} />,
              source: SOURCE_LABEL[l.source],
              responsable: who ?? <span className="text-muted">Personne</span>,
              relance:
                l.stage === "perdu" ? (
                  <span className="text-xs font-medium text-red-600">{l.lost_reason ?? "Perdu"}</span>
                ) : l.stage === "gagne" ? (
                  <span className="text-xs font-medium text-emerald-700">Gagné le {fmtDate(l.updated_at, { day: "numeric", month: "short" })}</span>
                ) : (
                  <NextAction date={l.next_action_on} />
                ),
              valeur: mad(l.value_mad),
              cree: fmtDate(l.created_at),
              maj: fmtDate(l.updated_at),
            },
            values: {
              client: c?.full_name ?? "Contact",
              telephone: c?.phone,
              interet: l.interest,
              etape: `${STAGES.findIndex((s) => s.id === l.stage) + 1}. ${STAGE_LABEL[l.stage]}`,
              etab: entity(l.entity_id)?.short,
              source: SOURCE_LABEL[l.source],
              responsable: who,
              relance: isOpen(l) ? l.next_action_on : l.stage === "perdu" ? l.lost_reason : null,
              valeur: Number(l.value_mad),
              cree: l.created_at,
              maj: l.updated_at,
            },
          };
        })
      : [];

  const emptyState = (
    <Empty
      icon={<Filter />}
      title="Aucun prospect pour l'instant"
      text="Ajoutez les personnes intéressées (Instagram, passage, téléphone…) pour ne plus en oublier."
      action={
        <LinkButton href="/prospects/nouveau" variant="brand">
          <Plus /> Nouveau prospect
        </LinkButton>
      }
    />
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Prospects"
        subtitle="Du premier contact à l'inscription."
        actions={
          <LinkButton href="/prospects/nouveau" variant="brand">
            <Plus /> Nouveau prospect
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="En cours" value={open.length} sub={`${all.length} au total`} icon={<Filter />} />
        <SolidTile label="Valeur potentielle" value={madShort(potential)} sub={mad(potential)} icon={<CircleDollarSign />} />
        <SolidTile
          label="À relancer"
          value={toFollow.length}
          trendLabel={late ? `${late} en retard` : undefined}
          trendUp={late ? false : null}
          sub={late ? undefined : "Échéance atteinte"}
          icon={<BellRing />}
          href={hrefWith("/prospects", { vue: vue === "liste" ? "liste" : null, relance: "retard" })}
        />
        <SolidTile label="Conversion 30 j" value={`${pct(won30.length, closed30)} %`} sub={closed30 ? `${won30.length} gagnés / ${closed30}` : "Aucun clôturé"} icon={<Percent />} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          active={vue}
          items={[
            {
              id: "kanban",
              href: tabHref("kanban"),
              label: (
                <>
                  <KanbanSquare className="size-4" /> Pipeline
                </>
              ),
            },
            {
              id: "liste",
              href: tabHref("liste"),
              label: (
                <>
                  <List className="size-4" /> Liste
                </>
              ),
            },
          ]}
        />
        {vue === "kanban" && filtered && <ResultCount n={all.length} total={everything.length} unit={["prospect", "prospects"]} />}
      </div>

      <ListToolbar
        placeholder="Nom, téléphone, intérêt, source, responsable…"
        filters={[
          ...(vue === "liste"
            ? [{ param: "etape", label: "Toutes étapes", options: STAGES.map((s) => ({ value: s.id, label: s.label.split(" /")[0]!, count: everything.filter((l) => l.stage === s.id).length })) }]
            : []),
          {
            param: "relance",
            label: "Toute échéance",
            options: [
              { value: "retard", label: "En retard" },
              { value: "aujourdhui", label: "Aujourd'hui" },
              { value: "semaine", label: "7 jours" },
              { value: "aucune", label: "Sans relance" },
            ],
          },
          {
            param: "responsable",
            label: "Toute l'équipe",
            options: [
              ...owners.map(([id, n]) => ({ value: id, label: id === me.id ? "Moi" : (people.get(id)?.full_name.split(" ")[0] ?? "?"), count: n })),
              { value: "aucun", label: "Sans responsable" },
            ],
          },
          { param: "source", label: "Toutes sources", options: SOURCES.filter(([k]) => everything.some((l) => l.source === k)).map(([k, l]) => ({ value: k, label: l })) },
          ...(multi ? [{ param: "etab", label: "Tous établ.", options: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ value: e.id, label: e.short })) }] : []),
        ]}
        right={
          <SaveViewButton
            defaultLabel={["Prospects", vue === "liste" && "liste", relance === "retard" && "en retard", owner === me.id && "à moi", source && SOURCE_LABEL[source], q && `« ${q} »`].filter(Boolean).join(" · ")}
            icon="/prospects"
          />
        }
      />

      {vue === "liste" ? (
        <LeadsTable
          id="prospects"
          columns={tableCols}
          rows={tableRows}
          openIds={all.filter(isOpen).map((l) => l.id)}
          query={q}
          filtered={filtered}
          clearHref={clearHref}
          unit={["prospect", "prospects"]}
          minWidth={900}
          empty={emptyState}
        />
      ) : all.length === 0 ? (
        <Card>{filtered ? <NoResults query={q} clearHref={clearHref} /> : emptyState}</Card>
      ) : (
        /* Pipeline : seul ce conteneur défile horizontalement */
        <div className="-mx-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
          <div className="flex w-max gap-3">
            {columns.map((col) => (
              <section key={col.id} aria-label={col.label} className="flex w-[272px] shrink-0 flex-col rounded-xl bg-slate-100/70 p-2">
                <header className="flex items-center justify-between gap-2 px-1.5 pb-2 pt-1">
                  <h2 className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: col.tone }} />
                    <span className="truncate">{col.label}</span>
                    <span className="font-normal tabular-nums text-muted">{col.rows.length}</span>
                  </h2>
                  <span className="shrink-0 text-xs tabular-nums text-muted" title={col.id === "gagne" || col.id === "perdu" ? "30 derniers jours" : undefined}>
                    {madShort(col.value)}
                  </span>
                </header>
                <div className="flex flex-1 flex-col gap-2">
                  {col.rows.length ? (
                    col.rows.map((l) => <LeadCard key={l.id} lead={l} contact={contacts.get(l.contact_id)} owner={l.owner_id ? people.get(l.owner_id) : undefined} />)
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-muted">Aucun prospect</p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
