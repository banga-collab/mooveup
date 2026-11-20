import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "brand" | "accent" | "green" | "violet";

/** Mini courbe SVG discrète */
function Sparkline({ data, id }: { data: number[]; id: string }) {
  if (data.length < 2) return null;
  const w = 96;
  const h = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / span) * (h - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-24 shrink-0" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1a6d8e" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#1a6d8e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke="#1a6d8e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Indicateur principal, minimaliste : libellé, grand chiffre, tendance et mini-courbe.
 * (`tone` et `watermark` restent acceptés pour compatibilité, sans effet visuel.)
 */
export function SolidTile({
  label,
  value,
  sub,
  trendLabel,
  trendUp,
  series,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  watermark?: ReactNode;
  tone?: Tone;
  trendLabel?: string;
  trendUp?: boolean | null;
  series?: number[];
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[12.5px] text-muted">{label}</p>
        {href && <ChevronRight className="size-3.5 shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" />}
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[22px] font-semibold leading-none tracking-tight tabular-nums text-ink sm:text-[26px]">{value}</p>
          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs">
            {trendLabel && (
              <span className={cn("inline-flex shrink-0 items-center gap-0.5 font-medium", trendUp == null ? "text-slate-500" : trendUp ? "text-emerald-600" : "text-red-600")}>
                {trendUp != null && (trendUp ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />)}
                {trendLabel}
              </span>
            )}
            {sub && <span className="truncate text-muted">{trendLabel ? `· ${sub}` : sub}</span>}
          </div>
        </div>
        {series && (
          <span className="hidden sm:block">
            <Sparkline data={series} id={`sl-${label.replace(/\W/g, "")}`} />
          </span>
        )}
      </div>
    </>
  );
  const cls = "group block min-w-0 rounded-lg border border-line bg-white px-4 py-3.5 transition";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-slate-300")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Variante (compatibilité) */
export function StatTile(props: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  tone?: Tone;
  trend?: number | null;
  trendLabel?: string;
  goodWhenUp?: boolean;
  series?: number[];
  href?: string;
}) {
  const { trend, goodWhenUp = true, ...rest } = props;
  const up = trend == null || trend === 0 ? null : (trend > 0) === goodWhenUp;
  return <SolidTile {...rest} trendUp={up} />;
}

/** Raccourci compact : une ligne cliquable avec compteur */
export function ShortcutTile({ href, icon, label, value, hint, hot }: { href: string; icon: ReactNode; label: string; value: ReactNode; hint: string; hot?: boolean }) {
  return (
    <Link href={href} className="group flex min-w-0 items-center gap-3 bg-white px-4 py-3.5 transition-colors hover:bg-slate-50">
      <span className={cn("shrink-0 [&_svg]:size-4", hot ? "text-ink" : "text-slate-400")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{label}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
      <span className={cn("flex items-center gap-1.5 text-[15px] font-semibold tabular-nums", hot ? "text-ink" : "text-slate-400")}>
        {hot && <span className="size-1.5 rounded-full bg-accent-500" aria-hidden />}
        {value}
      </span>
    </Link>
  );
}
