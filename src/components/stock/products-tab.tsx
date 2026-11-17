import Link from "next/link";
import { AlertTriangle, Boxes, X } from "lucide-react";
import { entity } from "@/lib/entities";
import { cn, fmtDate, mad } from "@/lib/utils";
import { MOVEMENT_REASON_LABEL, type StockMovement, type Supplier } from "@/lib/types-ops";
import { addMovement, saveStockSettings } from "@/actions/stock";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, CardHeader, DescList, Empty, Field, Input, LinkButton, Select } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { clearHref, entityFilter } from "@/components/reports/list-kit";
import { EntityBadge } from "@/components/entity-icon";
import type { ProductRow } from "./lib";

type SP = Record<string, string | string[] | undefined>;
const FILTERS = ["q", "etab", "etat", "categorie"];

const COLUMNS: DataColumn[] = [
  { key: "name", label: "Produit", card: "title" },
  { key: "etab", label: "Établissement", card: "subtitle" },
  { key: "category", label: "Catégorie", hidden: true },
  { key: "stock", label: "Stock", numeric: true, card: "right" },
  { key: "alert", label: "Seuil", numeric: true },
  { key: "cost", label: "Prix d'achat", numeric: true },
  { key: "value", label: "Valeur", numeric: true },
  { key: "supplier", label: "Fournisseur" },
];

