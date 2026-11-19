import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { entity } from "@/lib/entities";
import { byId } from "@/lib/data";
import { fmtDate, fmtTime, mad, PAY_LABEL } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { DENOMINATIONS, type CashSession } from "@/lib/types-finance";
import { BackLink } from "@/components/back-link";
import { Card, tableClass } from "@/components/ui";
import { EntityMark } from "@/components/entity-icon";
import { PrintButton } from "@/components/finance/controls";
import { Diff } from "@/components/finance/diff";
import { METHODS, type CashDayTotals } from "@/components/finance/cash-day";

export const metadata = { title: "Z de caisse" };

function Row({ label, value, strong }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className={strong ? "font-medium text-ink" : "text-muted"}>{label}</span>
      <span className={strong ? "font-semibold tabular-nums text-ink" : "tabular-nums text-ink"}>{value}</span>
    </div>
  );
}

export default async function ZPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getProfile();
  if (me.role === "staff") redirect("/");
  const scope = await getScope();
  const supabase = await createClient();
  const { data } = await supabase.from("cash_sessions").select("*").eq("id", id).maybeSingle();
  const s = data as CashSession | null;
  if (!s || !scope.allowed.some((e) => e.id === s.entity_id)) notFound();
  if (s.status !== "cloturee" || !s.totals) redirect("/cloture");

  const [settings, { data: profileRows }] = await Promise.all([getSettings(), supabase.from("profiles").select("*")]);
  const people = byId((profileRows ?? []) as Profile[]);
  const who = (pid: string | null) => (pid ? (people.get(pid)?.full_name ?? "–") : "–");
  const e = entity(s.entity_id)!;
  const t = s.totals as CashDayTotals;
  const totalIn = METHODS.reduce((a, m) => a + t.sales[m] + t.balances[m], 0);
  const coins = s.breakdown ? DENOMINATIONS.filter((d) => s.breakdown![String(d)]) : [];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex items-center justify-between gap-3">
        <BackLink href="/cloture" label="Clôture de caisse" />
        <PrintButton label="Imprimer le Z" />
      </div>

      <Card className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-5">
          <div className="flex items-center gap-3">
            <EntityMark id={e.id} size={40} />
            <div>
              <p className="text-sm font-semibold text-ink">{e.name}</p>
              <p className="text-xs text-muted">{settings.company_name}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tracking-tight text-ink">Z de caisse</p>
            <p className="text-[13px] capitalize text-muted">{fmtDate(s.day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          </div>
        </div>

        <div className="grid gap-x-8 border-b border-line py-3 sm:grid-cols-2">
          <Row label="Ouverture" value={`${fmtTime(s.opened_at)} · ${who(s.opened_by)}`} />
          <Row label="Clôture" value={`${s.closed_at ? fmtTime(s.closed_at) : "–"} · ${who(s.closed_by)}`} />
        </div>

        <h2 className="mt-5 text-[13px] font-semibold text-ink">Encaissements ({t.sales_count} vente{t.sales_count > 1 ? "s" : ""})</h2>
        <div className="-mx-4 mt-1 overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Mode</th>
                <th className="!text-right">Ventes</th>
                <th className="!text-right">Soldes</th>
                <th className="!text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {METHODS.map((m) => (
                <tr key={m}>
                  <td>{PAY_LABEL[m]}</td>
                  <td className="text-right tabular-nums">{mad(t.sales[m])}</td>
                  <td className="text-right tabular-nums">{mad(t.balances[m])}</td>
                  <td className="text-right font-medium tabular-nums">{mad(t.sales[m] + t.balances[m])}</td>
                </tr>
              ))}
              <tr>
                <td className="font-semibold text-ink">Total encaissé</td>
                <td />
                <td />
                <td className="text-right font-semibold tabular-nums text-ink">{mad(totalIn)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="mt-5 text-[13px] font-semibold text-ink">Espèces</h2>
        <div className="mt-1 divide-y divide-line">
          <Row label="Fond de caisse" value={mad(s.opening_float_mad)} />
          <Row label="+ Espèces encaissées" value={mad(t.cash_in)} />
          {!!t.moves_in && <Row label="+ Dépôts d'espèces" value={mad(t.moves_in)} />}
          {!!t.moves_out && <Row label="− Retraits d'espèces" value={mad(t.moves_out)} />}
          <Row label="− Remboursements en espèces" value={mad(t.refunds_cash)} />
          <Row label="− Dépenses payées en espèces" value={mad(t.expenses_cash)} />
          <Row label="Espèces attendues" value={mad(s.expected_cash_mad)} strong />
          <Row label="Espèces comptées" value={mad(s.counted_cash_mad)} strong />
          <Row label="Écart" value={<Diff value={s.difference_mad} />} strong />
        </div>

        {(t.refunds_total > 0 || t.expenses_total > 0) && (
          <p className="mt-2 text-xs text-muted">
            Tous modes confondus : remboursements {mad(t.refunds_total)} · dépenses {mad(t.expenses_total)}
          </p>
        )}

        {s.comment && (
          <div className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm">
            <p className="text-xs font-medium text-muted">Commentaire</p>
            <p className="mt-1 text-ink">{s.comment}</p>
          </div>
        )}

        {coins.length > 0 && (
          <>
            <h2 className="mt-5 text-[13px] font-semibold text-ink">Billetage</h2>
            <div className="mt-2 grid grid-cols-2 gap-x-8 text-sm sm:grid-cols-4">
              {coins.map((d) => (
                <div key={d} className="flex justify-between py-1 tabular-nums">
                  <span className="text-muted">
                    {d} × {s.breakdown![String(d)]}
                  </span>
                  <span>{mad(d * s.breakdown![String(d)]!)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-10 grid grid-cols-2 gap-8 text-xs text-muted">
          <div className="border-t border-line pt-2">Signature du caissier</div>
          <div className="border-t border-line pt-2">Signature du responsable</div>
        </div>
      </Card>
    </div>
  );
}
