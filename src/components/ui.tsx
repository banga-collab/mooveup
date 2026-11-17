import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn, initials } from "@/lib/utils";

/* ---------- Boutons ---------- */
type Variant = "primary" | "secondary" | "ghost" | "brand" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent-500 text-white hover:bg-accent-600 shadow-sm shadow-accent-500/20",
  brand: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/20",
  secondary: "bg-white text-ink border border-line hover:bg-canvas hover:border-slate-300",
  ghost: "text-muted hover:text-ink hover:bg-canvas",
  danger: "bg-white text-red-600 border border-red-200 hover:bg-red-50",
};
const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 h-10 text-sm font-semibold transition-all duration-150 active:scale-[.98] disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100 whitespace-nowrap";

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
  return <div className={cn("rounded-2xl border border-line bg-white shadow-card print-break", className)} {...props} />;
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-500">{icon}</span>}
        <div className="min-w-0">
          <h3 className="font-display text-[15px] font-bold text-ink truncate">{title}</h3>
          {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------- En-tête de page ---------- */
export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 animate-fade-up">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-[28px] font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------- Badges ---------- */
type Tone = "brand" | "accent" | "green" | "amber" | "red" | "gray";
const tones: Record<Tone, string> = {
  brand: "bg-brand-50 text-brand-600 ring-brand-100",
  accent: "bg-accent-50 text-accent-700 ring-accent-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  red: "bg-red-50 text-red-700 ring-red-100",
  gray: "bg-slate-50 text-slate-600 ring-slate-200",
};
export function Badge({ tone = "brand", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap", tones[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ---------- Avatar ---------- */
const avatarColors = ["bg-brand-500", "bg-accent-500", "bg-brand-700", "bg-teal-600", "bg-accent-600", "bg-sky-700"];
export function Avatar({ name, size = 40, className }: { name: string; size?: number; className?: string }) {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % avatarColors.length;
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-display font-bold text-white", avatarColors[idx], className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
    >
      {initials(name)}
    </span>
  );
}

/* ---------- KPI ---------- */
export function Kpi({ label, value, delta, tone = "brand", icon, positive }: { label: string; value: ReactNode; delta?: ReactNode; tone?: "brand" | "accent"; icon?: ReactNode; positive?: boolean }) {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className={cn("absolute inset-x-0 top-0 h-1", tone === "brand" ? "bg-brand-500" : "bg-accent-500")} />
      <div className="flex items-start justify-between">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon && <span className={cn("grid size-9 place-items-center rounded-xl", tone === "brand" ? "bg-brand-50 text-brand-500" : "bg-accent-50 text-accent-500")}>{icon}</span>}
      </div>
      <p className={cn("mt-1 font-display text-[28px] font-extrabold tracking-tight", tone === "brand" ? "text-brand-500" : "text-accent-500")}>{value}</p>
      {delta !== undefined && (
        <p className={cn("mt-0.5 text-xs font-semibold", positive === undefined ? "text-muted" : positive ? "text-emerald-600" : "text-red-600")}>{delta}</p>
      )}
    </Card>
  );
}

/* ---------- Formulaires ---------- */
const fieldBase =
  "w-full rounded-xl border border-line bg-white px-3.5 h-11 text-sm text-ink placeholder:text-slate-400 transition focus:outline-none focus:border-brand-400 focus:ring-4 focus:ring-brand-50";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
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
      <select className={cn(fieldBase, "appearance-none pr-10", className)} {...props} />
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </span>
  );
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "h-auto py-3 min-h-[88px] resize-y", className)} {...props} />;
}

export function SectionTitle({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mt-8 mb-4 flex items-center gap-2 first:mt-0">
      {icon && <span className="text-accent-500">{icon}</span>}
      <h4 className="font-display text-sm font-bold uppercase tracking-wider text-brand-600">{children}</h4>
      <span className="ml-2 h-px flex-1 bg-line" />
    </div>
  );
}

/* ---------- États vides ---------- */
export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-50 text-brand-500">{icon}</span>
      <p className="mt-4 font-display font-bold text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-muted">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</p>;
}
