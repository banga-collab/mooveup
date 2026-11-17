import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Inter, Montserrat, Noto_Sans_Arabic } from "next/font/google";
import { LangProvider } from "@/lib/i18n/client";
import { dir, type Lang } from "@/lib/i18n/core";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["600", "700", "800"] });
const arabic = Noto_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], preload: false, display: "swap" });

export const metadata: Metadata = {
  title: { default: "Moov'Up CRM", template: "%s · Moov'Up CRM" },
  description: "CRM du groupe Moov'Up Agadir : Sports, Lady, Kids, Power Gym, Anais Clinic, Anais Institut, Evolve Hommes",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1a6d8e" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
  width: "device-width",
  initialScale: 1,
};

/** Thème « système » : appliqué avant le premier affichage (pas de flash). Clair / sombre : classe posée côté serveur (cookie « theme »). */
const THEME_SCRIPT = `(function(){try{var d=document.documentElement;if(d.dataset.theme==="system"){var m=window.matchMedia("(prefers-color-scheme: dark)").matches;d.classList.toggle("dark",m);d.style.colorScheme=m?"dark":"light";}}catch(e){}})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const lang: Lang = jar.get("lang")?.value === "ar" ? "ar" : "fr";
  const t = jar.get("theme")?.value;
  const theme = t === "dark" || t === "system" ? t : "light";
  return (
    <html
      lang={lang}
      dir={dir(lang)}
      data-theme={theme}
      className={theme === "dark" ? "dark" : undefined}
      style={theme === "dark" ? { colorScheme: "dark" } : undefined}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${inter.variable} ${montserrat.variable} ${arabic.variable} font-sans antialiased`}>
        <LangProvider lang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
