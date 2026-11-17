/**
 * Dossiers clinique / institut / barbier et Moov'Up Kids.
 * Types, libellés, modèles de consentement et règles d'accès.
 */
import type { EntityId } from "./entities";
import type { Profile } from "./types";

/* ---------- Accès ---------- */

/** Établissements qui tiennent un dossier de soins */
export const CARE_ENTITIES: EntityId[] = ["clinic", "institut", "evolve"];
/** Établissements dont l'équipe peut voir les données médicales */
export const MEDICAL_ENTITIES: EntityId[] = ["clinic", "institut"];

/** Données médicales : direction, ou membre (manager, équipe, réception) de la clinique ou de l'institut */
export function canSeeMedical(p: Profile) {
  return p.role === "direction" || !p.entity_ids?.length || p.entity_ids.some((e) => MEDICAL_ENTITIES.includes(e));
}

/* ---------- Fiche santé-beauté ---------- */

export type SkinType = "normale" | "seche" | "grasse" | "mixte" | "sensible";
export type Pregnancy = "non" | "enceinte" | "allaitement";

export type CareProfile = {
  id: string;
  contact_id: string;
  skin_type: SkinType | null;
  /** Phototype de Fitzpatrick 1 à 6 (laser) */
  phototype: number | null;
  pregnancy: Pregnancy;
  contraindications: string | null;
  allergies: string | null;
  treatments: string | null;
  history: string | null;
  notes: string | null;
  updated_by: string | null;
  updated_at: string;
  created_at: string;
};

export const SKIN_LABEL: Record<SkinType, string> = { normale: "Normale", seche: "Sèche", grasse: "Grasse", mixte: "Mixte", sensible: "Sensible" };
export const PREGNANCY_LABEL: Record<Pregnancy, string> = { non: "Non", enceinte: "Enceinte", allaitement: "Allaitement" };
export const PHOTOTYPES = [1, 2, 3, 4, 5, 6] as const;

/** Points d'alerte d'une fiche (contre-indications, allergies, grossesse) */
export function careAlerts(p: CareProfile | null | undefined): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.contraindications) out.push(`Contre-indication : ${p.contraindications}`);
  if (p.allergies) out.push(`Allergie : ${p.allergies}`);
  if (p.pregnancy !== "non") out.push(PREGNANCY_LABEL[p.pregnancy]);
  return out;
}

/* ---------- Fiches techniques ---------- */

export type TreatmentKind = "laser" | "injection" | "peeling" | "soin" | "epilation" | "autre";

export type TreatmentSettings = {
  /** Laser */
  fluence?: string | null;
  wavelength?: string | null;
  spot?: string | null;
  /** Injection */
  quantity?: string | null;
};

export type TreatmentRecord = {
  id: string;
  entity_id: EntityId;
  contact_id: string;
  appointment_id: string | null;
  performed_at: string;
  kind: TreatmentKind;
  service: string;
  practitioner_id: string | null;
  zone: string | null;
  product: string | null;
  lot: string | null;
  settings: TreatmentSettings;
  observations: string | null;
  side_effects: string | null;
  /** Prochaine séance / contrôle conseillé */
  next_on: string | null;
  created_by: string | null;
  created_at: string;
};

export const TREATMENT_LABEL: Record<TreatmentKind, string> = {
  laser: "Laser",
  injection: "Injection",
  peeling: "Peeling",
  soin: "Soin",
  epilation: "Épilation",
  autre: "Autre",
};

/** Devine le type de séance à partir du nom de la prestation */
export function guessKind(service: string): TreatmentKind {
  const s = service.toLowerCase();
  if (s.includes("laser")) return "laser";
  if (s.includes("injection") || s.includes("toxine") || s.includes("hyaluron") || s.includes("méso")) return "injection";
  if (s.includes("peeling")) return "peeling";
  if (s.includes("épilation") || s.includes("epilation")) return "epilation";
  if (s.includes("soin") || s.includes("hammam") || s.includes("massage")) return "soin";
  return "autre";
}

/** Prestations qui appellent une fiche technique (pas le hammam, la coiffure…) */
export function needsRecord(service: string) {
  if (/consultation/i.test(service)) return true;
  return !/hammam|massage|manucure|pédicure|brushing|coupe|barbe|coiffure/i.test(service) && guessKind(service) !== "autre";
}

export const ZONES = ["Visage", "Front", "Pattes d'oie", "Lèvres", "Sillons", "Cou", "Aisselles", "Bras", "Maillot", "Jambes", "Dos", "Ventre", "Barbe"];

/* ---------- Consentements ---------- */

export type ConsentTemplate = "laser" | "injection" | "peeling" | "epilation" | "soin";

export type Consent = {
  id: string;
  entity_id: EntityId;
  contact_id: string;
  template: ConsentTemplate;
  title: string;
  body: string;
  /** Signature dessinée (image PNG en data URL) */
  signature: string;
  signed_by: string;
  signed_at: string;
  collected_by: string | null;
  created_at: string;
};

