import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonClass } from "@/components/ui";

/**
 * État vide d'une liste filtrée : « Aucun résultat pour « … » » + bouton Effacer.
 * Utilisable côté serveur comme côté client.
 */
export function NoResults({ query, clearHref, hint }: { query?: string | null; clearHref: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center" role="status">
      <span className="grid size-10 place-items-center rounded-lg bg-slate-100 text-slate-400">
        <SearchX className="size-5" />
      </span>
      <p className="mt-3 text-sm font-medium text-ink">{query ? <>Aucun résultat pour « {query} »</> : "Aucun résultat pour ces filtres"}</p>
      <p className="mt-1 max-w-sm text-[13px] text-muted">{hint ?? "Vérifiez l'orthographe, essayez un numéro de téléphone ou retirez un filtre."}</p>
      <Link href={clearHref} scroll={false} className={buttonClass("secondary", "mt-4")}>
        Effacer la recherche et les filtres
      </Link>
    </div>
  );
}

/** « 128 résultats » (avec le total si différent) */
export function ResultCount({ n, total, unit = ["résultat", "résultats"] }: { n: number; total?: number; unit?: [string, string] }) {
  return (
    <p className="text-[13px] text-muted" aria-live="polite">
      <span className="font-semibold tabular-nums text-ink">{n}</span> {n > 1 ? unit[1] : unit[0]}
      {total !== undefined && total !== n && <span className="tabular-nums"> sur {total}</span>}
    </p>
  );
}
