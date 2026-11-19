"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useT } from "@/lib/i18n/client";

const START = "mu-nav-start";

/** À appeler avant une navigation programmée (router.push) pour afficher la barre de chargement */
export const startNavProgress = () => window.dispatchEvent(new Event(START));

/**
 * Barre de progression fine en haut de l'écran pendant le chargement d'une page :
 * démarre dès le clic sur un lien interne (retour visuel immédiat), se termine quand l'adresse change.
 * Doit être placée dans un <Suspense> (useSearchParams).
 */
export function NavProgress() {
  const t = useT();
  const path = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<"idle" | "start" | "run" | "done">("idle");
  const timers = useRef<number[]>([]);

  const clear = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };

  useEffect(() => {
    const begin = () => {
      clear();
      setPhase("start");
      // Deux images plus tard : la largeur part de 0 puis avance lentement jusqu'à ~85 %
      timers.current.push(window.setTimeout(() => setPhase("run"), 20));
      // Sécurité : la barre disparaît si la page ne change jamais (lien vers la page courante, erreur réseau)
      timers.current.push(window.setTimeout(() => setPhase("idle"), 20_000));
    };
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.hasAttribute("download") || (a.target && a.target !== "_self")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      begin();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(START, begin);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START, begin);
      clear();
    };
  }, []);

  // Nouvelle adresse affichée : on termine la barre
  const running = phase === "start" || phase === "run";
  const runningRef = useRef(running);
  runningRef.current = running;
  useEffect(() => {
    if (!runningRef.current) return;
    clear();
    setPhase("done");
    timers.current.push(window.setTimeout(() => setPhase("idle"), 350));
  }, [path, search]);

  if (phase === "idle") return null;
  const width = phase === "start" ? "0%" : phase === "run" ? "85%" : "100%";
  const transition = phase === "run" ? "width 8s cubic-bezier(0.1, 0.7, 0.2, 1)" : phase === "done" ? "width 150ms ease-out, opacity 250ms ease 100ms" : "none";
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5" role="progressbar" aria-busy="true" aria-label={t("nav.loading")}>
      <div className="h-full bg-brand-500" style={{ width, transition, opacity: phase === "done" ? 0 : 1 }} />
    </div>
  );
}
