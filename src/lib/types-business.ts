import type { EntityId } from "./entities";
import type { Supplier } from "./types-ops";
import type { Expense } from "./types-finance";

/* ---------- Pièces jointes (photos, documents) ---------- */
export type Attachment = {
  /** data URL (démo) ou lien Storage */
  url: string;
  label: string | null;
  added_at: string;
};

/* ---------- Fournisseurs (table `suppliers` du stock, étendue) ---------- */
export type SupplierFull = Supplier & {
  legal_name?: string | null;
  ice?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  categories?: string[] | null;
  payment_terms?: string | null;
  rib?: string | null;
  documents?: Attachment[] | null;
  active?: boolean | null;
};

/** Dépense rattachée (ou non) à une fiche fournisseur */
export type ExpenseRow = Expense & { supplier_id?: string | null };

export const PAYMENT_TERMS = ["Comptant", "À la livraison", "30 jours", "60 jours", "Fin de mois", "Prélèvement mensuel"] as const;

/* ---------- Collaborations / partenariats ---------- */
export type PartnerKind = "marque" | "influenceur" | "entreprise" | "association" | "media" | "sportif" | "autre";
export type PartnershipNature = "sponsoring" | "echange" | "influence" | "evenement" | "cobranding" | "mecenat" | "autre";
export type PartnershipStatus = "discussion" | "active" | "terminee";

export type Partnership = {
  id: string;
  title: string;
  partner_name: string;
  partner_kind: PartnerKind;
  nature: PartnershipNature;
  status: PartnershipStatus;
  start_date: string | null;
  end_date: string | null;
  entity_ids: EntityId[];
  /** Ce que nous apportons */
  our_part: string | null;
  /** Ce que le partenaire apporte */
  their_part: string | null;
  value_mad: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  /** Instagram, site… */
  social: string | null;
  photos: Attachment[];
  results: string | null;
  notes: string | null;
  reminder_date: string | null;
  reminder_task_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export const PARTNER_KIND_LABEL: Record<PartnerKind, string> = {
  marque: "Marque",
  influenceur: "Influenceur",
  entreprise: "Entreprise",
  association: "Association",
  media: "Média",
  sportif: "Club / sportif",
  autre: "Autre",
};
export const NATURE_LABEL: Record<PartnershipNature, string> = {
  sponsoring: "Sponsoring",
  echange: "Échange de services",
  influence: "Influence",
  evenement: "Événement",
  cobranding: "Co-branding",
  mecenat: "Mécénat",
  autre: "Autre",
};
export const PARTNERSHIP_STATUS_LABEL: Record<PartnershipStatus, string> = { discussion: "En discussion", active: "Active", terminee: "Terminée" };

/* ---------- Réclamations (QR) ---------- */
export type ComplaintType = "panne" | "proprete" | "securite" | "service" | "autre";
export type ComplaintStatus = "nouvelle" | "en_cours" | "resolue";
export type ComplaintPriority = "basse" | "normale" | "haute";

export type ComplaintZone = {
  id: string;
  entity_id: EntityId;
  label: string;
  created_at: string;
};

export type Complaint = {
  id: string;
  ref: string;
  entity_id: EntityId;
  zone_id: string | null;
  zone_label: string | null;
  type: ComplaintType;
  description: string;
  photo_url: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  assigned_to: string | null;
  task_id: string | null;
  /** qr = déposée par un client ; interne = saisie par l'équipe */
  source: "qr" | "interne";
  resolution: string | null;
  taken_at: string | null;
  resolved_at: string | null;
  created_at: string;
};

export const COMPLAINT_TYPES: { id: ComplaintType; label: string; hint: string }[] = [
  { id: "panne", label: "Panne", hint: "Machine, douche, climatisation…" },
  { id: "proprete", label: "Propreté", hint: "Vestiaires, sanitaires, salle…" },
  { id: "securite", label: "Sécurité", hint: "Danger, blessure, objet cassé…" },
  { id: "service", label: "Service", hint: "Accueil, attente, cours…" },
  { id: "autre", label: "Autre", hint: "Toute autre remarque" },
];
export const COMPLAINT_TYPE_LABEL = Object.fromEntries(COMPLAINT_TYPES.map((t) => [t.id, t.label])) as Record<ComplaintType, string>;
export const COMPLAINT_STATUS_LABEL: Record<ComplaintStatus, string> = { nouvelle: "Nouvelle", en_cours: "En cours", resolue: "Résolue" };
export const COMPLAINT_PRIORITY_LABEL: Record<ComplaintPriority, string> = { basse: "Basse", normale: "Normale", haute: "Haute" };
/** Priorité proposée selon le type */
export const DEFAULT_PRIORITY: Record<ComplaintType, ComplaintPriority> = { panne: "haute", proprete: "normale", securite: "haute", service: "normale", autre: "basse" };

/** Zones proposées par défaut selon le type d'établissement */
export const DEFAULT_ZONES: Record<"sport" | "beaute" | "clinique", string[]> = {
  sport: ["Accueil", "Vestiaires", "Plateau musculation", "Salle de cours", "Douches"],
  beaute: ["Accueil", "Cabines", "Hammam", "Sanitaires"],
  clinique: ["Accueil", "Salle d'attente", "Cabines de soin", "Sanitaires"],
};

/** Délai lisible entre deux dates ISO : « 3 h », « 2 j 4 h » */
export function durationLabel(fromIso: string, toIso: string) {
  const min = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h${min % 60 >= 10 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} j${h % 24 ? ` ${h % 24} h` : ""}`;
}
