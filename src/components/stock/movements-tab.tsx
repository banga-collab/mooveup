import Link from "next/link";
import { ArrowLeftRight, X } from "lucide-react";
import { entity } from "@/lib/entities";
import { cn, fmtDate, fmtTime } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { MOVEMENT_KIND_LABEL, MOVEMENT_REASON_LABEL, type StockMovement } from "@/lib/types-ops";
import { addMovement } from "@/actions/stock";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, CardHeader, Empty, Input, Select } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { clearHref, entityFilter } from "@/components/reports/list-kit";
import { EntityBadge } from "@/components/entity-icon";
import type { ProductRow } from "./lib";

export const PERIODS = [
  { id: "7", label: "7 jours" },
  { id: "30", label: "30 jours" },
  { id: "90", label: "90 jours" },
  { id: "tout", label: "Tout" },
] as const;

type SP = Record<string, string | string[] | undefined>;
const FILTERS = ["q", "type", "etab", "produit"];
const COLUMNS: DataColumn[] = [
  { key: "date", label: "Date", card: "subtitle" },
  { key: "product", label: "Produit", card: "title" },
  { key: "type", label: "Type" },
  { key: "qty", label: "Qté", numeric: true, card: "right" },
  { key: "after", label: "Stock après", numeric: true },
  { key: "by", label: "Par" },
  { key: "note", label: "Note", hidden: true },
];

