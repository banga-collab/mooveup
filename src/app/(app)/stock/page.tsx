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
import { buildRows, type StockTransfer } from "@/components/stock/lib";
import { ProductsTab } from "@/components/stock/products-tab";
import { MovementsTab, PERIODS } from "@/components/stock/movements-tab";
import { InventoryForm } from "@/components/stock/inventory-form";
import { OrdersTab } from "@/components/stock/orders-tab";
import { GlobalTab } from "@/components/stock/global-tab";
import { TransfersTab } from "@/components/stock/transfers-tab";

export const metadata = { title: "Stock" };

const TABS = ["global", "produits", "mouvements", "transferts", "inventaire", "commandes"] as const;
type Tab = (typeof TABS)[number];

type SP = Record<string, string | undefined>;

export default async function StockPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, me, scope] = await Promise.all([searchParams, getProfile(), getScope()]);
  const entities = scope.allowed.filter((e) => scope.ids.includes(e.id));
  const multi = entities.length > 1;
  // Plusieurs établissements : vue globale par défaut ; un produit ou un établissement demandé → vue par établissement
  const fallback: Tab = !multi || sp.produit || sp.etab ? "produits" : "global";
  const tab: Tab = TABS.includes(sp.onglet as Tab) && (sp.onglet !== "global" || multi) ? (sp.onglet as Tab) : fallback;
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
  const withProducts = entities.filter((e) => rows.some((r) => r.item.entity_id === e.id));
  const lowEntity = rows.find((r) => r.low)?.item.entity_id ?? withProducts[0]?.id;
  const etabQ = sp.etab && entities.some((e) => e.id === sp.etab) ? `&etab=${sp.etab}` : "";

  const tabs = [
    ...(multi ? [{ id: "global", label: "Vue globale", href: "/stock?onglet=global" }] : []),
    { id: "produits", label: multi ? "Par établissement" : "Produits", href: `/stock?onglet=produits${etabQ}` },
    { id: "mouvements", label: "Mouvements", href: "/stock?onglet=mouvements" },
    ...(multi ? [{ id: "transferts", label: "Transferts", href: "/stock?onglet=transferts" }] : []),
    { id: "inventaire", label: "Inventaire", href: `/stock?onglet=inventaire${etabQ}` },
    { id: "commandes", label: "Commandes", href: "/stock?onglet=commandes", count: orders.filter((o) => o.status !== "recue").length || undefined },
    // Répertoire fournisseurs : page dédiée
    { id: "fournisseurs", label: "Fournisseurs", href: "/fournisseurs", count: suppliers.length || undefined },
  ];

  const headerAction = !canWrite ? null : tab === "commandes" ? (
    lowEntity ? (
      <LinkButton href={`/stock?onglet=commandes&nouveau=${lowEntity}`} variant="brand">
        <Plus /> Nouvelle commande
      </LinkButton>
    ) : null
  ) : tab === "global" || tab === "produits" ? (
    <>
      {lowCount > 0 && lowEntity && (
        <LinkButton href={`/stock?onglet=commandes&nouveau=${lowEntity}`} variant="secondary">
          <ClipboardList /> Préparer une commande
        </LinkButton>
      )}
      {multi && (
        <LinkButton href="/stock?onglet=transferts#nouveau" variant="secondary">
          <ArrowLeftRight /> Transfert
        </LinkButton>
      )}
      <LinkButton href="/stock?onglet=mouvements#nouveau" variant="brand">
        <Plus /> Nouveau mouvement
      </LinkButton>
    </>
  ) : null;

  /* ---------- Contenu de l'onglet ---------- */
  let content: React.ReactNode;
  if (tab === "global") {
    content = <GlobalTab rows={rows} entityIds={withProducts.map((e) => e.id)} sp={sp} canWrite={canWrite} />;
  } else if (tab === "produits") {
    const selected = rows.find((r) => r.item.id === sp.produit) ?? null;
    const siblings = selected ? rows.filter((r) => r.key === selected.key && r.item.id !== selected.item.id) : [];
    const { data: mv } = selected ? await supabase.from("stock_movements").select("*").eq("item_id", selected.item.id).order("created_at", { ascending: false }).limit(8) : { data: [] };
    content = (
      <div className="space-y-4">
        {multi && withProducts.length > 1 && (
          <Segmented
            items={[
              { id: "", label: "Tous", href: "/stock?onglet=produits", count: rows.length },
              ...withProducts.map((e) => ({ id: e.id, label: e.short, href: `/stock?onglet=produits&etab=${e.id}`, count: rows.filter((r) => r.item.entity_id === e.id).length })),
            ]}
            active={withProducts.some((e) => e.id === sp.etab) ? sp.etab! : ""}
          />
        )}
        <ProductsTab rows={rows} sp={sp} selected={selected} selectedMoves={(mv ?? []) as StockMovement[]} siblings={siblings} suppliers={suppliers} canWrite={canWrite} />
      </div>
    );
  } else if (tab === "mouvements") {
    const period = PERIODS.some((p) => p.id === sp.periode) ? sp.periode! : "30";
    const product = rows.some((r) => r.item.id === sp.produit) ? sp.produit! : "";
    let q = supabase.from("stock_movements").select("*").in("entity_id", scope.ids);
    if (period !== "tout") q = q.gte("created_at", agadirToIso(addDaysKey(today, -Number(period)), "00:00"));
    if (product) q = q.eq("item_id", product);
    const [{ data: mv }, { data: pr }] = await Promise.all([q.order("created_at", { ascending: false }).limit(300), supabase.from("profiles").select("*")]);
    content = <MovementsTab rows={rows} sp={sp} moves={(mv ?? []) as StockMovement[]} people={byId(pr as Profile[])} product={product} period={period} canWrite={canWrite} />;
  } else if (tab === "transferts") {
    const [{ data: tr }, { data: pr }] = await Promise.all([supabase.from("stock_transfers").select("*").order("created_at", { ascending: false }).limit(300), supabase.from("profiles").select("*")]);
    const ids = new Set<string>(scope.ids);
    const transfers = ((tr ?? []) as StockTransfer[]).filter((t) => ids.has(t.from_entity_id) || ids.has(t.to_entity_id));
    content = (
      <TransfersTab
        rows={rows}
        transfers={transfers}
        people={byId(pr as Profile[])}
        entities={entities.map((e) => ({ id: e.id, short: e.short, color: e.color }))}
        sp={sp}
        canWrite={canWrite}
      />
    );
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
      <PageHeader
        title="Stock"
        subtitle={multi ? `${entities.length} établissements · vue globale, transferts, inventaires et commandes` : `${entities[0]?.short ?? ""} · produits, mouvements, inventaire et commandes`}
        actions={headerAction}
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Valeur du stock" value={madShort(stockValue)} sub={`${rows.reduce((a, r) => a + r.stock, 0)} articles · prix d'achat`} icon={<Wallet />} href={multi ? "/stock?onglet=global" : "/stock"} />
        <SolidTile
          label="Produits à commander"
          value={lowCount}
          sub={lowCount ? `${rows.filter((r) => r.stock === 0).length} en rupture` : "Stocks suffisants"}
          trendLabel={lowCount ? "Alerte" : undefined}
          trendUp={lowCount ? false : null}
          icon={<AlertTriangle />}
          href="/stock?onglet=produits&etat=commander"
        />
        <SolidTile label="Ventes produits du mois" value={madShort(soldAmount)} sub={`${soldUnits} unité${soldUnits > 1 ? "s" : ""} · ${mad(soldAmount)}`} icon={<ShoppingBag />} href="/stock?onglet=mouvements" />
        <SolidTile label="Commandes en attente" value={pending.length} sub={pending.length ? `${mad(pending.reduce((a, o) => a + Number(o.total_mad), 0))} à recevoir` : "Rien en attente"} icon={<Truck />} href="/stock?onglet=commandes" />
      </div>

      <Segmented items={tabs} active={tab} />
      {content}
    </div>
  );
}