export function ProductsTab({
  rows,
  sp,
  selected,
  selectedMoves,
  suppliers,
  canWrite,
}: {
  rows: ProductRow[];
  sp: SP;
  selected: ProductRow | null;
  selectedMoves: StockMovement[];
  suppliers: Supplier[];
  canWrite: boolean;
}) {
  const low = rows.filter((r) => r.low).sort((a, b) => a.stock - a.alert - (b.stock - b.alert));
  const q = one(sp.q);
  const fEtab = one(sp.etab);
  const fState = one(sp.etat);
  const fCat = one(sp.categorie);
  const filtered = FILTERS.some((k) => !!one(sp[k]));
  const entityIds = [...new Set(rows.map((r) => r.item.entity_id))];
  const categories = [...new Set(rows.map((r) => r.item.category || "Boutique"))].sort((a, b) => a.localeCompare(b, "fr"));
  const list = rows
    .filter(
      (r) =>
        (!fEtab || r.item.entity_id === fEtab) &&
        (!fCat || (r.item.category || "Boutique") === fCat) &&
        (!fState || (fState === "rupture" ? r.stock === 0 : fState === "commander" ? r.low : !r.low)) &&
        matchesQuery(q, r.item.name, r.item.category, r.supplier?.name, r.supplier?.contact_name, entity(r.item.entity_id)?.short, r.item.price_mad),
    )
    .sort((a, b) => Number(b.low) - Number(a.low) || a.item.name.localeCompare(b.item.name));
  const tableRows: DataRow[] = list.map((r) => ({
    id: r.item.id,
    href: `/stock?produit=${r.item.id}`,
    cells: {
      name: (
        <span>
          <span className="font-medium text-ink">{r.item.name}</span>
          <span className="block text-xs text-muted">Vendu {mad(Number(r.item.price_mad))}</span>
        </span>
      ),
      etab: <EntityBadge id={r.item.entity_id} />,
      category: r.item.category || "Boutique",
      stock: r.low ? <Badge tone={r.stock === 0 ? "red" : "accent"}>{r.stock === 0 ? "Rupture" : r.stock}</Badge> : <span className="font-semibold tabular-nums text-ink">{r.stock}</span>,
      alert: <span className="tabular-nums text-muted">{r.alert}</span>,
      cost: r.hasCost ? <span className="tabular-nums text-slate-600">{mad(r.cost)}</span> : <span className="text-slate-400">—</span>,
      value: <span className="font-semibold tabular-nums text-ink">{mad(r.value)}</span>,
      supplier: r.supplier?.name ? <span className="block max-w-[180px] truncate text-[13px] text-slate-600">{r.supplier.name}</span> : <span className="text-slate-400">—</span>,
    },
    values: {
      name: r.item.name,
      etab: entity(r.item.entity_id)?.short ?? r.item.entity_id,
      category: r.item.category || "Boutique",
      stock: r.stock,
      alert: r.alert,
      cost: r.hasCost ? r.cost : null,
      value: r.value,
      supplier: r.supplier?.name ?? "",
    },
  }));
  const lowEntities = [...new Set(low.map((r) => r.item.entity_id))];

  return (
    <div className="space-y-6">
      {selected && <ProductDetail row={selected} moves={selectedMoves} suppliers={suppliers} canWrite={canWrite} />}

      {low.length > 0 && !selected && !filtered && (
        <Card className="border-accent-200">
          <CardHeader
            icon={<AlertTriangle className="text-accent-500" />}
            title={`À commander · ${low.length} produit${low.length > 1 ? "s" : ""}`}
            subtitle="Stock au niveau du seuil d'alerte ou en dessous"
            action={
              lowEntities.length === 1 ? (
                <LinkButton href={`/stock?onglet=commandes&nouveau=${lowEntities[0]}`} variant="brand" className="h-8">
                  Préparer la commande
                </LinkButton>
              ) : undefined
            }
          />
          <ul className="divide-y divide-line border-t border-line">
            {low.map((r) => (
              <li key={r.item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                <Link href={`/stock?produit=${r.item.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-brand-600">
                  {r.item.name}
                </Link>
                <EntityBadge id={r.item.entity_id} />
                <span className={cn("w-24 text-right text-[13px] font-semibold tabular-nums", r.stock === 0 ? "text-red-600" : "text-accent-600")}>
                  {r.stock} / {r.alert}
                </span>
                {lowEntities.length > 1 && (
                  <Link href={`/stock?onglet=commandes&nouveau=${r.item.entity_id}${r.supplier ? `&fournisseur=${r.supplier.id}` : ""}`} className="text-[13px] font-medium text-brand-600 hover:underline">
                    Commander
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section>
        {rows.length > 0 && (
          <ListToolbar
            className="mb-3"
            placeholder="Produit, catégorie, fournisseur…"
            filters={[
              ...entityFilter(
                entityIds.map((id) => ({ id, short: entity(id)?.short ?? id })),
                Object.fromEntries(entityIds.map((id) => [id, rows.filter((r) => r.item.entity_id === id).length])),
              ),
              {
                param: "etat",
                label: "Tous stocks",
                options: [
                  { value: "commander", label: "À commander", count: rows.filter((r) => r.low).length },
                  { value: "rupture", label: "En rupture", count: rows.filter((r) => r.stock === 0).length },
                  { value: "ok", label: "Suffisant", count: rows.filter((r) => !r.low).length },
                ],
              },
              ...(categories.length > 1 && categories.length <= 10
                ? [{ param: "categorie", label: "Toutes catégories", options: categories.map((c) => ({ value: c, label: c, count: rows.filter((r) => (r.item.category || "Boutique") === c).length })) }]
                : []),
            ]}
          />
        )}
        <DataTable
          id="stock-produits"
          columns={COLUMNS}
          rows={tableRows}
          query={q}
          filtered={filtered}
          clearHref={clearHref("/stock", sp, [...FILTERS, "produit"])}
          unit={["produit", "produits"]}
          minWidth={760}
          exportName="stock_produits"
          empty={
            <Empty
              icon={<Boxes />}
              title="Aucun produit en vente"
              text="Ajoutez des articles de type « Produit » au catalogue pour suivre leur stock."
              action={
                <LinkButton href="/catalogue/nouveau?type=produit" variant="brand">
                  Ajouter un produit
                </LinkButton>
              }
            />
          }
        />
      </section>
    </div>
  );
}

function ProductDetail({ row: r, moves, suppliers, canWrite }: { row: ProductRow; moves: StockMovement[]; suppliers: Supplier[]; canWrite: boolean }) {
  const e = entity(r.item.entity_id);
  const options = suppliers.filter((s) => !s.entity_ids?.length || s.entity_ids.includes(r.item.entity_id));
  return (
    <Card>
      <CardHeader
        title={r.item.name}
        subtitle={`${e?.short ?? ""} · ${r.item.category || "Boutique"}`}
        action={
          <Link href="/stock" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Fermer">
            <X className="size-4" />
          </Link>
        }
      />
      <div className="grid gap-6 border-t border-line p-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div>
          <DescList
            items={[
              ["Stock", <span key="s" className={cn("tabular-nums", r.low && "text-accent-600")}>{r.stock}</span>],
              ["Seuil d'alerte", r.alert],
              ["Valeur du stock", mad(r.value)],
              ["Prix de vente", mad(Number(r.item.price_mad))],
              ["Fournisseur", r.supplier?.name ?? "—"],
            ]}
          />
        </div>

        {canWrite ? (
          <div className="space-y-5">
            <ActionForm action={addMovement} className="space-y-3">
              <p className="text-[13px] font-semibold text-ink">Mouvement</p>
              <input type="hidden" name="item_id" value={r.item.id} />
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
                Enregistrer le mouvement
              </SubmitButton>
            </ActionForm>
            <details className="group">
              <summary className="cursor-pointer list-none text-[13px] font-medium text-brand-600 [&::-webkit-details-marker]:hidden">Seuil, prix d&apos;achat et fournisseur</summary>
              <ActionForm action={saveStockSettings.bind(null, r.item.id)} className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
                  <Field label="Seuil d'alerte">
                    <Input name="alert_qty" inputMode="numeric" defaultValue={r.alert} required />
                  </Field>
                  <Field label="Prix d'achat (MAD)">
                    <Input name="unit_cost_mad" inputMode="decimal" defaultValue={r.hasCost ? r.cost : ""} />
                  </Field>
                </div>
                <Field label="Fournisseur">
                  <Select name="supplier_id" defaultValue={r.supplier?.id ?? ""}>
                    <option value="">Aucun</option>
                    {options.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton variant="secondary" className="w-full">
                  Enregistrer les réglages
                </SubmitButton>
              </ActionForm>
            </details>
          </div>
        ) : (
          <p className="text-[13px] text-muted">Lecture seule.</p>
        )}

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Derniers mouvements</p>
          {moves.length ? (
            <ul className="space-y-2">
              {moves.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="min-w-0 truncate text-slate-600">
                    {fmtDate(m.created_at, { day: "numeric", month: "short" })} · {MOVEMENT_REASON_LABEL[m.reason]}
                  </span>
                  <span className={cn("shrink-0 font-semibold tabular-nums", m.qty > 0 ? "text-emerald-600" : m.qty < 0 ? "text-slate-700" : "text-slate-400")}>
                    {m.qty > 0 ? "+" : ""}
                    {m.qty}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">Aucun mouvement.</p>
          )}
          <Link href={`/stock?onglet=mouvements&produit=${r.item.id}`} className="mt-3 inline-block text-[13px] font-medium text-brand-600 hover:underline">
            Tout l&apos;historique
          </Link>
        </div>
      </div>
    </Card>
  );
}