export function MovementsTab({
  rows,
  sp,
  moves: all,
  people,
  product,
  period,
  canWrite,
}: {
  rows: ProductRow[];
  sp: SP;
  moves: StockMovement[];
  people: Map<string, Profile>;
  product: string;
  period: string;
  canWrite: boolean;
}) {
  const items = new Map(rows.map((r) => [r.item.id, r.item]));
  const byEntity = [...new Set(rows.map((r) => r.item.entity_id))];
  const options = (
    <>
      {byEntity.map((eid) => (
        <optgroup key={eid} label={entity(eid)?.short ?? eid}>
          {rows
            .filter((r) => r.item.entity_id === eid)
            .map((r) => (
              <option key={r.item.id} value={r.item.id}>
                {r.item.name} ({r.stock})
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
  const q = one(sp.q);
  const fType = one(sp.type);
  const fEtab = one(sp.etab);
  const who = (m: StockMovement) => (m.author_id && people.get(m.author_id)?.full_name) || "";
  const typeOf = (m: StockMovement) => (m.reason === "perte" ? "perte" : m.kind);
  const entityIds = [...new Set(rows.map((r) => r.item.entity_id))];
  const moves = all.filter(
    (m) =>
      (!fType || typeOf(m) === fType) &&
      (!fEtab || m.entity_id === fEtab) &&
      matchesQuery(q, items.get(m.item_id)?.name, items.get(m.item_id)?.category, m.note, who(m), MOVEMENT_REASON_LABEL[m.reason], MOVEMENT_KIND_LABEL[m.kind]),
  );
  const filtered = FILTERS.some((k) => !!one(sp[k]));
  const productName = product ? items.get(product)?.name : null;
  const tableRows: DataRow[] = moves.map((m) => {
    const it = items.get(m.item_id);
    const label = m.kind === "ajustement" || m.reason === "perte" ? MOVEMENT_REASON_LABEL[m.reason] : `${MOVEMENT_KIND_LABEL[m.kind]} · ${MOVEMENT_REASON_LABEL[m.reason].toLowerCase()}`;
    return {
      id: m.id,
      cells: {
        date: (
          <span className="whitespace-nowrap text-[13px] text-slate-600">
            {fmtDate(m.created_at, { day: "numeric", month: "short" })} <span className="text-muted">{fmtTime(m.created_at)}</span>
          </span>
        ),
        product: (
          <span className="block min-w-0">
            <Link href={`/stock?produit=${m.item_id}`} className="block max-w-[220px] truncate font-medium text-ink hover:text-brand-600">
              {it?.name ?? "Produit supprimé"}
            </Link>
            <span className="flex items-center gap-2 text-xs text-muted">
              <EntityBadge id={m.entity_id} />
              {m.note && <span className="truncate">{m.note}</span>}
            </span>
          </span>
        ),
        type: <Badge tone={m.kind === "entree" ? "green" : m.kind === "sortie" ? (m.reason === "perte" ? "red" : "gray") : "brand"}>{label}</Badge>,
        qty: (
          <span className={cn("font-semibold tabular-nums", m.qty > 0 ? "text-emerald-600" : "text-ink")}>
            {m.qty > 0 ? "+" : ""}
            {m.qty}
          </span>
        ),
        after: <span className="tabular-nums text-slate-600">{m.stock_after ?? "—"}</span>,
        by: <span className="whitespace-nowrap text-[13px] text-slate-600">{who(m) || "—"}</span>,
        note: m.note ?? "",
      },
      values: { date: m.created_at, product: it?.name ?? "", type: label, qty: m.qty, after: m.stock_after, by: who(m), note: m.note ?? "" },
    };
  });
  const totalIn = moves.filter((m) => m.qty > 0).reduce((a, m) => a + m.qty, 0);
  const totalOut = moves.filter((m) => m.qty < 0).reduce((a, m) => a - m.qty, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
      {canWrite && rows.length > 0 && (
        <Card className="h-fit lg:order-2" id="nouveau">
          <CardHeader title="Nouveau mouvement" subtitle="Livraison, casse, correction…" />
          <ActionForm action={addMovement} className="space-y-3 border-t border-line p-5">
            <Select name="item_id" defaultValue={product || rows[0]?.item.id} aria-label="Produit" required>
              {options}
            </Select>
            <div className="grid grid-cols-[1fr_90px] gap-2 [&>*]:min-w-0">
              <Select name="type" defaultValue="entree" aria-label="Type de mouvement">
                <option value="entree">Entrée (+)</option>
                <option value="sortie">Sortie (−)</option>
                <option value="perte">Perte / casse (−)</option>
                <option value="compte">Corriger le stock à…</option>
              </Select>
              <Input name="qty" inputMode="numeric" placeholder="Qté" required aria-label="Quantité" />
            </div>
            <Input name="note" placeholder="Note (facultatif)" aria-label="Note" />
            <SubmitButton variant="brand" className="w-full">
              Enregistrer
            </SubmitButton>
          </ActionForm>
        </Card>
      )}
      <Card className="lg:order-1">
        <div className="px-5 pb-1 pt-4">
          <h3 className="text-sm font-semibold text-ink">Mouvements</h3>
          <p className="mt-0.5 text-xs text-muted">
            <span className="tabular-nums">+{totalIn}</span> entrées · <span className="tabular-nums">−{totalOut}</span> sorties
          </p>
        </div>
        <div className="px-5 pt-2">
          <ListToolbar
            className="mb-3"
            placeholder="Produit, note, personne, motif…"
            filters={[
              { param: "periode", label: "30 jours", options: PERIODS.filter((p) => p.id !== "30").map((p) => ({ value: p.id, label: p.label })) },
              {
                param: "type",
                label: "Tous types",
                options: [
                  { value: "entree", label: "Entrées", count: all.filter((m) => typeOf(m) === "entree").length },
                  { value: "sortie", label: "Sorties", count: all.filter((m) => typeOf(m) === "sortie").length },
                  { value: "perte", label: "Pertes", count: all.filter((m) => typeOf(m) === "perte").length },
                  { value: "ajustement", label: "Ajustements", count: all.filter((m) => typeOf(m) === "ajustement").length },
                ],
              },
              ...entityFilter(entityIds.map((id) => ({ id, short: entity(id)?.short ?? id }))),
            ]}
          />
          {productName && (
            <p className="mb-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 py-1 pl-2.5 pr-1 text-[13px] text-brand-700">
              Produit : <span className="font-medium">{productName}</span>
              <Link href={clearHref("/stock", sp, ["produit"])} scroll={false} className="grid size-6 place-items-center rounded text-brand-600 hover:bg-white" aria-label="Retirer le filtre produit">
                <X className="size-3.5" />
              </Link>
            </p>
          )}
        </div>
        <DataTable
          id="stock-mouvements"
          className="rounded-none border-x-0 border-b-0"
          columns={COLUMNS}
          rows={tableRows}
          query={q}
          filtered={filtered}
          clearHref={clearHref("/stock", sp, FILTERS)}
          unit={["mouvement", "mouvements"]}
          minWidth={720}
          exportName={`stock_mouvements_${period}j`}
          empty={<Empty icon={<ArrowLeftRight />} title="Aucun mouvement sur la période" text="Les ventes, réceptions et inventaires apparaissent ici automatiquement." />}
        />
      </Card>

    </div>
  );
}
