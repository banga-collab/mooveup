"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type GalleryItem = { src: string; label: string | null; remove?: () => Promise<void> };

/** Galerie de photos avec visionneuse plein écran (flèches clavier, Échap) */
export function Gallery({ items, className }: { items: GalleryItem[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const cur = open === null ? null : items[open];

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % items.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + items.length) % items.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items.length]);

  return (
    <>
      <ul className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", className)}>
        {items.map((it, i) => (
          <li key={`${it.src}-${i}`} className="group relative">
            <button type="button" onClick={() => setOpen(i)} className="block w-full overflow-hidden rounded-lg border border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40" aria-label={`Agrandir ${it.label ?? `la photo ${i + 1}`}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={it.src} alt={it.label ?? ""} loading="lazy" className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
            </button>
            {it.remove && (
              <form
                action={it.remove}
                onSubmit={(e) => {
                  if (!confirm("Retirer cette photo de la galerie ?")) e.preventDefault();
                }}
                className="absolute right-1 top-1 hidden group-hover:block group-focus-within:block"
              >
                <button type="submit" aria-label="Retirer la photo" className="grid size-7 place-items-center rounded-md bg-white/90 text-slate-500 hover:text-red-600">
                  <Trash2 className="size-3.5" />
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {cur && (
        <div role="dialog" aria-modal="true" aria-label="Photo" className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.src} alt={cur.label ?? ""} className="max-h-[85vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <button type="button" onClick={() => setOpen(null)} className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Fermer">
            <X className="size-5" />
          </button>
          {items.length > 1 && (
            <>
              <button type="button" onClick={(e) => (e.stopPropagation(), setOpen((open! - 1 + items.length) % items.length))} className="absolute left-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Photo précédente">
                <ChevronLeft className="size-5" />
              </button>
              <button type="button" onClick={(e) => (e.stopPropagation(), setOpen((open! + 1) % items.length))} className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20" aria-label="Photo suivante">
                <ChevronRight className="size-5" />
              </button>
            </>
          )}
          <p className="absolute inset-x-0 bottom-3 text-center text-[13px] text-white/80">
            {cur.label ? `${cur.label} · ` : ""}
            {open! + 1} / {items.length}
          </p>
        </div>
      )}
    </>
  );
}
