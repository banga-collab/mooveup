import type { EntityId } from "./entities";

/* ---------- Fidélité (programme commun aux 7 établissements) ---------- */

export type LedgerKind = "gain" | "utilisation" | "parrainage" | "ajustement" | "annulation";

/** Mouvement de points (positif = crédit, négatif = débit) */
export type LedgerRow = {
  id: string;
  contact_id: string;
  /** Établissement où les points ont été gagnés / utilisés */
  entity_id: EntityId;
  points: number;
  kind: LedgerKind;
  sale_id: string | null;
  /** Utilisation : bon de réduction créé */
  voucher_code: string | null;
  value_mad: number | null;
  voucher_used: boolean;
  note: string | null;
  author_id: string | null;
  created_at: string;
};

export type GiftCardStatus = "active" | "epuisee" | "expiree" | "annulee";

export type GiftCard = {
  id: string;
  code: string;
  amount_mad: number;
  balance_mad: number;
  buyer_contact_id: string | null;
  buyer_name: string | null;
  beneficiary_contact_id: string | null;
  beneficiary_name: string | null;
  /** Établissements où la carte est valable (vide = tous) */
  entity_ids: EntityId[];
  /** Établissement qui a vendu la carte */
  entity_id: EntityId;
  expires_on: string;
  status: GiftCardStatus;
  message: string | null;
  created_by: string | null;
  created_at: string;
};

export type GiftCardUse = {
  id: string;
  card_id: string;
  entity_id: EntityId;
  amount_mad: number;
  note: string | null;
  author_id: string | null;
  created_at: string;
};

export type ReferralStatus = "en_attente" | "valide";

export type Referral = {
  id: string;
  referrer_id: string;
  referee_id: string;
  entity_id: EntityId | null;
  status: ReferralStatus;
  bonus_points: number;
  rewarded_at: string | null;
  created_by: string | null;
  created_at: string;
};

/* ---------- Rappels automatiques ---------- */

export type AutomationKey = "rdv_veille" | "rdv_confirmation" | "abo_j7" | "abo_j1" | "inactif_21" | "anniversaire" | "avis" | "impaye";

/** Réglage d'une règle (le reste est défini dans le code) */
export type AutomationRule = {
  id: AutomationKey;
  enabled: boolean;
  message: string;
  updated_by: string | null;
  updated_at: string;
};

export type MessageStatus = "envoye" | "simule" | "echec";
export type MessageMode = "api" | "lien" | "demo";

export type MessageLog = {
  id: string;
  rule_key: AutomationKey | null;
  contact_id: string | null;
  entity_id: EntityId | null;
  phone: string | null;
  body: string;
  status: MessageStatus;
  mode: MessageMode;
  error: string | null;
  /** Objet à l'origine de l'envoi (rendez-vous, abonnement, vente…) */
  ref_id: string | null;
  /** Jour d'envoi AAAA-MM-JJ (Agadir) pour éviter les doublons */
  day_key: string;
  wa_message_id: string | null;
  author_id: string | null;
  created_at: string;
};

/* ---------- Avis clients ---------- */

export type Review = {
  id: string;
  token: string;
  contact_id: string;
  entity_id: EntityId;
  appointment_id: string | null;
  sale_id: string | null;
  service: string | null;
  rating: number | null;
  comment: string | null;
  answered_at: string | null;
  /** Avis négatif traité par le manager */
  handled: boolean;
  handled_at: string | null;
  handled_by: string | null;
  task_id: string | null;
  created_at: string;
};
