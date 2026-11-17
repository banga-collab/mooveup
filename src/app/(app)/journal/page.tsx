import Link from "next/link";
import { ChevronRight, ScrollText } from "lucide-react";
import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addDaysKey, agadirToIso, cn, dayKey, fmtDate, fmtTime } from "@/lib/utils";
import type { Sale } from "@/lib/types";
import type { AuditEntry } from "@/lib/types-finance";
import { Avatar, Badge, Card, Empty, LinkButton, PageHeader, Segmented } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { AutoSubmitSelect } from "@/components/finance/controls";
import { AUDIT_GROUPS, auditHref, auditMeta, sensitiveReason, type AuditGroup } from "@/components/finance/audit-meta";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { NoResults, ResultCount, clearHref, entityFilter } from "@/components/reports/list-kit";

export const metadata = { title: "Journal des actions" };

const PERIODS = [
  { id: "1", label: "Aujourd'hui", days: 0 },
  { id: "7", label: "7 jours", days: 6 },
  { id: "30", label: "30 jours", days: 29 },
  { id: "90", label: "90 jours", days: 89 },
];

type SP = { type?: string; who?: string; period?: string; sensible?: string; n?: string; q?: string; etab?: string; ordre?: string };

export default async function JournalPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireManager();
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();

  const type = AUDIT_GROUPS.some((g) => g.id === sp.type) ? (sp.type as AuditGroup | "all") : "all";
  const period = PERIODS.find((p) => p.id === sp.period) ?? PERIODS[2]!;
  const onlySensitive = sp.sensible === "1";
  const limit = Math.min(2000, Math.max(100, Number(sp.n) || 150));
  const today = dayKey();
  const since = agadirToIso(addDaysKey(today, -period.days), "00:00");

  const { data } = await supabase.from("audit_log").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(5000);
  // Périmètre : établissements sélectionnés ; actions du groupe (sans établissement) en vue « tout le groupe »
  const inScopeAll = ((data ?? []) as AuditEntry[]).filter((e) => (e.entity_id ? scope.ids.includes(e.entity_id) : !scope.current));
  // Recherche (résumé, personne, action, numéro…) et établissement
  const term = (sp.q ?? "").trim();
  const entities = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const etab = entities.some((e) => e.id === sp.etab) ? sp.etab! : "";
  const asc = sp.ordre === "asc";
  const entityCounts: Record<string, number> = {};
  for (const e of inScopeAll) if (e.entity_id) entityCounts[e.entity_id] = (entityCounts[e.entity_id] ?? 0) + 1;
  const inScope = inScopeAll.filter(
    (e) =>
      (!etab || e.entity_id === etab) &&
      matchesQuery(
        term,
        e.summary,
        e.actor_name,
        auditMeta(e.action).label,
        e.action,
        e.target_id,
        ...Object.values(e.meta ?? {}).map((v) => (typeof v === "string" || typeof v === "number" ? v : null)),
      ),
  );
  if (asc) inScope.reverse();

  // Pourcentage des remises (pour repérer les remises > 20 %)
  const remiseIds = inScope.filter((e) => e.action === "vente.remise" && e.meta?.pct === undefined && e.target_id).map((e) => e.target_id!);
  const { data: saleRows } = remiseIds.length ? await supabase.from("sales").select("*").in("id", remiseIds) : { data: [] };
  const pctBySale = new Map(
    ((saleRows ?? []) as Sale[]).map((s) => {
      const gross = Number(s.total_mad) + Number(s.discount_mad);
      return [s.id, gross ? Math.round((Number(s.discount_mad) / gross) * 100) : 0];
    }),
  );
  const reasonOf = (e: AuditEntry) => sensitiveReason(e, e.target_id ? pctBySale.get(e.target_id) : undefined);

  // Personnes présentes dans la période
  const actors = [...new Map(inScopeAll.filter((e) => e.actor_id).map((e) => [e.actor_id!, e.actor_name])).entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  const who = actors.some(([id]) => id === sp.who) ? sp.who! : "";

  const byPerson = who ? inScope.filter((e) => e.actor_id === who) : inScope;
  const counts = Object.fromEntries(AUDIT_GROUPS.map((g) => [g.id, g.id === "all" ? byPerson.length : byPerson.filter((e) => auditMeta(e.action).group === g.id).length]));
  const filtered = byPerson.filter((e) => (type === "all" || auditMeta(e.action).group === type) && (!onlySensitive || reasonOf(e)));
  const sensitiveCount = byPerson.filter((e) => (type === "all" || auditMeta(e.action).group === type) && reasonOf(e)).length;
  const shown = filtered.slice(0, limit);

  const url = (p: Partial<SP>) => {
    const q = new URLSearchParams();
    const merged = { type, period: period.id, who, sensible: onlySensitive ? "1" : "", q: term, etab, ordre: asc ? "asc" : "", ...p };
    if (merged.type && merged.type !== "all") q.set("type", merged.type);
    if (merged.period && merged.period !== "30") q.set("period", merged.period);
    if (merged.who) q.set("who", merged.who);
    if (merged.sensible) q.set("sensible", merged.sensible);
    if (merged.q) q.set("q", merged.q);
    if (merged.etab) q.set("etab", merged.etab);
    if (merged.ordre) q.set("ordre", merged.ordre);
    if (merged.n) q.set("n", merged.n);
    const s = q.toString();
    return `/journal${s ? `?${s}` : ""}`;
  };

  // Regroupement par jour
  const days: { key: string; items: AuditEntry[] }[] = [];
  for (const e of shown) {
    const k = dayKey(e.created_at);
    const last = days[days.length - 1];
    if (last?.key === k) last.items.push(e);
    else days.push({ key: k, items: [e] });
  }
  const dayTitle = (k: string) => (k === today ? "Aujourd'hui" : k === addDaysKey(today, -1) ? "Hier" : fmtDate(k, { weekday: "long", day: "numeric", month: "long" }));

  return (
    <div className="space-y-5">
      <PageHeader title="Journal des actions" subtitle="Remises, remboursements, suppressions, caisse et droits : qui a fait quoi, et quand" />

      <ListToolbar
        placeholder="Rechercher : résumé, personne, action, numéro…"
        className="mb-0"
        filters={[...entityFilter(entities, entityCounts), { param: "ordre", label: "Plus récentes", options: [{ value: "asc", label: "Plus anciennes" }] }]}
        right={<ResultCount shown={filtered.length} total={inScopeAll.length} filtered={!!(term || etab || who || type !== "all" || onlySensitive)} unit="action" />}
      />

      <div className="flex flex-col gap-3">
        <Segmented items={AUDIT_GROUPS.map((g) => ({ id: g.id, label: g.label, count: counts[g.id], href: url({ type: g.id }) }))} active={type} />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented items={PERIODS.map((p) => ({ id: p.id, label: p.label, href: url({ period: p.id }) }))} active={period.id} />
          <form action="/journal" className="w-full sm:w-56">
            {type !== "all" && <input type="hidden" name="type" value={type} />}
            {period.id !== "30" && <input type="hidden" name="period" value={period.id} />}
            {onlySensitive && <input type="hidden" name="sensible" value="1" />}
            {term && <input type="hidden" name="q" value={term} />}
            {etab && <input type="hidden" name="etab" value={etab} />}
            {asc && <input type="hidden" name="ordre" value="asc" />}
            <AutoSubmitSelect name="who" defaultValue={who} aria-label="Personne" className="h-9 text-[13px]">
              <option value="">Toute l&apos;équipe</option>
              {actors.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </AutoSubmitSelect>
          </form>
          <Link
            href={url({ sensible: onlySensitive ? "" : "1" })}
            scroll={false}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-medium transition",
              onlySensitive ? "border-red-200 bg-red-50 text-red-700" : "border-line bg-white text-slate-600 hover:border-slate-300 hover:text-ink",
            )}
          >
            <span className={cn("size-1.5 rounded-full", onlySensitive ? "bg-red-500" : "bg-red-400")} />
            À vérifier
            <span className="tabular-nums text-xs opacity-70">{sensitiveCount}</span>
          </Link>
        </div>
      </div>

      {shown.length ? (
        <div className="space-y-5">
          {days.map((d) => (
            <section key={d.key}>
              <h2 className="mb-2 px-1 text-xs font-medium capitalize text-muted">{dayTitle(d.key)}</h2>
              <Card>
                <ul className="divide-y divide-line">
                  {d.items.map((e) => {
                    const meta = auditMeta(e.action);
                    const Icon = meta.icon;
                    const reason = reasonOf(e);
                    const href = auditHref(e);
                    const body = (
                      <>
                        <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4", reason ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500")}>
                          <Icon />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[13px] font-medium text-ink">{meta.label}</span>
                            {reason && <Badge tone="red">{reason}</Badge>}
                          </span>
                          <span className="mt-0.5 block text-[13px] text-muted">{e.summary}</span>
                          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                            <span className="inline-flex items-center gap-1.5">
                              <Avatar name={e.actor_name || "?"} size={18} />
                              {e.actor_name || "Système"}
                            </span>
                            {e.entity_id && <EntityBadge id={e.entity_id} />}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block text-xs tabular-nums text-muted">{fmtTime(e.created_at)}</span>
                          {href && <ChevronRight className="ml-auto mt-2 size-4 text-slate-300 transition group-hover:text-brand-500" />}
                        </span>
                      </>
                    );
                    return (
                      <li key={e.id} className={cn(reason && "shadow-[inset_2px_0_0_0_#ef4444]")}>
                        {href ? (
                          <Link href={href} className="group flex items-start gap-3 px-4 py-3 transition hover:bg-slate-50/70">
                            {body}
                          </Link>
                        ) : (
                          <div className="flex items-start gap-3 px-4 py-3">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
          {filtered.length > shown.length && (
            <div className="flex justify-center">
              <LinkButton href={url({ n: String(limit + 150) })} variant="secondary" scroll={false}>
                Afficher plus ({filtered.length - shown.length} restantes)
              </LinkButton>
            </div>
          )}
        </div>
      ) : term || etab || who || type !== "all" || onlySensitive ? (
        <Card>
          <NoResults q={term} href={clearHref("/journal", sp, ["q", "etab", "who", "type", "sensible", "n"])} what="action" />
        </Card>
      ) : (
        <Card>
          <Empty
            icon={<ScrollText />}
            title="Aucune action sur cette période"
            text="Les remises, remboursements, suppressions, clôtures de caisse et changements de droits s'enregistrent automatiquement ici."
            action={
              <LinkButton href="/journal?period=90" variant="secondary">
                Voir les 90 derniers jours
              </LinkButton>
            }
          />
        </Card>
      )}
    </div>
  );
}
