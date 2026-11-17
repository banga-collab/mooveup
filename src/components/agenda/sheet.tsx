import Link from "next/link";
import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Fenêtre par-dessus la page, pilotée par l'URL (ex. `?sel=<id>`).
 * Sur mobile : panneau qui monte du bas ; sur bureau : fenêtre centrée.
 */
export function Sheet({ closeHref, title, subtitle, icon, children }: { closeHref: string; title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="no-print fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <Link href={closeHref} scroll={false} aria-label="Fermer" className="absolute inset-0 bg-ink/30" />
      <div className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-xl border border-line bg-white p-5 shadow-pop animate-fade-up sm:max-w-lg sm:rounded-xl sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-tight text-ink">{title}</h2>
            {subtitle && <div className="mt-1 text-[13px] text-muted">{subtitle}</div>}
          </div>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Fermer"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            <X className="size-4" />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
