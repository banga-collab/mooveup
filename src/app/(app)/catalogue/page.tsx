import Link from "next/link";
import { CalendarRange, ConciergeBell, Eye, EyeOff, Lock, Package, PackageX, Plus, Search, SquarePen, Tag } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn, mad } from "@/lib/utils";
import type { CatalogItem, CatalogKind } from "@/lib/types";
import { deleteCatalogItem, toggleCatalogItem } from "@/actions/catalog";
import { SolidTile } from "@/components/stat-tile";
import { DeleteIconButton } from "@/components/catalog/delete-button";
import { Empty, LinkButton, buttonClass } from "@/components/ui";
import { EntityMark } from "@/components/entity-icon";
import { KIND_META, KIND_ORDER, LOW_STOCK, itemDetail } from "@/components/sales/meta";

export const metadata = { title: "Catalogue" };

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ type?: string; q?: string }> }) {
  const sp = await searchParams;
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  const supabase = await createClient();
  const canEdit = me.role === "direction" || me.role === "manager";
  const type = KIND_ORDER.includes(sp.type as CatalogKind) ? (sp.type as CatalogKind) : null;
  const q = (sp.q ?? "").trim();

  const { data } = await supabase.from("catalog_items").select("*").in("entity_id", scope.ids).order("name");
  const all = (data ?? []) as CatalogItem[];
  const n = q.toLowerCase();
  const items = all.filter((i) => (!type || i.kind === type) && (!n || i.name.toLowerCase().includes(n) || i.category.toLowerCase().includes(n)));

  const active = all.filter((i) => i.active);
  const lowStock = active.filter((i) => i.kind === "produit" && i.stock !== null && i.stock <= LOW_STOCK);
  const href = (p: { type?: string | null; q?: string }) => {
    const u = new URLSearchParams();
    const t = p.type === undefined ? type : p.type;
    const qq = p.q === undefined ? q : p.q;
    if (t) u.set("type", t);
    if (qq) u.set("q", qq);
    const s = u.toString();
    return `/catalogue${s ? `?${s}` : ""}`;
  };
  const entities = scope.allowed.filter((e) => scope.ids.includes(e.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">Catalogue</h1>
          <p className="mt-1 text-sm text-muted">Abonnements, packs, prestations et produits vendus à la caisse</p>
        </div>
        {canEdit ? (
          <LinkButton href={`/catalogue/nouveau${type ? `?type=${type}` : ""}`} className="h-11 rounded-2xl">
            <Plus className="size-4" /> Ajouter un article
          </LinkButton>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
            <Lock className="size-3.5" /> Lecture seule
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile tone="brand" label="Articles actifs" value={active.length} sub={`${all.length - active.length} désactivé(s)`} icon={<Tag />} watermark={<Tag />} href={href({ type: null })} />
        <SolidTile
          tone="violet"
          label="Abonnements & packs"
          value={active.filter((i) => i.kind === "abonnement" || i.kind === "pack").length}
          sub="Formules à durée ou à séances"
          icon={<CalendarRange />}
          watermark={<CalendarRange />}
          href={href({ type: "abonnement" })}
        />
        <SolidTile tone="accent" label="Prestations" value={active.filter((i) => i.kind === "prestation").length} sub="Soins et services sur rendez-vous" icon={<ConciergeBell />} watermark={<ConciergeBell />} href={href({ type: "prestation" })} />
        <SolidTile
          tone="green"
          label="Produits"
          value={active.filter((i) => i.kind === "produit").length}
          sub={lowStock.length ? `${lowStock.length} en stock bas` : "Stocks suffisants"}
          icon={<Package />}
          watermark={<Package />}
          href={href({ type: "produit" })}
          trendLabel={lowStock.length ? "Stock bas" : undefined}
          trendUp={lowStock.length ? false : null}
        />
      </div>

      {/* Filtres */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex w-max gap-1.5">
            {[null, ...KIND_ORDER].map((k) => {
              const on = k === type;
              const meta = k ? KIND_META[k] : null;
              const I = meta?.icon ?? Tag;
              const count = all.filter((i) => !k || i.kind === k).length;
              return (
                <Link
                  key={k ?? "all"}
                  href={href({ type: k })}
                  className={cn("inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition", on ? "text-white shadow-sm" : "border border-line bg-white text-slate-600 hover:border-slate-300")}
                  style={on ? { background: meta?.color ?? "#1a6d8e" } : undefined}
                >
                  <I className="size-4" />
                  {meta?.plural ?? "Tout"}
                  <span className={cn("rounded-full px-1.5 text-[11px]", on ? "bg-white/25" : "bg-canvas text-muted")}>{count}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <form action="/catalogue" className="relative lg:ml-auto lg:w-72">
          {type && <input type="hidden" name="type" value={type} />}
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Rechercher un article…"
            className="h-10 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50"
          />
        </form>
      </div>

      {items.length ? (
        entities.map((e) => {
          const mine = items.filter((i) => i.entity_id === e.id);
          if (!mine.length) return null;
          return (
            <section key={e.id} id={e.id} className="scroll-mt-20 overflow-hidden rounded-3xl border border-line bg-white shadow-card">
              <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" style={{ background: `linear-gradient(135deg, ${e.soft}, #ffffff)` }}>
                <div className="flex min-w-0 items-center gap-3">
                  <EntityMark id={e.id} size={42} />
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-extrabold" style={{ color: e.color }}>
                      {e.short}
                    </h2>
                    <p className="truncate text-xs text-muted">
                      {mine.length} article{mine.length > 1 ? "s" : ""} · {e.tagline}
                    </p>
                  </div>
                </div>
                {canEdit && (
                  <Link href={`/catalogue/nouveau?etab=${e.id}${type ? `&type=${type}` : ""}`} className={buttonClass("secondary", "h-9 rounded-xl")}>
                    <Plus className="size-4" /> Ajouter
                  </Link>
                )}
              </header>
              <div className="space-y-6 p-5 pt-3">
                {KIND_ORDER.map((k) => {
                  const group = mine.filter((i) => i.kind === k);
                  if (!group.length) return null;
                  const meta = KIND_META[k];
                  const KI = meta.icon;
                  return (
                    <div key={k}>
                      <p className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: meta.color }}>
                        <KI className="size-4" /> {meta.plural}
                        <span className="h-px flex-1 bg-line" />
                      </p>
                      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [&>*]:min-w-0">
                        {group.map((i) => (
                          <ItemCard key={i.id} item={i} canEdit={canEdit} color={e.color} />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      ) : (
        <div className="rounded-3xl border border-line bg-white shadow-card">
          <Empty
            icon={<Package className="size-6" />}
            title={all.length ? "Aucun article ne correspond" : "Catalogue vide"}
            text={all.length ? "Essayez un autre type ou une autre recherche." : "Ajoutez les abonnements, prestations et produits de l'établissement."}
            action={
              canEdit ? (
                <LinkButton href="/catalogue/nouveau">
                  <Plus className="size-4" /> Ajouter un article
                </LinkButton>
              ) : undefined
            }
          />
        </div>
      )}
    </div>
  );
}

function ItemCard({ item: i, canEdit, color }: { item: CatalogItem; canEdit: boolean; color: string }) {
  const meta = KIND_META[i.kind];
  const I = meta.icon;
  const out = i.kind === "produit" && i.stock !== null && i.stock <= 0;
  const low = i.kind === "produit" && i.stock !== null && i.stock > 0 && i.stock <= LOW_STOCK;
  return (
    <li className={cn("group flex flex-col rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-pop", !i.active && "bg-canvas/60")}>
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", !i.active && "grayscale")} style={{ background: meta.soft, color: meta.color }}>
          <I className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold leading-snug", !i.active && "text-muted line-through decoration-slate-300")}>{i.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {i.category || "Sans catégorie"}
            {itemDetail(i) ? ` · ${itemDetail(i)}` : ""}
          </p>
        </div>
        <span className="shrink-0 font-display text-[15px] font-extrabold" style={{ color: i.active ? color : "#94a3b8" }}>
          {mad(Number(i.price_mad))}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {i.active ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            <span className="size-1.5 rounded-full bg-current" /> Actif
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
            <span className="size-1.5 rounded-full bg-current" /> Désactivé
          </span>
        )}
        {out && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
            <PackageX className="size-3" /> Rupture
          </span>
        )}
        {low && <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-bold text-accent-700">Stock bas : {i.stock}</span>}
        {canEdit && (
          <span className="ml-auto flex items-center gap-1">
            <Link href={`/catalogue/${i.id}`} className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-brand-50 hover:text-brand-600" title="Modifier" aria-label="Modifier">
              <SquarePen className="size-4" />
            </Link>
            <form action={toggleCatalogItem.bind(null, i.id)}>
              <button
                type="submit"
                className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-amber-50 hover:text-amber-700"
                title={i.active ? "Désactiver" : "Activer"}
                aria-label={i.active ? "Désactiver" : "Activer"}
              >
                {i.active ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </form>
            <form action={deleteCatalogItem.bind(null, i.id)}>
              <DeleteIconButton message={`Supprimer « ${i.name} » ? Les ventes passées gardent leur libellé. Pour simplement le retirer de la caisse, désactivez-le.`} />
            </form>
          </span>
        )}
      </div>
    </li>
  );
}
