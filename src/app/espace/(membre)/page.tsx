import Link from "next/link";
import { CalendarDays, CalendarPlus, ChevronRight, Gift, Receipt, Star, Ticket } from "lucide-react";
import { bestVerdict, ensureCard, evaluateAccess, loadAccessData, qrSvg, SPORT_ENTITIES } from "@/lib/access";
import { memberReadDb, memberSettings, memberWriteDb, requireMember } from "@/lib/member-auth";
import { pointsValue } from "@/lib/loyalty";
import { dayKey, mad } from "@/lib/utils";
import type { EntityId } from "@/lib/entities";
import type { Appointment, Subscription } from "@/lib/types";
import { EntityMark } from "@/components/entity-icon";
import { buttonClass } from "@/components/ui";
import { AccessCard } from "@/components/member/access-card";
import { MCard, SubProgress, getMt } from "@/components/member/parts";
import { mDate, mTime } from "@/components/member/i18n";

export const metadata = { title: "Accueil" };
export const dynamic = "force-dynamic";

const LIVE = ["prevu", "confirme", "arrive"];

export default async function MemberHome({ searchParams }: { searchParams: Promise<{ carte?: string }> }) {
  const [{ contact }, { lang, t }, sp, settings] = await Promise.all([requireMember(), getMt(), searchParams, memberSettings()]);
  const db = await memberReadDb();
  const today = dayKey();
  const nowIso = new Date().toISOString();

  const [{ data: subRows }, { data: apptRows }, { data: ledgerRows }, card] = await Promise.all([
    db.from("subscriptions").select("*").eq("contact_id", contact.id),
    db.from("appointments").select("*").eq("contact_id", contact.id).gte("starts_at", agoIso(2)).order("starts_at"),
    db.from("loyalty_ledger").select("points").eq("contact_id", contact.id),
    ensureCard(memberWriteDb(), contact.id).catch(() => null),
  ]);
  const subs = ((subRows ?? []) as Subscription[])
    .filter((s) => s.status !== "resilie" && s.end_date >= today && (s.status === "actif" || s.status === "suspendu"))
    .sort((a, b) => (a.end_date > b.end_date ? 1 : -1));
  const next = ((apptRows ?? []) as Appointment[]).find((a) => LIVE.includes(a.status) && a.starts_at >= nowIso) ?? null;
  const points = ((ledgerRows ?? []) as { points: number }[]).reduce((a, r) => a + Number(r.points), 0);

  // Droit d'entrée aujourd'hui (même règle que l'accueil)
  const entityIds = [...new Set([...contact.entity_ids, ...subs.map((s) => s.entity_id)])] as EntityId[];
  const access = entityIds.length ? await loadAccessData(db, contact.id, entityIds) : { subs: [], sales: [], appts: [] };
  const verdict = bestVerdict(entityIds.filter((e) => SPORT_ENTITIES.includes(e) || access.appts.some((a) => a.entity_id === e)).map((e) => evaluateAccess(e, access, today)));
  const svg = card ? await qrSvg(card.code) : null;

  const first = contact.full_name.split(/\s+/)[0] ?? contact.full_name;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t("m.hello", { name: first })}</h1>
        <p className="mt-0.5 text-[13px] capitalize text-muted">{mDate(lang, new Date(), { weekday: "long", day: "numeric", month: "long" })}</p>
      </div>

      <AccessCard
        svg={svg}
        code={card?.code ?? null}
        name={contact.full_name}
        ok={verdict ? verdict.ok : null}
        status={verdict ? (verdict.ok ? t("m.access.ok") : verdict.reason) : null}
        plan={verdict?.plan ?? null}
        autoOpen={sp.carte === "1"}
      />

      <MCard title={t("m.subs.active")} href="/espace/abonnements" link={t("m.seeAll")}>
        {subs.length ? (
          <div className="divide-y divide-line">
            {subs.map((s) => (
              <SubProgress key={s.id} sub={s} lang={lang} t={t} />
            ))}
          </div>
        ) : (
          <div className="px-4 pb-4 pt-1">
            <p className="text-[13px] text-muted">{t("m.subs.none")}</p>
            <Link href="/espace/abonnements" className={buttonClass("secondary", "mt-3 h-10")}>
              <Ticket /> {t("m.subs.renew")}
            </Link>
          </div>
        )}
      </MCard>

      <MCard title={t("m.rdv.next")} href="/espace/rdv" link={t("m.seeAll")}>
        {next ? (
          <Link href="/espace/rdv" className="flex items-center gap-3 px-4 pb-4 pt-2">
            <EntityMark id={next.entity_id} size={40} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{next.service}</span>
              <span className="block text-[13px] capitalize text-muted">
                {mDate(lang, next.starts_at, { weekday: "long", day: "numeric", month: "long" })} · {mTime(next.starts_at)}
              </span>
            </span>
            <ChevronRight className="size-4 text-slate-300 rtl:rotate-180" />
          </Link>
        ) : (
          <div className="flex items-center justify-between gap-3 px-4 pb-4 pt-1">
            <p className="text-[13px] text-muted">{t("m.rdv.none")}</p>
            <Link href="/espace/rdv?reserver=1" className={buttonClass("brand", "h-10")}>
              <CalendarPlus /> {t("m.rdv.book")}
            </Link>
          </div>
        )}
      </MCard>

      <Link href="/espace/fidelite" className="flex items-center gap-4 rounded-xl border border-line bg-white p-4 transition hover:border-slate-300">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Gift className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-muted">{t("m.points")}</span>
          <span className="block text-lg font-semibold tabular-nums text-ink">
            {points.toLocaleString("fr-FR")} pts
            <span className="ms-2 text-[13px] font-normal text-muted">{t("m.points.value", { mad: mad(pointsValue(Math.max(0, points), settings)) })}</span>
          </span>
        </span>
        <ChevronRight className="size-4 text-slate-300 rtl:rotate-180" />
      </Link>

      <div className="grid grid-cols-3 gap-2 [&>*]:min-w-0">
        <QuickLink href="/espace/rdv?reserver=1" icon={<CalendarDays />} label={t("m.rdv.book")} />
        <QuickLink href="/espace/achats" icon={<Receipt />} label={t("m.nav.purchases")} />
        <QuickLink href="/espace/avis" icon={<Star />} label={t("m.nav.reviews")} />
      </div>
    </div>
  );
}

function agoIso(hours: number) {
  return new Date(Date.now() - hours * 3600_000).toISOString();
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1.5 rounded-xl border border-line bg-white px-2 py-3 text-center text-[12.5px] font-medium text-slate-700 transition hover:border-slate-300 [&_svg]:size-5 [&_svg]:text-slate-400">
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
