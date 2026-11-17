import { cn, mad } from "@/lib/utils";
import { CASH_TOLERANCE } from "@/lib/types-finance";

/** Écart de caisse coloré : vert si juste, orange si faible, rouge au-delà de la tolérance */
export function Diff({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-slate-400">–</span>;
  const v = Number(value);
  return (
    <span className={cn("font-semibold tabular-nums", v === 0 ? "text-emerald-600" : Math.abs(v) > CASH_TOLERANCE ? "text-red-600" : "text-amber-600")}>
      {v > 0 ? "+" : ""}
      {mad(v)}
    </span>
  );
}
