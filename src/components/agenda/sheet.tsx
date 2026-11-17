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
      <Link href={closeHref} scroll={false} aria-label="Fermer" className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />
      <div className="relative max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl animate-fade-up sm:max-w-lg sm:rounded-3xl sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          {icon}
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-lg font-extrabold leading-tight text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
          </div>
          <Link href={closeHref} scroll={false} aria-label="Fermer" className="grid size-9 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-canvas hover:text-ink">
            <X className="size-5" />
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
