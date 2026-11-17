import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/toaster";
import { MemberSwRegister } from "@/components/member/sw-register";

export const metadata: Metadata = {
  title: { default: "Mon espace", template: "%s · Mon espace Moov'Up" },
  description: "Espace adhérent du groupe Moov'Up Agadir : carte d'accès, rendez-vous, abonnements et points de fidélité.",
  manifest: "/espace/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Moov'Up", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

/** Espace adhérent (portail client) : séparé de l'application de l'équipe */
export default function MemberRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      {children}
      <Suspense>
        <Toaster />
      </Suspense>
      <MemberSwRegister />
    </div>
  );
}
