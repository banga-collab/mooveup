"use client";

import { useState } from "react";
import { AlertTriangle, Cake, CheckCircle2, CloudOff, Gift, Loader2, ShieldAlert, StickyNote, XCircle } from "lucide-react";
import type { DeskAlert, DeskVerdict } from "@/actions/access";
import { useLang, useT } from "@/lib/i18n/client";
import { cn, fmtDate, mad } from "@/lib/utils";
import { Badge, Button, Input, LinkButton } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ContactLink } from "@/components/quick-view/contact-link";

const SPORT = ["sports", "lady", "kids", "power"];
const FORCE_REASONS = ["force.renew", "force.paying", "force.card", "force.gesture"];

/** Titre du verdict : texte détaillé du serveur en français, libellé traduit sinon */
export function useVerdictTitle() {
  const t = useT();
  const lang = useLang();
  return (v: DeskVerdict) => {
    if (v.ok) return v.forced ? t("acces.forced") : v.code === "ok_rdv" ? t("acces.welcome") : t("acces.allowed");
    return lang === "fr" ? v.reason : t(`acces.code.${v.code}`);
  };
}

function alertText(a: DeskAlert, t: ReturnType<typeof useT>) {
  if (a.kind === "care") return a.text ?? t("acces.alert.care_hidden");
  if (a.kind === "absences") return t("acces.alert.absences", { n: a.n ?? 2 });
  return t(`acces.alert.${a.kind}`);
}

/**
 * Résultat d'un passage à l'accueil, avec les suggestions utiles :
 * renouveler, encaisser le solde, anniversaire, alertes, points de fidélité.
 * `size="lg"` : version tablette (grandes cibles, nom non cliquable).
 */
