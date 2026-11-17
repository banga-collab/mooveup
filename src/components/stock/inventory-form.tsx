"use client";

import { useActionState, useState } from "react";
import { AlertCircle, CheckCheck, ClipboardCheck, Loader2 } from "lucide-react";
import type { FormState } from "@/components/action-form";
import { Card, buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

type Item = { id: string; name: string; category: string; stock: number };

/** Saisie du stock compté, écarts en direct, validation = ajustements */
export function InventoryForm({ items, action, canWrite }: { items: Item[]; action: (s: FormState, fd: FormData) => Promise<FormState>; canWrite: boolean }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const parsed = (id: string) => {
    const v = (counts[id] ?? "").trim();
    if (!v) return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const filled = items.filter((i) => parsed(i.id) !== null);
  const gaps = filled.filter((i) => parsed(i.id) !== i.stock);
  const net = gaps.reduce((a, i) => a + (parsed(i.id)! - i.stock), 0);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(gaps.length ? `Valider l'inventaire ? ${gaps.length} écart(s) seront corrigés dans le stock.` : "Valider l'inventaire sans écart ?")) e.preventDefault();
      }}
    >
      {state?.error && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
        </p>
      )}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
          <div>
            <h3 className="text-sm font-semibold text-ink">Comptage</h3>
            <p className="mt-0.5 text-xs text-muted">
              {filled.length}/{items.length} compté(s) · {gaps.length} écart(s)
              {gaps.length > 0 && ` · ${net > 0 ? "+" : ""}${net} unité(s)`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCounts(Object.fromEntries(items.map((i) => [i.id, counts[i.id]?.trim() ? counts[i.id]! : String(i.stock)])))}
            className={buttonClass("ghost", "h-8")}
          >
            <CheckCheck /> Reporter le stock théorique
          </button>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {items.map((i) => {
            const n = parsed(i.id);
            const diff = n === null ? null : n - i.stock;
            return (
              <li key={i.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{i.name}</p>
                  <p className="text-xs text-muted">
                    Théorique : <span className="tabular-nums">{i.stock}</span>
                  </p>
                </div>
                <span className={cn("w-14 text-right text-[13px] font-semibold tabular-nums", diff === null ? "text-slate-300" : diff === 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-brand-600")}>
                  {diff === null ? "—" : diff === 0 ? "OK" : `${diff > 0 ? "+" : ""}${diff}`}
                </span>
                <input
                  name={`count_${i.id}`}
                  inputMode="numeric"
                  aria-label={`Quantité comptée : ${i.name}`}
                  placeholder={String(i.stock)}
                  value={counts[i.id] ?? ""}
                  onChange={(e) => setCounts((c) => ({ ...c, [i.id]: e.target.value }))}
                  className="h-9 w-20 rounded-lg border border-line bg-white px-2.5 text-right text-sm tabular-nums placeholder:text-slate-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                />
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
          <p className="text-xs text-muted">Les lignes laissées vides ne sont pas modifiées.</p>
          <button type="submit" disabled={!canWrite || pending || !filled.length} className={buttonClass("brand")}>
            {pending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />} Valider l&apos;inventaire
          </button>
        </div>
      </Card>
    </form>
  );
}
