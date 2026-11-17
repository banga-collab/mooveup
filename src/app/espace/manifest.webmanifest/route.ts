/** Application installable de l'espace adhérent (écran d'accueil du téléphone) */
export function GET() {
  const manifest = {
    id: "/espace",
    name: "Moov'Up · Mon espace",
    short_name: "Moov'Up",
    description: "Carte d'accès, rendez-vous, abonnements et points de fidélité du groupe Moov'Up Agadir.",
    lang: "fr",
    start_url: "/espace",
    scope: "/espace",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f8fa",
    theme_color: "#1a6d8e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ma carte d'accès", short_name: "Carte", url: "/espace?carte=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Réserver", short_name: "Réserver", url: "/espace/rdv?reserver=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
  return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" } });
}
