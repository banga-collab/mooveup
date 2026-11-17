"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMt } from "./use-mt";

type WakeLock = { release: () => Promise<void> };

/**
 * Carte d'accès : aperçu sur l'accueil, QR plein écran au toucher
 * (écran maintenu allumé quand le navigateur le permet).
 */
export function AccessCard({ svg, code, name, ok, status, plan, autoOpen = false }: { svg: string | null; code: string | null; name: string; ok: boolean | null; status: string | null; plan: string | null; autoOpen?: boolean }) {
  const t = useMt();
  const [open, setOpen] = useState(autoOpen && !!svg);

  useEffect(() => {
    if (!open) return;
    let lock: WakeLock | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (k: "screen") => Promise<WakeLock> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => undefined);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      lock?.release().catch(() => undefined);
    };
  }, [open]);

  if (!svg || !code) {
    return <div className="rounded-xl border border-line bg-white p-4 text-[13px] text-muted">{t("m.card.none")}</div>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-4 rounded-xl border border-line bg-white p-4 text-start transition hover:border-slate-300 active:scale-[.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        aria-label={t("m.card.open")}
      >
        <span className="block size-20 shrink-0 overflow-hidden rounded-lg border border-line [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: svg }} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{t("m.card.title")}</span>
          <span className="mt-0.5 block font-mono text-[13px] tracking-wide text-slate-600">{code}</span>
          {status && (
            <span className={cn("mt-1.5 inline-flex items-center gap-1 text-xs font-medium", ok ? "text-emerald-700" : "text-amber-700")}>
              {ok ? <CheckCircle2 className="size-3.5" /> : <CircleAlert className="size-3.5" />}
              {status}
            </span>
          )}
        </span>
        <Maximize2 className="size-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label={t("m.card.title")} className="fixed inset-0 z-[80] flex flex-col bg-white" onClick={() => setOpen(false)}>
          <div className="flex justify-end p-3">
            <button type="button" onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label={t("m.card.close")}>
              <X className="size-5" />
            </button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
            <p className="text-lg font-semibold text-ink">{name}</p>
            {plan && <p className="mt-0.5 text-[13px] text-muted">{plan}</p>}
            <div className="mt-6 w-full max-w-[min(80vw,22rem)] rounded-2xl border border-line p-3 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="mt-4 font-mono text-xl font-semibold tracking-[0.12em] text-ink">{code}</p>
            {status && (
              <p className={cn("mt-2 inline-flex items-center gap-1.5 text-sm font-medium", ok ? "text-emerald-700" : "text-amber-700")}>
                {ok ? <CheckCircle2 className="size-4" /> : <CircleAlert className="size-4" />}
                {status}
              </p>
            )}
            <p className="mt-6 max-w-xs text-[13px] text-muted">{t("m.card.hint")}</p>
          </div>
        </div>
      )}
    </>
  );
}
