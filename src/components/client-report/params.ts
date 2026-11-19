import type { Scope } from "@/lib/auth";
import type { EntityId } from "@/lib/entities";
import { readPeriod, type Period } from "./period";

/*
 * Paramètres d'URL de /rapports-clients (partagés avec l'export) :
 *  ?client=<id>            un client (lien depuis la fiche client)
 *  ?clients=<id>,<id>…     une sélection
 *  ?tous=1                 tous les clients actifs sur la période
 *  &periode=mois|precedent|trimestre|annee|perso (&du=&au=)  &etab=<établissement>
 */

export type ClientParams = {
  mode: "un" | "selection" | "tous" | null;
  ids: string[] | "all";
  period: Period;
  etab: EntityId | null;
};

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function readClientParams(sp: URLSearchParams, scope: Scope): ClientParams {
  const period = readPeriod((k) => sp.get(k));
  const etabRaw = sp.get("etab");
  const etab = scope.allowed.some((e) => e.id === etabRaw) && scope.ids.includes(etabRaw as EntityId) ? (etabRaw as EntityId) : null;
  if (sp.get("tous") === "1") return { mode: "tous", ids: "all", period, etab };
  const ids = [...new Set([...sp.getAll("client"), ...sp.getAll("clients")].flatMap((v) => v.split(",")).map((v) => v.trim()).filter((v) => ID.test(v)))].slice(0, 500);
  if (!ids.length) return { mode: null, ids: [], period, etab };
  return { mode: ids.length === 1 ? "un" : "selection", ids, period, etab };
}

/** Paramètres → chaîne de requête (pour les liens d'export) */
export function toQuery(sp: Record<string, string | string[] | undefined>) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (!["client", "clients", "tous", "periode", "du", "au", "etab"].includes(k)) continue;
    for (const x of Array.isArray(v) ? v : v ? [v] : []) out.append(k, x);
  }
  return out.toString();
}

export function toSearchParams(sp: Record<string, string | string[] | undefined>) {
  return new URLSearchParams(toQuery(sp));
}
