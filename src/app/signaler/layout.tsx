import Image from "next/image";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Signaler un problème", template: "%s · Moov'Up" },
  description: "Signalez une panne, un problème de propreté ou de sécurité dans un établissement Moov'Up Agadir.",
  robots: { index: false },
};

/** Page publique (QR code affiché dans les établissements), pensée pour le téléphone */
export default function SignalerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="h-auto w-28" />
          <span className="text-xs text-muted">Agadir</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-6">{children}</main>
    </div>
  );
}
