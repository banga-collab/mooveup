import Link from "next/link";
import { AlertTriangle, Eye, EyeOff, Lock, Package, Plus, SquarePen } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { entity } from "@/lib/entities";
import { CATALOG_KIND_LABEL, cn, mad } from "@/lib/utils";
import type { CatalogItem, CatalogKind } from "@/lib/types";
import { deleteCatalogItem, toggleCatalogItem } from "@/actions/catalog";
import { DeleteIconButton } from "@/components/catalog/delete-button";
import { Badge, Empty, LinkButton, PageHeader } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery, one } from "@/components/data-table/match";
import { SaveViewButton } from "@/components/data-table/save-view";
import { KIND_META, KIND_ORDER, LOW_STOCK, itemDetail } from "@/components/sales/meta";

export const metadata = { title: "Catalogue" };

const ETATS = ["actif", "inactif", "stock-bas"] as const;

export default async function CataloguePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const canEdit = me.role === "direction" || me.role === "manager";
  const typeRaw = one(sp.type) as CatalogKind | undefined;
  const type = typeRaw && KIND_ORDER.includes(typeRaw) ? typeRaw : null;
  const etatRaw = one(sp.etat) as (typeof ETATS)[number] | undefined;
  const etat = etatRaw && ETATS.includes(etatRaw) ? etatRaw : null;
  const etab = scope.ids.find((e) => e === one(sp.etab));
  const q = one(sp.q)?.slice(0, 80) ?? "";

  const { data } = await supabase.from("catalog_items").select("*").in("entity_id", scope.ids).order("name");
  const all = (data ?? []) as CatalogItem[];
  const isLow = (i: CatalogItem) => i.kind === "produit" && i.stock !== null && i.stock <= LOW_STOCK;

  const items = all
    .filter(
      (i) =>
        (!type || i.kind === type) &&
        (!etab || i.entity_id === etab) &&
        (!etat || (etat === "actif" ? i.active : etat === "inactif" ? !i.active : isLow(i))) &&
        matchesQuery(q, i.name, i.category, CATALOG_KIND_LABEL[i.kind], KIND_META[i.kind].plural, entity(i.entity_id)?.short, Number(i.price_mad), mad(Number(i.price_mad)), itemDetail(i)),
    )
    .sort((a, b) => (entity(a.entity_id)?.name ?? "").localeCompare(entity(b.entity_id)?.name ?? "") || a.name.localeCompare(b.name, "fr"));

  const active = all.filter((i) => i.active);
  const lowStock = active.filter(isLow);
  const multi = scope.ids.length > 1;
  const filtered = !!(q || type || etat || etab);

  const columns: DataColumn[] = [
    { key: "article", label: "Article", card: "title", className: "min-w-[220px]" },
    { key: "categorie", label: "Catégorie", hidden: true, className: "text-[13px] text-slate-600" },
    { key: "type", label: "Type", className: "whitespace-nowrap text-[13px] text-slate-600", card: "subtitle" },
    ...(multi ? [{ key: "etab", label: "Établissement" }] : []),
    { key: "detail", label: "Durée / stock", hidden: true, className: "whitespace-nowrap text-[13px] text-slate-600" },
    { key: "prix", label: "Prix", numeric: true, card: "right", className: "font-semibold" },
    { key: "statut", label: "Statut" },
    ...(canEdit ? [{ key: "actions", label: "Actions", srOnly: true, noExport: true, sortable: false, hideable: false, card: "footer" as const, className: "w-px !py-1.5" }] : []),
  ];

  const rows: DataRow[] = items.map((i) => ({
    id: i.id,
    href: canEdit ? `/catalogue/${i.id}` : undefined,
    className: i.active ? undefined : "text-muted",
    cells: {
      article: (
        <span className="block min-w-0">
          <span className={cn("block font-medium", i.active ? "text-ink" : "text-muted")}>{i.name}</span>
          <span className="block text-xs text-muted">
            {i.category || "Sans catégorie"}
            {itemDetail(i) ? ` · ${itemDetail(i)}` : ""}
          </span>
        </span>
      ),
      categorie: i.category || null,
      type: CATALOG_KIND_LABEL[i.kind],
      etab: <EntityBadge id={i.entity_id} />,
      detail: itemDetail(i) || null,
      prix: <span className={cn(!i.active && "text-muted")}>{mad(Number(i.price_mad))}</span>,
      statut: <StatusBadges item={i} />,
      actions: <RowActions item={i} />,
    },
    values: {
      article: i.name,
      categorie: i.category,
      type: CATALOG_KIND_LABEL[i.kind],
      etab: entity(i.entity_id)?.short,
      detail: itemDetail(i),
      prix: Number(i.price_mad),
      statut: i.active ? (isLow(i) ? `Actif · stock ${i.stock}` : "Actif") : "Désactivé",
    },
  }));

  const viewName = ["Catalogue", type && KIND_META[type].plural, etat === "stock-bas" && "stock bas", etat === "inactif" && "désactivés", etab && entity(etab)?.short, q && `« ${q} »`].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Catalogue"
        subtitle={`${active.length} articles actifs · abonnements, packs, prestations et produits`}
        actions={
          canEdit ? (
            <LinkButton variant="brand" href={`/catalogue/nouveau${type ? `?type=${type}` : ""}${etab ? `${type ? "&" : "?"}etab=${etab}` : ""}`}>
              <Plus /> Ajouter un article
            </LinkButton>
          ) : (
            <Badge tone="gray">
              <Lock className="size-3" /> Lecture seule
            </Badge>
          )
        }
      />

      {lowStock.length > 0 && etat !== "stock-bas" && (
        <Link
          href="/catalogue?type=produit&etat=stock-bas"
          className="flex items-center gap-2.5 rounded-xl border border-accent-200 bg-accent-50 px-4 py-2.5 text-[13px] text-accent-700 transition hover:border-accent-300"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            <b className="font-semibold">
              {lowStock.length} produit{lowStock.length > 1 ? "s" : ""} en stock bas
            </b>{" "}
            : {lowStock.slice(0, 3).map((i) => i.name).join(", ")}
            {lowStock.length > 3 ? "…" : ""}
          </span>
        </Link>
      )}

      <ListToolbar
        placeholder="Nom, catégorie, type, prix…"
        filters={[
          { param: "type", label: "Tout", options: KIND_ORDER.map((k) => ({ value: k, label: KIND_META[k].plural, count: all.filter((i) => i.kind === k).length })) },
          {
            param: "etat",
            label: "Tous états",
            options: [
              { value: "actif", label: "Actifs", count: active.length },
              { value: "inactif", label: "Désactivés", count: all.length - active.length },
              { value: "stock-bas", label: "Stock bas", count: lowStock.length },
            ],
          },
          ...(multi ? [{ param: "etab", label: "Tous établ.", options: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ value: e.id, label: e.short })) }] : []),
        ]}
        right={<SaveViewButton defaultLabel={viewName} icon="/catalogue" />}
      />

      <DataTable
        id="catalogue"
        columns={columns}
        rows={rows}
        query={q}
        filtered={filtered}
        clearHref="/catalogue"
        unit={["article", "articles"]}
        minWidth={640}
        selectable
        bulkActions={
          canEdit
            ? [
                { label: "Masquer à la caisse", icon: <EyeOff />, ids: items.filter((i) => i.active).map((i) => i.id), each: toggleCatalogItem, done: "{n} article(s) masqué(s) à la caisse" },
                { label: "Réactiver", icon: <Eye />, ids: items.filter((i) => !i.active).map((i) => i.id), each: toggleCatalogItem, done: "{n} article(s) réactivé(s)" },
              ]
            : undefined
        }
        empty={
          <Empty
            icon={<Package />}
            title="Catalogue vide"
            text="Ajoutez les abonnements, prestations et produits de l'établissement."
            action={
              canEdit ? (
                <LinkButton variant="brand" href="/catalogue/nouveau">
                  <Plus /> Ajouter un article
                </LinkButton>
              ) : undefined
            }
          />
        }
      />
    </div>
  );
}

