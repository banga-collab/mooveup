import type { ContactStatus, LeadSource } from "@/lib/types";
import { SOURCE_LABEL } from "@/lib/utils";

/** Chiffres seuls d'un numéro, au format national (06…) */
export function phoneDigits(phone: string | null | undefined) {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("00212")) d = "0" + d.slice(5);
  else if (d.startsWith("212") && d.length === 12) d = "0" + d.slice(3);
  return d;
}

/** "0612345678" → "06 12 34 56 78" (sinon le numéro tel quel) */
export function formatPhone(phone: string | null | undefined) {
  const raw = (phone ?? "").trim();
  if (!raw) return null;
  const d = phoneDigits(raw);
  if (d.length === 10 && d.startsWith("0")) return d.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return raw;
}

/** "VIP, parrain ,  VIP" → ["VIP", "parrain"] */
export function parseTags(v: FormDataEntryValue | null) {
  const out: string[] = [];
  for (const t of String(v ?? "").split(",")) {
    const s = t.trim().replace(/\s+/g, " ");
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s.slice(0, 40));
  }
  return out.slice(0, 12);
}

/** Construit une URL avec des paramètres de recherche (valeurs vides retirées) */
export function hrefWith(path: string, params: Record<string, string | null | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const s = sp.toString();
  return s ? `${path}?${s}` : path;
}

/** Premier paramètre d'URL en chaîne */
export function param(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}

export const TAG_SUGGESTIONS = ["VIP", "Parrain", "Entreprise partenaire", "Suivi médical", "Mariée 2026", "Étudiant", "Famille", "Ambassadeur"];

export const STATUS_TONE: Record<ContactStatus, "green" | "brand" | "gray"> = { client: "green", prospect: "brand", ancien: "gray" };

export const SOURCES = Object.entries(SOURCE_LABEL) as [LeadSource, string][];

export const LOST_REASONS = ["Trop cher", "Trop loin", "A choisi un concurrent", "Pas de réponse", "Pas le bon moment", "Autre"];
