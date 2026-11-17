"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, Tablet, X } from "lucide-react";
import { useTabletLock } from "@/components/tablet/lock";

/** Évènement « beforeinstallprompt » (Chrome / Edge / Android) : non typé dans lib.dom */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "moovup.install.dismissed";
const DISMISS_DAYS = 30;

function dismissedRecently() {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86400_000;
  } catch {
    return false;
  }
}

/**
 * Application installable et hors ligne :
 * enregistre le service worker, propose discrètement « Installer l'application »
 * (iOS : Partager → Sur l'écran d'accueil) et, si la tablette est verrouillée, un retour rapide vers /tablette.
 */
export function PwaRegister() {
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);
  const [help, setHelp] = useState(false);
  const { locked } = useTabletLock();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const dev = process.env.NODE_ENV !== "production";
    navigator.serviceWorker.register(dev ? "/sw.js?dev=1" : "/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone || dismissedRecently()) return;
    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
    const first = setTimeout(() => {
      if (isIos && isSafari) {
        setIos(true);
        setShow(true);
      }
    }, 0);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
      setShow(true);
    };
    const onInstalled = () => {
      setShow(false);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      clearTimeout(first);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* stockage indisponible */
    }
    setShow(false);
    setHelp(false);
  };

  const install = async () => {
    if (ios) {
      setHelp((v) => !v);
      return;
    }
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    if (outcome === "accepted") setShow(false);
  };

  const backToTablet = locked && pathname !== "/tablette";
  const onTablet = pathname === "/tablette";

  return (
    <>
      <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      {backToTablet && (
        <Link
          href="/tablette"
          className="no-print fixed bottom-[88px] end-4 z-[55] inline-flex h-11 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-medium text-white shadow-pop transition hover:bg-slate-800 lg:bottom-5"
        >
          <Tablet className="size-4" /> Retour à la tablette
        </Link>
      )}
      {show && !onTablet && !backToTablet && (
        <div className="no-print fixed bottom-[88px] start-4 z-[55] max-w-[calc(100vw-2rem)] lg:bottom-5">
          {help && (
            <div role="dialog" aria-label="Installer sur iPhone ou iPad" className="mb-2 w-72 max-w-full rounded-xl border border-line bg-white p-4 text-[13px] text-slate-700 shadow-pop">
              <p className="font-semibold text-ink">Installer sur l&apos;écran d&apos;accueil</p>
              <ol className="mt-2 space-y-2">
                <li className="flex items-center gap-2">
                  <Share className="size-4 shrink-0 text-brand-600" /> Touchez <span className="font-medium text-ink">Partager</span> dans Safari
                </li>
                <li className="flex items-center gap-2">
                  <SquarePlus className="size-4 shrink-0 text-brand-600" /> puis <span className="font-medium text-ink">Sur l&apos;écran d&apos;accueil</span>
                </li>
              </ol>
            </div>
          )}
          <div className="inline-flex h-9 items-center rounded-lg border border-line bg-white text-[13px] font-medium text-slate-700 shadow-sm">
            <button type="button" onClick={() => void install()} className="inline-flex h-full items-center gap-1.5 rounded-s-lg ps-3 pe-2 transition hover:bg-slate-50 hover:text-ink" aria-expanded={ios ? help : undefined}>
              <Download className="size-4 text-slate-400" /> Installer l&apos;application
            </button>
            <button type="button" onClick={dismiss} className="grid h-full w-9 place-items-center rounded-e-lg border-s border-line text-slate-400 transition hover:bg-slate-50 hover:text-ink" aria-label="Masquer la proposition d'installation">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
