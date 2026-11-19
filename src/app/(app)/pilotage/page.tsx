import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, BarChart3, CircleCheck, Info, MessageCircle, Phone, ShieldCheck, Target, Users } from "lucide-react";
import { getScope, requireManager } from "@/lib/auth";
import { cn, fmtDate, mad, madShort, relative, waLink } from "@/lib/utils";
import { RISK_LABEL, type RiskLevel } from "@/lib/churn";
import { monthLabel } from "@/lib/forecast";
import { Badge, Card, CardHeader, DescList, Empty, LinkButton, PageHeader, buttonClass, tableClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { ContactLink } from "@/components/quick-view/contact-link";
import { ForecastChart } from "@/components/exec/forecast-chart";
import { RelanceButton } from "@/components/exec/relance-button";
import { TargetForm } from "@/components/exec/target-form";
import { ExportMenu } from "@/components/data-table/export-menu";
import { loadExec, type Alert } from "./load";

export const metadata = { title: "Pilotage" };

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const DOW_LABEL = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const DOW_LONG = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const LEVEL_TONE: Record<RiskLevel, "red" | "amber" | "gray"> = { eleve: "red", moyen: "amber", faible: "gray" };
const FLAG_LABEL = { ramadan: "Ramadan", ete: "Été" } as const;

/** « +12 % » / « −8 % » et le sens (null si pas de base de comparaison) */
function delta(cur: number, base: number | null | undefined) {
  if (!base) return null;
  const d = cur / base - 1;
  const n = Math.round(d * 100);
  return { text: `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)} %`, up: n >= 0 };
}

function Delta({ cur, base, suffix }: { cur: number; base: number | null | undefined; suffix: string }) {
  const d = delta(cur, base);
  if (!d) return null;
  return (
    <span className="whitespace-nowrap">
      <span className={cn("font-medium tabular-nums", d.up ? "text-emerald-600" : "text-red-600")}>{d.text}</span> <span className="text-muted">{suffix}</span>
    </span>
  );
}

function Tile({ label, value, children, icon }: { label: string; value: ReactNode; children?: ReactNode; icon: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] text-muted">{label}</p>
        <span className="text-slate-400 [&_svg]:size-4">{icon}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      {children && <div className="mt-1 space-y-0.5 text-xs">{children}</div>}
    </Card>
  );
}

