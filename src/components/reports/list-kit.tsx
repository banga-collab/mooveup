import { SearchX } from "lucide-react";
import { Empty, LinkButton } from "@/components/ui";

/* Outils communs des pages de liste (recherche / filtres / tri côté serveur). */

export type SortDir = "asc" | "desc";
type Params = Record<string, string | string[] | undefined>;

/** Lit le tri demandé dans l'URL (`tri` / `ordre`), borné aux colonnes autorisées */
export function readSort<K extends string>(sp: Params, keys: readonly K[], def: K, defDir: SortDir = "asc", param = "tri"): { key: K; dir: SortDir } {
  const raw = sp[param];
  const d = sp[param === "tri" ? "ordre" : `${param}_ordre`];
  if (typeof raw !== "string" || !(keys as readonly string[]).includes(raw)) return { key: def, dir: defDir };
  return { key: raw as K, dir: d === "desc" ? "desc" : "asc" };
}

/** Trie une copie de la liste (texte sans accents/casse, nombres, dates ISO) ; valeurs vides en dernier */
export function sortRows<T>(rows: T[], get: (r: T) => string | number | boolean | null | undefined, dir: SortDir): T[] {
  const m = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    const ex = x === null || x === undefined || x === "";
    const ey = y === null || y === undefined || y === "";
    if (ex || ey) return ex && ey ? 0 : ex ? 1 : -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * m;
    if (typeof x === "boolean" || typeof y === "boolean") return (Number(x) - Number(y)) * m;
    return String(x).localeCompare(String(y), "fr", { sensitivity: "base", numeric: true }) * m;
  });
}

/** Lien qui retire la recherche et les filtres donnés en gardant le reste de l'URL (onglet…) */
export function clearHref(path: string, sp: Params, remove: string[]) {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v !== "string" || !v || remove.includes(k) || k === "page") continue;
    next.set(k, v);
  }
  const qs = next.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Vrai si une recherche ou un filtre est actif */
export function hasFilters(sp: Params, params: string[]) {
  return params.some((p) => typeof sp[p] === "string" && !!sp[p]);
}

/** Compteur de résultats : « 12 résultats » ou « 3 sur 40 » quand un filtre est actif */
export function ResultCount({ shown, total, filtered, unit = "résultat", units }: { shown: number; total: number; filtered: boolean; unit?: string; units?: string }) {
  const plural = units ?? `${unit}s`;
  return (
    <span className="text-[13px] tabular-nums text-muted" aria-live="polite">
      {filtered ? `${shown} sur ${total}` : `${total} ${total > 1 ? plural : unit}`}
    </span>
  );
}

/** État vide d'une recherche / d'un filtre sans résultat */
export function NoResults({ q, href, what = "élément" }: { q?: string | null; href: string; what?: string }) {
  const term = (q ?? "").trim();
  return (
    <Empty
      icon={<SearchX />}
      title={term ? `Aucun résultat pour « ${term} »` : `Aucun ${what} ne correspond aux filtres`}
      text="Vérifiez l'orthographe, essayez un autre mot (nom, téléphone, numéro…) ou retirez des filtres."
      action={
        <LinkButton href={href} variant="secondary" scroll={false}>
          Effacer
        </LinkButton>
      }
    />
  );
}

/** Puces d'établissements pour `ListToolbar` (seulement s'il y en a plusieurs dans le périmètre) */
export function entityFilter(entities: { id: string; short: string }[], counts?: Record<string, number>, param = "etab") {
  return entities.length > 1
    ? [{ param, label: "Tous", options: entities.map((e) => ({ value: e.id, label: e.short, count: counts ? (counts[e.id] ?? 0) : undefined })) }]
    : [];
}
