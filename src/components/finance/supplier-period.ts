import { addDaysKey } from "@/lib/utils";

/** Périodes de calcul du « total payé » d'un fournisseur */
export const PERIODS = [
  { id: "mois", label: "Ce mois" },
  { id: "3m", label: "3 mois" },
  { id: "12m", label: "12 mois" },
  { id: "annee", label: "Cette année" },
] as const;
export type PeriodId = (typeof PERIODS)[number]["id"];

/** Premier jour (AAAA-MM-JJ) inclus dans la période */
export function periodStart(p: PeriodId, today: string) {
  if (p === "mois") return `${today.slice(0, 7)}-01`;
  if (p === "annee") return `${today.slice(0, 4)}-01-01`;
  return addDaysKey(today, p === "3m" ? -91 : -365);
}
