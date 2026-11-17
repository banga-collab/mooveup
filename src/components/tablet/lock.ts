"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Verrouillage simple de la tablette : code à 4 chiffres gardé sur l'appareil (localStorage) */
const PIN = "moovup.tablet.pin";
const LOCKED = "moovup.tablet.locked";
const EVENT = "moovup:tablet-lock";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible */
  }
  window.dispatchEvent(new Event(EVENT));
};

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
};

export const isTabletLocked = () => read(LOCKED) === "1" && !!read(PIN);

export function useTabletLock() {
  const locked = useSyncExternalStore(subscribe, isTabletLocked, () => false);
  const hasPin = useSyncExternalStore(subscribe, () => !!read(PIN), () => false);
  return {
    locked,
    hasPin,
    setPin: useCallback((pin: string) => write(PIN, pin), []),
    check: useCallback((pin: string) => read(PIN) === pin, []),
    lock: useCallback(() => write(LOCKED, "1"), []),
    unlock: useCallback(() => write(LOCKED, null), []),
  };
}
