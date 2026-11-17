import { AlertTriangle, ArrowLeftRight, Boxes, ClipboardList, Plus, ShoppingBag, Truck, Wallet } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, monthKey } from "@/lib/data";
import { addDaysKey, agadirToIso, dayKey, mad, madShort } from "@/lib/utils";
import type { CatalogItem, Profile, Sale, SaleItem } from "@/lib/types";
import type { PurchaseOrder, StockMovement, StockSetting, Supplier } from "@/lib/types-ops";
import { validateInventory } from "@/actions/stock";
import { SolidTile } from "@/components/stat-tile";
import { Card, Empty, LinkButton, PageHeader, Segmented } from "@/components/ui";
import { buildRows } from "@/components/stock/lib";
import { ProductsTab } from "@/components/stock/products-tab";
import { MovementsTab, PERIODS } from "@/components/stock/movements-tab";
import { InventoryForm } from "@/components/stock/inventory-form";
import { SuppliersTab } from "@/components/stock/suppliers-tab";
import { OrdersTab } from "@/components/stock/orders-tab";

export const metadata = { title: "Stock" };

const TABS = ["produits", "mouvements", "inventaire", "fournisseurs", "commandes"] as const;
type Tab = (typeof TABS)[number];

type SP = Record<string, string | undefined>;

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, me, scope] = await Promise.all([searchParams, getProfile(), getScope()]);
  const tab: Tab = TABS.includes(sp.onglet as Tab) ? (sp.onglet as Tab) : "produits";
  const canWrite = me.role !== "staff";
  const supabase = await createClient();
  const today = dayKey();
  const monthStart = agadirToIso(`${monthKey(new Date())}-01`, "00:00");

  const [{ data: cat }, { data: st }, { data: sup }, { data: po }, { data: sa }] = await Promise.all([
    supabase.from("catalog_items").select("*").in("entity_id", scope.ids).eq("kind", "produit").order("name"),
    supabase.from("stock_settings").select("*").in("entity_id", scope.ids),
    supabase.from("suppliers").select("*").overlaps("entity_ids", scope.ids).order("name"),
    supabase.from("purchase_orders").select("*").in("entity_id", scope.ids).order("created_at", { ascending: false }),
    supabase.from("sales").select("*").in("entity_id", scope.ids).gte("sold_at", monthStart),
  ]);
  const items = ((cat ?? []) as CatalogItem[]).filter((i) => i.active || Number(i.stock ?? 0) > 0);
  const suppliers = (sup ?? []) as Supplier[];
  const orders = (po ?? []) as PurchaseOrder[];
  const rows = buildRows(items, (st ?? []) as StockSetting[], suppliers);
  const itemIds = new Set(items.map((i) => i.id));

  // Ventes de produits du mois
  const monthSales = ((sa ?? []) as Sale[]).filter((s) => s.status !== "remboursee");
  const { data: li } = monthSales.length ? await supabase.from("sale_items").select("*").in("sale_id", monthSales.map((s) => s.id)) : { data: [] };
  const productLines = ((li ?? []) as SaleItem[]).filter((l) => l.item_id && itemIds.has(l.item_id));
  const soldAmount = productLines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price_mad), 0);
  const soldUnits = productLines.reduce((a, l) => a + Number(l.qty), 0);

  const stockValue = rows.reduce((a, r) => a + r.value, 0);
  const lowCount = rows.filter((r) => r.low).length;
  const pending = orders.filter((o) => o.status === "envoyee");
  const entities = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const withProducts = entities.filter((e) => rows.some((r) => r.item.entity_id === e.id));
  const lowEntity = rows.find((r) => r.low)?.item.entity_id ?? withProducts[0]?.id;

  const tabs = [
    { id: "produits", label: "Produits", href: "/stock" },
    { id: "mouvements", label: "Mouvements", href: "/stock?onglet=mouvements" },
    { id: "inventaire", label: "Inventaire", href: "/stock?onglet=inventaire" },
    { id: "fournisseurs", label: "Fournisseurs", href: "/stock?onglet=fournisseurs", count: suppliers.length },
    { id: "commandes", label: "Commandes", href: "/stock?onglet=commandes", count: orders.filter((o) => o.status !== "recue").length || undefined },
  ];

  const headerAction =
    !canWrite ? null : tab === "fournisseurs" ? (
      <LinkButton href="/stock?onglet=fournisseurs&nouveau=1" variant="brand">
        <Plus /> Ajouter un fournisseur
      </LinkButton>
    ) : tab === "commandes" ? (
      lowEntity ? (
        <LinkButton href={`/stock?onglet=commandes&nouveau=${lowEntity}`} variant="brand">
          <Plus /> Nouvelle commande
        </LinkButton>
      ) : null
    ) : tab === "produits" ? (
      <>
        {lowCount > 0 && lowEntity && (
          <LinkButton href={`/stock?onglet=commandes&nouveau=${lowEntity}`} variant="secondary">
            <ClipboardList /> Préparer une commande
          </LinkButton>
        )}
        <LinkButton href="/stock?onglet=mouvements#nouveau" variant="brand">
          <ArrowLeftRight /> Nouveau mouvement
        </LinkButton>
      </>
    ) : null;

  /* ---------- Contenu de l'onglet ---------- */
  let content: React.ReactNode;
  if (tab === "produits") {
    const selected = rows.find((r) => r.item.id === sp.produit) ?? null;
    const { data: mv } = selected ? await supabase.from("stock_movements").select("*").eq("item_id", selected.item.id).order("created_at", { ascending: false }).limit(8) : { data: [] };
    content = <ProductsTab rows={rows} sp={sp} selected={selected} selectedMoves={(mv ?? []) as StockMovement[]} suppliers={suppliers} canWrite={canWrite} />;
  } else if (tab === "mouvements") {
    const period = PERIODS.some((p) => p.id === sp.periode) ? sp.periode! : "30";
    const product = rows.some((r) => r.item.id === sp.produit) ? sp.produit! : "";
    let q = supabase.from("stock_movements").select("*").in("entity_id", scope.ids);
    if (period !== "tout") q = q.gte("created_at", agadirToIso(addDaysKey(today, -Number(period)), "00:00"));
    if (product) q = q.eq("item_id", product);
    const [{ data: mv }, { data: pr }] = await Promise.all([q.order("created_at", { ascending: false }).limit(300), supabase.from("profiles").select("*")]);
    content = <MovementsTab rows={rows} sp={sp} moves={(mv ?? []) as StockMovement[]} people={byId(pr as Profile[])} product={product} period={period} canWrite={canWrite} />;
  } else if (tab === "inventaire") {
    const eid = withProducts.find((e) => e.id === sp.etab)?.id ?? (scope.current && withProducts.some((e) => e.id === scope.current!.id) ? scope.current.id : withProducts[0]?.id);
    const list = rows.filter((r) => r.item.entity_id === eid);
    content = eid ? (
      <div className="space-y-4">
        {withProducts.length > 1 && <Segmented items={withProducts.map((e) => ({ id: e.id, label: e.short, href: `/stock?onglet=inventaire&etab=${e.id}`, count: rows.filter((r) => r.item.entity_id === e.id).length }))} active={eid} />}
        <p className="text-[13px] text-muted">Comptez les produits en rayon et en réserve, saisissez les quantités, puis validez : les écarts deviennent des ajustements de stock.</p>
        <InventoryForm key={eid} items={list.map((r) => ({ id: r.item.id, name: r.item.name, category: r.item.category, stock: r.stock }))} action={validateInventory.bind(null, eid)} canWrite={canWrite} />
      </div>
    ) : (
      <Card>
        <Empty icon={<Boxes />} title="Aucun produit à inventorier" text="Ajoutez des produits au catalogue pour suivre leur stock." action={<LinkButton href="/catalogue/nouveau?type=produit" variant="brand">Ajouter un produit</LinkButton>} />
      </Card>
    );
  } else if (tab === "fournisseurs") {
    content = (
      <SuppliersTab
        sp={sp}
        suppliers={suppliers}
        rows={rows}
        entities={entities.map((e) => ({ id: e.id, short: e.short, color: e.color }))}
        editing={suppliers.find((s) => s.id === sp.modifier) ?? null}
        creating={sp.nouveau === "1"}
        canWrite={canWrite}
      />
    );
  } else {
    const newEntity = sp.nouveau && entities.some((e) => e.id === sp.nouveau) ? sp.nouveau : null;
    const status = ["recue", "tout"].includes(sp.statut ?? "") ? sp.statut! : "encours";
    content = (
      <OrdersTab
        sp={sp}
        orders={orders}
        suppliers={suppliers}
        rows={rows}
        entities={entities.map((e) => ({ id: e.id, short: e.short }))}
        newEntity={newEntity}
        newSupplier={sp.fournisseur ?? null}
        status={status}
        canWrite={canWrite}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Stock" subtitle="Produits vendus en boutique, mouvements, inventaires et commandes fournisseurs" actions={headerAction} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Valeur du stock" value={madShort(stockValue)} sub={`${rows.reduce((a, r) => a + r.stock, 0)} articles · prix d'achat`} icon={<Wallet />} href="/stock" />
        <SolidTile
          label="Produits à commander"
          value={lowCount}
          sub={lowCount ? `${rows.filter((r) => r.stock === 0).length} en rupture` : "Stocks suffisants"}
          trendLabel={lowCount ? "Alerte" : undefined}
          trendUp={lowCount ? false : null}
          icon={<AlertTriangle />}
          href="/stock"
        />
        <SolidTile label="Ventes produits du mois" value={madShort(soldAmount)} sub={`${soldUnits} unité${soldUnits > 1 ? "s" : ""} · ${mad(soldAmount)}`} icon={<ShoppingBag />} href="/stock?onglet=mouvements" />
        <SolidTile label="Commandes en attente" value={pending.length} sub={pending.length ? `${mad(pending.reduce((a, o) => a + Number(o.total_mad), 0))} à recevoir` : "Rien en attente"} icon={<Truck />} href="/stock?onglet=commandes" />
      </div>

      <Segmented items={tabs} active={tab} />
      {content}
    </div>
  );
}
