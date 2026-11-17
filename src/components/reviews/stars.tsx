import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Note en étoiles (lecture seule) */
export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} style={{ width: size, height: size }} className={i <= Math.round(value) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"} />
      ))}
    </span>
  );
}

/** NPS simplifié sur une note de 1 à 5 : % de 5 étoiles − % de 1 à 3 étoiles */
export function nps(ratings: number[]) {
  if (!ratings.length) return null;
  const promoters = ratings.filter((r) => r === 5).length;
  const detractors = ratings.filter((r) => r <= 3).length;
  return Math.round(((promoters - detractors) / ratings.length) * 100);
}

export const avg = (ratings: number[]) => (ratings.length ? ratings.reduce((a, r) => a + r, 0) / ratings.length : null);
export const fmt1 = (n: number | null) => (n === null ? "–" : n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