export function VerdictView({
  v,
  onForce,
  forcing: forcePending,
  size = "md",
}: {
  v: DeskVerdict;
  onForce?: (reason: string) => void;
  forcing?: boolean;
  size?: "md" | "lg";
}) {
  const t = useT();
  const title = useVerdictTitle();
  const [forcing, setForcing] = useState(false);
  const [reason, setReason] = useState("");
  const lg = size === "lg";
  const h = v.hints;
  const sport = SPORT.includes(v.entity_id);
  const first = v.contact.full_name.split(" ")[0] ?? "";
  const ending = v.ok && v.daysLeft !== null && v.daysLeft <= 7 && v.code === "ok_sub";
  const renewHref = h?.renewHref ?? (sport && (!v.ok || ending) ? `/abonnements/nouveau?contact=${v.contact.id}` : null);
  const btn = lg ? "h-14 rounded-xl px-6 text-base" : "";

  return (
    <div className={cn("rounded-xl border", lg ? "p-6 sm:p-8" : "p-5 sm:p-6", v.ok ? "border-emerald-200 bg-emerald-50/60" : "border-red-200 bg-red-50/60")}>
      <div className="flex items-start gap-4">
        {v.ok ? (
          <CheckCircle2 className={cn("shrink-0 text-emerald-600", lg ? "size-16" : "size-10")} strokeWidth={1.75} />
        ) : (
          <XCircle className={cn("shrink-0 text-red-600", lg ? "size-16" : "size-10")} strokeWidth={1.75} />
        )}
        <div className="min-w-0 flex-1">
          <p className={cn("font-semibold tracking-tight", lg ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl", v.ok ? "text-emerald-700" : "text-red-700")}>{title(v)}</p>
          {lg ? (
            <p className="mt-1 truncate text-2xl font-medium text-ink">{v.contact.full_name}</p>
          ) : (
            <ContactLink id={v.contact.id} name={v.contact.full_name} className="mt-1 block truncate text-lg" />
          )}
          <div className={cn("mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600", lg ? "text-base" : "text-[13px]")}>
            <EntityBadge id={v.entity_id} className={lg ? "text-sm" : undefined} />
            {v.plan && <span>{v.plan}</span>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {v.offline && (
              <Badge tone="gray">
                <CloudOff className="size-3" /> {v.ok && !v.already ? t("acces.offline.queued") : t("acces.offline.checked")}
              </Badge>
            )}
            {v.ok && v.code === "ok_rdv" && !v.offline && !v.already && <Badge tone="green">{t("acces.rdv_arrived")}</Badge>}
            {v.ok && v.daysLeft !== null && v.code !== "ok_rdv" && (
              <Badge tone={v.daysLeft <= 7 ? "amber" : "green"}>{v.daysLeft === 0 ? t("acces.last_day") : t(v.daysLeft > 1 ? "acces.days_left_n" : "acces.days_left_1", { n: v.daysLeft })}</Badge>
            )}
            {v.sessionUsed && <Badge tone="brand">{t("acces.session_used")}</Badge>}
            {v.ok && v.sessionsLeft !== null && <Badge tone={v.sessionsLeft <= 2 ? "amber" : "gray"}>{t(v.sessionsLeft > 1 ? "acces.sessions_left_n" : "acces.sessions_left_1", { n: v.sessionsLeft })}</Badge>}
            {v.already && <Badge tone="gray">{t("acces.already", { time: v.already })}</Badge>}
            {v.forced && <Badge tone="amber">{t("acces.forced_logged")}</Badge>}
          </div>
        </div>
      </div>

      {h?.birthday && (
        <p className={cn("mt-4 flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2.5 font-medium text-ink", lg ? "text-base" : "text-sm")}>
          <Cake className="size-4 shrink-0 text-accent-500" />
          {h.age ? t("acces.birthday_age", { name: first, n: h.age }) : t("acces.birthday", { name: first })}
        </p>
      )}

      {h && (h.alerts.length > 0 || h.note) && (
        <div className={cn("mt-4 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-900", lg ? "text-base" : "text-[13px]")}>
          {h.alerts.map((a, i) => (
            <p key={i} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" /> <span className="min-w-0">{alertText(a, t)}</span>
            </p>
          ))}
          {h.note && (
            <p className="flex items-start gap-2">
              <StickyNote className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <span className="min-w-0">
                <span className="font-medium">{t("acces.note")}</span> {h.note.body} <span className="text-amber-700/80">· {fmtDate(h.note.at, { day: "numeric", month: "short" })}</span>
              </span>
            </p>
          )}
        </div>
      )}

      {h?.points && (
        <p className={cn("mt-3 flex items-center gap-2 text-slate-700", lg ? "text-base" : "text-[13px]")}>
          <Gift className="size-4 shrink-0 text-slate-400" />
          {t("acces.points", { n: h.points.balance, value: mad(h.points.value) })}
        </p>
      )}

      {ending && !h?.renewHref && <p className="mt-3 text-[13px] text-amber-700">{t("acces.renew_hint", { name: first })}</p>}

      {(renewHref || h?.unpaid || !v.ok) && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-black/5 pt-4">
          {h?.unpaid && (
            <LinkButton href={h.unpaid.href} variant="primary" className={btn}>
              {t("acces.pay_balance", { amount: mad(h.unpaid.amount) })}
            </LinkButton>
          )}
          {renewHref && (
            <LinkButton href={renewHref} variant="brand" className={btn}>
              {t("acces.renew")}
            </LinkButton>
          )}
          {!v.ok && !sport && (
            <LinkButton href={`/agenda/nouveau?contact=${v.contact.id}`} variant={renewHref ? "secondary" : "brand"} className={btn}>
              {t("acces.book")}
            </LinkButton>
          )}
          {!v.ok && !h?.unpaid && (
            <LinkButton href={`/caisse?contact=${v.contact.id}&etab=${v.entity_id}`} variant="primary" className={btn}>
              {t("acces.pay_entry")}
            </LinkButton>
          )}
          {!v.ok && v.canForce && onForce && !forcing && (
            <Button type="button" variant="secondary" className={btn} onClick={() => setForcing(true)}>
              <ShieldAlert /> {t("acces.force")}
            </Button>
          )}
        </div>
      )}

      {forcing && !v.ok && onForce && (
        <form
          className="mt-4 rounded-lg border border-line bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            onForce(reason);
          }}
        >
          <p className="text-[13px] font-medium text-slate-700">{t("acces.force_reason")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {FORCE_REASONS.map((k) => {
              const r = t(`acces.${k}`);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn("min-h-9 rounded-md border px-2.5 py-1 text-xs transition", reason === r ? "border-brand-300 bg-brand-50 text-brand-700" : "border-line text-slate-600 hover:bg-slate-50")}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex gap-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("acces.force_placeholder")} required minLength={3} maxLength={200} autoFocus aria-label={t("acces.force_reason")} />
            <Button type="submit" variant="dark" disabled={forcePending || reason.trim().length < 3}>
              {forcePending ? <Loader2 className="animate-spin" /> : null} {t("acces.validate")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
