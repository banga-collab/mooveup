"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { UserPlus } from "lucide-react";
import { buttonClass, Kbd } from "@/components/ui";

/** « Client suivant » : prend le focus pour enchaîner avec Entrée ; T ouvre le ticket */
export function NextClient({ ticketHref }: { ticketHref: string | null }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const ticket = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.key === "t" || e.key === "T") && !e.ctrlKey && !e.metaKey && !e.altKey) ticket.current?.click();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      {ticketHref && (
        <Link ref={ticket} href={ticketHref} className={buttonClass("secondary")}>
          Voir le ticket <Kbd>T</Kbd>
        </Link>
      )}
      <Link ref={ref} href="/express" className={buttonClass("brand")}>
        <UserPlus /> Client suivant <span className="hidden sm:inline">· Entrée</span>
      </Link>
    </>
  );
}
