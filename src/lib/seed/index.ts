/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Données de démo des modules complémentaires.
 * Chaque module remplit son propre fichier et renvoie ses tables.
 */
import { seedFinance } from "./finance";
import { seedLoyalty } from "./loyalty";
import { seedAccess } from "./access";
import { seedCare } from "./care";
import { seedOps } from "./ops";
import { seedShell } from "./shell";
import { seedAgenda } from "./agenda";
import { seedMember } from "./member";
import { seedCorporate } from "./corporate";

type Row = Record<string, any>;
export type SeedDB = Record<string, Row[]>;
export type SeedHelpers = {
  /** Identifiant déterministe */
  uid: () => string;
  /** Aléatoire reproductible 0..1 */
  rnd: () => number;
  pick: <T>(a: readonly T[]) => T;
  int: (min: number, max: number) => number;
  /** Date AAAA-MM-JJ décalée de N jours (Agadir) */
  day: (offset: number) => string;
  /** ISO UTC pour un jour décalé et une heure "HH:MM" à Agadir */
  at: (offset: number, hhmm: string) => string;
};

/** Ajoute les tables des modules. Chaque module peut aussi lire (sans le modifier) `db`. */
export function extendSeed(db: SeedDB, h: SeedHelpers): SeedDB {
  const out: SeedDB = { settings: [] };
  for (const fn of [seedFinance, seedLoyalty, seedAccess, seedCare, seedOps, seedShell, seedAgenda, seedMember, seedCorporate]) Object.assign(out, fn({ ...db, ...out }, h));
  return out;
}
