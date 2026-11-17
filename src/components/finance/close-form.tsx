"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Calculator, Loader2, Lock } from "lucide-react";
import { ActionForm, type FormState } from "@/components/action-form";
import { buttonClass, Field, Input, Textarea } from "@/components/ui";
import { cn, mad, parseNum } from "@/lib/utils";
import { CASH_TOLERANCE, DENOMINATIONS } from "@/lib/types-finance";

function CloseButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass("brand", "w-full")}
      onClick={(e) => {
        if (!confirm("Clôturer la caisse ? Les montants seront verrouillés et ne pourront plus être modifiés.")) e.preventDefault();
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Lock />}
      {pending ? "Clôture…" : "Clôturer la caisse"}
    </button>
  );
}

/** Formulaire de clôture : espèces comptées, aide au comptage, écart en direct */
export function CloseForm({ action, expected }: { action: (state: FormState, fd: FormData) => Promise<FormState>; expected: number }) {
  const [counted, setCounted] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>({});

  const setCount = (d: number, v: string) => {
    const next = { ...counts, [d]: v.replace(/[^\d]/g, "") };
    setCounts(next);
    const sum = DENOMINATIONS.reduce((a, x) => a + x * (Number(next[x]) || 0), 0);
    setCounted(sum ? String(sum) : "");
  };

  const value = parseNum(counted);
  const diff = value === null ? null : Math.round((value - expected) * 100) / 100;
  const big = diff !== null && Math.abs(diff) > CASH_TOLERANCE;

  return (
    <ActionForm action={action} className="space-y-4">
      <Field label="Espèces comptées dans le tiroir (MAD)">
        <Input name="counted" inputMode="decimal" autoComplete="off" required placeholder="0" value={counted} onChange={(e) => setCounted(e.target.value)} className="h-11 text-lg font-semibold tabular-nums" />
      </Field>

      <details className="group rounded-lg border border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-[13px] font-medium text-slate-600 hover:text-ink">
          <Calculator className="size-4 text-slate-400" /> Aide au comptage (billets et pièces)
        </summary>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line p-3 [&>*]:min-w-0">
          {DENOMINATIONS.map((d) => (
            <label key={d} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-right text-[13px] tabular-nums text-muted">{d} ×</span>
              <input
                name={`d${d}`}
                inputMode="numeric"
                value={counts[d] ?? ""}
                onChange={(e) => setCount(d, e.target.value)}
                placeholder="0"
                className="h-8 w-full min-w-0 rounded-md border border-line px-2 text-sm tabular-nums focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
              />
            </label>
          ))}
          <p className="col-span-2 text-xs text-muted">Le total se reporte automatiquement dans « Espèces comptées ».</p>
        </div>
      </details>

      <div className="rounded-lg bg-slate-50 px-3.5 py-3">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted">Espèces attendues</span>
          <span className="font-medium tabular-nums text-ink">{mad(expected)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-[13px] text-muted">Écart</span>
          <span className={cn("text-lg font-semibold tabular-nums", diff === null ? "text-slate-400" : diff === 0 ? "text-emerald-600" : "text-red-600")}>
            {diff === null ? "–" : `${diff > 0 ? "+" : ""}${mad(diff)}`}
          </span>
        </div>
        {diff !== null && <p className={cn("mt-1 text-xs", diff === 0 ? "text-emerald-700" : "text-red-700")}>{diff === 0 ? "Caisse juste." : diff > 0 ? "Il y a plus d'espèces que prévu." : "Il manque des espèces."}</p>}
      </div>

      <Field label={big ? "Commentaire (obligatoire)" : "Commentaire"} hint={big ? `Écart supérieur à ${CASH_TOLERANCE} MAD : expliquez-le.` : undefined}>
        <Textarea name="comment" required={big} placeholder={big ? "Ex. : monnaie rendue en trop sur un ticket" : "Facultatif"} className={cn("min-h-[64px]", big && "border-red-300")} />
      </Field>

      <CloseButton />
    </ActionForm>
  );
}
