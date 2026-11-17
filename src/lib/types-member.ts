import type { EntityId } from "./entities";

/* ---------- Espace adhérent (portail client) ---------- */

/**
 * Compte de connexion d'un adhérent : un compte Supabase Auth (`kind = 'member'`)
 * rattaché à une fiche client. Un adhérent n'est jamais un membre de l'équipe (pas de ligne `profiles`).
 */
export type MemberAccount = {
  id: string;
  /** auth.users.id (en démo : identifiant fixe, cookie « demo_member ») */
  user_id: string;
  /** Fiche client rattachée (null tant que l'e-mail / le téléphone n'est pas vérifié) */
  contact_id: string | null;
  email: string | null;
  phone: string | null;
  last_login_at: string | null;
  created_at: string;
};

export type MemberRequestKind = "renouvellement";
/** a_payer : paiement CMI en attente · accueil : à régler à l'accueil · paye : payé en ligne · traite : fait par l'accueil */
export type MemberRequestStatus = "a_payer" | "accueil" | "paye" | "traite" | "annule";

/** Demande faite depuis l'espace adhérent (renouvellement d'abonnement) */
export type MemberRequest = {
  id: string;
  /** Référence courte : « A-7K2P9 » (aussi l'identifiant de commande CMI) */
  ref: string;
  kind: MemberRequestKind;
  contact_id: string;
  entity_id: EntityId;
  subscription_id: string | null;
  item_id: string | null;
  label: string;
  amount_mad: number;
  status: MemberRequestStatus;
  task_id: string | null;
  created_at: string;
};
