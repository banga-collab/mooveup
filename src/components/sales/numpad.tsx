"use client";

import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

/** Applique une touche du pavé numérique à une saisie de montant ("125,5") */
export function applyKey(value: string, key: string) {
  if (key === "C") return "";
  if (key === "⌫") return value.slice(0, -1);
  if (key === ",") return value.includes(",") ? value : (value || "0") + ",";
  const [, dec] = value.split(",");
  if (dec !== undefined && dec.length >= 2) return value;
  if (value === "0") return key === "0" || key === "00" ? "0" : key;
  return (value + key).slice(0, 9);
}

/** Saisie "125,5" → 125.5 */
export const amountOf = (s: string) => {
  const n = Number(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "00", "0", ","];

/** Pavé numérique tactile (grandes touches) */
export function Numpad({ onKey, className }: { onKey: (key: string) => void; className?: string }) {
  return (
    <div className={cn("grid grid-cols-4 gap-1.5", className)}>
      <div className="col-span-3 grid grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onKey(k)}
            className="h-12 rounded-lg border border-line bg-white text-lg font-semibold tabular-nums text-ink transition hover:bg-slate-50 active:scale-[.97] active:bg-slate-100"
          >
            {k}
          </button>
        ))}
      </div>
      <div className="grid grid-rows-2 gap-1.5">
        <button type="button" onClick={() => onKey("⌫")} className="grid place-items-center rounded-lg border border-line bg-white text-slate-500 transition hover:bg-slate-50 active:scale-[.97]" aria-label="Effacer le dernier chiffre">
          <Delete className="size-5" />
        </button>
        <button type="button" onClick={() => onKey("C")} className="rounded-lg border border-line bg-white text-sm font-semibold text-slate-500 transition hover:bg-slate-50 active:scale-[.97]" aria-label="Tout effacer">
          C
        </button>
      </div>
    </div>
  );
}
