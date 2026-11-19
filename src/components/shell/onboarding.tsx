"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, CalendarPlus, Check, Keyboard, ListChecks, Rocket, ScanLine, Search, ShoppingCart, UserPlus, X, type LucideIcon } from "lucide-react";
import { getOnboarding } from "@/actions/preferences";
import { useT } from "@/lib/i18n/client";
import type { OnboardingStep } from "@/lib/types-shell";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui";
import { getFlags, readLocal, writeLocal } from "./prefs";

const HIDDEN = "mu:onboarding-hidden";
const ICONS: Record<string, LucideIcon> = { client: UserPlus, rdv: CalendarPlus, vente: ShoppingCart, entree: ScanLine, tache: ListChecks, palette: Search, raccourcis: Keyboard };

/** Étapes serveur + étapes cochées dans le navigateur (Ctrl+K, « ? ») */
function useMerged(steps: OnboardingStep[] | null) {
  const [flags, setFlags] = useState<string[]>([]);
  useEffect(() => {
    const read = () => setFlags(getFlags());
    read();
    window.addEventListener("mu-flags", read);
    return () => window.removeEventListener("mu-flags", read);
  }, []);
  return steps?.map((s) => ({ ...s, done: s.done || flags.includes(s.id) })) ?? null;
}

/** Liste de la page /demarrer */
export function OnboardingChecklist({ steps: initial }: { steps: OnboardingStep[] }) {
  const t = useT();
  const steps = useMerged(initial)!;
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("onb.progress", { done, total: steps.length })}>
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[13px] font-semibold tabular-nums text-ink">
          {done}/{steps.length}
        </span>
      </div>
      <ul className="divide-y divide-line rounded-xl border border-line bg-white">
        {steps.map((s) => {
          const Icon = ICONS[s.id] ?? Rocket;
          const action =
            s.id === "palette" ? (
              <button type="button" onClick={() => window.dispatchEvent(new Event("open-palette"))} className={buttonClass(s.done ? "ghost" : "secondary", "h-9")}>
                {t("onb.try")}
              </button>
            ) : s.id === "raccourcis" ? (
              <button type="button" onClick={() => window.dispatchEvent(new Event("open-shortcuts"))} className={buttonClass(s.done ? "ghost" : "secondary", "h-9")}>
                {t("onb.try")}
              </button>
            ) : (
              <Link href={s.href} className={buttonClass(s.done ? "ghost" : "secondary", "h-9")}>
                {s.done ? t("onb.again") : t("onb.go")}
              </Link>
            );
          return (
            <li key={s.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", s.done ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400")}>
                {s.done ? <Check className="size-4" strokeWidth={2.5} aria-label={t("onb.done")} /> : <Icon className="size-4" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[13px] font-medium", s.done ? "text-muted line-through decoration-slate-300" : "text-ink")}>{t(`onb.${s.id}`)}</span>
                <span className="block text-xs text-muted">{t(`onb.${s.id}.text`)}</span>
              </span>
              {action}
            </li>
          );
        })}
      </ul>
      {done === steps.length && <p className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-[13px] font-medium text-emerald-700">{t("onb.finished")}</p>}
    </div>
  );
}

/** Bandeau discret du tableau de bord tant que la prise en main n'est pas finie (fermable) */
export function OnboardingBanner() {
  const t = useT();
  const path = usePathname();
  const [raw, setRaw] = useState<OnboardingStep[] | null>(null);
  const [hidden, setHidden] = useState(true);
  const steps = useMerged(raw);
  const home = path === "/";

  useEffect(() => {
    if (!home) return;
    const h = readLocal<boolean>(HIDDEN, false);
    setHidden(h);
    if (h) return;
    // Différé : la page d'accueil s'affiche d'abord
    const id = window.setTimeout(() => getOnboarding().then(setRaw, () => {}), 1500);
    return () => window.clearTimeout(id);
  }, [home]);

  if (!home || hidden || !steps) return null;
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.find((s) => !s.done);

  return (
    <div className="no-print mb-4 flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-2.5">
      <Rocket className="size-4 shrink-0 text-brand-500" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] text-ink">
        <span className="font-medium">{t("onb.banner", { done, total: steps.length })}</span>
        {next && <span className="hidden text-muted sm:inline"> · {t("onb.next")} : {t(`onb.${next.id}`)}</span>}
      </p>
      <Link href="/demarrer" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-brand-600 hover:bg-brand-50">
        {t("onb.continue")} <ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden />
      </Link>
      <button
        type="button"
        onClick={() => {
          writeLocal(HIDDEN, true);
          setHidden(true);
        }}
        className="grid size-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-ink"
        aria-label={t("onb.hide")}
        title={t("onb.hide")}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
