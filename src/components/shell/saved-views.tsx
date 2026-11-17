"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Bookmark, X } from "lucide-react";
import { deleteSavedView } from "@/actions/preferences";
import { useT } from "@/lib/i18n/client";
import type { SavedView } from "@/lib/types-shell";
import { cn } from "@/lib/utils";

/** Section « Mes vues » de la barre latérale : listes filtrées enregistrées par le membre */
export function SavedViews({ views }: { views: SavedView[] }) {
  const t = useT();
  const path = usePathname();
  const sp = useSearchParams();
  const here = `${path}${sp.toString() ? `?${sp.toString()}` : ""}`;
  const [hidden, setHidden] = useState<string[]>([]);
  const [undo, setUndo] = useState<SavedView | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const remove = (v: SavedView) => {
    if (timer.current && undo) {
      clearTimeout(timer.current);
      void deleteSavedView(undo.id);
    }
    setHidden((h) => [...h, v.id]);
    setUndo(v);
    timer.current = setTimeout(() => {
      void deleteSavedView(v.id);
      setUndo(null);
      timer.current = null;
    }, 5000);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (undo) setHidden((h) => h.filter((id) => id !== undo.id));
    setUndo(null);
  };

  const list = views.filter((v) => !hidden.includes(v.id));
  if (!list.length && !undo) return null;

  return (
    <div className="mt-3">
      <p className="px-2.5 pb-1 text-[11px] font-medium text-slate-400">{t("views.title")}</p>
      {list.map((v) => {
        const on = here === v.href;
        return (
          <div key={v.id} className={cn("group flex items-center rounded-md transition-colors", on ? "bg-slate-100" : "hover:bg-slate-50")}>
            <Link href={v.href} className={cn("flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-[7px] text-[13px]", on ? "font-medium text-ink" : "text-slate-600 hover:text-ink")}>
              <Bookmark className={cn("size-4 shrink-0", on ? "text-brand-500" : "text-slate-400")} strokeWidth={1.8} />
              <span className="truncate">{v.label}</span>
            </Link>
            <button
              type="button"
              onClick={() => remove(v)}
              className="me-1 grid size-7 shrink-0 place-items-center rounded text-slate-400 opacity-0 transition hover:bg-slate-200 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
              aria-label={t("views.delete", { name: v.label })}
              title={t("views.delete", { name: v.label })}
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
      {undo && (
        <div role="status" className="mt-1 flex items-center gap-2 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs text-slate-600">
          <span className="min-w-0 flex-1 truncate">{t("views.deleted")}</span>
          <button type="button" onClick={cancel} className="font-medium text-brand-600 hover:underline">
            {t("common.undo")}
          </button>
        </div>
      )}
    </div>
  );
}
