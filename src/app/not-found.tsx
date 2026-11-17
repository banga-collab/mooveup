import Image from "next/image";
import { Compass } from "lucide-react";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-5">
      <div className="w-full max-w-md animate-fade-up text-center">
        <Image src="/logo.png" alt="Complexe Moov'Up Sports" width={473} height={136} className="mx-auto h-auto w-44" />
        <div className="mx-auto mt-10 grid size-16 place-items-center rounded-2xl bg-accent-50 text-accent-500">
          <Compass className="size-8" />
        </div>
        <p className="mt-6 font-display text-6xl font-extrabold tracking-tight text-brand-500">404</p>
        <h1 className="mt-2 font-display text-xl font-bold">Page introuvable</h1>
        <p className="mt-1 text-sm text-muted">Cette page n&apos;existe pas ou a été supprimée.</p>
        <LinkButton href="/" className="mt-8">
          Retour à l&apos;accueil
        </LinkButton>
      </div>
    </main>
  );
}
