import { readdirSync } from "node:fs";
import path from "node:path";
import type { MetadataRoute } from "next";

/**
 * Application installable (PWA) : écran d'accueil du téléphone / de la tablette,
 * et base de l'application Android (Trusted Web Activity, voir docs/ANDROID.md).
 * Captures d'écran : déposer des PNG dans public/screenshots/ (« mobile-1.png »… en portrait 1080×1920,
 * « large-1.png »… en paysage 1920×1080) : elles sont ajoutées automatiquement au manifeste.
 */
function screenshots(): NonNullable<MetadataRoute.Manifest["screenshots"]> {
  try {
    return readdirSync(path.join(process.cwd(), "public", "screenshots"))
      .filter((f) => /^(mobile|large)-\d+\.png$/i.test(f))
      .sort()
      .map((f) => {
        const wide = f.toLowerCase().startsWith("large");
        return { src: `/screenshots/${f}`, sizes: wide ? "1920x1080" : "1080x1920", type: "image/png", form_factor: wide ? "wide" : "narrow", label: "Moov'Up CRM" };
      });
  } catch {
    return [];
  }
}

const icon = [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }];

export default function manifest(): MetadataRoute.Manifest {
  const shots = screenshots();
  return {
    id: "/",
    name: "Moov'Up CRM",
    short_name: "Moov'Up",
    description: "CRM du groupe Moov'Up Agadir : accueil, caisse, agenda et clients des 7 établissements.",
    lang: "fr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#1a6d8e",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Caisse", short_name: "Caisse", description: "Encaisser une vente", url: "/caisse", icons: icon },
      { name: "Entrées", short_name: "Entrées", description: "Scanner les cartes à l'accueil", url: "/acces", icons: icon },
      { name: "Agenda", short_name: "Agenda", description: "Rendez-vous du jour", url: "/agenda", icons: icon },
    ],
    ...(shots.length ? { screenshots: shots } : {}),
  };
}
