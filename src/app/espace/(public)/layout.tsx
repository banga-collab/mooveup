import Image from "next/image";
import Link from "next/link";
import { LangToggle } from "@/components/member/lang-toggle";

/** Connexion, création de compte : pages sans navigation */
export default function MemberPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-xl items-center justify-between px-4">
          <Link href="/espace/connexion" aria-label="Moov'Up, mon espace">
            <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="h-auto w-28" />
          </Link>
          <LangToggle />
        </div>
      </header>
      <main className="mx-auto max-w-sm px-4 pb-16 pt-8">{children}</main>
    </>
  );
}
