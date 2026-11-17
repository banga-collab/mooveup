"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * En-tête de colonne triable (tri côté serveur via l'URL : `tri` = colonne, `ordre` = asc|desc).
 * `def` : vrai si c'est la colonne triée par défaut (sans paramètre dans l'URL), `defDir` son sens.
 * `first` : sens au premier clic (desc conseillé pour les montants / dates).
 */
export function SortTh({
  col,
  label,
  def = false,
  defDir = "asc",
  first = "asc",
  align = "left",
  param = "tri",
  className,
}: {
  col: string;
  label: React.ReactNode;
  def?: boolean;
  defDir?: "asc" | "desc";
  first?: "asc" | "desc";
  align?: "left" | "right" | "center";
  param?: string;
  className?: string;
}) {
  const path = usePathname();
  const sp = useSearchParams();
  const dirParam = param === "tri" ? "ordre" : `${param}_ordre`;
  const cur = sp.get(param);
  const active = cur ? cur === col : def;
  const dir = active ? ((sp.get(dirParam) === "desc" ? "desc" : sp.get(dirParam) === "asc" || cur ? "asc" : defDir)) : null;
  const next = new URLSearchParams(sp.toString());
  next.set(param, col);
  next.set(dirParam, active ? (dir === "asc" ? "desc" : "asc") : first);
  next.delete("page");
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"} className={cn(align === "right" && "text-right", align === "center" && "text-center", className)}>
      <Link
        href={`${path}?${next.toString()}`}
        replace
        scroll={false}
        className={cn("group inline-flex items-center gap-1 rounded hover:text-ink", align === "right" && "flex-row-reverse", active && "text-ink")}
      >
        {label}
        <Icon className={cn("size-3 shrink-0", active ? "text-brand-500" : "text-slate-300 group-hover:text-slate-400")} />
      </Link>
    </th>
  );
}
