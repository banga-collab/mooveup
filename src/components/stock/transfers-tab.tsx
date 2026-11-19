import { ArrowLeftRight, ArrowRight } from "lucide-react";
import { entity } from "@/lib/entities";
import { fmtDate, fmtTime, mad } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { Card, CardHeader, Empty } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { clearHref, entityFilter } from "@/components/reports/list-kit";
import { EntityBadge } from "@/components/entity-icon";
import { TransferForm } from "./transfer-form";
import type { ProductRow, StockTransfer } from "./lib";

type SP = Record<string, string | string[] | undefined>;
const FILTERS = ["q", "etab"];
const COLUMNS: DataColumn[] = [
  { key: "number", label: "N°", card: "subtitle" },
  { key: "date", label: "Date" },
  { key: "route", label: "Trajet", card: "title" },
  { key: "lines", label: "Produits" },
  { key: "units", label: "Articles", numeric: true, card: "right" },
  { key: "value", label: "Valeur", numeric: true },
  { key: "by", label: "Par" },
];

/** Transferts entre établissements : formulaire + historique */
export function TransfersTab({
  rows,
  transfers,
  people,
  entities,
  sp,
  canWrite,
}: {
  rows: ProductRow[];
  transfers: StockTransfer[];
  people: Map<string, Profile>;
  entities: { id: string; short: string; color: string }[];
  sp: SP;
  canWrite: boolean;
}) {
  const q = one(sp.q);
  const fEtab = one(sp.etab);
  const filtered = FILTERS.some((k) => !!one(sp[k]));
  const who = (id: string | null) => (id ? (people.get(id)?.full_name ?? "") : "");
  const short = (id: string) => entity(id)?.short ?? id;
  const list = transfers.filter(
    (t) =>
      (!fEtab || t.from_entity_id === fEtab || t.to_entity_id === fEtab) &&
      matchesQuery(q, t.number, short(t.from_entity_id), short(t.to_entity_id), t.lines.map((l) => l.label).join(" "), t.note, who(t.created_by)),
  );
  const tableRows: DataRow[] = list.map((t) => {
    const units = t.lines.reduce((a, l) => a + Number(l.qty), 0);
    const value = t.lines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_cost_mad ?? 0), 0);
    const label = t.lines.map((l) => `${l.qty} × ${l.label}`).join(", ");
    return {
      id: t.id,
      cells: {
        number: <span className="whitespace-nowrap font-medium tabular-nums text-ink">{t.number}</span>,
        date: (
          <span className="whitespace-nowrap text-[13px] text-slate-600">
            {fmtDate(t.created_at, { day: "numeric", month: "short" })} <span className="text-muted">{fmtTime(t.created_at)}</span>
          </span>
        ),
        route: (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <EntityBadge id={t.from_entity_id} />
            <ArrowRight className="size-3.5 text-slate-400" />
            <EntityBadge id={t.to_entity_id} />
          </span>
        ),
        lines: (
          <span className="block max-w-[300px] text-[13px] text-slate-600">
            <span className="line-clamp-2">{label}</span>
            {t.note && <span className="block truncate text-xs text-muted">{t.note}</span>}
          </span>
        ),
        units: <span className="font-semibold tabular-nums text-ink">{units}</span>,
        value: <span className="tabular-nums text-slate-600">{mad(Math.round(value))}</span>,
        by: <span className="whitespace-nowrap text-[13px] text-slate-600">{who(t.created_by) || "—"}</span>,
      },
      values: { number: t.number, date: t.created_at, route: `${short(t.from_entity_id)} → ${short(t.to_entity_id)}`, lines: label, units, value: Math.round(value), by: who(t.created_by) },
    };
  });

  const pick = (v: string | string[] | undefined) => one(v) ?? "";
  const productId = pick(sp.produit) || null;
  const fromProduct = productId ? rows.find((r) => r.item.id === productId) : undefined;
  // « vers » seul (depuis la fiche produit) : départ = l'établissement le mieux fourni pour ce produit
  const wantedTo = pick(sp.vers);
  const bestSource = fromProduct
    ? rows.filter((r) => r.key === fromProduct.key && r.item.entity_id !== wantedTo).sort((a, b) => b.stock - a.stock)[0]
    : undefined;
  const from = entities.find((e) => e.id === pick(sp.de))?.id ?? (wantedTo && bestSource ? bestSource.item.entity_id : undefined) ?? fromProduct?.item.entity_id ?? entities[0]?.id ?? "";
  const to = entities.find((e) => e.id === wantedTo && e.id !== from)?.id ?? entities.find((e) => e.id !== from)?.id ?? "";
  const initialProduct = from === fromProduct?.item.entity_id ? productId : bestSource && bestSource.item.entity_id === from ? bestSource.item.id : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px] [&>*]:min-w-0">
      {canWrite && entities.length > 1 && (
        <Card className="h-fit lg:order-2" id="nouveau">
          <CardHeader title="Nouveau transfert" subtitle="Sortie du stock de départ, entrée à l'arrivée" />
          <div className="border-t border-line p-5">
            <TransferForm
              key={`${from}-${to}-${initialProduct ?? ""}`}
              entities={entities}
              products={rows.map((r) => ({ id: r.item.id, entity_id: r.item.entity_id, name: r.item.name, stock: r.stock, key: r.key }))}
              from={from}
              to={to}
              productId={initialProduct}
            />
          </div>
        </Card>
      )}
      <section className="lg:order-1">
        {transfers.length > 0 && (
          <ListToolbar
            className="mb-3"
            placeholder="N°, produit, établissement, motif…"
            filters={entityFilter(
              entities,
              Object.fromEntries(entities.map((e) => [e.id, transfers.filter((t) => t.from_entity_id === e.id || t.to_entity_id === e.id).length])),
            )}
          />
        )}
        <DataTable
          id="stock-transferts"
          columns={COLUMNS}
          rows={tableRows}
          query={q}
          filtered={filtered}
          clearHref={clearHref("/stock", sp, FILTERS)}
          unit={["transfert", "transferts"]}
          minWidth={760}
          exportName="stock_transferts"
          empty={
            <Empty
              icon={<ArrowLeftRight />}
              title="Aucun transfert"
              text={entities.length > 1 ? "Déplacez du stock d'un établissement à l'autre : le départ et l'arrivée sont mis à jour en une fois." : "Les transferts nécessitent au moins deux établissements."}
            />
          }
        />
      </section>
    </div>
  );
}
