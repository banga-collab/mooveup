import type {
  AppointmentStatus,
  CampaignChannel,
  CatalogKind,
  ContactStatus,
  LeadSource,
  LeadStage,
  PayMethod,
  Role,
  SaleStatus,
  SubscriptionStatus,
} from "./types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?"
  );
}

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
export function num(v: number | null | undefined, unit = "") {
  if (v === null || v === undefined) return "–";
  return `${nf.format(Number(v))}${unit ? ` ${unit}` : ""}`;
}

const mf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
/** 12 500 MAD */
export function mad(v: number | null | undefined) {
  if (v === null || v === undefined) return "–";
  return `${mf.format(Number(v))} MAD`;
}
/** 12,5 k */
export function madShort(v: number) {
  if (Math.abs(v) >= 1_000_000) return `${nf.format(v / 1_000_000)} M`;
  if (Math.abs(v) >= 10_000) return `${mf.format(v / 1000)} k`;
  return mf.format(v);
}

export function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

export function age(birth: string | null) {
  if (!birth) return null;
  const b = new Date(birth);
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--;
  return a;
}

const dateFmts = new Map<string, Intl.DateTimeFormat>();
export function fmtDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  const k = JSON.stringify(opts);
  let f = dateFmts.get(k);
  if (!f) dateFmts.set(k, (f = new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Casablanca", ...opts })));
  return f.format(new Date(d));
}

const timeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Casablanca" });
export function fmtTime(d: string | Date) {
  return timeFmt.format(new Date(d));
}

/** "il y a 3 j", "dans 2 h"… */
export function relative(d: string | Date) {
  const diff = new Date(d).getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 3600_000) return rtf.format(Math.round(diff / 60_000), "minute");
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3600_000), "hour");
  if (abs < 30 * 86_400_000) return rtf.format(Math.round(diff / 86_400_000), "day");
  return rtf.format(Math.round(diff / (30 * 86_400_000)), "month");
}

/** Clé AAAA-MM-JJ d'une date dans le fuseau d'Agadir */
const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Casablanca" });
export function dayKey(d: string | Date = new Date()) {
  return dayFmt.format(new Date(d));
}

/** Nombre de jours entre aujourd'hui et une date AAAA-MM-JJ (négatif = passé) */
export function daysUntil(date: string) {
  const a = new Date(`${dayKey()}T00:00:00Z`).getTime();
  const b = new Date(`${date.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function addDaysKey(date: string, n: number) {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // lundi = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - day);
  return x;
}

export function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Heure (0-23) actuelle à Agadir */
export function agadirHour(d = new Date()) {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Casablanca" })
    .formatToParts(d)
    .find((p) => p.type === "hour")?.value;
  return Number(h ?? 12);
}

/** Décalage (en minutes) du fuseau d'Agadir à une date donnée */
const offsetFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Casablanca", timeZoneName: "longOffset" });
export function agadirOffsetMin(d: Date = new Date()) {
  const part =
    offsetFmt
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = part.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0));
}

/** "2026-11-17" + "18:00" saisis à Agadir → ISO UTC */
export function agadirToIso(date: string, time: string) {
  const [h = "9", m = "00"] = (time || "09:00").split(":");
  const naive = new Date(`${date}T${h.padStart(2, "0")}:${m.padStart(2, "0").slice(0, 2)}:00Z`);
  return new Date(naive.getTime() - agadirOffsetMin(naive) * 60000).toISOString();
}

/** ISO UTC → { date, time } à Agadir */
export function isoToAgadir(iso: string) {
  const d = new Date(iso);
  const local = new Date(d.getTime() + agadirOffsetMin(d) * 60000);
  return { date: local.toISOString().slice(0, 10), time: local.toISOString().slice(11, 16) };
}

/** Parse un nombre saisi en français ("72,5") */
export function parseNum(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function str(v: FormDataEntryValue | null): string | null {
  const s = v === null ? "" : String(v).trim();
  return s ? s : null;
}

/** Lien WhatsApp (numéro marocain 06… → 2126…) */
export function waLink(phone: string | null, text?: string) {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) d = "212" + d.slice(1);
  return `https://wa.me/${d}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/* ---------- Libellés ---------- */
export const ROLE_LABEL: Record<Role, string> = {
  direction: "Direction",
  manager: "Manager",
  reception: "Réception",
  staff: "Équipe",
};

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = { prospect: "Prospect", client: "Client", ancien: "Ancien client" };

export const STAGES: { id: LeadStage; label: string; tone: string }[] = [
  { id: "nouveau", label: "Nouveau", tone: "#64748b" },
  { id: "contacte", label: "Contacté", tone: "#1a6d8e" },
  { id: "essai", label: "Séance d'essai / visite", tone: "#7c4dcc" },
  { id: "offre", label: "Offre envoyée", tone: "#e8782a" },
  { id: "gagne", label: "Gagné", tone: "#059669" },
  { id: "perdu", label: "Perdu", tone: "#dc2626" },
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<LeadStage, string>;

export const SOURCE_LABEL: Record<LeadSource, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  passage: "Passage à l'accueil",
  telephone: "Téléphone",
  parrainage: "Parrainage",
  site: "Site web",
  google: "Google",
};

export const CATALOG_KIND_LABEL: Record<CatalogKind, string> = {
  abonnement: "Abonnement",
  prestation: "Prestation",
  produit: "Produit",
  pack: "Pack de séances",
};

export const SUB_STATUS_LABEL: Record<SubscriptionStatus, string> = { actif: "Actif", suspendu: "Suspendu", expire: "Expiré", resilie: "Résilié" };

export const APPT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  prevu: "Prévu",
  confirme: "Confirmé",
  arrive: "Arrivé",
  termine: "Terminé",
  absent: "Absent",
  annule: "Annulé",
};

export const PAY_LABEL: Record<PayMethod, string> = { especes: "Espèces", carte: "Carte bancaire", virement: "Virement", cheque: "Chèque", en_ligne: "Paiement en ligne" };
export const SALE_STATUS_LABEL: Record<SaleStatus, string> = { payee: "Payée", partielle: "Partielle", impayee: "Impayée", remboursee: "Remboursée" };
export const CHANNEL_LABEL: Record<CampaignChannel, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "E-mail" };
