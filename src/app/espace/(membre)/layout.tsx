import Image from "next/image";
import Link from "next/link";
import { requireMember } from "@/lib/member-auth";
import { MemberNav } from "@/components/member/bottom-nav";
import { LangToggle } from "@/components/member/lang-toggle";

/** Espace adhérent connecté : en-tête, contenu étroit (mobile d'abord), navigation en bas */
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  await requireMember();
  return (
    <>
      <header className="no-print sticky top-0 z-30 border-b border-line bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <Link href="/espace" aria-label="Moov'Up, mon espace" className="shrink-0">
            <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="h-auto w-24" />
          </Link>
          <MemberNav variant="top" />
          <LangToggle className="shrink-0" />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-28 pt-5 sm:pb-16">{children}</main>
      <MemberNav variant="bottom" />
    </>
  );
}
