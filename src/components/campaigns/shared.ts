/** Outils communs (client + serveur) pour les campagnes */
import { ENTITY_IDS, type EntityId } from "@/lib/entities";
import type { CampaignChannel, CampaignSegment, CampaignStatus, ContactStatus } from "@/lib/types";
import { CONTACT_STATUS_LABEL } from "@/lib/utils";

export const EMPTY_SEGMENT: CampaignSegment = { entity_ids: [], statuses: ["client"], tags: [], expiring_days: null, inactive_days: null, sex: null };

export const CHANNEL_META: Record<CampaignChannel, { label: string; color: string; soft: string }> = {
  whatsapp: { label: "WhatsApp", color: "#16a34a", soft: "#ecfdf3" },
  sms: { label: "SMS", color: "#0284c7", soft: "#eff8ff" },
  email: { label: "E-mail", color: "#7c4dcc", soft: "#f4effc" },
};

export const STATUS_META: Record<CampaignStatus, { label: string; color: string; soft: string }> = {
  brouillon: { label: "Brouillon", color: "#64748b", soft: "#f1f5f9" },
  programmee: { label: "Programmée", color: "#c9611a", soft: "#fdf3eb" },
  envoyee: { label: "Envoyée", color: "#059669", soft: "#ecfdf5" },
};

export type Template = {
  id: string;
  label: string;
  emoji: string;
  name: string;
  message: string;
  segment?: Partial<CampaignSegment>;
};

export const TEMPLATES: Template[] = [
  {
    id: "renouvellement",
    label: "Renouvellement",
    emoji: "🔁",
    name: "Renouvellement d'abonnement",
    message:
      "Bonjour {prenom} 👋\nVotre abonnement {etablissement} arrive bientôt à échéance. Renouvelez-le cette semaine à l'accueil ou répondez simplement à ce message. À très vite !",
    segment: { statuses: ["client"], expiring_days: 10, inactive_days: null },
  },
  {
    id: "offre",
    label: "Offre spéciale",
    emoji: "🎁",
    name: "Offre du moment",
    message: "Bonjour {prenom} ✨\nCette semaine chez {etablissement} : -15 % sur votre prochaine prestation. Réservez en répondant à ce message !",
    segment: { statuses: ["client", "ancien"], expiring_days: null },
  },
  {
    id: "rappel",
    label: "On vous attend",
    emoji: "💬",
    name: "Relance des clients absents",
    message: "Bonjour {prenom}, cela fait un moment ! Toute l'équipe {etablissement} serait ravie de vous revoir. Une séance découverte vous attend cette semaine 💪",
    segment: { statuses: ["client", "ancien"], inactive_days: 45, expiring_days: null },
  },
  {
    id: "anniversaire",
    label: "Anniversaire",
    emoji: "🎂",
    name: "Joyeux anniversaire",
    message: "Joyeux anniversaire {prenom} 🎉\nToute l'équipe {etablissement} vous souhaite une très belle journée. Un petit cadeau vous attend à l'accueil !",
  },
];

export function firstName(full: string) {
  return full.trim().split(/\s+/)[0] ?? "";
}

/** Remplace {prenom} et {etablissement} */
export function personalize(message: string, prenom: string, etablissement: string) {
  return message.replace(/\{prenom\}/g, prenom).replace(/\{etablissement\}/g, etablissement);
}

const STATUSES: ContactStatus[] = ["prospect", "client", "ancien"];

function posInt(v: unknown, max = 3650): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : null;
}

/** Nettoie un segment reçu du navigateur ou de la base */
export function parseSegment(raw: unknown): CampaignSegment {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    entity_ids: arr(o.entity_ids).filter((id): id is EntityId => ENTITY_IDS.includes(id as EntityId)),
    statuses: arr(o.statuses).filter((s): s is ContactStatus => STATUSES.includes(s as ContactStatus)),
    tags: arr(o.tags)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20),
    expiring_days: posInt(o.expiring_days, 365),
    inactive_days: posInt(o.inactive_days),
    sex: o.sex === "H" || o.sex === "F" ? o.sex : null,
  };
}

/** Critères lisibles (hors établissements, affichés en badges) */
export function describeSegment(s: CampaignSegment, channel: CampaignChannel): string[] {
  const out: string[] = [];
  out.push(s.statuses.length ? s.statuses.map((x) => CONTACT_STATUS_LABEL[x]).join(", ") : "Tous les contacts");
  if (s.sex) out.push(s.sex === "F" ? "Femmes" : "Hommes");
  if (s.tags.length) out.push(`Tags : ${s.tags.join(", ")}`);
  if (s.expiring_days) out.push(`Abonnement qui se termine dans ${s.expiring_days} j ou moins`);
  if (s.inactive_days) out.push(`Sans achat ni visite depuis ${s.inactive_days} j`);
  if (channel === "whatsapp") out.push("Accord WhatsApp uniquement");
  if (channel === "email") out.push("Avec adresse e-mail");
  if (channel === "sms") out.push("Avec numéro de téléphone");
  return out;
}
