/* Moov'Up CRM : service worker (application installable + accueil hors ligne).
 * - Fichiers statiques : cache (en production, les noms de fichiers changent à chaque version).
 * - Pages : réseau d'abord ; /acces et /tablette sont gardées pour rouvrir l'accueil sans réseau ;
 *   sinon page « hors ligne » sobre.
 * - Les données (actions serveur, RSC) ne sont jamais mises en cache.
 */
const VERSION = "moovup-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const DEV = new URL(self.location.href).searchParams.get("dev") === "1";
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png", "/logo.png"];
const OFFLINE_PAGES = ["/acces", "/tablette"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC);
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok && !res.redirected) await cache.put(url, res);
          } catch {
            /* fichier indisponible : ignoré */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const isStatic = (url) => url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$/.test(url.pathname);

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.type === "basic") (await caches.open(STATIC)).put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName) {
  try {
    const res = await fetch(request);
    if (res.ok && res.type === "basic") (await caches.open(cacheName)).put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw err;
  }
}

async function page(request, url) {
  try {
    const res = await fetch(request);
    if (res.ok && !res.redirected && OFFLINE_PAGES.includes(url.pathname)) (await caches.open(PAGES)).put(url.pathname, res.clone());
    return res;
  } catch {
    if (OFFLINE_PAGES.includes(url.pathname)) {
      const hit = await caches.match(url.pathname, { cacheName: PAGES });
      if (hit) return hit;
    }
    return (await caches.match("/offline.html")) || new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") return;

  if (request.mode === "navigate") {
    event.respondWith(page(request, url));
    return;
  }
  if (isStatic(url)) {
    event.respondWith(DEV ? networkFirst(request, STATIC) : cacheFirst(request));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") self.skipWaiting();
});
