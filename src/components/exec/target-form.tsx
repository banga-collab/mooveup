"use client";

import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { saveMonthlyTargets } from "@/actions/exec";
import { madShort } from "@/lib/utils";

export type TargetLine = { id: string; name: string; color: string; target: number | null; prevTotal: number; forecast: number };

/** Objectifs mensuels par établissement (champ vide = pas d'objectif) */
export function TargetForm({ lines }: { lines: TargetLine[] }) {
  return (
    <ActionForm action={saveMonthlyTargets} className="px-5 pb-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
        {lines.map((l) => (
          <label key={l.id} className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-slate-700">
              <span className="size-2 shrink-0 rounded-full" style={{ background: l.color }} />
              <span className="truncate">{l.name}</span>
            </span>
            <span className="relative block">
              <input
                name={`target_${l.id}`}
                inputMode="numeric"
                defaultValue={l.target ?? ""}
                placeholder={l.prevTotal ? String(Math.round((l.prevTotal * 1.05) / 1000) * 1000) : "Ex. 100000"}
                className="h-10 w-full rounded-lg border border-line bg-white pl-3 pr-12 text-sm tabular-nums text-ink placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">MAD</span>
            </span>
            <span className="mt-1 block text-xs text-muted">
              Mois dernier {madShort(l.prevTotal)} · prévu {madShort(l.forecast)}
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <SubmitButton variant="brand">Enregistrer les objectifs</SubmitButton>
        <p className="text-xs text-muted">Suggestion affichée : mois dernier + 5 %. Laissez vide pour retirer un objectif.</p>
      </div>
    </ActionForm>
  );
}
