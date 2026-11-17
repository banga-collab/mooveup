"use client";

import Link from "next/link";
import { createContext, useContext, useOptimistic, useTransition, type ReactNode } from "react";
import { Ban, CalendarX2, CheckCheck, CircleCheck, DoorOpen, Pencil, RotateCcw, ShoppingCart, Trash2, UserX } from "lucide-react";
import { deleteAppointment } from "@/actions/agenda";
import { cancelSeries, restoreStatuses, setStatusQuick } from "@/actions/agenda-plus";
import type { AppointmentStatus } from "@/lib/types";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, buttonClass } from "@/components/ui";
import { APPT_STATUS_LABEL, cn } from "@/lib/utils";
import { APPT_TONE } from "./status";
import { notify } from "./undo-toast";

type Quick = { to: AppointmentStatus; label: string; icon: ReactNode; when: AppointmentStatus[]; main?: boolean };

const QUICK: Quick[] = [
  { to: "confirme", label: "Confirmer", icon: <CircleCheck />, when: ["prevu"], main: true },
  { to: "arrive", label: "Arrivé", icon: <DoorOpen />, when: ["prevu", "confirme"], main: true },
  { to: "termine", label: "Terminé", icon: <CheckCheck />, when: ["prevu", "confirme", "arrive"] },
  { to: "absent", label: "Absent", icon: <UserX />, when: ["prevu", "confirme"] },
  { to: "annule", label: "Annuler", icon: <Ban />, when: ["prevu", "confirme", "arrive"] },
  { to: "prevu", label: "Remettre prévu", icon: <RotateCcw />, when: ["absent", "annule"] },
];

/* ---------- Statut optimiste partagé (badge + boutons d'un même rendez-vous) ---------- */
type Ctx = { status: AppointmentStatus; change: (to: AppointmentStatus) => void; pending: boolean };
const StatusCtx = createContext<Ctx | null>(null);

function useStatusState(id: string, status: AppointmentStatus): Ctx {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, start] = useTransition();
  const change = (to: AppointmentStatus) =>
    start(async () => {
      setOptimistic(to);
      const r = await setStatusQuick(id, to);
      if (!r.ok) notify({ m: r.error, t: "error" });
      else
        notify({
          m: r.message,
          undo: async () => {
            const u = await restoreStatuses(r.prev);
            if (!u.ok) notify({ m: u.error, t: "error" });
          },
        });
    });
  return { status: optimistic, change, pending };
}

/** Partage le statut optimiste d'un rendez-vous entre `LiveStatusBadge` et `AppointmentActions` */
export function ApptStatusScope({ id, status, children }: { id: string; status: AppointmentStatus; children: ReactNode }) {
  const value = useStatusState(id, status);
  return <StatusCtx.Provider value={value}>{children}</StatusCtx.Provider>;
}

/** Badge de statut, mis à jour instantanément dans un `ApptStatusScope` */
export function LiveStatusBadge({ status }: { status: AppointmentStatus }) {
  const ctx = useContext(StatusCtx);
  const s = ctx?.status ?? status;
  return <Badge tone={APPT_TONE[s].tone}>{APPT_STATUS_LABEL[s]}</Badge>;
}

/** Actions rapides d'un rendez-vous (statut instantané, encaissement, série, modification, suppression) */
export function AppointmentActions({ id, status, compact = false, seriesId = null }: { id: string; status: AppointmentStatus; compact?: boolean; seriesId?: string | null }) {
  const own = useStatusState(id, status);
  const ctx = useContext(StatusCtx) ?? own;
  const [seriesPending, startSeries] = useTransition();
  const cur = ctx.status;
  const quick = QUICK.filter((q) => q.when.includes(cur));
  const canCash = cur === "arrive" || cur === "termine";
  const mainTo = canCash ? null : quick.find((q) => q.main)?.to;

  const cancelAll = () =>
    startSeries(async () => {
      const r = await cancelSeries(id);
      if (!r.ok) notify({ m: r.error, t: "error" });
      else
        notify({
          m: r.message,
          undo: async () => {
            const u = await restoreStatuses(r.prev.snaps, r.prev.seriesId);
            if (!u.ok) notify({ m: u.error, t: "error" });
          },
        });
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-busy={ctx.pending || seriesPending}>
      {canCash && (
        <Link href={`/caisse?rdv=${id}`} className={buttonClass("primary")}>
          <ShoppingCart /> Encaisser
        </Link>
      )}
      {quick.map((q) => (
        <button
          key={q.to}
          type="button"
          onClick={() => ctx.change(q.to)}
          className={buttonClass(q.to === mainTo ? "brand" : "secondary", "px-3")}
          title={q.label}
          aria-label={q.label}
        >
          {q.icon}
          <span className={cn(compact && "sr-only sm:not-sr-only")}>{q.label}</span>
        </button>
      ))}
      {seriesId && (cur === "prevu" || cur === "confirme") && (
        <button type="button" onClick={cancelAll} disabled={seriesPending} className={buttonClass("ghost", "px-3")} title="Annuler cette séance et toutes les suivantes">
          <CalendarX2 />
          <span className={cn(compact && "sr-only sm:not-sr-only")}>Annuler la série</span>
        </button>
      )}
      <span className="ml-auto flex items-center gap-1">
        <Link href={`/agenda/${id}/modifier`} className={buttonClass("ghost", "w-9 px-0")} title="Modifier" aria-label="Modifier le rendez-vous">
          <Pencil />
        </Link>
        <form action={deleteAppointment.bind(null, id)}>
          <ConfirmButton message="Supprimer définitivement ce rendez-vous ?" className="w-9 border-transparent px-0">
            <Trash2 />
            <span className="sr-only">Supprimer le rendez-vous</span>
          </ConfirmButton>
        </form>
      </span>
    </div>
  );
}
