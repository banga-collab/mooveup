import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn, initials } from "@/lib/utils";

/*
 * Système de design minimaliste Moov'Up :
 * fond gris très clair, surfaces blanches, bordures fines, une seule couleur
 * d'action (bleu Moov'Up), l'orange réservé à l'action principale (Encaisser).
 */

/* ---------- Boutons ---------- */
type Variant = "primary" | "secondary" | "ghost" | "brand" | "danger" | "dark";
const variants: Record<Variant, string> = {
  primary: "bg-accent-500 text-white hover:bg-accent-600",
  brand: "bg-brand-500 text-white hover:bg-brand-600",
  dark: "bg-ink text-white hover:bg-slate-800",
  secondary: "bg-white text-ink border border-line hover:bg-slate-50 hover:border-slate-300",
  ghost: "text-slate-600 hover:text-ink hover:bg-slate-100",
  danger: "bg-white text-red-600 border border-line hover:border-red-200 hover:bg-red-50",
};
const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 h-9 text-[13px] font-medium transition-colors duration-150 active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 whitespace-nowrap [&_svg]:size-4 [&_svg]:shrink-0";

export function buttonClass(variant: Variant = "primary", className?: string) {
  return cn(btnBase, variants[variant], className);
}

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

/* ---------- Cartes ---------- */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border border-line bg-white print-break", className)} {...props} />;
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <span className="text-slate-400 [&_svg]:size-4">{icon}</span>}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 text-[13px] [&_a]:font-medium">{action}</div>}
    </div>
  );
}

/* ---------- En-tête de page ---------- */
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-[13px] text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------- Badges ---------- */
type Tone = "brand" | "accent" | "green" | "amber" | "red" | "gray";
const tones: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-700",
  accent: "bg-accent-50 text-accent-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  gray: "bg-slate-100 text-slate-600",
};
const dots: Record<Tone, string> = {
  brand: "bg-brand-500",
  accent: "bg-accent-500",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-slate-400",
};
export function Badge({ tone = "brand", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11.5px] font-medium", tones[tone])}>
      {dot && <span className={cn("size-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}

/* ---------- Avatar ---------- */
const avatarColors = ["bg-brand-100 text-brand-700", "bg-accent-100 text-accent-700", "bg-slate-200 text-slate-700", "bg-teal-100 text-teal-700", "bg-violet-100 text-violet-700", "bg-sky-100 text-sky-700"];
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length;
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold", avatarColors[idx], className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

/* ---------- KPI ---------- */
export function Kpi({ label, value, delta, icon, positive }: { label: string; value: ReactNode; delta?: ReactNode; tone?: "brand" | "accent"; icon?: ReactNode; positive?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">{label}</p>
        {icon && <span className="text-slate-400 [&_svg]:size-4">{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      {delta !== undefined && <p className={cn("mt-0.5 text-xs font-medium", positive === undefined ? "text-muted" : positive ? "text-emerald-600" : "text-red-600")}>{delta}</p>}
    </Card>
  );
}

/* ---------- Formulaires ---------- */
const fieldBase =
  "w-full rounded-lg border border-line bg-white px-3 h-10 text-sm text-ink placeholder:text-slate-400 transition focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldBase, className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <span className="relative block">
      <select className={cn(fieldBase, "appearance-none pr-9", className)} {...props} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
    </span>
  );
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "h-auto min-h-[88px] resize-y py-2.5", className)} {...props} />;
}

export function SectionTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-3 mt-7 flex items-center gap-2 first:mt-0">
      {icon && <span className="text-slate-400 [&_svg]:size-4">{icon}</span>}
      <h4 className="text-[13px] font-semibold text-ink">{children}</h4>
      <span className="ml-2 h-px flex-1 bg-line" />
    </div>
  );
}

/* ---------- États vides ---------- */
export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-400 [&_svg]:size-5">{icon}</span>
      <p className="mt-3 text-sm font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[13px] text-muted">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{message}</p>;
}

/* ---------- Éléments complémentaires ---------- */

/** Onglets segmentés (liens) */
export function Segmented({ items, active }: { items: { href: string; label: ReactNode; count?: number; id: string }[]; active: string }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <nav className="inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
        {items.map((it) => (
          <Link
            key={it.id}
            href={it.href}
            scroll={false}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition",
              it.id === active ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink",
            )}
          >
            {it.label}
            {it.count !== undefined && <span className="text-xs tabular-nums text-slate-400">{it.count}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Liste de lignes clé / valeur */
export function DescList({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {items.map(([k, v], i) => (
        <div key={i} className="flex items-start justify-between gap-4 py-2.5">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Touche de raccourci clavier */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500">{children}</kbd>;
}

/** Classes de tableau minimaliste : <table className={tableClass}> */
export const tableClass =
  "w-full text-sm [&_th]:h-10 [&_th]:px-4 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted [&_th]:whitespace-nowrap [&_td]:px-4 [&_td]:py-3 [&_tbody_tr]:border-t [&_tbody_tr]:border-line [&_tbody_tr:hover]:bg-slate-50/70";
