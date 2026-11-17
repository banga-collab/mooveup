import type { EntityId } from "./entities";

export type Role = "direction" | "manager" | "reception" | "staff";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  /** Établissements accessibles (vide = tous, pour la direction) */
  entity_ids: EntityId[];
  job_title: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
};

export type ContactStatus = "prospect" | "client" | "ancien";

export type Contact = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  sex: "H" | "F" | null;
  birth_date: string | null;
  city: string | null;
  source: LeadSource | null;
  tags: string[];
  /** Établissements fréquentés */
  entity_ids: EntityId[];
  status: ContactStatus;
  /** Pour Moov'Up Kids : nom du parent */
  guardian_name: string | null;
  notes: string | null;
  owner_id: string | null;
  whatsapp_optin: boolean;
  created_at: string;
};

export type LeadStage = "nouveau" | "contacte" | "essai" | "offre" | "gagne" | "perdu";
export type LeadSource = "instagram" | "facebook" | "whatsapp" | "passage" | "telephone" | "parrainage" | "site" | "google";

export type Lead = {
  id: string;
  contact_id: string;
  entity_id: EntityId;
  interest: string;
  stage: LeadStage;
  source: LeadSource;
  value_mad: number;
  owner_id: string | null;
  next_action_on: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type CatalogKind = "abonnement" | "prestation" | "produit" | "pack";

export type CatalogItem = {
  id: string;
  entity_id: EntityId;
  kind: CatalogKind;
  name: string;
  category: string;
  price_mad: number;
  /** Prestations : durée du rendez-vous */
  duration_min: number | null;
  /** Abonnements : durée de validité */
  duration_days: number | null;
  /** Packs : nombre de séances */
  sessions_count: number | null;
  stock: number | null;
  active: boolean;
  created_at: string;
};

export type SubscriptionStatus = "actif" | "suspendu" | "expire" | "resilie";

export type Subscription = {
  id: string;
  contact_id: string;
  entity_id: EntityId;
  item_id: string | null;
  name: string;
  price_mad: number;
  start_date: string;
  end_date: string;
  status: SubscriptionStatus;
  auto_renew: boolean;
  /** Packs de séances : séances restantes */
  sessions_left: number | null;
  created_at: string;
};

export type AppointmentStatus = "prevu" | "confirme" | "arrive" | "termine" | "absent" | "annule";

export type Appointment = {
  id: string;
  entity_id: EntityId;
  contact_id: string;
  item_id: string | null;
  service: string;
  staff_id: string | null;
  starts_at: string;
  duration_min: number;
  status: AppointmentStatus;
  room: string | null;
  price_mad: number;
  notes: string | null;
  created_at: string;
};

export type PayMethod = "especes" | "carte" | "virement" | "cheque" | "en_ligne";
export type SaleStatus = "payee" | "partielle" | "impayee" | "remboursee";

export type Sale = {
  id: string;
  number: string;
  entity_id: EntityId;
  contact_id: string | null;
  total_mad: number;
  discount_mad: number;
  paid_mad: number;
  method: PayMethod;
  status: SaleStatus;
  sold_by: string | null;
  sold_at: string;
  notes: string | null;
  created_at: string;
};

export type SaleItem = {
  id: string;
  sale_id: string;
  item_id: string | null;
  label: string;
  qty: number;
  unit_price_mad: number;
};

export type ActivityKind = "note" | "appel" | "whatsapp" | "email" | "visite" | "rdv" | "vente" | "statut";

export type Activity = {
  id: string;
  contact_id: string;
  entity_id: EntityId | null;
  kind: ActivityKind;
  body: string;
  author_id: string | null;
  created_at: string;
};

export type TaskPriority = "basse" | "normale" | "haute";

export type Task = {
  id: string;
  title: string;
  contact_id: string | null;
  lead_id: string | null;
  entity_id: EntityId | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: TaskPriority;
  done: boolean;
  created_by: string | null;
  created_at: string;
};

export type CampaignChannel = "whatsapp" | "sms" | "email";
export type CampaignStatus = "brouillon" | "programmee" | "envoyee";

export type CampaignSegment = {
  entity_ids: EntityId[];
  statuses: ContactStatus[];
  tags: string[];
  /** Abonnement qui expire dans N jours */
  expiring_days: number | null;
  /** Sans visite / achat depuis N jours */
  inactive_days: number | null;
  sex: "H" | "F" | null;
};

export type Campaign = {
  id: string;
  name: string;
  channel: CampaignChannel;
  segment: CampaignSegment;
  message: string;
  status: CampaignStatus;
  scheduled_at: string | null;
  sent_at: string | null;
  recipients_count: number;
  created_by: string | null;
  created_at: string;
};
