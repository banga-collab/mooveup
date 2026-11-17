import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "brand" | "accent" | "green" | "violet";

const TONES: Record<Tone, { icon: string; line: string; fill: string; glow: string }> = {
  brand: { icon: "bg-brand-500 text-white shadow-brand-500/30", line: "#1a6d8e", fill: "#1a6d8e", glow: "from-brand-50" },
  accent: { icon: "bg-accent-500 text-white shadow-accent-500/30", line: "#e8782a", fill: "#e8782a", glow: "from-accent-50" },
  green: { icon: "bg-emerald-500 text-white shadow-emerald-500/30", line: "#10b981", fill: "#10b981", glow: "from-emerald-50" },
  violet: { icon: "bg-violet-500 text-white shadow-violet-500/30", line: "#8b5cf6", fill: "#8b5cf6", glow: "from-violet-50" },
};

/** Mini courbe SVG (vectorielle, sans librairie) */
function Sparkline({ data, color, id }: { data: number[]; color: string; id: string }) {
  if (data.length < 2) return null;
  const w = 120;
  const h = 36;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = pts.at(-1)!;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-9 w-28" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="#fff" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const SOLID: Record<Tone, string> = {
  brand: "from-brand-700 via-brand-600 to-brand-500 shadow-brand-700/25",
  accent: "from-accent-600 via-accent-500 to-accent-400 shadow-accent-600/25",
  green: "from-emerald-600 via-emerald-500 to-emerald-400 shadow-emerald-600/25",
  violet: "from-violet-600 via-violet-500 to-violet-400 shadow-violet-600/25",
};

/** Tuile pleine couleur (style « énergique ») : texte blanc, grande icône en filigrane, mini-courbe blanche. */
export function SolidTile({
  label,
  value,
  sub,
  icon,
  watermark,
  tone = "brand",
  trendLabel,
  trendUp,
  series,
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  watermark: ReactNode;
  tone?: Tone;
  trendLabel?: string;
  trendUp?: boolean | null;
  series?: number[];
  href?: string;
}) {
  const TrendIcon = trendUp == null ? Minus : trendUp ? ArrowUpRight : ArrowDownRight;
  const body = (
    <>
      <span className="pointer-events-none absolute -bottom-6 -right-6 text-white/10 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6 [&>svg]:size-36">
        {watermark}
      </span>
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <rect key={i} x={`${55 + ((i * 13) % 40)}%`} y={`${(i * 29) % 70}%`} width={4 + (i % 3) * 3} height={4 + (i % 3) * 3} fill="#fff" opacity={0.35} transform={`rotate(${i * 9})`} />
        ))}
      </svg>
      <div className="relative flex items-start justify-between gap-2">
        <span className="grid size-12 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur-sm [&>svg]:size-6">{icon}</span>
        {trendLabel && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold ring-1 ring-white/25 backdrop-blur-sm">
            <TrendIcon className="size-3.5" />
            {trendLabel}
          </span>
        )}
      </div>
      <div className="relative mt-5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[40px] font-extrabold leading-none tracking-tight drop-shadow-sm">{value}</p>
          <p className="mt-2 text-sm font-bold uppercase tracking-wide text-white/95">{label}</p>
          {sub && <p className="mt-0.5 truncate text-xs text-white/75">{sub}</p>}
        </div>
        {series && <Sparkline data={series} color="#ffffff" id={`sl-${label.replace(/\W/g, "")}`} />}
      </div>
    </>
  );
  const cls = cn("group relative overflow-hidden rounded-3xl bg-gradient-to-br p-5 text-white shadow-xl transition duration-200", SOLID[tone]);
  return href ? (
    <Link href={href} className={cn(cls, "hover:-translate-y-1 hover:shadow-2xl")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = "brand",
  trend,
  trendLabel,
  goodWhenUp = true,
  series,
  href,
}: {
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
  const t = TONES[tone];
  const good = trend == null || trend === 0 ? null : (trend > 0) === goodWhenUp;
  const TrendIcon = trend == null || trend === 0 ? Minus : trend > 0 ? ArrowUpRight : ArrowDownRight;
  const body = (
    <>
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent to-60% opacity-70", t.glow)} />
      <div className="relative flex items-start justify-between gap-2">
        <span className={cn("grid size-11 place-items-center rounded-2xl shadow-lg", t.icon)}>{icon}</span>
        {trend !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-[11px] font-bold",
              good === null ? "bg-slate-100 text-slate-500" : good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600",
            )}
          >
            <TrendIcon className="size-3.5" />
            {trendLabel}
          </span>
        )}
      </div>
      <div className="relative mt-4 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[30px] font-extrabold leading-none tracking-tight text-ink">{value}</p>
          <p className="mt-1.5 text-[13px] font-semibold text-slate-600">{label}</p>
          {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
        </div>
        {series && <Sparkline data={series} color={t.line} id={`sp-${label.replace(/\W/g, "")}`} />}
      </div>
    </>
  );
  const cls = "relative overflow-hidden rounded-3xl border border-line bg-white p-5 shadow-card transition";
  return href ? (
    <Link href={href} className={cn(cls, "group hover:-translate-y-0.5 hover:shadow-pop")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** Raccourci compact (tâches, messages…) */
export function ShortcutTile({ href, icon, label, value, hint, hot }: { href: string; icon: ReactNode; label: string; value: ReactNode; hint: string; hot?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-pop">
      <span className={cn("relative grid size-11 shrink-0 place-items-center rounded-xl transition", hot ? "bg-accent-50 text-accent-600" : "bg-canvas text-slate-500 group-hover:bg-brand-50 group-hover:text-brand-500")}>
        {icon}
        {hot && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent-500 ring-2 ring-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{label}</span>
        <span className="block truncate text-xs text-muted">{hint}</span>
      </span>
      <span className={cn("font-display text-lg font-extrabold", hot ? "text-accent-600" : "text-slate-400")}>{value}</span>
      <ChevronRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500" />
    </Link>
  );
}
