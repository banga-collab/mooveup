"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Info, Loader2, Undo2, X, XCircle } from "lucide-react";
import { undoAction } from "@/actions/undo";
import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";
/** m = message, t = ton, id = unique, u = jeton d'annulation */
type Toast = { m: string; t: Tone; id: number; u?: string };

const EVENT = "moovup:toast";
const UNDO_MS = 5_000;
const PLAIN_MS = 4_000;

/**
 * Affiche un toast depuis un composant client (erreur d'une mise à jour optimiste,
 * note ajoutée dans l'aperçu rapide…). Les server actions utilisent `flash()`.
 */
export function showToast(message: string, tone: Tone = "success", opts: { undo?: string | null } = {}) {
  if (typeof window === "undefined") return;
  const detail: Toast = { m: message, t: tone, id: Date.now() + Math.random(), ...(opts.undo ? { u: opts.undo } : {}) };
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail }));
}

/** Lit (et efface) le cookie « flash » posé par une server action */
function readFlashCookie(): Toast | null {
  const raw = document.cookie.split("; ").find((c) => c.startsWith("flash="));
  if (!raw) return null;
  document.cookie = "flash=; path=/; max-age=0";
  try {
    return JSON.parse(decodeURIComponent(decodeURIComponent(raw.slice(6)))) as Toast;
  } catch {
    return null; /* cookie illisible : ignoré */
  }
}

function isTyping(el: Element | null) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

/**
 * Notifications en bas de l'écran : cookie « flash » des server actions (après
 * navigation OU mise à jour sur place) et `showToast()` côté client.
 * Un toast avec jeton d'annulation affiche « Annuler » pendant 5 s (ou Ctrl/⌘+Z).
 */
export function Toaster() {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const [toast, setToast] = useState<Toast | null>(null);
  const [undoing, startUndo] = useTransition();
  const [bar, setBar] = useState(false);
  const toastRef = useRef<Toast | null>(null);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const check = useCallback(() => {
    const t = readFlashCookie();
    if (t) setToast(t);
  }, []);

  // Après navigation
  useEffect(() => {
    check();
  }, [path, params, check]);

  // Après une server action qui met à jour la page sans naviguer
  useEffect(() => {
    const onToast = (e: Event) => setToast((e as CustomEvent<Toast>).detail);
    window.addEventListener(EVENT, onToast);
    window.addEventListener("focus", check);
    const store = (window as unknown as { cookieStore?: EventTarget }).cookieStore;
    store?.addEventListener?.("change", check);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") check();
    }, 500);
    return () => {
      window.removeEventListener(EVENT, onToast);
      window.removeEventListener("focus", check);
      store?.removeEventListener?.("change", check);
      window.clearInterval(timer);
    };
  }, [check]);

  // Disparition automatique (pas pendant une annulation en cours)
  useEffect(() => {
    if (!toast || undoing) return;
    setBar(false);
    const raf = requestAnimationFrame(() => setBar(true));
    const t = setTimeout(() => setToast((cur) => (cur?.id === toast.id ? null : cur)), toast.u ? UNDO_MS : PLAIN_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [toast, undoing]);

  const undo = useCallback(() => {
    const t = toastRef.current;
    if (!t?.u) return;
    const token = t.u;
    setToast({ ...t, u: undefined, m: "Annulation…", t: "info" });
    startUndo(async () => {
      try {
        const res = await undoAction(token);
        setToast({ m: res.message, t: res.ok ? "success" : "error", id: Date.now() });
        // Les panneaux ouverts (aperçu rapide) se rechargent
        window.dispatchEvent(new Event("moovup:refresh"));
        if (res.href && res.href !== window.location.pathname) router.push(res.href);
        else router.refresh();
      } catch {
        setToast({ m: "Annulation impossible : vérifiez votre connexion.", t: "error", id: Date.now() });
      }
    });
  }, [router]);

  // Ctrl/⌘ + Z tant que « Annuler » est proposé
  useEffect(() => {
    if (!toast?.u) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !isTyping(document.activeElement)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toast?.u, undo]);

  if (!toast) return null;
  const Icon = undoing ? Loader2 : toast.t === "success" ? CheckCircle2 : toast.t === "error" ? XCircle : Info;
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex justify-center px-4 lg:bottom-6">
      <div
        key={toast.id}
        role={toast.t === "error" ? "alert" : "status"}
        className="pointer-events-auto relative flex max-w-md items-center gap-2.5 overflow-hidden rounded-xl bg-ink py-2 pl-4 pr-2 text-sm text-white shadow-pop animate-toast"
      >
        <Icon className={cn("size-4 shrink-0", undoing && "animate-spin", toast.t === "success" ? "text-emerald-400" : toast.t === "error" ? "text-red-400" : "text-sky-300")} />
        <span className="min-w-0 py-1">{toast.m}</span>
        {toast.u && (
          <button
            type="button"
            onClick={undo}
            className="ml-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-sky-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            title="Annuler (Ctrl+Z)"
          >
            <Undo2 className="size-4" /> Annuler
          </button>
        )}
        <button
          type="button"
          onClick={() => setToast(null)}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          aria-label="Fermer"
        >
          <X className="size-3.5" />
        </button>
        {toast.u && (
          <span
            aria-hidden
            className="absolute bottom-0 left-0 h-0.5 bg-sky-300/70"
            style={{ width: bar ? "0%" : "100%", transition: bar ? `width ${UNDO_MS}ms linear` : "none" }}
          />
        )}
      </div>
    </div>
  );
}
