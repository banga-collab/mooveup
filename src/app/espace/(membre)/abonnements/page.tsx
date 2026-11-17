import Link from "next/link";
import { CheckCircle2, CircleAlert, CreditCard, RefreshCw, Ticket } from "lucide-react";
import { cmiConfigured } from "@/lib/access";
import { memberReadDb, memberSettings, requireMember } from "@/lib/member-auth";
import { dayKey, mad } from "@/lib/utils";
import type { Subscription } from "@/lib/types";
import type { MemberRequest } from "@/lib/types-member";
import { requestRenewal } from "@/actions/member";
import { EntityBadge } from "@/components/entity-icon";
import { Badge, Empty, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { MCard, MTitle, SubProgress, SubStatus, getMt, type MT } from "@/components/member/parts";
import { mDate } from "@/components/member/i18n";

export const metadata = { title: "Abonnements" };
export const dynamic = "force-dynamic";

export default async function MemberSubscriptionsPage({ searchParams }: { searchParams: Promise<{ paiement?: string }> }) {
  const [{ contact }, { lang, t }, sp, settings] = await Promise.all([requireMember(), getMt(), searchParams, memberSettings()]);
  const db = await memberReadDb();
  const today = dayKey();
  const [{ data: subRows }, { data: reqRows }] = await Promise.all([
    db.from("subscriptions").select("*").eq("contact_id", contact.id).order("end_date", { ascending: false }),
    db.from("member_requests").select("*").eq("contact_id", contact.id).order("created_at", { ascending: false }),
  ]);
  const subs = (subRows ?? []) as Subscription[];
  const requests = ((reqRows ?? []) as MemberRequest[]).filter((r) => ["a_payer", "accueil", "paye"].includes(r.status)).slice(0, 5);
  const online = settings.cmi_enabled && cmiConfigured(settings.cmi_client_id);

  const current = subs.filter((s) => (s.status === "actif" || s.status === "suspendu") && s.end_date >= today).sort((a, b) => (a.end_date > b.end_date ? 1 : -1));
  const history = subs.filter((s) => !current.includes(s));
  const key = (s: Subscription) => `${s.entity_id}|${s.name}`;
  // Un seul bouton « Renouveler » par formule terminée (la plus récente, si elle n'est pas déjà en cours)
  const seen = new Set(current.map(key));
  const renewable = new Set<string>();
  for (const s of history) {
    if (seen.has(key(s))) continue;
    seen.add(key(s));
    if (s.status !== "resilie") renewable.add(s.id);
  }

  return (
    <div className="space-y-4">
      <MTitle title={t("m.nav.subs")} />

      {sp.paiement === "ok" && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {t("m.subs.paidOk")}
        </p>
      )}
      {sp.paiement === "echec" && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <CircleAlert className="mt-0.5 size-4 shrink-0" /> {t("m.subs.paidFail")}
        </p>
      )}

      {requests.length > 0 && (
        <MCard title={t("m.subs.pending")}>
          <ul className="divide-y divide-line">
            {requests.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.label}</p>
                  <p className="text-xs text-muted">
                    {r.ref} · {mad(r.amount_mad)} · {mDate(lang, r.created_at, { day: "numeric", month: "short" })}
                  </p>
                </div>
                {r.status === "a_payer" ? (
                  <Link href={`/espace/paiement/${r.id}`} className={buttonClass("brand", "h-9")}>
                    <CreditCard /> {t("m.subs.payNow")}
                  </Link>
                ) : (
                  <Badge tone={r.status === "paye" ? "green" : "amber"}>{r.status === "paye" ? t("m.subs.paid") : t("m.subs.payDesk")}</Badge>
                )}
              </li>
            ))}
          </ul>
        </MCard>
      )}

      <MCard title={t("m.subs.active")}>
        {current.length ? (
          <div className="divide-y divide-line">
            {current.map((s) => (
              <SubProgress key={s.id} sub={s} lang={lang} t={t} action={s.status === "actif" ? <RenewButton sub={s} online={online} t={t} /> : <SubStatus sub={s} lang={lang} />} />
            ))}
          </div>
        ) : (
          <Empty icon={<Ticket />} title={t("m.subs.none")} text={t("m.subs.noneText")} />
        )}
      </MCard>

      {history.length > 0 && (
        <MCard title={t("m.subs.history")}>
          <ul className="divide-y divide-line">
            {history.map((s) => (
              <li key={s.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{s.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      <EntityBadge id={s.entity_id} />
                      <span>{t("m.subs.from", { from: mDate(lang, s.start_date, { day: "numeric", month: "short" }), to: mDate(lang, s.end_date, { day: "numeric", month: "short", year: "numeric" }) })}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <SubStatus sub={s} lang={lang} />
                    <p className="mt-1 text-xs tabular-nums text-muted">{mad(s.price_mad)}</p>
                  </div>
                </div>
                {renewable.has(s.id) && (
                  <div className="mt-2.5">
                    <RenewButton sub={s} online={online} t={t} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </MCard>
      )}

      <p className="px-1 text-xs text-muted">{online ? t("m.subs.onlineNote") : t("m.subs.deskNote")}</p>
    </div>
  );
}

function RenewButton({ sub, online, t }: { sub: Subscription; online: boolean; t: MT }) {
  return (
    <form action={requestRenewal}>
      <input type="hidden" name="subscription_id" value={sub.id} />
      <SubmitButton variant={online ? "brand" : "secondary"} className="h-10" pendingText="…">
        <RefreshCw /> {online ? t("m.subs.renewPay") : t("m.subs.renew")}
      </SubmitButton>
    </form>
  );
}
