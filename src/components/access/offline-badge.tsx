"use client";

import { CloudOff, Loader2, RefreshCw } from "lucide-react";
import type { OfflineDesk } from "@/lib/offline/use-offline-desk";
import { useT } from "@/lib/i18n/client";
import { cn, fmtTime } from "@/lib/utils";

/** « Hors ligne · 3 en attente » ; bouton pour renvoyer la file à la main */
export function OfflineBadge({ state, large }: { state: OfflineDesk; large?: boolean }) {
  const t = useT();
  const { online, pending, syncing, snapAt } = state;
  if (online && !pending) return null;
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border font-medium",
        large ? "h-12 px-4 text-base" : "h-9 px-3 text-[13px]",
        online ? "border-line bg-white text-slate-700" : "border-amber-200 bg-amber-50 text-amber-800",
      )}
      title={snapAt ? t("acces.offline.snap_at", { time: fmtTime(snapAt) }) : t("acces.offline.nosnap")}
    >
      {syncing ? <Loader2 className="size-4 animate-spin" /> : <CloudOff className={cn("size-4", online ? "text-slate-400" : "text-amber-600")} />}
      <span className="whitespace-nowrap">
        {online ? t("acces.offline.sending") : t("acces.offline.badge")}
        {pending > 0 && ` · ${t("acces.offline.pending", { n: pending })}`}
      </span>
      {online && pending > 0 && !syncing && (
        <button type="button" onClick={() => void state.sync()} className="-me-1 grid size-7 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-ink" aria-label={t("acces.offline.send_now")}>
          <RefreshCw className="size-3.5" />
        </button>
      )}
    </span>
  );
}
