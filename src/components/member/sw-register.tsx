"use client";

import { useEffect } from "react";

/** Application installable : enregistre le service worker commun (/sw.js) */
export function MemberSwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const dev = process.env.NODE_ENV !== "production";
    navigator.serviceWorker.register(dev ? "/sw.js?dev=1" : "/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
