import { addDaysKey, dayKey, fmtDate } from "@/lib/utils";

/* Périodes des rapports clients (fuseau d'Agadir). */

export type PeriodId = "mois" | "precedent" | "trimestre" | "annee" | "perso";

export const PERIOD_OPTIONS: { id: PeriodId; label: string }[] = [
  { id: "mois", label: "Ce mois" },
  { id: "precedent", label: "Mois dernier" },
  { id: "trimestre", label: "Trimestre" },
  { id: "annee", label: "Année" },
  { id: "perso", label: "Personnalisée" },
];

export type Period = { id: PeriodId; from: string; to: string; label: string };

const isDay = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function monthEnd(y: number, m: number) {
  // m : 1-12
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Période demandée (`periode`, `du`, `au`) → bornes incluses AAAA-MM-JJ */
export function readPeriod(get: (k: string) => string | null | undefined, today = dayKey()): Period {
  const raw = get("periode");
  const id: PeriodId = PERIOD_OPTIONS.some((p) => p.id === raw) ? (raw as PeriodId) : isDay(get("du")) ? "perso" : "mois";
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const mm = (n: number) => String(n).padStart(2, "0");
  if (id === "precedent") {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    const from = `${py}-${mm(pm)}-01`;
    return { id, from, to: monthEnd(py, pm), label: fmtDate(`${from}T12:00:00Z`, { month: "long", year: "numeric" }) };
  }
  if (id === "trimestre") {
    const q = Math.floor((m - 1) / 3);
    return { id, from: `${y}-${mm(q * 3 + 1)}-01`, to: monthEnd(y, q * 3 + 3), label: `${q + 1}${q ? "e" : "er"} trimestre ${y}` };
  }
  if (id === "annee") return { id, from: `${y}-01-01`, to: `${y}-12-31`, label: `Année ${y}` };
  if (id === "perso") {
    let from = isDay(get("du")) ? get("du")! : `${today.slice(0, 7)}-01`;
    let to = isDay(get("au")) ? get("au")! : today;
    if (from > to) [from, to] = [to, from];
    // 3 ans au plus
    if (addDaysKey(from, 1100) < to) from = addDaysKey(to, -1100);
    return { id, from, to, label: `du ${fmtDate(`${from}T12:00:00Z`)} au ${fmtDate(`${to}T12:00:00Z`)}` };
  }
  return { id: "mois", from: `${today.slice(0, 7)}-01`, to: monthEnd(y, m), label: fmtDate(`${today}T12:00:00Z`, { month: "long", year: "numeric" }) };
}
