"use client";

import { useState } from "react";
import { HandCoins, Printer, X } from "lucide-react";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import { cn, PAY_LABEL } from "@/lib/utils";
import type { PayMethod } from "@/lib/types";
import { METHOD_META, METHOD_ORDER } from "./meta";

export function PrintButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary", className)}>
      <Printer /> Imprimer
    </button>
  );
}

/** Enregistre un paiement complémentaire sur une vente non soldée */
export function PaymentPanel({ action, rest, method: initial }: { action: (state: FormState, formData: FormData) => Promise<FormState>; rest: number; method: PayMethod }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PayMethod>(initial);
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary")}>
        <HandCoins /> Encaisser le reste
      </button>
    );
  return (
    <div className="w-full rounded-xl border border-line bg-white p-4 animate-fade-up">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Nouveau paiement</p>
        <button type="button" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Fermer">
          <X className="size-4" />
        </button>
      </div>
      <ActionForm action={action} className="space-y-3">
        <input type="hidden" name="method" value={method} />
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
                title={PAY_LABEL[m]}
                onClick={() => setMethod(m)}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-1 rounded-lg border px-0.5 py-2 text-[11px] font-medium transition",
                  on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                <I className={cn("size-4", on ? "text-brand-600" : "text-slate-400")} />
                <span className="w-full truncate text-center">{meta.short}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <span className="relative min-w-0 flex-1">
            <input
              name="amount"
              inputMode="decimal"
              defaultValue={String(rest)}
              className="h-10 w-full rounded-lg border border-line bg-white pl-3 pr-12 text-sm font-medium tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
              aria-label="Montant reçu"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">MAD</span>
          </span>
          <SubmitButton className="h-10">Valider</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
