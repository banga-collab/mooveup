import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Réserver en ligne", template: "%s · Moov'Up" },
  description: "Réservez votre rendez-vous en ligne au groupe Moov'Up Agadir : Anais Institut, Anais Beauty Clinic, Evolve Hommes, Moov'Up Sports et Kids.",
  robots: { index: true },
};

/** Pages publiques (sans connexion), pensées pour le téléphone */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link href="/reserver" aria-label="Moov'Up, réserver">
            <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="h-auto w-28" />
          </Link>
          <span className="text-xs text-muted">Agadir</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}
