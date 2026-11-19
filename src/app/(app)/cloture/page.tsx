import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownRight, Banknote, Coins, Lock, LockOpen, ReceiptText, ShoppingCart, Wallet } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId } from "@/lib/data";
import { addDaysKey, cn, dayKey, fmtDate, fmtTime, mad, PAY_LABEL } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import type { CashSession } from "@/lib/types-finance";
import { closeCashSession, openCashSession } from "@/actions/finance";
import { setScope } from "@/app/(app)/scope-actions";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, CardHeader, DescList, Empty, Field, Input, LinkButton, PageHeader, buttonClass, tableClass } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { clearHref, entityFilter } from "@/components/reports/list-kit";
import { CASH_TOLERANCE } from "@/lib/types-finance";
import { SolidTile } from "@/components/stat-tile";
import { EntityBadge, EntityMark } from "@/components/entity-icon";
import { CloseForm } from "@/components/finance/close-form";
import { Diff } from "@/components/finance/diff";
import { METHODS, computeCashDay, expectedCash, type CashDayTotals } from "@/components/finance/cash-day";

export const metadata = { title: "Clôture de caisse" };

type SP = Record<string, string | string[] | undefined>;
const PERIODS = [
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
  { value: "90", label: "90 jours" },
];
const FILTER_PARAMS = ["q", "etab", "periode", "ecart", "caissier"];

