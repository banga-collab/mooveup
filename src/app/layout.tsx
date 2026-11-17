import type { Metadata, Viewport } from "next";
import { Inter, Montserrat } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const montserrat = Montserrat({ variable: "--font-montserrat", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: "Moov'Up CRM", template: "%s · Moov'Up CRM" },
  description: "CRM du groupe Moov'Up Agadir : Sports, Lady, Kids, Power Gym, Anais Clinic, Anais Institut, Evolve Hommes",
};

export const viewport: Viewport = { themeColor: "#1a6d8e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} ${montserrat.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
