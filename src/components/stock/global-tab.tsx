import Link from "next/link";
import { ArrowLeftRight, Boxes } from "lucide-react";
import { entity } from "@/lib/entities";
import { cn, mad, madShort } from "@/lib/utils";
import { Card, Empty, LinkButton } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { clearHref } from "@/components/reports/list-kit";
import type { ProductRow } from "./lib";

type SP = Record<string, string | string[] | undefined>;
const FILTERS = ["q", "etat", "categorie"];

type Group = { key: string; name: string; category: string; barcode: string | null; cells: Map<string, ProductRow>; total: number; value: number; low: number; out: number };

/** Regroupe les articles d'un même produit (code-barres ou nom) dans tous les établissements */
export function groupProducts(rows: ProductRow[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    let g = map.get(r.key);
    if (!g) map.set(r.key, (g = { key: r.key, name: r.item.name, category: r.item.category || "Boutique", barcode: r.barcode, cells: new Map(), total: 0, value: 0, low: 0, out: 0 }));
    g.cells.set(r.item.entity_id, r);
    g.total += r.stock;
    g.value += r.value;
    if (r.stock === 0) g.out++;
    else if (r.low) g.low++;
    g.barcode ??= r.barcode;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "fr"));
}

/** Vue globale : un produit par ligne, le stock de chaque établissement en colonnes */
export function GlobalTab({ rows, entityIds, sp, canWrite }: { rows: ProductRow[]; entityIds: string[]; sp: SP; canWrite: boolean }) {
  const groups = groupProducts(rows);
  const q = one(sp.q);
  const fState = one(sp.etat);
  const fCat = one(sp.categorie);
  const filtered = FILTERS.some((k) => !!one(sp[k]));
  const categories = [...new Set(groups.map((g) => g.category))].sort((a, b) => a.localeCompare(b, "fr"));
  const list = groups.filter(
    (g) =>
      (!fCat || g.category === fCat) &&
      (!fState || (fState === "rupture" ? g.out > 0 : fState === "commander" ? g.out + g.low > 0 : fState === "multi" ? g.cells.size > 1 : g.out + g.low === 0)) &&
      matchesQuery(q, g.name, g.category, g.barcode),
  );

  // Résumé par établissement
  const perEntity = entityIds.map((id) => {
    const rs = rows.filter((r) => r.item.entity_id === id);
    return { id, units: rs.reduce((a, r) => a + r.stock, 0), value: rs.reduce((a, r) => a + r.value, 0), alerts: rs.filter((r) => r.low).length, products: rs.length };
  });
  const totalValue = perEntity.reduce((a, e) => a + e.value, 0);

  const columns: DataColumn[] = [
    { key: "name", label: "Produit", card: "title" },
    { key: "category", label: "Catégorie", hidden: true },
    ...entityIds.map((id): DataColumn => ({ key: `e_${id}`, label: entity(id)?.short ?? id, numeric: true })),
    { key: "total", label: "Total", numeric: true, card: "right" },
    { key: "value", label: "Valeur", numeric: true },
    ...(canWrite ? [{ key: "actions", label: "Actions", srOnly: true, sortable: false, noExport: true, hideable: false, card: "footer" as const }] : []),
  ];

  const tableRows: DataRow[] = list.map((g) => {
    const cells: Record<string, React.ReactNode> = {};
    const values: Record<string, string | number | null> = { name: g.name, category: g.category, total: g.total, value: Math.round(g.value) };
    for (const id of entityIds) {
      const r = g.cells.get(id);
      values[`e_${id}`] = r ? r.stock : null;
      cells[`e_${id}`] = r ? (
        <Link
          href={`/stock?onglet=produits&produit=${r.item.id}`}
          title={`${entity(id)?.short} · seuil ${r.alert}`}
          className={cn("inline-block min-w-8 rounded-md px-1.5 py-0.5 font-semibold tabular-nums hover:bg-slate-100", r.stock === 0 ? "text-red-600" : r.low ? "text-accent-600" : "text-ink")}
        >
          {r.stock}
        </Link>
      ) : (
        <span className="text-slate-300">—</span>
      );
    }
    // Établissement le mieux fourni → départ suggéré d'un transfert vers celui en alerte
    const sorted = [...g.cells.values()].sort((a, b) => b.stock - b.alert - (a.stock - a.alert));
    const needy = [...g.cells.values()].find((r) => r.low);
    const source = sorted[0];
    return {
      id: g.key,
      cells: {
        name: (
          <span className="block min-w-0">
            <span className="block max-w-[260px] truncate font-medium text-ink">{g.name}</span>
            <span className="block text-xs text-muted">
              {g.category}
              {g.barcode && <span className="tabular-nums text-slate-400"> · {g.barcode}</span>}
            </span>
          </span>
        ),
        category: g.category,
        ...cells,
        total: <span className="font-semibold tabular-nums text-ink">{g.total}</span>,
        value: <span className="tabular-nums text-slate-600">{mad(Math.round(g.value))}</span>,
        actions:
          source && entityIds.length > 1 ? (
            <Link
              href={`/stock?onglet=transferts&de=${source.item.entity_id}&produit=${source.item.id}${needy && needy.item.entity_id !== source.item.entity_id ? `&vers=${needy.item.entity_id}` : ""}`}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[13px] font-medium text-brand-600 hover:bg-brand-50"
            >
              <ArrowLeftRight className="size-3.5" /> Transférer
            </Link>
          ) : null,
      },
      values,
    };
  });

  if (!rows.length) {
    return (
      <Card>
        <Empty icon={<Boxes />} title="Aucun produit en vente" text="Ajoutez des articles de type « Produit » au catalogue pour suivre leur stock." action={<LinkButton href="/catalogue/nouveau?type=produit" variant="brand">Ajouter un produit</LinkButton>} />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Valeur par établissement */}
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <div className="flex min-w-max divide-x divide-line">
          {perEntity.map((e) => (
            <Link key={e.id} href={`/stock?onglet=produits&etab=${e.id}`} className="min-w-[132px] flex-1 px-4 py-3 transition hover:bg-slate-50">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <span className="size-2 rounded-full" style={{ background: entity(e.id)?.color }} />
                {entity(e.id)?.short ?? e.id}
              </span>
              <span className="mt-1 block text-[15px] font-semibold tabular-nums text-ink">{madShort(e.value)}</span>
              <span className="block text-xs tabular-nums text-muted">
                {e.units} art. · {e.products} réf.
                {e.alerts > 0 && <span className="text-accent-600"> · {e.alerts} alerte{e.alerts > 1 ? "s" : ""}</span>}
              </span>
            </Link>
          ))}
          <div className="min-w-[132px] flex-1 bg-slate-50 px-4 py-3">
            <span className="text-xs font-medium text-slate-600">Groupe</span>
            <span className="mt-1 block text-[15px] font-semibold tabular-nums text-ink">{madShort(totalValue)}</span>
            <span className="block text-xs tabular-nums text-muted">
              {perEntity.reduce((a, e) => a + e.units, 0)} art. · {groups.length} produits
            </span>
          </div>
        </div>
      </div>

      <section>
        <ListToolbar
          className="mb-3"
          placeholder="Produit, code-barres, catégorie…"
          filters={[
            {
              param: "etat",
              label: "Tous stocks",
              options: [
                { value: "commander", label: "Alerte quelque part", count: groups.filter((g) => g.out + g.low > 0).length },
                { value: "rupture", label: "Rupture quelque part", count: groups.filter((g) => g.out > 0).length },
                { value: "multi", label: "Dans plusieurs établissements", count: groups.filter((g) => g.cells.size > 1).length },
                { value: "ok", label: "Partout suffisant", count: groups.filter((g) => g.out + g.low === 0).length },
              ],
            },
            ...(categories.length > 1 && categories.length <= 12
              ? [{ param: "categorie", label: "Toutes catégories", options: categories.map((c) => ({ value: c, label: c, count: groups.filter((g) => g.category === c).length })) }]
              : []),
          ]}
        />
        <DataTable
          id="stock-global"
          columns={columns}
          rows={tableRows}
          query={q}
          filtered={filtered}
          clearHref={clearHref("/stock", sp, FILTERS)}
          unit={["produit", "produits"]}
          minWidth={360 + entityIds.length * 96}
          exportName="stock_global"
          pageSize={60}
          empty={<Empty icon={<Boxes />} title="Aucun produit" />}
        />
        <p className="mt-2 text-xs text-muted">
          Chiffre <span className="font-medium text-accent-600">orange</span> : au seuil d&apos;alerte de l&apos;établissement · <span className="font-medium text-red-600">rouge</span> : rupture · — : produit non référencé.
        </p>
      </section>
    </div>
  );
}
