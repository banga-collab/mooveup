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
    <button type="button" onClick={() => window.print()} className={buttonClass("brand", className)}>
      <Printer className="size-4" /> Imprimer
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
        <HandCoins className="size-4" /> Enregistrer un paiement
      </button>
    );
  return (
    <div className="w-full rounded-2xl border border-accent-200 bg-accent-50/50 p-4 animate-fade-up">
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display text-sm font-bold">Nouveau paiement</p>
        <button type="button" onClick={() => setOpen(false)} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-white" aria-label="Fermer">
          <X className="size-4" />
        </button>
      </div>
      <ActionForm action={action} className="space-y-3">
        <input type="hidden" name="method" value={method} />
        <div className="grid grid-cols-5 gap-1.5">
          {METHOD_ORDER.map((m) => {
            const meta = METHOD_META[m];
            const I = meta.icon;
            const on = m === method;
            return (
              <button
                key={m}
                type="button"
                title={PAY_LABEL[m]}
                onClick={() => setMethod(m)}
                className={cn("flex min-w-0 flex-col items-center gap-1 rounded-xl border px-0.5 py-2 text-[10.5px] font-bold transition", on ? "text-white" : "border-line bg-white text-slate-600")}
                style={on ? { background: meta.color, borderColor: meta.color } : undefined}
              >
                <I className="size-4" />
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
              className="h-11 w-full rounded-xl border border-line bg-white pl-3.5 pr-12 text-sm font-semibold focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50"
              aria-label="Montant reçu"
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted">MAD</span>
          </span>
          <SubmitButton>Valider</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
