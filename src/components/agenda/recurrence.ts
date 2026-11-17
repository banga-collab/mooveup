import type { RepeatFreq } from "@/lib/types-agenda";
import { addDaysKey, isoToAgadir } from "@/lib/utils";

/** Nombre maximal de séances dans une série */
export const MAX_OCCURRENCES = 52;

export const isFreq = (v: unknown): v is RepeatFreq => v === "weekly" || v === "biweekly" || v === "monthly";

/** Ajoute N mois à une date AAAA-MM-JJ (jour ramené au dernier jour du mois si besoin) */
export function addMonthsKey(date: string, n: number) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/**
 * Dates (AAAA-MM-JJ) d'une série : jusqu'à `until` (incluse) ou `count` séances,
 * au plus MAX_OCCURRENCES.
 */
export function seriesDates(start: string, freq: RepeatFreq, end: { until?: string | null; count?: number | null }): string[] {
  const out: string[] = [];
  const count = end.count && end.count > 0 ? Math.min(end.count, MAX_OCCURRENCES) : MAX_OCCURRENCES;
  const until = end.until && /^\d{4}-\d{2}-\d{2}$/.test(end.until) ? end.until : null;
  if (!until && !end.count) return [start];
  for (let i = 0; out.length < count; i++) {
    const d = freq === "monthly" ? addMonthsKey(start, i) : addDaysKey(start, i * (freq === "weekly" ? 7 : 14));
    if (until && d > until) break;
    out.push(d);
  }
  return out;
}

/** Nombre de jours entre deux dates AAAA-MM-JJ */
export function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/** 570 → "09:30" */
export function hhmm(min: number) {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "lun. 3 déc." */
export function shortDay(date: string) {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

/** Minutes depuis minuit (heure d'Agadir) d'une date ISO */
export function minutesOf(iso: string) {
  const { time } = isoToAgadir(iso);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

const normText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Recherche texte sans accents ni casse, chiffres du téléphone compris
 * (même règle que `matchesQuery` de list-toolbar, utilisable côté serveur).
 */
export function matchText(q: string | null | undefined, ...fields: (string | number | null | undefined)[]) {
  const n = normText(q ?? "");
  if (!n) return true;
  const digits = (q ?? "").replace(/\D/g, "");
  return fields.some((f) => {
    if (f === null || f === undefined) return false;
    const s = String(f);
    return normText(s).includes(n) || (digits.length >= 3 && s.replace(/\D/g, "").includes(digits));
  });
}
