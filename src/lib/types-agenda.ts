import type { EntityId } from "./entities";
import type { Appointment, AppointmentStatus, PayMethod } from "./types";

/** Fréquence d'une série de rendez-vous */
export type RepeatFreq = "weekly" | "biweekly" | "monthly";

export const REPEAT_LABEL: Record<RepeatFreq, string> = {
  weekly: "Chaque semaine",
  biweekly: "Toutes les 2 semaines",
  monthly: "Chaque mois",
};

/** Série de rendez-vous récurrents (table `appointment_series`) */
export type AppointmentSeries = {
  id: string;
  entity_id: EntityId;
  contact_id: string;
  item_id: string | null;
  service: string;
  staff_id: string | null;
  freq: RepeatFreq;
  /** Premier jour AAAA-MM-JJ */
  start_date: string;
  /** Heure HH:MM à Agadir */
  time: string;
  duration_min: number;
  price_mad: number;
  room: string | null;
  notes: string | null;
  /** Fin : jusqu'à cette date… */
  until_date: string | null;
  /** …ou N séances */
  occurrences: number | null;
  /** Date d'annulation de la série (null = active) */
  cancelled_at: string | null;
  created_by: string | null;
  created_at: string;
};

/** Rendez-vous éventuellement rattaché à une série */
export type SeriesAppointment = Appointment & { series_id?: string | null };

/** Valeurs précédentes d'un rendez-vous (pour l'annulation d'un déplacement) */
export type ApptSnapshot = { id: string; starts_at: string; staff_id: string | null; duration_min: number };

/** Statuts précédents (pour l'annulation d'un changement de statut groupé) */
export type StatusSnapshot = { id: string; status: AppointmentStatus };

/** Résultat d'une action rapide de l'agenda */
export type QuickResult<T = undefined> = { ok: true; prev: T; message: string } | { ok: false; error: string };

/* ---------- Accueil express ---------- */
export type ExpressMode = "rdv" | "abonnement" | "produit";

export type ExpressLine = { item_id: string; qty: number };

export type ExpressInput = {
  entity_id: EntityId;
  /** Client existant… */
  contact_id: string | null;
  /** …ou nouveau client */
  new_name: string | null;
  new_phone: string | null;
  mode: ExpressMode;
  lines: ExpressLine[];
  /** Rendez-vous (mode « rdv ») */
  rdv: { date: string; time: string; staff_id: string | null } | null;
  method: PayMethod;
  /** Montant encaissé maintenant */
  paid: number;
};