export default async function CloturePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const me = await getProfile();
  if (me.role === "staff") redirect("/");
  const scope = await getScope();
  const supabase = await createClient();
  const today = dayKey();

  const [{ data: todayRows }, { data: histRows }, { data: profileRows }] = await Promise.all([
    supabase.from("cash_sessions").select("*").in("entity_id", scope.ids).eq("day", today),
    supabase.from("cash_sessions").select("*").in("entity_id", scope.ids).eq("status", "cloturee").order("day", { ascending: false }).limit(400),
    supabase.from("profiles").select("*"),
  ]);
  const todaySessions = (todayRows ?? []) as CashSession[];
  const history = ((histRows ?? []) as CashSession[]).sort((a, b) => (a.day === b.day ? (a.entity_id < b.entity_id ? -1 : 1) : a.day < b.day ? 1 : -1));
  const people = byId((profileRows ?? []) as Profile[]);
  const who = (id: string | null) => (id ? (people.get(id)?.full_name ?? "–") : "–");
  const dateLabel = fmtDate(today, { weekday: "long", day: "numeric", month: "long" });

  /* ---------- Historique : recherche + filtres ---------- */
  const q = one(sp.q);
  const fEtab = one(sp.etab);
  const fPeriod = PERIODS.some((p) => p.value === one(sp.periode)) ? one(sp.periode)! : "";
  const fGap = one(sp.ecart);
  const fCashier = one(sp.caissier);
  const since = fPeriod ? addDaysKey(today, -Number(fPeriod)) : "";
  const histEntities = scope.allowed.filter((e) => scope.ids.includes(e.id) && history.some((s) => s.entity_id === e.id));
  const cashiers = [...new Set(history.map((s) => s.closed_by).filter(Boolean) as string[])].map((id) => ({ id, name: who(id) })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  const gapOf = (s: CashSession) => Math.abs(Number(s.difference_mad ?? 0));
  const shownHistory = history.filter(
    (s) =>
      (!fEtab || s.entity_id === fEtab) &&
      (!since || s.day >= since) &&
      (!fCashier || s.closed_by === fCashier) &&
      (!fGap || (fGap === "juste" ? gapOf(s) === 0 : fGap === "ecart" ? gapOf(s) > 0 : gapOf(s) > CASH_TOLERANCE)) &&
      matchesQuery(q, who(s.closed_by), who(s.opened_by), s.comment, s.day, fmtDate(s.day, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), s.expected_cash_mad, s.counted_cash_mad, s.difference_mad),
  );
  const histFiltered = FILTER_PARAMS.some((p) => !!one(sp[p]));
  const histColumns: DataColumn[] = [
    { key: "day", label: "Date", card: "title" },
    ...(!scope.current ? [{ key: "etab", label: "Établissement", card: "subtitle" as const }] : []),
    { key: "expected", label: "Attendu", numeric: true },
    { key: "counted", label: "Compté", numeric: true },
    { key: "diff", label: "Écart", numeric: true, card: "right" },
    { key: "cashier", label: "Caissier" },
    { key: "comment", label: "Commentaire", hidden: true },
  ];
  const histRowsData: DataRow[] = shownHistory.map((s) => ({
    id: s.id,
    href: `/cloture/${s.id}`,
    cells: {
      day: <span className="whitespace-nowrap font-medium text-ink">{fmtDate(s.day, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>,
      etab: <EntityBadge id={s.entity_id} />,
      expected: mad(s.expected_cash_mad),
      counted: mad(s.counted_cash_mad),
      diff: <Diff value={s.difference_mad} />,
      cashier: <span className="whitespace-nowrap text-muted">{who(s.closed_by)}</span>,
      comment: s.comment ? <span className="text-[13px] text-muted">{s.comment}</span> : "",
    },
    values: {
      day: s.day,
      etab: scope.allowed.find((e) => e.id === s.entity_id)?.short ?? s.entity_id,
      expected: Number(s.expected_cash_mad ?? 0),
      counted: Number(s.counted_cash_mad ?? 0),
      diff: Number(s.difference_mad ?? 0),
      cashier: who(s.closed_by),
      comment: s.comment ?? "",
    },
  }));

  const historyCard = (
    <section className="space-y-3">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ReceiptText className="size-4 text-slate-400" /> Historique des clôtures
        </h2>
        <p className="mt-0.5 text-xs text-muted">Cliquez sur une ligne pour afficher et imprimer le Z de caisse</p>
      </div>
      {history.length > 0 && (
        <ListToolbar
          className="mb-0"
          placeholder="Caissier, commentaire, date, montant…"
          filters={[
            ...(!scope.current ? entityFilter(histEntities, Object.fromEntries(histEntities.map((e) => [e.id, history.filter((s) => s.entity_id === e.id).length]))) : []),
            { param: "periode", label: "Toutes dates", options: PERIODS },
            {
              param: "ecart",
              label: "Tous écarts",
              options: [
                { value: "juste", label: "Caisse juste", count: history.filter((s) => gapOf(s) === 0).length },
                { value: "ecart", label: "Avec écart", count: history.filter((s) => gapOf(s) > 0).length },
                { value: "hors", label: `Écart > ${CASH_TOLERANCE} MAD`, count: history.filter((s) => gapOf(s) > CASH_TOLERANCE).length },
              ],
            },
            ...(cashiers.length > 1 ? [{ param: "caissier", label: "Tous caissiers", options: cashiers.map((c) => ({ value: c.id, label: c.name })) }] : []),
          ]}
        />
      )}
      <DataTable
        id="clotures"
        columns={histColumns}
        rows={histRowsData}
        pageSize={40}
        query={q}
        filtered={histFiltered}
        clearHref={clearHref("/cloture", sp, FILTER_PARAMS)}
        unit={["clôture", "clôtures"]}
        minWidth={620}
        exportName="clotures"
        empty={<Empty icon={<Lock />} title="Aucune clôture pour l'instant" text="Les caisses clôturées apparaîtront ici, avec leur Z de caisse imprimable." />}
      />
    </section>
  );

  // Depuis la caisse : ?caisse=<établissement> choisit directement la caisse
  const fromPos = one(sp.caisse);
  const picked = scope.current ?? scope.allowed.find((e) => e.id === fromPos && scope.ids.includes(e.id)) ?? null;

  /* ---------- Plusieurs établissements : choisir ---------- */
  if (!picked) {
    return (
      <div className="space-y-5">
        <PageHeader title="Clôture de caisse" subtitle={`${dateLabel} · choisissez l'établissement`} />
        <Card>
          <CardHeader title="Caisses du jour" subtitle="Chaque établissement a sa propre caisse" />
          <ul className="divide-y divide-line border-t border-line">
            {scope.allowed
              .filter((e) => scope.ids.includes(e.id))
              .map((e) => {
                const s = todaySessions.find((x) => x.entity_id === e.id);
                return (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <EntityMark id={e.id} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{e.short}</p>
                      <p className="truncate text-xs text-muted">
                        {!s ? "Caisse non ouverte" : s.status === "ouverte" ? `Ouverte à ${fmtTime(s.opened_at)} par ${who(s.opened_by)}` : `Clôturée à ${fmtTime(s.closed_at!)} par ${who(s.closed_by)}`}
                      </p>
                    </div>
                    {s?.status === "cloturee" ? <Diff value={s.difference_mad} /> : <Badge tone={s ? "green" : "gray"} dot>{s ? "Ouverte" : "Fermée"}</Badge>}
                    <form action={setScope.bind(null, e.id)}>
                      <button className={buttonClass(s?.status === "ouverte" ? "brand" : "secondary", "h-8 px-3")}>{!s ? "Ouvrir" : s.status === "ouverte" ? "Clôturer" : "Voir"}</button>
                    </form>
                  </li>
                );
              })}
          </ul>
        </Card>
        {historyCard}
      </div>
    );
  }

  /* ---------- Un établissement ---------- */
  const e = picked;
  const session = todaySessions.find((s) => s.entity_id === e.id) ?? null;
  const lastFloat = history.find((s) => s.entity_id === e.id)?.opening_float_mad;
  const live = await computeCashDay(supabase, e.id, today);
  const totals = session?.status === "cloturee" && session.totals ? session.totals : live;
  const float = Number(session?.opening_float_mad ?? lastFloat ?? 500);
  const expected = session?.status === "cloturee" ? Number(session.expected_cash_mad) : expectedCash(float, totals);
  const totalIn = METHODS.reduce((a, m) => a + totals.sales[m] + totals.balances[m], 0);
  const movesIn = Number((totals as CashDayTotals).moves_in ?? 0);
  const movesOut = Number((totals as CashDayTotals).moves_out ?? 0);
  const outCash = totals.refunds_cash + totals.expenses_cash + movesOut;
  const canExpenses = me.role === "direction" || me.role === "manager";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clôture de caisse"
        subtitle={`${e.short} · ${dateLabel}`}
        actions={
          !session ? (
            <Badge tone="gray" dot>
              Caisse non ouverte
            </Badge>
          ) : session.status === "ouverte" ? (
            <>
              <Badge tone="green" dot>
                Ouverte depuis {fmtTime(session.opened_at)}
              </Badge>
              <LinkButton href={`/caisse?etab=${e.id}`} variant="secondary">
                <ShoppingCart /> Caisse
              </LinkButton>
            </>
          ) : (
            <LinkButton href={`/cloture/${session.id}`} variant="secondary">
              <ReceiptText /> Z de caisse
            </LinkButton>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Fond de caisse" value={mad(float)} sub={session ? `par ${who(session.opened_by)}` : "à l'ouverture"} icon={<Coins />} />
        <SolidTile label="Espèces encaissées" value={mad(totals.cash_in)} sub="ventes + soldes" icon={<Banknote />} />
        <SolidTile label="Sorties d'espèces" value={mad(outCash)} sub={movesOut ? "dépenses, remboursements, retraits" : "dépenses + remboursements"} icon={<ArrowDownRight />} />
        <SolidTile label="Espèces attendues" value={mad(expected)} sub={movesIn ? "fond + entrées + dépôts − sorties" : "fond + entrées − sorties"} icon={<Wallet />} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Encaissements du jour" subtitle={`${totals.sales_count} vente${totals.sales_count > 1 ? "s" : ""} · ${mad(totalIn)} encaissés`} />
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>Mode de paiement</th>
                    <th className="!text-right">Ventes</th>
                    <th className="!text-right">Soldes encaissés</th>
                    <th className="!text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {METHODS.map((m) => {
                    const t = totals.sales[m] + totals.balances[m];
                    return (
                      <tr key={m} className={cn(!t && "text-slate-400")}>
                        <td className={cn("font-medium", t ? "text-ink" : "text-slate-400")}>{PAY_LABEL[m]}</td>
                        <td className="text-right tabular-nums">{mad(totals.sales[m])}</td>
                        <td className="text-right tabular-nums">{mad(totals.balances[m])}</td>
                        <td className={cn("text-right font-semibold tabular-nums", t ? "text-ink" : "")}>{mad(t)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-line">
                    <td className="px-4 py-3 text-sm font-semibold text-ink">Total</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">{mad(METHODS.reduce((a, m) => a + totals.sales[m], 0))}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">{mad(METHODS.reduce((a, m) => a + totals.balances[m], 0))}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-ink">{mad(totalIn)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card className="px-5 py-2">
            <DescList
              items={[
                ["Remboursements", totals.refunds_total ? `${mad(totals.refunds_total)} · dont ${mad(totals.refunds_cash)} en espèces` : mad(0)],
                [
                  canExpenses ? (
                    <Link key="d" href="/depenses" className="hover:text-brand-600">
                      Dépenses du jour
                    </Link>
                  ) : (
                    "Dépenses du jour"
                  ),
                  totals.expenses_total ? `${mad(totals.expenses_total)} · dont ${mad(totals.expenses_cash)} en espèces` : mad(0),
                ],
                ...(movesIn || movesOut
                  ? ([["Dépôts / retraits d'espèces", `+ ${mad(movesIn)} · − ${mad(movesOut)}`]] as [ReactNode, ReactNode][])
                  : []),
                [<span key="c" className="font-medium text-ink">Espèces attendues en caisse</span>, <span key="v" className="tabular-nums">{mad(expected)}</span>],
              ]}
            />
          </Card>
        </div>

        <div>
          {!session && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-ink">Ouvrir la caisse</h3>
              <p className="mt-1 text-[13px] text-muted">Comptez les espèces présentes dans le tiroir avant la première vente.</p>
              <ActionForm action={openCashSession} className="mt-4 space-y-4">
                <input type="hidden" name="entity_id" value={e.id} />
                <Field label="Fond de caisse (MAD)">
                  <Input name="opening_float" inputMode="decimal" defaultValue={String(float)} required className="h-11 text-lg font-semibold tabular-nums" />
                </Field>
                <SubmitButton variant="brand" className="w-full" pendingText="Ouverture…">
                  <LockOpen className="size-4" /> Ouvrir la caisse
                </SubmitButton>
              </ActionForm>
            </Card>
          )}

          {session?.status === "ouverte" && (
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-ink">Clôturer la caisse</h3>
              <p className="mb-4 mt-1 text-[13px] text-muted">Comptez les espèces du tiroir, fond de caisse compris.</p>
              <CloseForm action={closeCashSession.bind(null, session.id)} expected={expected} />
            </Card>
          )}

          {session?.status === "cloturee" && (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-ink">Caisse clôturée</h3>
              </div>
              <div className="mt-2">
                <DescList
                  items={[
                    ["Clôturée à", `${fmtTime(session.closed_at!)} par ${who(session.closed_by)}`],
                    ["Attendu", mad(session.expected_cash_mad)],
                    ["Compté", mad(session.counted_cash_mad)],
                    ["Écart", <Diff key="d" value={session.difference_mad} />],
                    ...(session.comment ? ([["Commentaire", <span key="c" className="font-normal">{session.comment}</span>]] as [string, ReactNode][]) : []),
                  ]}
                />
              </div>
              <LinkButton href={`/cloture/${session.id}`} variant="secondary" className="mt-4 w-full">
                <ReceiptText /> Voir et imprimer le Z de caisse
              </LinkButton>
            </Card>
          )}
        </div>
      </div>

      {historyCard}
    </div>
  );
}
