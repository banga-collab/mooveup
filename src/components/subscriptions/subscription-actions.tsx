import Link from "next/link";
import { Minus, Pause, Play, RefreshCw, XCircle } from "lucide-react";
import { consumeSession, setSubscriptionStatus } from "@/actions/subscriptions";
import type { Subscription } from "@/lib/types";
import { ConfirmButton } from "@/components/confirm-button";
import { buttonClass } from "@/components/ui";

/** Actions d'une ligne d'abonnement : renouveler en évidence, le reste en icônes discrètes */
export function SubscriptionActions({ sub, renewHref }: { sub: Subscription; renewHref: string }) {
  const isPack = sub.sessions_left !== null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {sub.status !== "resilie" && (
        <Link href={renewHref} scroll={false} className={buttonClass("secondary", "px-3")}>
          <RefreshCw /> Renouveler
        </Link>
      )}
      {isPack && sub.status === "actif" && (sub.sessions_left ?? 0) > 0 && (
        <form action={consumeSession.bind(null, sub.id)}>
          <button type="submit" className={buttonClass("secondary", "px-3")} title="Décompter une séance">
            <Minus /> Séance
          </button>
        </form>
      )}
      {sub.status === "actif" && (
        <form action={setSubscriptionStatus.bind(null, sub.id, "suspendu")}>
          <button type="submit" className={buttonClass("ghost", "w-9 px-0")} title="Suspendre" aria-label="Suspendre l'abonnement">
            <Pause />
          </button>
        </form>
      )}
      {sub.status === "suspendu" && (
        <form action={setSubscriptionStatus.bind(null, sub.id, "actif")}>
          <button type="submit" className={buttonClass("secondary", "px-3")}>
            <Play /> Réactiver
          </button>
        </form>
      )}
      {(sub.status === "actif" || sub.status === "suspendu") && (
        <form action={setSubscriptionStatus.bind(null, sub.id, "resilie")}>
          <ConfirmButton message={`Résilier l'abonnement « ${sub.name} » ?`} className="w-9 border-transparent px-0">
            <XCircle />
            <span className="sr-only">Résilier l&apos;abonnement</span>
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