export const CONSENT_TEMPLATES: Record<ConsentTemplate, { title: string; body: string }> = {
  laser: {
    title: "Consentement éclairé : traitement laser",
    body:
      "Je reconnais avoir été informé(e) du déroulement des séances laser, de leurs effets attendus et des effets secondaires possibles (rougeurs, gonflement, sensation de chaleur, rares modifications de pigmentation).\n" +
      "J'ai déclaré mes traitements en cours, ma grossesse éventuelle et toute exposition solaire récente. Je m'engage à éviter le soleil et les UV avant et après les séances et à appliquer une protection solaire.\n" +
      "Je sais que plusieurs séances sont nécessaires et que le résultat varie selon les personnes. J'accepte le traitement en connaissance de cause.",
  },
  injection: {
    title: "Consentement éclairé : injections esthétiques",
    body:
      "Le médecin m'a expliqué le produit injecté, la zone traitée, le résultat attendu et sa durée, ainsi que les effets secondaires possibles (rougeurs, œdème, ecchymoses, asymétrie temporaire, rares complications).\n" +
      "J'ai déclaré mes allergies, traitements (anticoagulants notamment), antécédents et une éventuelle grossesse ou allaitement.\n" +
      "Je m'engage à respecter les consignes après injection (pas de sport ni de massage de la zone pendant 24 h, pas de sauna pendant 48 h). J'accepte l'injection en connaissance de cause.",
  },
  peeling: {
    title: "Consentement éclairé : peeling",
    body:
      "J'ai été informé(e) du type de peeling réalisé, de la desquamation attendue les jours suivants et des effets possibles (rougeurs, tiraillements, sensibilité, rares troubles pigmentaires).\n" +
      "Je m'engage à suivre les soins conseillés, à ne pas arracher les peaux et à me protéger du soleil pendant toute la durée de cicatrisation. J'accepte le soin en connaissance de cause.",
  },
  epilation: {
    title: "Consentement : épilation",
    body:
      "J'ai été informé(e) de la méthode d'épilation utilisée et des réactions possibles (rougeurs, petits boutons, irritation passagère).\n" +
      "J'ai signalé toute allergie, prise de traitement photosensibilisant ou fragilité de la peau. J'accepte la prestation.",
  },
  soin: {
    title: "Consentement : soin esthétique",
    body:
      "J'ai été informé(e) du déroulement du soin, des produits utilisés et des réactions possibles. J'ai signalé mes allergies et mes éventuelles contre-indications.\n" +
      "J'accepte la réalisation du soin et l'utilisation de mes informations dans mon dossier, réservé à l'équipe de l'établissement.",
  },
};

export const CONSENT_LABEL: Record<ConsentTemplate, string> = { laser: "Laser", injection: "Injections", peeling: "Peeling", epilation: "Épilation", soin: "Soin général" };

/** Consentement attendu pour un type de séance */
export function consentFor(kind: TreatmentKind): ConsentTemplate | null {
  if (kind === "laser" || kind === "injection" || kind === "peeling" || kind === "epilation") return kind;
  return null;
}

/* ---------- Photos ---------- */

export type CarePhoto = {
  id: string;
  entity_id: EntityId;
  contact_id: string;
  kind: "avant" | "apres";
  zone: string;
  taken_on: string;
  url: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

/* ---------- Moov'Up Kids ---------- */

export type KidsGroup = {
  id: string;
  entity_id: EntityId;
  name: string;
  activity: string;
  age_min: number;
  age_max: number;
  /** Jours : 1 = lundi … 7 = dimanche */
  days: number[];
  start_time: string;
  end_time: string;
  coach_id: string | null;
  capacity: number;
  location: string | null;
  active: boolean;
  created_at: string;
};

export type KidsMember = {
  id: string;
  entity_id: EntityId;
  group_id: string;
  contact_id: string;
  status: "inscrit" | "attente";
  joined_on: string;
  created_at: string;
};

/** Fiche enfant : parents et autorisations */
export type KidsChild = {
  id: string;
  entity_id: EntityId;
  contact_id: string;
  parent1_name: string | null;
  parent1_phone: string | null;
  parent1_relation: string | null;
  parent2_name: string | null;
  parent2_phone: string | null;
  parent2_relation: string | null;
  allow_leave_alone: boolean;
  allow_photos: boolean;
  allow_medical: boolean;
  pickup_names: string | null;
  health_notes: string | null;
  updated_at: string;
  created_at: string;
};

export type AttendanceStatus = "present" | "absent" | "excuse";

export type KidsAttendance = {
  id: string;
  entity_id: EntityId;
  group_id: string;
  contact_id: string;
  date: string;
  status: AttendanceStatus;
  marked_by: string | null;
  created_at: string;
};

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = { present: "Présent", absent: "Absent", excuse: "Excusé" };

export const DAY_SHORT = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Jour ISO (1 = lundi … 7 = dimanche) d'une date AAAA-MM-JJ */
export function isoDay(date: string) {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function daysLabel(days: number[]) {
  return [...days].sort((a, b) => a - b).map((d) => DAY_SHORT[d]).join(", ");
}

/** Taux de présence (excusé exclu du calcul) */
export function attendanceRate(rows: { status: AttendanceStatus }[]) {
  const counted = rows.filter((r) => r.status !== "excuse");
  if (!counted.length) return null;
  return Math.round((counted.filter((r) => r.status === "present").length / counted.length) * 100);
}

export const KIDS_ACTIVITIES = ["Natation enfants", "Football école", "Gym enfants", "Arts martiaux", "Danse", "Multisport"];
