import type { AppointmentStatus } from "@/lib/types";

/** Couleurs des statuts de rendez-vous (ton du Badge + point) */
export const APPT_TONE: Record<AppointmentStatus, { tone: "amber" | "brand" | "green" | "gray" | "red"; dot: string }> = {
  prevu: { tone: "amber", dot: "bg-amber-400" },
  confirme: { tone: "brand", dot: "bg-brand-500" },
  arrive: { tone: "green", dot: "bg-emerald-500" },
  termine: { tone: "gray", dot: "bg-slate-400" },
  absent: { tone: "red", dot: "bg-red-500" },
  annule: { tone: "gray", dot: "bg-slate-300" },
};

/** Statuts qui libèrent le créneau */
export const FREE_STATUSES: AppointmentStatus[] = ["annule", "absent"];
