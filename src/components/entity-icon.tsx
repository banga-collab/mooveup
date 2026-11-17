import { Dumbbell, Flower2, Scissors, Smile, Sparkles, Stethoscope, Zap, Building2, type LucideProps } from "lucide-react";
import { entity } from "@/lib/entities";
import { cn } from "@/lib/utils";

const ICONS = { Dumbbell, Flower2, Smile, Zap, Stethoscope, Sparkles, Scissors };

/** Icône vectorielle d'un établissement (ou du groupe si null) */
export function EntityIcon({ id, ...props }: { id: string | null | undefined } & Omit<LucideProps, "id">) {
  const e = entity(id);
  const I = e ? ICONS[e.icon] : Building2;
  return <I {...props} />;
}

/** Pastille discrète : fond teinté, icône à la couleur de l'établissement */
export function EntityMark({ id, size = 36, className }: { id: string | null | undefined; size?: number; className?: string }) {
  const e = entity(id);
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-lg", className)}
      style={{ width: size, height: size, background: e ? e.soft : "#eef6f9", color: e ? e.color : "#1a6d8e" }}
    >
      <EntityIcon id={id ?? null} style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2} />
    </span>
  );
}

/** Nom de l'établissement précédé d'un point de couleur */
export function EntityBadge({ id, short = true, className }: { id: string | null | undefined; short?: boolean; className?: string }) {
  const e = entity(id);
  if (!e) return null;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-slate-600", className)}>
      <span className="size-2 shrink-0 rounded-full" style={{ background: e.color }} />
      {short ? e.short : e.name}
    </span>
  );
}

/** Plusieurs établissements en petits points */
export function EntityDots({ ids }: { ids: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {ids.map((id) => {
        const e = entity(id);
        if (!e) return null;
        return <span key={id} title={e.name} className="size-2.5 rounded-full ring-2 ring-white" style={{ background: e.color }} />;
      })}
    </span>
  );
}

/** Éclaircit (+) ou assombrit (−) une couleur hex */
export function shade(hex: string, percent: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (percent / 100) * (percent < 0 ? c : 255 - c))));
  const r = f(n >> 16);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
