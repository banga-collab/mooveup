"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Plus, X } from "lucide-react";
import { createTransfer } from "@/actions/stock";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Input, Select } from "@/components/ui";

type Product = { id: string; entity_id: string; name: string; stock: number; key: string };
type Ent = { id: string; short: string; color: string };

/** Formulaire de transfert : départ, arrivée, produits et quantités */
export function TransferForm({ entities, products, from: initialFrom, to: initialTo, productId }: { entities: Ent[]; products: Product[]; from: string; to: string; productId: string | null }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [lines, setLines] = useState<{ k: number; item_id: string; qty: string }[]>(() => [{ k: 1, item_id: productId && products.some((p) => p.id === productId && p.entity_id === initialFrom) ? productId : "", qty: "" }]);
  const available = useMemo(() => products.filter((p) => p.entity_id === from && p.stock > 0).sort((a, b) => a.name.localeCompare(b.name, "fr")), [products, from]);
  const atDest = useMemo(() => new Map(products.filter((p) => p.entity_id === to).map((p) => [p.key, p.stock])), [products, to]);
  const payload = JSON.stringify(lines.filter((l) => l.item_id && Number(l.qty) > 0).map((l) => ({ item_id: l.item_id, qty: Number(l.qty) })));
  const units = lines.reduce((a, l) => a + (l.item_id ? Math.max(0, Number(l.qty) || 0) : 0), 0);

  const changeFrom = (v: string) => {
    setFrom(v);
    if (v === to) setTo(entities.find((e) => e.id !== v)?.id ?? "");
    setLines([{ k: Date.now(), item_id: "", qty: "" }]);
  };

  return (
    <ActionForm action={createTransfer} className="space-y-4">
      <input type="hidden" name="lines" value={payload} />
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2 [&>*]:min-w-0">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Départ</span>
          <Select name="from" value={from} onChange={(e) => changeFrom(e.target.value)}>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.short}
              </option>
            ))}
          </Select>
        </label>
        <ArrowRight className="mb-3 size-4 text-slate-400" />
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Arrivée</span>
          <Select name="to" value={to} onChange={(e) => setTo(e.target.value)}>
            {entities
              .filter((e) => e.id !== from)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.short}
                </option>
              ))}
          </Select>
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-[13px] font-medium text-slate-700">Produits</p>
        {!available.length && <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-muted">Aucun produit en stock dans cet établissement.</p>}
        {lines.map((l, i) => {
          const p = available.find((x) => x.id === l.item_id);
          const dest = p ? atDest.get(p.key) : undefined;
          const over = p && Number(l.qty) > p.stock;
          return (
            <div key={l.k}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <Select
                    value={l.item_id}
                    aria-label={`Produit ${i + 1}`}
                    onChange={(e) => setLines((ls) => ls.map((x) => (x.k === l.k ? { ...x, item_id: e.target.value } : x)))}
                  >
                    <option value="">Choisir un produit…</option>
                    {available.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name} ({x.stock} en stock)
                      </option>
                    ))}
                  </Select>
                </span>
                <Input
                  value={l.qty}
                  inputMode="numeric"
                  placeholder="Qté"
                  aria-label={`Quantité ${i + 1}`}
                  className="w-20 shrink-0 text-right tabular-nums"
                  onChange={(e) => setLines((ls) => ls.map((x) => (x.k === l.k ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x)))}
                />
                <button
                  type="button"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.k !== l.k) : [{ k: Date.now(), item_id: "", qty: "" }]))}
                  className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Retirer la ligne"
                >
                  <X className="size-4" />
                </button>
              </div>
              {p && (
                <p className={over ? "mt-1 text-xs text-red-600" : "mt-1 text-xs text-muted"}>
                  {over ? `Seulement ${p.stock} disponible${p.stock > 1 ? "s" : ""}.` : `Stock à l'arrivée : ${dest ?? 0}${dest === undefined ? " (produit créé automatiquement)" : ""}`}
                </p>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => setLines((ls) => [...ls, { k: Date.now(), item_id: "", qty: "" }])} className="inline-flex h-9 items-center gap-1.5 text-[13px] font-medium text-brand-600 hover:underline">
          <Plus className="size-3.5" /> Ajouter un produit
        </button>
      </div>

      <Input name="note" placeholder="Motif (facultatif) : réassort, rupture, événement…" maxLength={200} aria-label="Motif du transfert" />
      <SubmitButton variant="brand" className="w-full" pendingText="Transfert…">
        Transférer {units > 0 ? `${units} article${units > 1 ? "s" : ""}` : ""}
      </SubmitButton>
    </ActionForm>
  );
}
