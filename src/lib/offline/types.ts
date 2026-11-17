/**
 * Mode hors ligne de l'accueil : instantané des droits d'accès et file d'entrées en attente.
 * Aucune donnée médicale n'est stockée sur l'appareil.
 */
import type { EntityId } from "@/lib/entities";
import type { AccessCode } from "@/lib/access";

/** Droit d'accès d'un client à un établissement, calculé au moment de l'instantané */
export type SnapVerdict = {
  e: EntityId;
  ok: boolean;
  code: AccessCode;
  reason: string;
  plan: string | null;
  /** Fin de l'abonnement ou du pack (AAAA-MM-JJ) */
  until: string | null;
  /** Séances restantes (pack) */
  sessions: number | null;
};

export type SnapMember = {
  id: string;
  name: string;
  /** Chiffres du téléphone au format 06… */
  phone: string;
  /** Code de carte « MU-XXXX-XXXX » */
  code: string | null;
  ents: EntityId[];
  v: SnapVerdict[];
};

export type AccessSnapshot = {
  /** Date de téléchargement (ISO) */
  at: string;
  /** Jour de calcul des droits (AAAA-MM-JJ, Agadir) */
  day: string;
  desk: string;
  ids: EntityId[];
  members: SnapMember[];
};

/** Entrée scannée sans réseau, envoyée au retour de la connexion */
export type QueuedCheckin = {
  /** Identifiant local (évite les doublons à l'envoi) */
  id: string;
  contact_id: string;
  name: string;
  entity_id: EntityId;
  method: "qr" | "recherche";
  /** Heure réelle du passage (ISO) */
  at: string;
  desk: string;
};

export type ImportResult = {
  /** Identifiants traités (importés ou ignorés) à retirer de la file */
  done: string[];
  imported: number;
  /** Déjà enregistrés (doublons) */
  skipped: number;
  failed: number;
};
