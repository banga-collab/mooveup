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

/** Pastille ronde colorée avec l'icône de l'établissement */
export function EntityMark({ id, size = 36, className }: { id: string | null | undefined; size?: number; className?: string }) {
  const e = entity(id);
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-xl text-white shadow-sm", className)}
      style={{ width: size, height: size, background: e ? `linear-gradient(135deg, ${e.color}, ${shade(e.color, -18)})` : "linear-gradient(135deg,#1a6d8e,#e8782a)" }}
    >
      <EntityIcon id={id ?? null} style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.1} />
    </span>
  );
}

/** Badge texte de l'établissement, à sa couleur */
export function EntityBadge({ id, short = true, className }: { id: string | null | undefined; short?: boolean; className?: string }) {
  const e = entity(id);
  if (!e) return null;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", className)}
      style={{ background: e.soft, color: e.color, boxShadow: `inset 0 0 0 1px ${e.color}22` }}
    >
      <EntityIcon id={e.id} className="size-3" strokeWidth={2.4} />
      {short ? e.short : e.name}
    </span>
  );
}

/** Plusieurs établissements en petites pastilles */
export function EntityDots({ ids }: { ids: string[] }) {
  return (
    <span className="inline-flex -space-x-1.5">
      {ids.map((id) => {
        const e = entity(id);
        if (!e) return null;
        return (
          <span key={id} title={e.name} className="grid size-6 place-items-center rounded-full text-white ring-2 ring-white" style={{ background: e.color }}>
            <EntityIcon id={id} className="size-3" strokeWidth={2.4} />
          </span>
        );
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
