"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Sons de l'accueil (bip vert / rouge), désactivables ; préférence gardée sur l'appareil */
const KEY = "moovup.sound";
const EVENT = "moovup:sound";

function soundOn() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

/** Petit signal sonore discret : aigu si autorisé, grave si refusé */
export function beep(ok: boolean) {
  if (!soundOn()) return;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = ok ? "sine" : "triangle";
    o.frequency.value = ok ? 880 : 220;
    g.gain.setValueAtTime(0.05, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.15 : 0.4));
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + (ok ? 0.15 : 0.4));
    o.onended = () => void ctx.close();
  } catch {
    /* son indisponible */
  }
}

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};

/** [sons actifs, inverser] */
export function useSound() {
  const on = useSyncExternalStore(subscribe, soundOn, () => true);
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(KEY, soundOn() ? "off" : "on");
    } catch {
      /* stockage indisponible */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [on, toggle] as const;
}
