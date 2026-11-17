/**
 * Registre des raccourcis clavier du CRM (affichés dans la fenêtre « ? » et la page /aide).
 * L'écouteur global est `ShortcutsListener` (shortcuts-listener.tsx).
 *
 * Pour un raccourci propre à une page : `useShortcut("s", () => …)` (inactif pendant la saisie).
 * Un gestionnaire de page qui appelle `e.preventDefault()` prend le pas sur le raccourci global.
 */
import { useEffect, useRef } from "react";
import type { Role } from "@/lib/types";

export type Shortcut = {
  id: string;
  /** Touches successives (minuscules) : ["n"], ["g", "d"], ["?"] */
  keys: string[];
  /** Clé de traduction du libellé */
  labelKey: string;
  /** Page ouverte */
  href?: string;
  /** Ou évènement envoyé sur window */
  event?: string;
  /** Touches affichées si différentes (ex. Ctrl K) */
  display?: string[];
  roles?: Role[];
  group: "actions" | "navigation" | "general";
};

export const SHORTCUTS: Shortcut[] = [
  { id: "search", keys: ["/"], display: ["Ctrl", "K"], labelKey: "sc.search", event: "open-palette", group: "general" },
  { id: "help", keys: ["?"], labelKey: "sc.help", event: "open-shortcuts", group: "general" },
  { id: "client", keys: ["n"], labelKey: "sc.client", href: "/contacts/nouveau", group: "actions" },
  { id: "vente", keys: ["v"], labelKey: "sc.sale", href: "/caisse", group: "actions" },
  { id: "rdv", keys: ["r"], labelKey: "sc.rdv", href: "/agenda/nouveau", group: "actions" },
  { id: "entree", keys: ["e"], labelKey: "sc.entry", href: "/acces", group: "actions" },
  { id: "tache", keys: ["t"], labelKey: "sc.task", href: "/taches#nouvelle-tache", group: "actions" },
  { id: "go-home", keys: ["g", "d"], labelKey: "sc.goHome", href: "/", group: "navigation" },
  { id: "go-clients", keys: ["g", "c"], labelKey: "sc.goClients", href: "/contacts", group: "navigation" },
  { id: "go-agenda", keys: ["g", "a"], labelKey: "sc.goAgenda", href: "/agenda", group: "navigation" },
  { id: "go-ventes", keys: ["g", "v"], labelKey: "sc.goSales", href: "/ventes", group: "navigation" },
];

/** Vrai quand on tape dans un champ (les raccourcis sont alors inactifs) */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return /^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable;
}

/** Touche normalisée : lettre latine même sur un clavier arabe (KeyN → « n ») */
export function keyOf(e: KeyboardEvent) {
  if (e.key === "?" || e.key === "/") return e.key;
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}

/** Raccourci propre à une page (une seule touche, sans modificateur, inactif pendant la saisie) */
export function useShortcut(key: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (keyOf(e) === key.toLowerCase()) {
        e.preventDefault();
        ref.current(e);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key, enabled]);
}
