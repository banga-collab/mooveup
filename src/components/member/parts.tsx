/**
 * Éléments d'affichage de l'espace adhérent (composants serveur).
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { getLang } from "@/lib/i18n";
import type { Lang } from "@/lib/i18n/core";
import { EntityBadge } from "@/components/entity-icon";
import { Badge } from "@/components/ui";
import { cn, daysUntil } from "@/lib/utils";
import type { SaleStatus, Subscription } from "@/lib/types";
import { mDate, mt, type MKey } from "./i18n";

export type MT = (key: MKey, vars?: Record<string, string | number>) => string;

/** Langue + traduction pour une page serveur */
export async function getMt(): Promise<{ lang: Lang; t: MT }> {
  const lang = await getLang();
  return { lang, t: (k, v) => mt(lang, k, v) };
}

/** Titre de page */
export function MTitle({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Carte avec titre et lien facultatif */
export function MCard({ title, href, link, children, className }: { title?: ReactNode; href?: string; link?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-line bg-white", className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {href && link && (
            <Link href={href} className="inline-flex h-8 items-center gap-0.5 text-[13px] font-medium text-brand-600 hover:text-brand-700">
              {link} <ChevronRight className="size-3.5 rtl:rotate-180" />
            </Link>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/** Abonnement en cours ou vivant : jours ou séances restants et barre de progression */
export function SubProgress({ sub, lang, t, action }: { sub: Subscription; lang: Lang; t: MT; action?: ReactNode }) {
  const left = daysUntil(sub.end_date);
  const total = Math.max(1, daysUntil(sub.end_date) - daysUntil(sub.start_date));
  const done = Math.min(1, Math.max(0, (total - left) / total));
  const low = left <= 7 || (sub.sessions_left !== null && sub.sessions_left <= 1);
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{sub.name}</p>
          <div className="mt-0.5">
            <EntityBadge id={sub.entity_id} />
          </div>
        </div>
        <div className="shrink-0 text-end">
          <p className={cn("text-sm font-semibold tabular-nums", low ? "text-accent-700" : "text-ink")}>
            {sub.sessions_left !== null ? t("m.subs.sessionsLeft", { n: sub.sessions_left }) : left <= 0 ? t("m.subs.dayLeft") : t("m.subs.daysLeft", { n: left })}
          </p>
          <p className="text-xs text-muted">{t("m.subs.until", { date: mDate(lang, sub.end_date, { day: "numeric", month: "short" }) })}</p>
        </div>
      </div>
      {sub.sessions_left === null && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden>
          <div className={cn("h-full rounded-full", low ? "bg-accent-500" : "bg-brand-500")} style={{ width: `${Math.round(done * 100)}%` }} />
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

const SUB_TONE: Record<Subscription["status"], "green" | "amber" | "gray" | "red"> = { actif: "green", suspendu: "amber", expire: "gray", resilie: "red" };
const SUB_LABEL: Record<Subscription["status"], string> = { actif: "Actif", suspendu: "Suspendu", expire: "Expiré", resilie: "Résilié" };
const SUB_LABEL_AR: Record<Subscription["status"], string> = { actif: "ساري", suspendu: "موقوف", expire: "منتهي", resilie: "ملغى" };

export function SubStatus({ sub, lang }: { sub: Subscription; lang: Lang }) {
  const expired = sub.status === "actif" && daysUntil(sub.end_date) < 0;
  const status = expired ? "expire" : sub.status;
  return (
    <Badge tone={SUB_TONE[status]} dot>
      {(lang === "ar" ? SUB_LABEL_AR : SUB_LABEL)[status]}
    </Badge>
  );
}

/** Statut d'un ticket pour le client */
export const SALE_STATUS: Record<SaleStatus, { fr: string; ar: string; tone: "green" | "amber" | "red" | "gray" }> = {
  payee: { fr: "Payé", ar: "مدفوع", tone: "green" },
  partielle: { fr: "Partiel", ar: "جزئي", tone: "amber" },
  impayee: { fr: "À régler", ar: "غير مدفوع", tone: "red" },
  remboursee: { fr: "Remboursé", ar: "مسترجع", tone: "gray" },
};
