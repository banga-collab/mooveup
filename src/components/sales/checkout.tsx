"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertCircle, Loader2, Minus, PackageX, Plus, Search, ShoppingBasket, ShoppingCart, Trash2, Wallet, X } from "lucide-react";
import { createSale, type CheckoutInput } from "@/actions/sales";
import { ContactPicker, type PickerContact } from "@/components/contact-picker";
import { buttonClass } from "@/components/ui";
import { cn, mad, PAY_LABEL } from "@/lib/utils";
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

const field =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 transition focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15";
const segBtn = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
    on ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink",
  );
const chip = "inline-flex h-9 items-center rounded-lg border border-line bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-ink";

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

  const inCartBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) if (l.item_id) m.set(l.item_id, (m.get(l.item_id) ?? 0) + l.qty);
    return m;
  }, [lines]);

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
    <div className="space-y-5">
      {/* Établissement + chiffres du jour */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {entities.length > 1 ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Établissement">
              {entities.map((e) => (
                <button key={e.id} type="button" role="tab" aria-selected={e.id === entityId} onClick={() => switchEntity(e.id)} className={segBtn(e.id === entityId)}>
                  <span className="size-2 rounded-full" style={{ background: e.color }} />
                  {e.short}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <span />
        )}
        <p className="text-[13px] text-muted">
          Aujourd&apos;hui : <span className="font-semibold tabular-nums text-ink">{mad(stats.paid)}</span> encaissés ·{" "}
          <span className="tabular-nums">{stats.count}</span> ticket{stats.count > 1 ? "s" : ""}
          {stats.count > 0 && (
            <>
              {" "}
              · panier moyen <span className="tabular-nums">{mad(Math.round(stats.avg))}</span>
            </>
          )}
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px] [&>*]:min-w-0">
        {/* ----- Catalogue ----- */}
        <section className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Rechercher chez ${ent.short}…`} aria-label="Rechercher un article" className={cn(field, "pl-9 pr-10")} />
            {q && (
              <button type="button" onClick={() => setQ("")} className="absolute right-0.5 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:text-ink" aria-label="Effacer la recherche">
                <X className="size-4" />
              </button>
            )}
          </div>

          {categories.length > 1 && (
            <div className="-mx-1 overflow-x-auto px-1">
              <div className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
                {["all", ...categories].map((c) => (
                  <button key={c} type="button" onClick={() => setCat(c)} className={segBtn(c === cat)} aria-pressed={c === cat}>
                    {c === "all" ? "Tout" : c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {shown.length ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 [&>*]:min-w-0">
              {shown.map((it) => {
                const I = KIND_META[it.kind].icon;
                const inCart = inCartBy.get(it.id) ?? 0;
                const out = it.kind === "produit" && it.stock !== null && it.stock <= 0;
                const low = it.kind === "produit" && it.stock !== null && it.stock > 0 && it.stock <= LOW_STOCK;
                return (
                  <button
                    key={it.id}
                    type="button"
                    disabled={out}
                    onClick={() => add(it)}
                    aria-label={`Ajouter ${it.name}, ${mad(it.price)}`}
                    className={cn(
                      "relative flex min-h-[116px] flex-col rounded-xl border bg-white p-3 text-left transition active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                      out ? "cursor-not-allowed border-line opacity-50" : inCart ? "border-brand-500" : "border-line hover:border-slate-300",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <I className="size-4 shrink-0 text-slate-400" />
                      {inCart > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand-500 px-1.5 text-[11px] font-semibold tabular-nums text-white">{inCart}</span>}
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug text-ink">{it.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted">{itemDetail(it) || it.category}</p>
                    <div className="mt-auto flex items-end justify-between gap-1 pt-2">
                      <span className="text-sm font-semibold tabular-nums text-ink">{mad(it.price)}</span>
                      {out ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                          <PackageX className="size-3" /> Rupture
                        </span>
                      ) : low ? (
                        <span className="text-[11px] font-medium text-accent-700">Stock {it.stock}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-line bg-white px-6 py-10 text-center">
              <span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-400">
                <Search className="size-5" />
              </span>
              <p className="mt-3 text-sm font-medium text-ink">Aucun article trouvé</p>
              <p className="mt-1 max-w-sm text-[13px] text-muted">{entityItems.length ? "Essayez une autre recherche ou catégorie." : "Ajoutez des articles au catalogue de cet établissement."}</p>
            </div>
          )}
        </section>

        {/* ----- Panier ----- */}
        <aside id="panier" className="scroll-mt-20 lg:sticky lg:top-6">
          <div className="rounded-xl border border-line bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-line px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Panier</p>
                <p className="truncate text-xs text-muted">
                  {ent.short} · <span className="tabular-nums">{count}</span> article{count > 1 ? "s" : ""}
                </p>
              </div>
              {lines.length > 0 && (
                <button type="button" onClick={clear} className={buttonClass("ghost", "px-2.5 text-xs")}>
                  <Trash2 /> Vider
                </button>
              )}
            </div>

            <div className="space-y-5 p-5">
              {/* Lignes */}
              {lines.length ? (
                <ul className="-mt-2 divide-y divide-line">
                  {lines.map((l) => (
                    <li key={l.key} className="py-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          {l.item_id ? (
                            <p className="text-[13px] font-medium leading-snug text-ink">{l.label}</p>
                          ) : (
                            <input value={l.label} onChange={(e) => patch(l.key, { label: e.target.value })} placeholder="Libellé de la ligne" aria-label="Libellé de la ligne libre" className={cn(field, "h-9 text-[13px]")} />
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center rounded-lg border border-line">
                              <button type="button" onClick={() => bump(l.key, -1)} className="grid size-9 place-items-center rounded-l-lg text-slate-500 hover:bg-slate-50" aria-label="Diminuer la quantité">
                                <Minus className="size-3.5" />
                              </button>
                              <span className="w-7 text-center text-sm font-semibold tabular-nums">{l.qty}</span>
                              <button type="button" onClick={() => bump(l.key, 1)} className="grid size-9 place-items-center rounded-r-lg text-slate-500 hover:bg-slate-50" aria-label="Augmenter la quantité">
                                <Plus className="size-3.5" />
                              </button>
                            </div>
                            <span className="text-xs text-muted">×</span>
                            <span className="relative">
                              <input
                                value={l.priceText}
                                inputMode="decimal"
                                onChange={(e) => patch(l.key, { priceText: e.target.value, unit_price: Math.max(0, toNum(e.target.value)) })}
                                className="h-9 w-[92px] rounded-lg border border-line pl-2 pr-10 text-right text-[13px] tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                                aria-label="Prix unitaire"
                              />
                              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted">MAD</span>
                            </span>
                            <span className="ml-auto text-sm font-semibold tabular-nums text-ink">{mad(l.qty * l.unit_price)}</span>
                          </div>
                        </div>
                        <button type="button" onClick={() => bump(l.key, -l.qty)} className="-mr-2 -mt-1.5 grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Retirer ${l.label || "la ligne"}`}>
                          <X className="size-4" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col items-center rounded-lg border border-dashed border-line px-4 py-7 text-center">
                  <ShoppingBasket className="size-6 text-slate-300" />
                  <p className="mt-2 text-[13px] font-medium text-slate-600">Panier vide</p>
                  <p className="text-xs text-muted">Touchez un article pour l&apos;ajouter.</p>
                </div>
              )}
              <button type="button" onClick={addFree} className="-mt-2 inline-flex h-9 items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline">
                <Plus className="size-3.5" /> Ligne libre
              </button>

              {/* Client */}
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-slate-700">
                  Client <span className="font-normal text-muted">(facultatif)</span>
                </p>
                <ContactPicker contacts={contacts} name="contact_id" defaultId={initialContact} onChange={setContact} />
                {needsContact && !contact && <p className="mt-1.5 text-xs text-accent-700">Choisissez le client pour activer l&apos;abonnement ou le pack.</p>}
              </div>

              {/* Remise */}
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-slate-700">Remise</p>
                <div className="flex gap-2">
                  <div className="inline-flex shrink-0 gap-0.5 rounded-lg bg-slate-100 p-0.5">
                    {(["mad", "pct"] as const).map((m) => (
                      <button key={m} type="button" onClick={() => setDiscMode(m)} className={cn(segBtn(discMode === m), "h-9")} aria-pressed={discMode === m}>
                        {m === "mad" ? "MAD" : "%"}
                      </button>
                    ))}
                  </div>
                  <input value={discText} onChange={(e) => setDiscText(e.target.value)} inputMode="decimal" placeholder="0" className={cn(field, "min-w-0 flex-1 tabular-nums")} aria-label="Montant de la remise" />
                </div>
              </div>

              {/* Totaux */}
              <dl className="space-y-1.5 border-t border-line pt-4 text-sm">
                <div className="flex justify-between text-slate-600">
                  <dt>Sous-total</dt>
                  <dd className="tabular-nums">{mad(gross)}</dd>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <dt>Remise{discMode === "pct" ? ` (${Math.min(dv, 100)} %)` : ""}</dt>
                    <dd className="tabular-nums">− {mad(discount)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-1">
                  <dt className="font-medium text-ink">Total</dt>
                  <dd className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-ink">{mad(total)}</dd>
                </div>
              </dl>

              {/* Paiement */}
              <div>
                <p className="mb-1.5 text-[13px] font-medium text-slate-700">Mode de paiement</p>
                <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Mode de paiement">
                  {METHOD_ORDER.map((m) => {
                    const meta = METHOD_META[m];
                    const I = meta.icon;
                    const on = m === method;
                    return (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setMethod(m)}
                        title={PAY_LABEL[m]}
                        className={cn(
                          "flex min-w-0 flex-col items-center gap-1 rounded-lg border px-0.5 py-2 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                          on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:border-slate-300",
                        )}
                      >
                        <I className={cn("size-4", on ? "text-brand-600" : "text-slate-400")} />
                        <span className="w-full truncate text-center">{meta.short}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-slate-700" htmlFor="recu">
                  {method === "especes" ? "Montant reçu" : "Montant encaissé"} <span className="font-normal text-muted">(vide = total)</span>
                </label>
                <input id="recu" value={received} onChange={(e) => setReceived(e.target.value)} inputMode="decimal" placeholder={String(total)} className={cn(field, "tabular-nums")} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => setReceived("")} className={chip}>
                    Montant exact
                  </button>
                  {method === "especes" &&
                    quick.map((v) => (
                      <button key={v} type="button" onClick={() => setReceived(String(v))} className={cn(chip, "tabular-nums")}>
                        {mad(v)}
                      </button>
                    ))}
                  <button type="button" onClick={() => setReceived("0")} className={chip}>
                    Payer plus tard
                  </button>
                </div>
                {change > 0 && (
                  <p className="mt-3 flex items-center justify-between rounded-lg bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
                    <span>Rendu monnaie</span>
                    <span className="text-base font-semibold tabular-nums">{mad(change)}</span>
                  </p>
                )}
                {rest > 0 && lines.length > 0 && (
                  <p className="mt-3 flex items-center justify-between rounded-lg bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
                    <span>{paidNow > 0 ? "Paiement partiel · reste" : "À crédit · reste"}</span>
                    <span className="text-base font-semibold tabular-nums">{mad(rest)}</span>
                  </p>
                )}
              </div>

              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note sur la vente (facultatif)" aria-label="Note sur la vente" className={field} />

              {error && (
                <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" /> {error}
                </p>
              )}

              <button type="button" onClick={submit} disabled={pending || !lines.length} className={buttonClass("primary", "h-12 w-full text-[15px] font-semibold")}>
                {pending ? (
                  <>
                    <Loader2 className="animate-spin" /> Enregistrement…
                  </>
                ) : (
                  <>
                    <Wallet /> Encaisser <span className="tabular-nums">{mad(total)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Raccourci panier (mobile) */}
      {lines.length > 0 && (
        <a href="#panier" className="fixed bottom-[76px] left-3 z-30 inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-white shadow-pop lg:hidden">
          <ShoppingCart className="size-4" /> <span className="tabular-nums">{count}</span> · <span className="tabular-nums">{mad(total)}</span>
        </a>
      )}
    </div>
  );
}
