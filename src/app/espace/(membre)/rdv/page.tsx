import Link from "next/link";
import { CalendarDays, CalendarPlus, X } from "lucide-react";
import { BOOKABLE } from "@/lib/access";
import { memberReadDb, memberWriteDb, requireMember } from "@/lib/member-auth";
import { dayKey } from "@/lib/utils";
import type { Appointment, AppointmentStatus, CatalogItem, Profile } from "@/lib/types";
import { cancelMemberAppointment } from "@/actions/member";
import { EntityBadge, EntityMark } from "@/components/entity-icon";
import { Badge, Empty, buttonClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { MemberBooking, type MemberBookItem } from "@/components/member/booking";
import { MCard, MTitle, getMt } from "@/components/member/parts";
import { mDate, mTime } from "@/components/member/i18n";

export const metadata = { title: "Rendez-vous" };
export const dynamic = "force-dynamic";

const LIVE: AppointmentStatus[] = ["prevu", "confirme", "arrive"];
const STATUS: Record<AppointmentStatus, { fr: string; ar: string; tone: "brand" | "green" | "gray" | "red" | "amber" }> = {
  prevu: { fr: "À confirmer", ar: "في انتظار التأكيد", tone: "amber" },
  confirme: { fr: "Confirmé", ar: "مؤكد", tone: "green" },
  arrive: { fr: "Sur place", ar: "حاضر", tone: "brand" },
  termine: { fr: "Terminé", ar: "منتهي", tone: "gray" },
  absent: { fr: "Absent", ar: "غائب", tone: "red" },
  annule: { fr: "Annulé", ar: "ملغى", tone: "gray" },
};
const CANCEL_LIMIT_MS = 24 * 3600_000;

export default async function MemberAppointmentsPage({ searchParams }: { searchParams: Promise<{ reserver?: string; e?: string }> }) {
  const [{ contact }, { lang, t }, sp] = await Promise.all([requireMember(), getMt(), searchParams]);
  const db = await memberReadDb();
  const admin = memberWriteDb();
  const booking = sp.reserver === "1";

  const [{ data: apptRows }, { data: staffRows }, { data: itemRows }] = await Promise.all([
    db.from("appointments").select("*").eq("contact_id", contact.id).order("starts_at", { ascending: false }),
    admin.from("profiles").select("id, full_name, role").eq("role", "staff"),
    booking ? admin.from("catalog_items").select("*").in("entity_id", BOOKABLE).eq("kind", "prestation").eq("active", true).order("price_mad") : Promise.resolve({ data: [] }),
  ]);
  const appts = (apptRows ?? []) as Appointment[];
  // Prénom du praticien (« Dr Kabbaj » pour un médecin)
  const short = (n: string) => (/^dr\.? /i.test(n) ? `Dr ${n.split(" ").slice(-1)[0]}` : (n.split(" ")[0] ?? n));
  const staff = new Map(((staffRows ?? []) as Pick<Profile, "id" | "full_name">[]).map((p) => [p.id, short(p.full_name)]));
  const now = Date.now();
  const upcoming = appts.filter((a) => LIVE.includes(a.status) && new Date(a.starts_at).getTime() >= now - 3600_000).reverse();
  const past = appts.filter((a) => !upcoming.includes(a)).slice(0, 15);

  const items: MemberBookItem[] = ((itemRows ?? []) as CatalogItem[]).map((i) => ({ id: i.id, entity_id: i.entity_id, name: i.name, category: i.category, price_mad: i.price_mad, duration_min: i.duration_min ?? 60 }));
  const entities = BOOKABLE.filter((e) => items.some((i) => i.entity_id === e));
  // Établissement proposé d'office : celui demandé, sinon celui que le client fréquente (s'il est réservable)
  const preferred = (sp.e && entities.includes(sp.e as never) ? sp.e : contact.entity_ids.find((e) => entities.includes(e))) ?? null;

  return (
    <div>
      <MTitle
        title={booking ? t("m.book.title") : t("m.nav.rdv")}
        action={
          booking ? (
            <Link href="/espace/rdv" className={buttonClass("ghost", "h-10")} aria-label={t("m.book.cancelBtn")}>
              <X /> {t("m.book.cancelBtn")}
            </Link>
          ) : (
            <Link href="/espace/rdv?reserver=1" className={buttonClass("brand", "h-10")}>
              <CalendarPlus /> {t("m.rdv.book")}
            </Link>
          )
        }
      />

      {booking ? (
        <MemberBooking entities={entities} items={items} today={dayKey()} initialEntity={preferred} />
      ) : (
        <div className="space-y-4">
          <MCard title={t("m.rdv.upcoming")}>
            {upcoming.length ? (
              <ul className="divide-y divide-line">
                {upcoming.map((a) => {
                  const cancellable = ["prevu", "confirme"].includes(a.status) && new Date(a.starts_at).getTime() - now >= CANCEL_LIMIT_MS;
                  return (
                    <li key={a.id} className="px-4 py-3.5">
                      <div className="flex items-start gap-3">
                        <EntityMark id={a.entity_id} size={40} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{a.service}</p>
                          <p className="text-[13px] capitalize text-slate-600">
                            {mDate(lang, a.starts_at, { weekday: "long", day: "numeric", month: "long" })} · {mTime(a.starts_at)}
                          </p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                            <EntityBadge id={a.entity_id} />
                            {a.staff_id && staff.get(a.staff_id) && <span>{t("m.rdv.with", { name: staff.get(a.staff_id)! })}</span>}
                          </p>
                        </div>
                        <Badge tone={STATUS[a.status].tone}>{STATUS[a.status][lang]}</Badge>
                      </div>
                      <div className="mt-2.5 ps-[52px]">
                        {cancellable ? (
                          <form action={cancelMemberAppointment}>
                            <input type="hidden" name="id" value={a.id} />
                            <ConfirmButton message={t("m.rdv.cancelConfirm")} className="h-9">
                              {t("m.rdv.cancel")}
                            </ConfirmButton>
                          </form>
                        ) : (
                          a.status !== "arrive" && <p className="text-xs text-muted">{t("m.rdv.cancelLate")}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty
                icon={<CalendarDays />}
                title={t("m.rdv.none")}
                text={t("m.rdv.noneText")}
                action={
                  <Link href="/espace/rdv?reserver=1" className={buttonClass("brand", "h-10")}>
                    <CalendarPlus /> {t("m.rdv.book")}
                  </Link>
                }
              />
            )}
          </MCard>

          {past.length > 0 && (
            <MCard title={t("m.rdv.past")}>
              <ul className="divide-y divide-line">
                {past.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{a.service}</p>
                      <p className="text-xs text-muted">
                        {mDate(lang, a.starts_at, { day: "numeric", month: "short", year: "numeric" })} · <EntityBadge id={a.entity_id} />
                      </p>
                    </div>
                    <Badge tone={STATUS[a.status].tone}>{STATUS[a.status][lang]}</Badge>
                  </li>
                ))}
              </ul>
            </MCard>
          )}
        </div>
      )}
    </div>
  );
}
