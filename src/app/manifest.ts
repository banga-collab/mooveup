import type { MetadataRoute } from "next";

/** Application installable (PWA) : écran d'accueil du téléphone / de la tablette */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Moov'Up CRM",
    short_name: "Moov'Up",
    description: "CRM du groupe Moov'Up Agadir : accueil, caisse, agenda et clients des 7 établissements.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#1a6d8e",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Caisse", short_name: "Caisse", description: "Encaisser une vente", url: "/caisse", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Entrées", short_name: "Entrées", description: "Scanner les cartes à l'accueil", url: "/acces", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Agenda", short_name: "Agenda", description: "Rendez-vous du jour", url: "/agenda", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
