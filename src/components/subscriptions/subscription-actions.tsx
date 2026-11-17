import Link from "next/link";
import { Minus, Pause, Play, RefreshCw, XCircle } from "lucide-react";
import { consumeSession, setSubscriptionStatus } from "@/actions/subscriptions";
import type { Subscription } from "@/lib/types";
import { ConfirmButton } from "@/components/confirm-button";
import { cn } from "@/lib/utils";

const small = "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition active:scale-[.98] whitespace-nowrap";

/** Actions d'une ligne d'abonnement */
export function SubscriptionActions({ sub, renewHref }: { sub: Subscription; renewHref: string }) {
  const isPack = sub.sessions_left !== null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sub.status !== "resilie" && (
        <Link href={renewHref} scroll={false} className={cn(small, "border-accent-500 bg-accent-500 text-white shadow-sm shadow-accent-500/20 hover:bg-accent-600")}>
          <RefreshCw className="size-3.5" /> Renouveler
        </Link>
      )}
      {isPack && sub.status === "actif" && (sub.sessions_left ?? 0) > 0 && (
        <form action={consumeSession.bind(null, sub.id)}>
          <button type="submit" className={cn(small, "border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100")} title="Décompter une séance">
            <Minus className="size-3.5" /> Séance
          </button>
        </form>
      )}
      {sub.status === "actif" && (
        <form action={setSubscriptionStatus.bind(null, sub.id, "suspendu")}>
          <button type="submit" className={cn(small, "border-line bg-white text-slate-600 hover:bg-canvas")} title="Suspendre">
            <Pause className="size-3.5" /> <span className="sr-only xl:not-sr-only">Suspendre</span>
          </button>
        </form>
      )}
      {sub.status === "suspendu" && (
        <form action={setSubscriptionStatus.bind(null, sub.id, "actif")}>
          <button type="submit" className={cn(small, "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100")}>
            <Play className="size-3.5" /> Réactiver
          </button>
        </form>
      )}
      {(sub.status === "actif" || sub.status === "suspendu") && (
        <form action={setSubscriptionStatus.bind(null, sub.id, "resilie")}>
          <ConfirmButton message={`Résilier l'abonnement « ${sub.name} » ?`} className="h-8 rounded-lg px-2.5 text-xs">
            <XCircle className="size-3.5" /> <span className="sr-only xl:not-sr-only">Résilier</span>
          </ConfirmButton>
        </form>
      )}
    </div>
  );
}
