import Link from "next/link";
import type { ReactNode } from "react";
import { Ban, CheckCheck, CircleCheck, DoorOpen, Pencil, RotateCcw, ShoppingCart, Trash2, UserX } from "lucide-react";
import { deleteAppointment, setAppointmentStatus } from "@/actions/agenda";
import type { AppointmentStatus } from "@/lib/types";
import { ConfirmButton } from "@/components/confirm-button";
import { cn } from "@/lib/utils";

/** Couleurs des statuts de rendez-vous */
export const APPT_TONE: Record<AppointmentStatus, { pill: string; dot: string }> = {
  prevu: { pill: "bg-amber-50 text-amber-700 ring-amber-100", dot: "bg-amber-400" },
  confirme: { pill: "bg-brand-50 text-brand-600 ring-brand-100", dot: "bg-brand-500" },
  arrive: { pill: "bg-emerald-50 text-emerald-700 ring-emerald-100", dot: "bg-emerald-500" },
  termine: { pill: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
  absent: { pill: "bg-red-50 text-red-600 ring-red-100", dot: "bg-red-500" },
  annule: { pill: "bg-slate-50 text-slate-400 ring-slate-200", dot: "bg-slate-300" },
};

type Quick = { to: AppointmentStatus; label: string; icon: ReactNode; when: AppointmentStatus[]; cls: string };

const QUICK: Quick[] = [
  { to: "confirme", label: "Confirmer", icon: <CircleCheck className="size-4" />, when: ["prevu"], cls: "border-brand-200 bg-brand-50 text-brand-600 hover:bg-brand-100" },
  { to: "arrive", label: "Arrivé", icon: <DoorOpen className="size-4" />, when: ["prevu", "confirme"], cls: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" },
  { to: "termine", label: "Terminé", icon: <CheckCheck className="size-4" />, when: ["prevu", "confirme", "arrive"], cls: "border-slate-200 bg-white text-slate-700 hover:bg-canvas" },
  { to: "absent", label: "Absent", icon: <UserX className="size-4" />, when: ["prevu", "confirme"], cls: "border-red-200 bg-white text-red-600 hover:bg-red-50" },
  { to: "annule", label: "Annuler", icon: <Ban className="size-4" />, when: ["prevu", "confirme", "arrive"], cls: "border-slate-200 bg-white text-slate-500 hover:bg-canvas" },
  { to: "prevu", label: "Remettre prévu", icon: <RotateCcw className="size-4" />, when: ["absent", "annule"], cls: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" },
];

const small = "inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition active:scale-[.98] whitespace-nowrap";

/** Actions rapides d'un rendez-vous (statut, encaissement, modification, suppression) */
export function AppointmentActions({ id, status, compact = false }: { id: string; status: AppointmentStatus; compact?: boolean }) {
  const quick = QUICK.filter((q) => q.when.includes(status));
  const canCash = status === "arrive" || status === "termine";
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", compact && "gap-1")}>
      {canCash && (
        <Link href={`/caisse?rdv=${id}`} className={cn(small, "border-accent-500 bg-accent-500 text-white shadow-sm shadow-accent-500/20 hover:bg-accent-600")}>
          <ShoppingCart className="size-4" /> Encaisser
        </Link>
      )}
      {quick.map((q) => (
        <form key={q.to} action={setAppointmentStatus.bind(null, id, q.to)}>
          <button type="submit" className={cn(small, q.cls)} title={q.label}>
            {q.icon}
            <span className={cn(compact && "sr-only sm:not-sr-only")}>{q.label}</span>
          </button>
        </form>
      ))}
      <Link href={`/agenda/${id}/modifier`} className={cn(small, "border-line bg-white text-slate-600 hover:bg-canvas")} title="Modifier">
        <Pencil className="size-4" />
        <span className={cn(compact && "sr-only")}>Modifier</span>
      </Link>
      <form action={deleteAppointment.bind(null, id)}>
        <ConfirmButton message="Supprimer définitivement ce rendez-vous ?" className="h-9 rounded-xl px-3 text-xs">
          <Trash2 className="size-4" />
          <span className={cn(compact && "sr-only")}>Supprimer</span>
        </ConfirmButton>
      </form>
    </div>
  );
}

