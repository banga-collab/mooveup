"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { hostSnapshot, nextHostKey, openQuickView, prefetchQuickView, registerHost, subscribe, unregisterHost } from "./store";
import { QuickViewPanel } from "./panel";

/**
 * Nom de client cliquable, à utiliser PARTOUT où un nom de client apparaît.
 * Clic : aperçu rapide dans un panneau latéral (sans quitter la page, URL inchangée).
 * Ctrl/⌘ + clic, Maj + clic ou clic du milieu : fiche complète (nouvel onglet).
 * Survol : préchargement de l'aperçu.
 */
export function ContactLink({ id, name, className }: { id: string; name: string; className?: string }) {
  const [hostKey] = useState(nextHostKey);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    registerHost(hostKey);
    return () => {
      unregisterHost(hostKey);
      window.clearTimeout(timer.current);
    };
  }, [hostKey]);

  // Le premier lien monté affiche le panneau (portail dans <body>)
  const openFor = useSyncExternalStore(
    subscribe,
    () => hostSnapshot(hostKey),
    () => null,
  );

  const intent = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => prefetchQuickView(id), 120);
  };

  return (
    <>
      <Link
        href={`/contacts/${id}`}
        prefetch={false}
        aria-haspopup="dialog"
        className={cn("font-medium text-ink hover:text-brand-600 hover:underline", className)}
        onClick={(e) => {
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          window.clearTimeout(timer.current);
          openQuickView(id, e.currentTarget);
        }}
        onMouseEnter={intent}
        onFocus={intent}
        onMouseLeave={() => window.clearTimeout(timer.current)}
      >
        {name}
      </Link>
      {openFor && typeof document !== "undefined" && createPortal(<QuickViewPanel key={openFor} id={openFor} />, document.body)}
    </>
  );
}
