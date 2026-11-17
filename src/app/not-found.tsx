import Image from "next/image";
import { Compass } from "lucide-react";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5">
      <div className="w-full max-w-sm text-center">
        <Image src="/logo.png" alt="Moov'Up" width={473} height={136} className="mx-auto h-auto w-36" />
        <div className="mt-10 rounded-xl border border-line bg-white px-6 py-8">
          <span className="mx-auto grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-400">
            <Compass className="size-5" aria-hidden />
          </span>
          <p className="mt-4 text-xs font-medium tabular-nums text-muted">Erreur 404</p>
          <h1 className="mt-1 text-lg font-semibold text-ink">Page introuvable</h1>
          <p className="mt-1 text-[13px] text-muted">Cette page n&apos;existe pas ou a été supprimée.</p>
          <LinkButton href="/" variant="brand" className="mt-6">
            Retour au tableau de bord
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
