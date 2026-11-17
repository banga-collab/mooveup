import type { EntityId } from "./entities";

/** Carte d'accès d'un client : un code unique (QR) par client */
export type MemberCard = {
  id: string;
  contact_id: string;
  /** Code lisible et contenu du QR : « MU-7K3P-9QXA » */
  code: string;
  regenerated_at: string | null;
  created_at: string;
};

/** Comment le client a été identifié à l'accueil */
export type CheckinMethod = "qr" | "recherche" | "rdv" | "manuel";

/** Un passage à l'accueil (autorisé ou forcé par un manager) */
export type Checkin = {
  id: string;
  contact_id: string;
  entity_id: EntityId;
  subscription_id: string | null;
  appointment_id: string | null;
  method: CheckinMethod;
  /** Une séance a été décomptée d'un pack */
  session_used: boolean;
  /** Entrée forcée malgré un refus */
  forced: boolean;
  force_reason: string | null;
  by_id: string | null;
  created_at: string;
};

export type BookingStatus = "nouvelle" | "confirmee" | "annulee";
export type DepositStatus = "aucun" | "a_payer" | "paye" | "accueil";

/** Réservation faite depuis la page publique /reserver */
export type OnlineBooking = {
  id: string;
  /** Référence courte communiquée au client */
  ref: string;
  entity_id: EntityId;
  contact_id: string;
  appointment_id: string;
  item_id: string | null;
  service: string;
  starts_at: string;
  duration_min: number;
  price_mad: number;
  full_name: string;
  phone: string;
  email: string | null;
  status: BookingStatus;
  source: "en_ligne";
  deposit_mad: number;
  deposit_status: DepositStatus;
  created_at: string;
};
