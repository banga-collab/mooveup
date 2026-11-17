/**
 * État partagé de l'aperçu rapide : quel client est ouvert, quel `ContactLink`
 * héberge le panneau (le premier monté), et cache des données préchargées.
 */
import { getQuickView, type QuickView } from "@/actions/quick-view";

type Listener = () => void;
export type QuickResult = QuickView | null | "error";

const listeners = new Set<Listener>();
let openId: string | null = null;
let opener: HTMLElement | null = null;
let hosts: number[] = [];
let seq = 0;

function emit() {
  listeners.forEach((l) => l());
}

export function subscribe(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const nextHostKey = () => ++seq;

export function registerHost(key: number) {
  hosts.push(key);
  if (hosts.length === 1) emit();
}

export function unregisterHost(key: number) {
  const wasHost = hosts[0] === key;
  hosts = hosts.filter((k) => k !== key);
  if (wasHost) emit();
}

/** Client ouvert, mais seulement pour le lien qui héberge le panneau */
export function hostSnapshot(key: number): string | null {
  return hosts[0] === key ? openId : null;
}

export function openQuickView(id: string, from?: HTMLElement | null) {
  opener = from ?? (document.activeElement as HTMLElement | null);
  openId = id;
  emit();
}

export function closeQuickView() {
  const back = opener;
  openId = null;
  opener = null;
  emit();
  // Rend le focus au nom cliqué
  if (back?.isConnected) requestAnimationFrame(() => back.focus({ preventScroll: true }));
}

/* ---------- Cache et préchargement ---------- */

const TTL = 20_000;
const cache = new Map<string, { at: number; p: Promise<QuickResult>; value?: QuickResult }>();
let prefetching = false;

export function loadQuickView(id: string, fresh = false): Promise<QuickResult> {
  const hit = cache.get(id);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.p;
  const entry: { at: number; p: Promise<QuickResult>; value?: QuickResult } = { at: Date.now(), p: Promise.resolve(null) };
  entry.p = getQuickView(id).then(
    (v) => (entry.value = v),
    () => {
      cache.delete(id);
      return (entry.value = "error");
    },
  );
  cache.set(id, entry);
  return entry.p;
}

/** Données déjà en cache (affichage instantané à l'ouverture) */
export function peekQuickView(id: string): QuickResult | undefined {
  const hit = cache.get(id);
  return hit && Date.now() - hit.at < TTL ? hit.value : undefined;
}

/** Préchargement au survol : une requête à la fois pour ne pas encombrer la file des actions */
export function prefetchQuickView(id: string) {
  const hit = cache.get(id);
  if (prefetching || (hit && Date.now() - hit.at < TTL)) return;
  prefetching = true;
  loadQuickView(id).finally(() => {
    prefetching = false;
  });
}

export function forgetQuickView(id: string) {
  cache.delete(id);
}
