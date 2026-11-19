"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, FileType2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui";
import { showToast } from "@/components/toaster";
import { exportHref } from "@/lib/export/client";
import type { ExportFormat } from "@/lib/export/types";

const ITEMS: Record<ExportFormat, { label: string; hint: string; icon: typeof FileText }> = {
  xlsx: { label: "Excel", hint: "Classeur .xlsx avec en-tête Moov'Up", icon: FileSpreadsheet },
  pdf: { label: "PDF", hint: "Mise en page A4, impression", icon: FileText },
  csv: { label: "CSV", hint: "Données brutes (séparateur ;)", icon: FileType2 },
};

/**
 * Bouton « Exporter » → Excel / PDF / CSV.
 * - `href` : route serveur d'export (le format est ajouté en `?format=`), PDF ouvert dans un nouvel onglet ;
 * - `onExport` : export construit côté navigateur (ex. `exportTable`).
 */
export function ExportMenu({
  href,
  onExport,
  formats = ["xlsx", "pdf", "csv"],
  label = "Exporter",
  variant = "secondary",
  compact,
  disabled,
  className,
  title = "Exporter (Excel, PDF ou CSV) avec l'en-tête Moov'Up",
}: {
  href?: string;
  onExport?: (format: ExportFormat) => void | Promise<void>;
  formats?: ExportFormat[];
  label?: string;
  variant?: "secondary" | "ghost" | "brand";
  /** Libellé masqué sous 640 px (barre de tableau) */
  compact?: boolean;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const run = async (f: ExportFormat) => {
    if (!onExport) return;
    setOpen(false);
    setBusy(f);
    try {
      await onExport(f);
      if (f !== "pdf") showToast(`Export ${ITEMS[f].label} téléchargé`, "success");
    } catch (e) {
      showToast(e instanceof Error && e.message ? e.message : "L'export n'a pas pu aboutir. Réessayez.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled || !!busy}
        aria-expanded={open}
        aria-haspopup="menu"
        title={title}
        className={buttonClass(variant, compact ? "h-8 px-2.5" : undefined)}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Download />}
        <span className={compact ? "hidden sm:inline" : undefined}>{label}</span>
        {compact && <span className="sr-only sm:hidden">{label}</span>}
      </button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-64 rounded-xl border border-line bg-white p-1.5 shadow-pop" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
            {formats.map((f) => {
              const it = ITEMS[f];
              const Icon = it.icon;
              const body = (
                <>
                  <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{it.label}</span>
                    <span className="block text-xs text-muted">{it.hint}</span>
                  </span>
                </>
              );
              const cls = "flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none";
              return href ? (
                <a
                  key={f}
                  role="menuitem"
                  href={exportHref(href, f)}
                  {...(f === "pdf" ? { target: "_blank", rel: "noopener" } : { download: "" })}
                  onClick={() => setOpen(false)}
                  className={cls}
                >
                  {body}
                </a>
              ) : (
                <button key={f} type="button" role="menuitem" onClick={() => void run(f)} className={cls}>
                  {body}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
