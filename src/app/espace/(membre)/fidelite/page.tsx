import { Gift, History } from "lucide-react";
import { siteOrigin } from "@/lib/access";
import { memberReadDb, memberSettings, requireMember } from "@/lib/member-auth";
import { pointsValue, referralCode } from "@/lib/loyalty";
import { cn, dayKey, mad } from "@/lib/utils";
import type { GiftCard, LedgerKind, LedgerRow, Referral } from "@/lib/types-loyalty";
import { EntityBadge } from "@/components/entity-icon";
import { Badge, Empty } from "@/components/ui";
import { ShareReferral } from "@/components/member/share-referral";
import { MCard, MTitle, getMt } from "@/components/member/parts";
import { mDate } from "@/components/member/i18n";

export const metadata = { title: "Fidélité" };
export const dynamic = "force-dynamic";

const KIND: Record<LedgerKind, { fr: string; ar: string }> = {
  gain: { fr: "Achat", ar: "شراء" },
  utilisation: { fr: "Bon de réduction", ar: "قسيمة تخفيض" },
  parrainage: { fr: "Parrainage", ar: "دعوة صديق" },
  ajustement: { fr: "Ajustement", ar: "تعديل" },
  annulation: { fr: "Annulation", ar: "إلغاء" },
};

export default async function MemberLoyaltyPage() {
  const [{ contact }, { lang, t }, settings, origin] = await Promise.all([requireMember(), getMt(), memberSettings(), siteOrigin()]);
  const db = await memberReadDb();
  const [{ data: ledgerRows }, { data: refRows }, { data: giftOwn }, { data: giftBought }] = await Promise.all([
    db.from("loyalty_ledger").select("*").eq("contact_id", contact.id).order("created_at", { ascending: false }),
    db.from("referrals").select("*").eq("referrer_id", contact.id),
    db.from("gift_cards").select("*").eq("beneficiary_contact_id", contact.id),
    db.from("gift_cards").select("*").eq("buyer_contact_id", contact.id),
  ]);
  const ledger = (ledgerRows ?? []) as LedgerRow[];
  const balance = ledger.reduce((a, r) => a + Number(r.points), 0);
  const referrals = (refRows ?? []) as Referral[];
  const vouchers = ledger.filter((r) => r.kind === "utilisation" && r.voucher_code && !r.voucher_used);
  const today = dayKey();
  const cards = [...new Map([...((giftOwn ?? []) as GiftCard[]), ...((giftBought ?? []) as GiftCard[])].map((g) => [g.id, g])).values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const code = referralCode(contact);

  return (
    <div className="space-y-4">
      <MTitle title={t("m.nav.loyalty")} />

      <section className="rounded-xl border border-line bg-white p-5">
        <p className="text-[13px] text-muted">{t("m.points")}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums text-ink">
          {balance.toLocaleString("fr-FR")} <span className="text-base font-medium text-muted">pts</span>
        </p>
        <p className="mt-1 text-sm font-medium text-brand-700">{t("m.points.value", { mad: mad(pointsValue(Math.max(0, balance), settings)) })}</p>
        <p className="mt-3 text-xs text-muted">{t("m.points.rule", { n: settings.loyalty_points_per_10mad })}</p>
      </section>

      <MCard title={t("m.ref.title")}>
        <div className="px-4 pb-4 pt-1">
          <p className="mb-3 text-[13px] text-muted">{t("m.ref.text", { n: settings.referral_bonus_points })}</p>
          <ShareReferral code={code} url={`${origin}/reserver`} />
          {referrals.length > 0 && <p className="mt-3 text-xs text-muted">{t("m.ref.count", { n: referrals.length })}</p>}
        </div>
      </MCard>

      <MCard title={t("m.gift.title")}>
        {cards.length || vouchers.length ? (
          <ul className="divide-y divide-line">
            {vouchers.map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-semibold text-ink">{v.voucher_code}</p>
                  <p className="text-xs text-muted">{KIND.utilisation[lang]}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums text-ink">{mad(v.value_mad ?? 0)}</span>
              </li>
            ))}
            {cards.map((g) => {
              const live = g.status === "active" && g.expires_on >= today && g.balance_mad > 0;
              return (
                <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                  <Gift className="size-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold text-ink">{g.code}</p>
                    <p className="text-xs text-muted">{t("m.gift.expires", { date: mDate(lang, g.expires_on) })}</p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className={cn("text-sm font-semibold tabular-nums", live ? "text-ink" : "text-muted")}>{mad(g.balance_mad)}</p>
                    {!live && <Badge tone="gray">{g.status === "epuisee" || g.balance_mad <= 0 ? "Épuisée" : g.status === "annulee" ? "Annulée" : "Expirée"}</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 pb-4 pt-1 text-[13px] text-muted">{t("m.gift.none")}</p>
        )}
      </MCard>

      <MCard title={t("m.points.history")}>
        {ledger.length ? (
          <ul className="divide-y divide-line">
            {ledger.slice(0, 40).map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-ink">{r.note || KIND[r.kind][lang]}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{mDate(lang, r.created_at, { day: "numeric", month: "short", year: "numeric" })}</span>
                    <EntityBadge id={r.entity_id} />
                  </p>
                </div>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", r.points >= 0 ? "text-emerald-700" : "text-slate-600")}>
                  {r.points > 0 ? "+" : ""}
                  {r.points}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<History />} title={t("m.points.none")} />
        )}
      </MCard>
    </div>
  );
}
