"use client";

import { useMemo, useState, useTransition } from "react";
import {
  AlertCircle,
  CircleDollarSign,
  Coins,
  Loader2,
  Minus,
  PackageX,
  Percent,
  Plus,
  ReceiptText,
  Search,
  ShoppingBasket,
  ShoppingCart,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { createSale, type CheckoutInput } from "@/actions/sales";
import { ContactPicker, type PickerContact } from "@/components/contact-picker";
import { EntityIcon } from "@/components/entity-icon";
import { SolidTile } from "@/components/stat-tile";
import { cn, mad, madShort, PAY_LABEL } from "@/lib/utils";
import type { CatalogKind, PayMethod } from "@/lib/types";
import { KIND_META, LOW_STOCK, METHOD_META, METHOD_ORDER, itemDetail } from "./meta";

export type CartLine = { key: string; item_id: string | null; label: string; kind: CatalogKind | null; qty: number; unit_price: number };

type PosItem = {
  id: string;
  entity_id: string;
  kind: CatalogKind;
  name: string;
  category: string;
  price: number;
  stock: number | null;
  duration_min: number | null;
  duration_days: number | null;
  sessions_count: number | null;
};

type Line = CartLine & { priceText: string };

const toNum = (s: string) => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const withText = (l: CartLine): Line => ({ ...l, priceText: String(l.unit_price) });

export function Checkout({
  entities,
  initialEntity,
  items,
  contacts,
  initialContact,
  initialLines,
  rdvId,
  todaySales,
}: {
  entities: { id: string; short: string; color: string; soft: string }[];
  initialEntity: string;
  items: PosItem[];
  contacts: PickerContact[];
  initialContact: string | null;
  initialLines: CartLine[];
  rdvId: string | null;
  todaySales: { entity_id: string; total: number; paid: number }[];
}) {
  const [entityId, setEntityId] = useState(initialEntity);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [lines, setLines] = useState<Line[]>(() => initialLines.map(withText));
  const [contact, setContact] = useState<PickerContact | null>(() => contacts.find((c) => c.id === initialContact) ?? null);
  const [discMode, setDiscMode] = useState<"mad" | "pct">("mad");
  const [discText, setDiscText] = useState("");
  const [method, setMethod] = useState<PayMethod>("especes");
  const [received, setReceived] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const ent = entities.find((e) => e.id === entityId) ?? entities[0]!;

  /* ----- Catalogue de l'établissement ----- */
  const entityItems = useMemo(() => items.filter((i) => i.entity_id === entityId), [items, entityId]);
  const categories = useMemo(() => [...new Set(entityItems.map((i) => i.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [entityItems]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const order: CatalogKind[] = ["abonnement", "pack", "prestation", "produit"];
    return entityItems
      .filter((i) => (cat === "all" || i.category === cat) && (!n || i.name.toLowerCase().includes(n) || i.category.toLowerCase().includes(n)))
      .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.localeCompare(b.name, "fr"));
  }, [entityItems, cat, q]);

  /* ----- Stats du jour ----- */
  const stats = useMemo(() => {
    const s = todaySales.filter((x) => x.entity_id === entityId);
    const total = s.reduce((a, x) => a + x.total, 0);
    return { paid: s.reduce((a, x) => a + x.paid, 0), count: s.length, avg: s.length ? total / s.length : 0 };
  }, [todaySales, entityId]);

  /* ----- Panier ----- */
  const gross = lines.reduce((a, l) => a + l.qty * l.unit_price, 0);
  const dv = Math.max(0, toNum(discText));
  const discount = Math.min(gross, discMode === "pct" ? (gross * Math.min(dv, 100)) / 100 : dv);
  const total = Math.round((gross - discount) * 100) / 100;
  const rec = received.trim() === "" ? null : Math.max(0, toNum(received));
  const paidNow = rec === null ? total : Math.min(total, rec);
  const change = method === "especes" && rec !== null && rec > total ? rec - total : 0;
  const rest = Math.max(0, total - paidNow);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const needsContact = lines.some((l) => l.kind === "abonnement" || l.kind === "pack");

  const qtyOf = (id: string) => lines.filter((l) => l.item_id === id).reduce((a, l) => a + l.qty, 0);

  const add = (it: PosItem) => {
    setError(null);
    setLines((ls) => {
      const ex = ls.find((l) => l.item_id === it.id);
      if (ex) return ls.map((l) => (l === ex ? { ...l, qty: l.qty + 1 } : l));
      return [...ls, withText({ key: `${it.id}-${Date.now()}`, item_id: it.id, label: it.name, kind: it.kind, qty: 1, unit_price: it.price })];
    });
  };
  const addFree = () => setLines((ls) => [...ls, withText({ key: `libre-${Date.now()}`, item_id: null, label: "", kind: null, qty: 1, unit_price: 0 })]);
  const patch = (key: string, p: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const bump = (key: string, d: number) => setLines((ls) => ls.flatMap((l) => (l.key !== key ? [l] : l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }])));

  const switchEntity = (id: string) => {
    if (id === entityId) return;
    if (lines.length && !confirm("Changer d'établissement vide le panier. Continuer ?")) return;
    setLines([]);
    setCat("all");
    setEntityId(id);
    setError(null);
  };

  const clear = () => {
    setLines([]);
    setDiscText("");
    setReceived("");
    setError(null);
  };

  const submit = () => {
    setError(null);
    if (!lines.length) return setError("Ajoutez au moins un article au panier.");
    if (lines.some((l) => !l.label.trim())) return setError("Donnez un nom à chaque ligne libre.");
    if (rest > 0 && !contact) return setError("Choisissez le client pour un paiement partiel ou à crédit.");
    const payload: CheckoutInput = {
      entity_id: entityId,
      contact_id: contact?.id ?? null,
      lines: lines.map((l) => ({ item_id: l.item_id, label: l.label.trim(), qty: l.qty, unit_price: l.unit_price })),
      discount_mode: discMode,
      discount_value: dv,
      method,
      paid: rec === null ? null : paidNow,
      rdv_id: rdvId,
      notes: notes.trim() || null,
    };
    startTransition(async () => {
      const r = await createSale(payload);
      if (r?.error) setError(r.error);
    });
  };

  // Billets ronds proposés pour les espèces
  const quick = useMemo(() => {
    if (total <= 0) return [];
    const ups = [50, 100, 200].map((s) => Math.ceil(total / s) * s).filter((v) => v > total);
    return [...new Set(ups)].slice(0, 3);
  }, [total]);

  return (
    <div className="space-y-6">
      {/* Tuiles du jour */}
      <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        <SolidTile tone="brand" label="Encaissé aujourd'hui" value={madShort(stats.paid)} sub={`${mad(stats.paid)} · ${ent.short}`} icon={<Wallet />} watermark={<Wallet />} />
        <SolidTile tone="accent" label="Tickets du jour" value={stats.count} sub={stats.count ? "Ventes enregistrées" : "Aucune vente pour l'instant"} icon={<ReceiptText />} watermark={<ReceiptText />} />
        <SolidTile tone="green" label="Panier moyen" value={madShort(Math.round(stats.avg))} sub={stats.count ? `${mad(stats.avg)} par ticket` : "Sur les ventes du jour"} icon={<ShoppingBasket />} watermark={<ShoppingBasket />} />
      </div>

      {/* Établissements */}
      {entities.length > 1 && (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="flex w-max gap-2 pb-1">
            {entities.map((e) => {
              const on = e.id === entityId;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => switchEntity(e.id)}
                  className={cn("inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold transition", on ? "text-white shadow-lg" : "hover:-translate-y-0.5")}
                  style={on ? { background: `linear-gradient(135deg, ${e.color}, ${e.color}cc)`, boxShadow: `0 8px 20px -8px ${e.color}` } : { background: e.soft, color: e.color }}
                >
                  <EntityIcon id={e.id} className="size-4" strokeWidth={2.3} />
                  {e.short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_390px] [&>*]:min-w-0">
        {/* ----- Catalogue ----- */}
        <section className="space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Rechercher chez ${ent.short}…`}
              className="h-12 w-full rounded-2xl border border-line bg-white pl-11 pr-10 text-sm shadow-card placeholder:text-slate-400 focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-50"
            />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted hover:bg-canvas" aria-label="Effacer">
                <X className="size-4" />
              </button>
            )}
          </div>

          {categories.length > 1 && (
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div className="flex w-max gap-1.5 pb-1">
                {["all", ...categories].map((c) => {
                  const on = c === cat;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCat(c)}
                      className={cn("h-9 rounded-full px-3.5 text-[13px] font-semibold transition", on ? "text-white" : "border border-line bg-white text-slate-600 hover:border-slate-300")}
                      style={on ? { background: ent.color } : undefined}
                    >
                      {c === "all" ? "Tout" : c}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {shown.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 [&>*]:min-w-0">
              {shown.map((it) => {
                const k = KIND_META[it.kind];
                const I = k.icon;
                const inCart = qtyOf(it.id);
                const out = it.kind === "produit" && it.stock !== null && it.stock <= 0;
                const low = it.kind === "produit" && it.stock !== null && it.stock > 0 && it.stock <= LOW_STOCK;
                return (
                  <button
                    key={it.id}
                    type="button"
                    disabled={out}
                    onClick={() => add(it)}
                    className={cn(
                      "group relative flex min-h-[148px] flex-col rounded-2xl border bg-white p-3.5 text-left shadow-card transition duration-150 active:scale-[.98]",
                      out ? "cursor-not-allowed border-line opacity-55" : "border-line hover:-translate-y-0.5 hover:shadow-pop",
                    )}
                    style={inCart ? { borderColor: ent.color, boxShadow: `0 0 0 2px ${ent.color}33` } : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: k.soft, color: k.color }}>
                        <I className="size-5" />
                      </span>
                      {inCart > 0 && (
                        <span className="grid h-6 min-w-6 place-items-center rounded-full px-1.5 font-display text-xs font-extrabold text-white" style={{ background: ent.color }}>
                          {inCart}
                        </span>
                      )}
                    </div>
                    <p className="mt-2.5 line-clamp-2 text-[13px] font-semibold leading-snug text-ink">{it.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">{itemDetail(it) || it.category}</p>
                    <div className="mt-auto flex items-end justify-between gap-1 pt-2">
                      <span className="font-display text-[15px] font-extrabold" style={{ color: ent.color }}>
                        {mad(it.price)}
                      </span>
                      {out ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10.5px] font-bold text-red-600">
                          <PackageX className="size-3" /> Rupture
                        </span>
                      ) : low ? (
                        <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[10.5px] font-bold text-accent-700">Stock : {it.stock}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-line bg-white px-6 py-12 text-center">
              <span className="grid size-14 place-items-center rounded-2xl" style={{ background: ent.soft, color: ent.color }}>
                <Search className="size-6" />
              </span>
              <p className="mt-4 font-display font-bold">Aucun article trouvé</p>
              <p className="mt-1 max-w-sm text-sm text-muted">{entityItems.length ? "Essayez une autre recherche ou une autre catégorie." : "Ajoutez des articles dans le catalogue de cet établissement."}</p>
            </div>
          )}
        </section>

        {/* ----- Panier ----- */}
        <aside id="panier" className="scroll-mt-20 lg:sticky lg:top-6">
          <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-card">
            <div className="flex items-center justify-between gap-2 px-5 py-4 text-white" style={{ background: `linear-gradient(135deg, ${ent.color}, ${ent.color}d0)` }}>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30">
                  <ShoppingCart className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-display text-base font-extrabold">Panier</p>
                  <p className="truncate text-xs text-white/80">
                    {ent.short} · {count} article{count > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              {lines.length > 0 && (
                <button type="button" onClick={clear} className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/15 px-2.5 text-xs font-semibold hover:bg-white/25">
                  <Trash2 className="size-3.5" /> Vider
                </button>
              )}
            </div>

            <div className="space-y-5 p-5">
              {/* Lignes */}
              {lines.length ? (
                <ul className="divide-y divide-line">
                  {lines.map((l) => {
                    const k = l.kind ? KIND_META[l.kind] : null;
                    const I = k?.icon ?? Coins;
                    return (
                      <li key={l.key} className="py-3 first:pt-0">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: k?.soft ?? "#f4f6f8", color: k?.color ?? "#66727e" }}>
                            <I className="size-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            {l.item_id ? (
                              <p className="text-[13px] font-semibold leading-snug">{l.label}</p>
                            ) : (
                              <input
                                value={l.label}
                                onChange={(e) => patch(l.key, { label: e.target.value })}
                                placeholder="Libellé de la ligne"
                                className="h-8 w-full rounded-lg border border-line px-2 text-[13px] font-semibold focus:border-brand-400 focus:outline-none"
                              />
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <div className="inline-flex items-center rounded-xl border border-line">
                                <button type="button" onClick={() => bump(l.key, -1)} className="grid size-8 place-items-center rounded-l-xl text-slate-500 hover:bg-canvas" aria-label="Moins">
                                  <Minus className="size-3.5" />
                                </button>
                                <span className="w-7 text-center font-display text-sm font-extrabold">{l.qty}</span>
                                <button type="button" onClick={() => bump(l.key, 1)} className="grid size-8 place-items-center rounded-r-xl text-slate-500 hover:bg-canvas" aria-label="Plus">
                                  <Plus className="size-3.5" />
                                </button>
                              </div>
                              <span className="text-xs text-muted">×</span>
                              <span className="relative">
                                <input
                                  value={l.priceText}
                                  inputMode="decimal"
                                  onChange={(e) => patch(l.key, { priceText: e.target.value, unit_price: Math.max(0, toNum(e.target.value)) })}
                                  className="h-8 w-[88px] rounded-lg border border-line pl-2 pr-9 text-right text-[13px] font-semibold focus:border-brand-400 focus:outline-none"
                                  aria-label="Prix unitaire"
                                />
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted">MAD</span>
                              </span>
                              <span className="ml-auto font-display text-sm font-extrabold">{mad(l.qty * l.unit_price)}</span>
                            </div>
                          </div>
                          <button type="button" onClick={() => bump(l.key, -l.qty)} className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Retirer">
                            <X className="size-4" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="flex flex-col items-center rounded-2xl bg-canvas px-4 py-8 text-center">
                  <ShoppingBasket className="size-8 text-slate-300" />
                  <p className="mt-2 text-sm font-semibold text-slate-600">Panier vide</p>
                  <p className="text-xs text-muted">Touchez un article pour l&apos;ajouter.</p>
                </div>
              )}
              <button type="button" onClick={addFree} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-500 hover:underline">
                <Plus className="size-3.5" /> Ligne libre
              </button>

              {/* Client */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <UserRound className="size-3.5" /> Client <span className="font-normal text-muted">(facultatif)</span>
                </p>
                <ContactPicker contacts={contacts} name="contact_id" defaultId={initialContact} onChange={setContact} />
                {needsContact && !contact && <p className="mt-1.5 text-xs text-accent-700">Choisissez le client pour activer l&apos;abonnement ou le pack.</p>}
              </div>

              {/* Remise */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <Percent className="size-3.5" /> Remise
                </p>
                <div className="flex gap-2">
                  <div className="inline-flex shrink-0 rounded-xl bg-canvas p-1">
                    {(["mad", "pct"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDiscMode(m)}
                        className={cn("h-9 rounded-lg px-3 text-xs font-bold transition", discMode === m ? "bg-white text-ink shadow-card" : "text-muted")}
                      >
                        {m === "mad" ? "MAD" : "%"}
                      </button>
                    ))}
                  </div>
                  <input
                    value={discText}
                    onChange={(e) => setDiscText(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-11 min-w-0 flex-1 rounded-xl border border-line px-3.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50"
                    aria-label="Montant de la remise"
                  />
                </div>
              </div>

              {/* Totaux */}
              <div className="space-y-1.5 rounded-2xl bg-canvas p-4 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Sous-total</span>
                  <span className="font-semibold">{mad(gross)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-accent-700">
                    <span>Remise{discMode === "pct" ? ` (${Math.min(dv, 100)} %)` : ""}</span>
                    <span className="font-semibold">− {mad(discount)}</span>
                  </div>
                )}
                <div className="flex items-end justify-between border-t border-line pt-2">
                  <span className="font-semibold">Total</span>
                  <span className="font-display text-2xl font-extrabold" style={{ color: ent.color }}>
                    {mad(total)}
                  </span>
                </div>
              </div>

              {/* Paiement */}
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <CircleDollarSign className="size-3.5" /> Mode de paiement
                </p>
                <div className="grid grid-cols-5 gap-1.5">
                  {METHOD_ORDER.map((m) => {
                    const meta = METHOD_META[m];
                    const I = meta.icon;
                    const on = m === method;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMethod(m)}
                        title={PAY_LABEL[m]}
                        className={cn("flex min-w-0 flex-col items-center gap-1 rounded-xl border px-0.5 py-2 text-[10.5px] font-bold transition", on ? "text-white" : "border-line bg-white text-slate-600 hover:border-slate-300")}
                        style={on ? { background: meta.color, borderColor: meta.color } : undefined}
                      >
                        <I className="size-[18px]" />
                        <span className="w-full truncate text-center">{meta.short}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-600" htmlFor="recu">
                  {method === "especes" ? "Montant reçu" : "Montant encaissé"} <span className="font-normal text-muted">(vide = total)</span>
                </label>
                <input
                  id="recu"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  inputMode="decimal"
                  placeholder={String(total)}
                  className="h-11 w-full rounded-xl border border-line px-3.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setReceived("")} className="h-8 rounded-lg border border-line px-2.5 text-xs font-semibold text-slate-600 hover:bg-canvas">
                    Montant exact
                  </button>
                  {method === "especes" &&
                    quick.map((v) => (
                      <button key={v} type="button" onClick={() => setReceived(String(v))} className="h-8 rounded-lg border border-line px-2.5 text-xs font-semibold text-slate-600 hover:bg-canvas">
                        {mad(v)}
                      </button>
                    ))}
                  <button type="button" onClick={() => setReceived("0")} className="h-8 rounded-lg border border-line px-2.5 text-xs font-semibold text-slate-600 hover:bg-canvas">
                    Payer plus tard
                  </button>
                </div>
                {change > 0 && (
                  <p className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-700">
                    <span>Rendu monnaie</span>
                    <span className="font-display text-lg font-extrabold">{mad(change)}</span>
                  </p>
                )}
                {rest > 0 && lines.length > 0 && (
                  <p className="mt-3 flex items-center justify-between rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-700">
                    <span>{paidNow > 0 ? "Paiement partiel · reste" : "À crédit · reste"}</span>
                    <span className="font-display text-lg font-extrabold">{mad(rest)}</span>
                  </p>
                )}
              </div>

              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Note sur la vente (facultatif)"
                className="h-10 w-full rounded-xl border border-line px-3.5 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
              />

              {error && (
                <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
                </p>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={pending || !lines.length}
                className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 px-4 font-display text-base font-extrabold text-white shadow-lg shadow-accent-500/25 transition hover:bg-accent-600 active:scale-[.99] disabled:pointer-events-none disabled:opacity-50"
              >
                {pending ? (
                  <>
                    <Loader2 className="size-5 animate-spin" /> Enregistrement…
                  </>
                ) : (
                  <>
                    <Wallet className="size-5" /> Encaisser {mad(total)}
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Raccourci panier (mobile) */}
      {lines.length > 0 && (
        <a
          href="#panier"
          className="fixed bottom-[76px] left-3 z-30 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-white shadow-pop lg:hidden"
          style={{ background: ent.color }}
        >
          <ShoppingCart className="size-4" /> {count} · {mad(total)}
        </a>
      )}
    </div>
  );
}
