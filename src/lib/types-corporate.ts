import type { EntityId } from "./entities";
import type { PayMethod } from "./types";

/** Entreprises partenaires : conventions salariés et facturation mensuelle groupée */

export type CompanyStatus = "active" | "suspendue" | "terminee";
/** remise = % de réduction sur abonnements et prestations ; forfait = montant fixe par salarié et par mois */
export type ConventionKind = "remise" | "forfait";
/** Prise en charge par l'entreprise : un pourcentage du montant dû ou un montant fixe par salarié et par mois */
export type ShareMode = "pct" | "fixe";

export type Company = {
  id: string;
  name: string;
  /** Secteur libre (Hôtellerie, Banque…) */
  sector: string | null;
  ice: string | null;
  address: string | null;
  hr_name: string | null;
  hr_phone: string | null;
  hr_email: string | null;
  /** Établissements couverts par la convention */
  entity_ids: EntityId[];
  /** Établissement de rattachement (sécurité) : le premier couvert */
  entity_id: EntityId;
  convention: ConventionKind;
  /** Remise en % (convention « remise ») */
  discount_pct: number;
  /** Forfait par salarié et par mois en MAD (convention « forfait ») */
  flat_mad: number;
  share_mode: ShareMode;
  /** % payé par l'entreprise (share_mode = pct) ou MAD par salarié et par mois (fixe) */
  share_value: number;
  /** Délai de paiement des factures (jours) */
  payment_days: number;
  start_date: string;
  end_date: string | null;
  status: CompanyStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export type CompanyEmployee = {
  id: string;
  company_id: string;
  contact_id: string;
  matricule: string | null;
  active: boolean;
  joined_on: string;
  left_on: string | null;
  created_at: string;
};

export type CompanyInvoiceStatus = "a_envoyer" | "envoyee" | "payee" | "annulee";

export type CompanyInvoice = {
  id: string;
  /** MU-ENT-AAAA-0001 */
  number: string;
  company_id: string;
  entity_id: EntityId;
  /** Mois facturé AAAA-MM */
  month: string;
  issued_on: string;
  due_on: string;
  /** Part entreprise TTC */
  total_mad: number;
  /** Montant net consommé par les salariés (part entreprise + part salariés) */
  net_mad: number;
  employees_count: number;
  status: CompanyInvoiceStatus;
  sent_at: string | null;
  paid_on: string | null;
  paid_method: PayMethod | null;
  paid_ref: string | null;
  reminders_count: number;
  last_reminder_at: string | null;
  created_by: string | null;
  created_at: string;
};

export type CompanyInvoiceLine = {
  id: string;
  invoice_id: string;
  employee_id: string | null;
  contact_id: string | null;
  label: string;
  matricule: string | null;
  detail: string;
  gross_mad: number;
  discount_mad: number;
  net_mad: number;
  company_mad: number;
  employee_mad: number;
};

export type CompanyEventKind = "creation" | "convention" | "salarie" | "facture" | "envoi" | "paiement" | "relance" | "note";

export type CompanyEvent = {
  id: string;
  company_id: string;
  kind: CompanyEventKind;
  body: string;
  author_id: string | null;
  created_at: string;
};

export const COMPANY_STATUS_LABEL: Record<CompanyStatus, string> = { active: "Active", suspendue: "Suspendue", terminee: "Terminée" };
export const INVOICE_STATUS_LABEL: Record<CompanyInvoiceStatus, string> = { a_envoyer: "À envoyer", envoyee: "Envoyée", payee: "Payée", annulee: "Annulée" };
export const CORPORATE_TAG = "Entreprise partenaire";
