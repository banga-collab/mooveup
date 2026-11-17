"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookmarkCheck, BookmarkPlus, Loader2 } from "lucide-react";
import { saveView } from "@/actions/views";
import { buttonClass } from "@/components/ui";
import { showToast } from "@/components/toaster";
import { cn } from "@/lib/utils";

/**
 * Bouton « Enregistrer cette vue » : mémorise l'URL actuelle (recherche, filtres, tri)
 * sous un nom ; la vue apparaît ensuite dans la barre latérale.
 */
export function SaveViewButton({ defaultLabel = "", icon, className }: { defaultLabel?: string; icon?: string; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(defaultLabel);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const href = window.location.pathname + window.location.search;
    start(async () => {
      const res = await saveView({ label, href, icon });
      if (res.error) {
        setError(res.error);
        return;
      }
      setError(null);
      setOpen(false);
      setSaved(true);
      showToast(res.updated ? `Vue « ${label.trim()} » mise à jour` : `Vue « ${label.trim()} » ajoutée à la barre latérale`);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    });
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          if (!open) setLabel(defaultLabel); // nom proposé selon les filtres actuels
          setOpen((o) => !o);
          setError(null);
          setTimeout(() => input.current?.select(), 0);
        }}
        aria-expanded={open}
        className={buttonClass("ghost", "h-9 px-2.5")}
        title="Enregistrer cette vue (recherche, filtres et tri) dans la barre latérale"
      >
        {saved ? <BookmarkCheck className="text-emerald-600" /> : <BookmarkPlus />}
        <span className={cn(saved ? "text-emerald-700" : "hidden md:inline")}>{saved ? "Vue enregistrée" : "Enregistrer la vue"}</span>
        {!saved && <span className="sr-only md:hidden">Enregistrer la vue</span>}
      </button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} />
          <form
            onSubmit={submit}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            className="absolute right-0 top-full z-40 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-line bg-white p-3 shadow-pop"
          >
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink">Nom de la vue</span>
              <input
                ref={input}
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                required
                placeholder="Ex. Impayés du mois"
                className="h-9 w-full rounded-lg border border-line bg-white px-3 text-[13px] text-ink placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
              />
            </label>
            <p className="mt-1.5 text-xs text-muted">Recherche, filtres et tri actuels seront retrouvés en un clic depuis la barre latérale.</p>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", "h-8 px-2.5")}>
                Annuler
              </button>
              <button type="submit" disabled={pending || !label.trim()} className={buttonClass("brand", "h-8 px-3")}>
                {pending && <Loader2 className="animate-spin" />} Enregistrer
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