function StatusBadges({ item: i }: { item: CatalogItem }) {
  const out = i.kind === "produit" && i.stock !== null && i.stock <= 0;
  const low = i.kind === "produit" && i.stock !== null && i.stock > 0 && i.stock <= LOW_STOCK;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {i.active ? (
        <Badge tone="green" dot>
          Actif
        </Badge>
      ) : (
        <Badge tone="gray" dot>
          Désactivé
        </Badge>
      )}
      {out && <Badge tone="red">Rupture</Badge>}
      {low && <Badge tone="accent">Stock bas : {i.stock}</Badge>}
    </span>
  );
}

function RowActions({ item: i }: { item: CatalogItem }) {
  const icon =
    "grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40";
  return (
    <span className="flex items-center justify-end gap-0.5">
      <Link href={`/catalogue/${i.id}`} className={icon} title="Modifier" aria-label={`Modifier ${i.name}`}>
        <SquarePen className="size-4" />
      </Link>
      <form action={toggleCatalogItem.bind(null, i.id)}>
        <button type="submit" className={icon} title={i.active ? "Désactiver" : "Activer"} aria-label={`${i.active ? "Désactiver" : "Activer"} ${i.name}`}>
          {i.active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </form>
      <form action={deleteCatalogItem.bind(null, i.id)}>
        <DeleteIconButton message={`Supprimer « ${i.name} » ? Les ventes passées gardent leur libellé. Pour simplement le retirer de la caisse, désactivez-le.`} />
      </form>
    </span>
  );
}