/** Jauge : barre = réalisé, trait = prévision de fin de mois (100 % = objectif) */
function Gauge({ done, forecast }: { done: number; forecast: number }) {
  const w = Math.max(0, Math.min(1, done)) * 100;
  const m = Math.max(0, Math.min(1, forecast)) * 100;
  return (
    <div className="relative mt-2 h-2 rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(done * 100)} aria-label="Objectif atteint">
      <div className="h-2 rounded-full bg-brand-500" style={{ width: `${w}%` }} />
      <span className={cn("absolute -top-1 h-4 w-0.5 rounded-full", forecast < 0.95 ? "bg-accent-500" : "bg-ink")} style={{ left: `calc(${m}% - 1px)` }} title="Prévision de fin de mois" />
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border border-line p-3">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function AlertLine({ a }: { a: Alert }) {
  const Icon = a.tone === "bad" ? AlertTriangle : a.tone === "good" ? CircleCheck : Info;
  return (
    <li className="flex items-start gap-2.5 py-2.5 text-sm text-ink">
      <Icon className={cn("mt-0.5 size-4 shrink-0", a.tone === "bad" ? "text-accent-500" : a.tone === "good" ? "text-emerald-600" : "text-slate-400")} />
      <span>{a.text}</span>
    </li>
  );
}

const pctTxt = (v: number | null, digits = 0) => (v === null ? "–" : `${(v * 100).toFixed(digits).replace(".", ",")} %`);

export default async function PilotagePage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp] = await Promise.all([searchParams, requireManager()]);
  const scope = await getScope();
  const d = await loadExec(scope);
  const { total, summaries, kpis } = d;
  const multi = d.ents.length > 1;

  /* ---------- Liste des clients à risque (filtres) ---------- */
  const q = one(sp.q)?.trim() ?? "";
  const etab = d.ents.find((e) => e.id === one(sp.etab))?.id ?? null;
  const level = (["eleve", "moyen", "faible"] as RiskLevel[]).find((l) => l === one(sp.risque)) ?? null;
  const base = d.churn.filter((c) => (!etab || c.entityId === etab) && matchesQuery(q, c.name, c.phone, ...c.reasons));
  const filtered = base.filter((c) => !level || c.level === level);
  const shown = filtered.slice(0, 50);
  const highCount = d.churn.filter((c) => c.level === "eleve").length;
  const highValue = d.churn.filter((c) => c.level === "eleve").reduce((a, c) => a + c.value12, 0);
  const levelCount = (l: RiskLevel) => base.filter((c) => c.level === l).length;

  const margin = total.expenses !== null ? total.forecast - total.expenses : null;
  const n1Label = monthLabel(`${Number(d.month.slice(0, 4)) - 1}${d.month.slice(4)}`, true);
  const targetLines = d.ents.map((e) => {
    const s = summaries.find((x) => x.entity.id === e.id)!;
    return { id: e.id, name: e.short, color: e.color, target: s.target, prevTotal: s.prevTotal, forecast: s.forecast };
  });
  const openTargets = one(sp.objectifs) === "1";
  const hasN1 = summaries.some((s) => s.n1 !== null);

  const orderedDows = [1, 2, 3, 4, 5, 6, 0].map((i) => kpis.dows[i]!);
  const maxDow = Math.max(...orderedDows.map((x) => x.avg), 1);
  const bestDow = orderedDows.reduce((a, b) => (b.avg > a.avg ? b : a));
  const worstDow = orderedDows.reduce((a, b) => (b.avg < a.avg ? b : a));
  const maxShare = Math.max(...kpis.shares.map((s) => s.value), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pilotage"
        subtitle={`${scope.current?.short ?? (multi ? "Tous les établissements" : (d.ents[0]?.short ?? ""))} · ${fmtDate(d.today, { weekday: "long", day: "numeric", month: "long" })} · jour ${d.dom} sur ${d.dim}`}
        actions={
          <>
            <ExportMenu
              href={`/pilotage/export?${new URLSearchParams([...(q ? [["q", q]] : []), ...(etab ? [["etab", etab]] : []), ...(level ? [["risque", level]] : [])]).toString()}`}
              formats={["pdf", "xlsx", "csv"]}
              title="Exporter le pilotage : PDF mis en page (graphiques et tableaux) ou chiffres en Excel"
            />
            <LinkButton href="/rapports" variant="secondary">
              <BarChart3 /> Rapports détaillés
            </LinkButton>
            <LinkButton href="#risque" variant="brand">
              <Users /> Clients à risque{highCount ? ` (${highCount})` : ""}
            </LinkButton>
          </>
        }
      />

      {/* ---------- 1. Synthèse ---------- */}
      <section aria-label="Synthèse du mois" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        <Tile label="CA du mois à date" value={mad(total.mtd)} icon={<BarChart3 />}>
          <p>
            <Delta cur={total.mtd} base={total.prevMtd} suffix="vs même jour du mois dernier" />
            {!total.prevMtd && <span className="text-muted">Pas de comparaison disponible</span>}
          </p>
        </Tile>
        <Tile label="Prévision fin de mois" value={mad(total.forecast)} icon={<Target />}>
          <p className="tabular-nums text-muted">
            entre {madShort(total.low)} et {madShort(total.high)} MAD
          </p>
          <p className="flex flex-wrap gap-x-3">
            <Delta cur={total.forecast} base={total.prevTotal} suffix="vs mois dernier" />
            {total.n1 !== null ? <Delta cur={total.forecast} base={total.n1} suffix={`vs ${n1Label}`} /> : <span className="text-muted">N-1 : pas d&apos;historique</span>}
          </p>
        </Tile>
        <Tile label="Marge prévue" value={margin === null ? "–" : mad(margin)} icon={<CircleCheck />}>
          {margin === null || total.expenses === null ? (
            <Link href="/depenses" className="font-medium text-brand-600 hover:underline">
              Saisir les dépenses pour voir la marge
            </Link>
          ) : (
            <p className="text-muted">
              Dépenses prévues {madShort(total.expenses)} MAD · taux{" "}
              <span className={cn("font-medium tabular-nums", margin < 0 ? "text-red-600" : "text-ink")}>{total.forecast ? Math.round((margin / total.forecast) * 100) : 0} %</span>
            </p>
          )}
        </Tile>
        <Tile label="Objectif du mois" value={total.target ? `${Math.round((total.targetForecast / total.target) * 100)} %` : "–"} icon={<Target />}>
          {total.target ? (
            <>
              <Gauge done={total.targetMtd / total.target} forecast={total.targetForecast / total.target} />
              <p className="pt-1.5 text-muted">
                {Math.round((total.targetMtd / total.target) * 100)} % atteint · objectif {madShort(total.target)} MAD
                {multi && total.targetCount < d.ents.length ? ` (${total.targetCount}/${d.ents.length} étab.)` : ""} ·{" "}
                <Link href="?objectifs=1#objectifs" scroll={false} className="font-medium text-brand-600 hover:underline">
                  Modifier
                </Link>
              </p>
            </>
          ) : (
            <Link href="?objectifs=1#objectifs" scroll={false} className="font-medium text-brand-600 hover:underline">
              Définir un objectif mensuel
            </Link>
          )}
        </Tile>
      </section>

      {/* ---------- 5. Alertes du dirigeant (lues en premier) ---------- */}
      {d.alerts.length > 0 && (
        <Card>
          <CardHeader title="À retenir" subtitle="Généré à partir des chiffres du jour" icon={<Info />} />
          <ul className="divide-y divide-line px-5 pb-2">
            {d.alerts.map((a, i) => (
              <AlertLine key={i} a={a} />
            ))}
          </ul>
        </Card>
      )}

      {/* ---------- Mois en cours par établissement + objectifs ---------- */}
      <Card id="objectifs" className="scroll-mt-20">
        <CardHeader title="Mois en cours" subtitle={multi ? "Par établissement, trié par prévision" : "Détail de la prévision"} />
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Établissement</th>
                <th className="text-right">À date</th>
                <th className="text-right">Prévision</th>
                <th className="text-right">vs mois dernier</th>
                {hasN1 && <th className="text-right">vs {n1Label}</th>}
                <th className="min-w-36">Objectif</th>
              </tr>
            </thead>
            <tbody>
              {[...summaries]
                .sort((a, b) => b.forecast - a.forecast)
                .map((s) => {
                  const dm = delta(s.forecast, s.prevTotal);
                  const dn = s.n1 !== null ? delta(s.forecast, s.n1) : null;
                  return (
                    <tr key={s.entity.id}>
                      <td>
                        <EntityBadge id={s.entity.id} className="text-[13px] text-ink" />
                      </td>
                      <td className="text-right tabular-nums">{madShort(s.mtd)}</td>
                      <td className="whitespace-nowrap text-right">
                        <span className="font-semibold tabular-nums text-ink">{madShort(s.forecast)}</span>
                        <span className="block text-xs tabular-nums text-muted">
                          {madShort(s.low)}–{madShort(s.high)}
                        </span>
                      </td>
                      <td className={cn("text-right tabular-nums", dm ? (dm.up ? "text-emerald-600" : "text-red-600") : "text-muted")}>{dm?.text ?? "–"}</td>
                      {hasN1 && <td className={cn("text-right tabular-nums", dn ? (dn.up ? "text-emerald-600" : "text-red-600") : "text-muted")}>{dn?.text ?? "–"}</td>}
                      <td>
                        {s.target ? (
                          <div className="min-w-32">
                            <div className="flex justify-between text-xs tabular-nums text-muted">
                              <span>{Math.round((s.mtd / s.target) * 100)} %</span>
                              <span>prévu {Math.round((s.forecast / s.target) * 100)} %</span>
                            </div>
                            <Gauge done={s.mtd / s.target} forecast={s.forecast / s.target} />
                          </div>
                        ) : (
                          <span className="text-xs text-muted">Non défini</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Prévision = réel à date + rythme habituel de chaque jour de la semaine (8 dernières semaines) + RDV déjà planifiés pondérés par le taux de présence ({madShort(total.rdv)} MAD) + renouvellements
          d&apos;abonnements attendus ({madShort(total.renewals)} MAD). Fourchette probable à environ 80 %.
        </p>
        <details open={openTargets} className="group border-t border-line">
          <summary className="flex h-11 cursor-pointer list-none items-center gap-2 px-5 text-[13px] font-medium text-brand-600 hover:text-brand-700 [&::-webkit-details-marker]:hidden">
            <Target className="size-4" /> Modifier les objectifs mensuels
          </summary>
          <TargetForm lines={targetLines} />
        </details>
      </Card>

      {/* ---------- 2. Prévisions 3 mois ---------- */}
      <section className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <Card className="lg:col-span-2">
          <CardHeader title="Prévisions sur 3 mois" subtitle="Chiffre d'affaires mensuel : réel, puis prévision avec fourchette" />
          <div className="px-3 sm:px-5">
            <ForecastChart data={d.chart} />
            <p className="mt-2 text-xs text-muted">
              Méthode : niveau des 3 derniers mois complets, tendance amortie et saisonnalité
              {d.methodN1 ? " (même mois N-1 × croissance annuelle quand l'historique existe)" : " supposée (Ramadan, été) faute d'un an d'historique"} ; la zone grisée est la fourchette
              probable (≈ 80 %).
            </p>
          </div>
          <div className="mt-3 overflow-x-auto border-t border-line">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Établissement</th>
                  {d.horizon.map((m, i) => {
                    const flags = new Set(d.perEntity.flatMap((p) => p.months[i]?.flags ?? []));
                    return (
                      <th key={m} className="text-right">
                        <span className="capitalize">{monthLabel(m, true)}</span>
                        {[...flags].map((f) => (
                          <span key={f} className="ml-1.5">
                            <Badge tone={f === "ramadan" ? "accent" : "gray"}>{FLAG_LABEL[f]}</Badge>
                          </span>
                        ))}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {d.perEntity.map((p) => (
                  <tr key={p.entity.id}>
                    <td>
                      <EntityBadge id={p.entity.id} className="text-[13px] text-ink" />
                      {p.method === "court" && <span className="ml-2 text-xs text-muted">historique court</span>}
                    </td>
                    {p.months.map((m) => (
                      <td key={m.month} className="whitespace-nowrap text-right">
                        <span className="font-medium tabular-nums text-ink">{madShort(m.value)}</span>
                        <span className="block text-xs tabular-nums text-muted">
                          {madShort(m.low)}–{madShort(m.high)}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Abonnements" subtitle="Revenus récurrents et renouvellements" />
          <div className="px-5 pb-4">
            <DescList
              items={[
                ["Revenu récurrent mensuel", <span key="mrr" className="tabular-nums">{mad(d.subsInfo.mrr)}</span>],
                ["Abonnements actifs", <span key="act" className="tabular-nums">{d.subsInfo.activeSubs}</span>],
                ["Taux de renouvellement (90 j)", <span key="rr" className="tabular-nums">{pctTxt(d.subsInfo.renewalRate)}</span>],
                ["Renouvellements attendus ce mois", <span key="rm" className="tabular-nums">{mad(total.renewals)}</span>],
                ...d.subsInfo.renewAhead.map(
                  (r) =>
                    [
                      <span key={`l${r.month}`} className="capitalize">
                        {monthLabel(r.month, true)}
                      </span>,
                      <span key={r.month} className="tabular-nums">
                        {r.count} · {madShort(r.value)} MAD
                      </span>,
                    ] as [ReactNode, ReactNode],
                ),
              ]}
            />
            <p className="mt-2 text-xs text-muted">Renouvellements pondérés par la probabilité observée (95 % si renouvellement automatique).</p>
            <LinkButton href="/abonnements" variant="secondary" className="mt-3 w-full">
              Voir les abonnements
            </LinkButton>
          </div>
        </Card>
      </section>

      {/* ---------- 4. Indicateurs clés ---------- */}
      <Card>
        <CardHeader title="Indicateurs clés" subtitle="Calculés sur les 30 à 90 derniers jours" />
        <div className="grid grid-cols-2 gap-3 px-5 sm:grid-cols-3 lg:grid-cols-6 [&>*]:min-w-0">
          <Stat
            label="Churn mensuel"
            value={pctTxt(kpis.monthlyChurn, 1)}
            sub={kpis.subChurn !== null ? `rétention abonnés ${pctTxt(1 - kpis.subChurn)}` : "estimé sur les visites"}
          />
          <Stat label="Clients revenus (90 j)" value={pctTxt(kpis.retention90)} sub="venus il y a 3 à 6 mois" />
          <Stat label="Valeur vie client" value={kpis.ltv === null ? "–" : `${madShort(kpis.ltv)} MAD`} sub={kpis.lifetime !== null ? `${madShort(kpis.arpu)} MAD/mois × ${Math.round(kpis.lifetime)} mois` : undefined} />
          <Stat label="Panier moyen (30 j)" value={kpis.basket === null ? "–" : mad(kpis.basket)} />
          <Stat label="Occupation des RDV" value={pctTxt(kpis.occupancy)} sub={kpis.occupancyHasData ? "créneaux pris / dispo, 14 j" : "planning équipe non renseigné"} />
          <Stat label="Conversion prospects" value={pctTxt(kpis.conversion)} sub={`${kpis.won} gagné${kpis.won > 1 ? "s" : ""} sur ${kpis.leads} (90 j)`} />
        </div>
        <div className="grid gap-6 px-5 pb-5 pt-5 lg:grid-cols-2 [&>*]:min-w-0">
          {multi && (
            <div>
              <h4 className="mb-2 text-[13px] font-semibold text-ink">Part du CA (90 jours)</h4>
              <ul className="space-y-2">
                {kpis.shares.map((s) => (
                  <li key={s.entity.id} className="grid grid-cols-[120px_minmax(0,1fr)_44px] items-center gap-3 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)_44px_64px]">
                    <EntityBadge id={s.entity.id} className="truncate" />
                    <span className="h-1.5 rounded-full bg-slate-100">
                      <span className="block h-1.5 rounded-full bg-brand-500" style={{ width: `${(s.value / maxShare) * 100}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-ink">{kpis.rev90 ? Math.round((s.value / kpis.rev90) * 100) : 0} %</span>
                    <span className="hidden text-right tabular-nums text-muted sm:block">{madShort(s.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <h4 className="mb-2 text-[13px] font-semibold text-ink">Jours et heures (CA moyen, 90 jours)</h4>
            <div className="flex h-20 items-end gap-1.5" aria-hidden>
              {orderedDows.map((x) => (
                <div key={x.dow} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className={cn("w-full max-w-10 rounded-t", x === bestDow ? "bg-brand-500" : x === worstDow ? "bg-slate-300" : "bg-brand-200")}
                    style={{ height: `${Math.max(4, (x.avg / maxDow) * 56)}px` }}
                    title={`${DOW_LONG[x.dow]} : ${mad(x.avg)}`}
                  />
                  <span className="text-[11px] text-muted">{DOW_LABEL[x.dow]}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-slate-700">
              Meilleur jour : <span className="font-medium text-ink">{DOW_LONG[bestDow.dow]}</span> ({madShort(bestDow.avg)} MAD en moyenne) · plus calme :{" "}
              <span className="font-medium text-ink">{DOW_LONG[worstDow.dow]}</span> ({madShort(worstDow.avg)} MAD).
            </p>
            {kpis.bestHour && kpis.worstHour && (
              <p className="mt-1 text-[13px] text-slate-700">
                Heures fortes : <span className="font-medium text-ink">{kpis.bestHour.h} h – {kpis.bestHour.h + 2} h</span> · heures creuses :{" "}
                <span className="font-medium text-ink">{kpis.worstHour.h} h – {kpis.worstHour.h + 2} h</span>.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ---------- 3. Clients à risque ---------- */}
      <Card id="risque" className="scroll-mt-20">
        <CardHeader
          title="Clients à risque de départ"
          subtitle={
            d.churn.length
              ? `${highCount} à risque élevé · ${madShort(highValue)} MAD de CA sur 12 mois en jeu · score de 0 à 100${d.hasCheckins ? "" : " (fréquentation estimée sur RDV et achats)"}`
              : "Score de 0 à 100 calculé chaque jour"
          }
          icon={<ShieldCheck />}
        />
        <div className="px-5">
          <ListToolbar
            placeholder="Nom, téléphone, raison…"
            filters={[
              ...(multi ? [{ param: "etab", label: "Tous", options: d.ents.map((e) => ({ value: e.id, label: e.short, count: d.churn.filter((c) => c.entityId === e.id).length })) }] : []),
              { param: "risque", label: "Tout risque", options: (["eleve", "moyen", "faible"] as RiskLevel[]).map((l) => ({ value: l, label: RISK_LABEL[l], count: levelCount(l) })) },
            ]}
            right={filtered.length > 50 ? <span className="text-xs text-muted">50 premiers sur {filtered.length}</span> : undefined}
          />
        </div>

        {!d.churn.length ? (
          <Empty icon={<ShieldCheck />} title="Aucun client à risque détecté" text="Aucun signal de départ (baisse de fréquentation, abonnement non renouvelé, impayé, avis négatif) dans votre périmètre." />
        ) : !shown.length ? (
          <Empty icon={<Users />} title="Aucun client ne correspond" text="Modifiez la recherche ou retirez un filtre (bouton « Effacer »)." />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_72px_96px_104px_auto] gap-4 border-t border-line px-5 py-2 text-xs font-medium text-muted lg:grid">
              <span>Client et raison</span>
              <span>Risque</span>
              <span className="text-right">CA 12 mois</span>
              <span>Dernière visite</span>
              <span className="w-[300px]">Action proposée</span>
            </div>
            <ul className="divide-y divide-line border-t border-line">
              {shown.map((c) => {
                const wa = waLink(c.phone, c.waText);
                const primaryWa = c.action.kind === "renouveler";
                return (
                  <li key={c.contactId} className="grid gap-2.5 px-5 py-3.5 lg:grid-cols-[minmax(0,1fr)_72px_96px_104px_auto] lg:items-center lg:gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <ContactLink id={c.contactId} name={c.name} />
                        <EntityBadge id={c.entityId} />
                        <span className="lg:hidden">
                          <Badge tone={LEVEL_TONE[c.level]}>
                            {c.score} · {RISK_LABEL[c.level]}
                          </Badge>
                        </span>
                      </div>
                      <p className="mt-0.5 text-[13px] text-muted" title={c.reasons.join("\n")}>
                        {c.reasons[0]}
                        {c.reasons.length > 1 && <span className="text-slate-400"> · +{c.reasons.length - 1} autre{c.reasons.length > 2 ? "s signaux" : " signal"}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-muted lg:hidden">
                        CA 12 mois {mad(c.value12)} · {c.lastVisit ? `vu ${relative(`${c.lastVisit}T12:00:00Z`)}` : "aucune visite récente"}
                      </p>
                    </div>
                    <div className="hidden lg:block">
                      <Badge tone={LEVEL_TONE[c.level]} dot>
                        <span className="tabular-nums">{c.score}</span>
                      </Badge>
                    </div>
                    <span className="hidden text-right text-sm tabular-nums text-ink lg:block">{madShort(c.value12)}</span>
                    <span className="hidden text-[13px] text-slate-600 lg:block">{c.lastVisit ? relative(`${c.lastVisit}T12:00:00Z`) : "–"}</span>
                    <div className="flex flex-wrap items-center gap-1.5 lg:w-[300px] lg:justify-end">
                      {c.phone ? (
                        primaryWa && wa ? (
                          <>
                            <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("brand", "px-2.5")}>
                              <MessageCircle /> {c.action.label}
                            </a>
                            <a href={`tel:${c.phone.replace(/\s/g, "")}`} className={buttonClass("secondary", "w-9 px-0")} aria-label={`Appeler ${c.name}`} title="Appeler">
                              <Phone />
                            </a>
                          </>
                        ) : (
                          <>
                            <a href={`tel:${c.phone.replace(/\s/g, "")}`} className={buttonClass("brand", "px-2.5")}>
                              <Phone /> {c.action.label}
                            </a>
                            {wa && (
                              <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("secondary", "w-9 px-0")} aria-label={`WhatsApp à ${c.name}`} title="WhatsApp (message pré-rempli)">
                                <MessageCircle />
                              </a>
                            )}
                          </>
                        )
                      ) : (
                        <span className="px-1 text-xs text-muted">Pas de téléphone</span>
                      )}
                      <RelanceButton contactId={c.contactId} entityId={c.entityId} score={c.score} reason={c.reasons[0] ?? ""} done={d.tasked.has(c.contactId)} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
