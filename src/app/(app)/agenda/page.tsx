import Link from "next/link";
import {
  Ban,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock,
  DoorOpen,
  Phone,
  StickyNote,
  UserRound,
  UserX,
  Users,
} from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getTeam } from "@/lib/data";
import { entity } from "@/lib/entities";
import { APPT_STATUS_LABEL, addDaysKey, agadirToIso, cn, dayKey, fmtTime, mad, madShort, pct } from "@/lib/utils";
import type { Appointment, Contact } from "@/lib/types";
import { SolidTile } from "@/components/stat-tile";
import { Avatar, Card, Empty, LinkButton, PageHeader } from "@/components/ui";
import { EntityBadge, EntityMark } from "@/components/entity-icon";
import { AppointmentActions, APPT_TONE } from "@/components/agenda/appointment-actions";
import { DayGrid, minutesOf, type GridAppt, type GridColumn } from "@/components/agenda/day-grid";
import { Sheet } from "@/components/agenda/sheet";

export const metadata = { title: "Agenda" };

const dayLabel = (key: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ date?: string; staff?: string; sel?: string }> }) {
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && !Number.isNaN(Date.parse(sp.date)) ? sp.date : today;
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDaysKey(date, -dow);
  const week = Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));

  const team = await getTeam(scope);
  const staffFilter = sp.staff && (sp.staff === "aucun" || team.some((p) => p.id === sp.staff)) ? sp.staff : null;

  let q = supabase
    .from("appointments")
    .select("*")
    .in("entity_id", scope.ids)
    .gte("starts_at", agadirToIso(monday, "00:00"))
    .lt("starts_at", agadirToIso(addDaysKey(monday, 7), "00:00"));
  if (staffFilter === "aucun") q = q.is("staff_id", null);
  else if (staffFilter) q = q.eq("staff_id", staffFilter);
  const { data: weekRows } = await q.order("starts_at");
  const weekAppts = (weekRows ?? []) as Appointment[];
  const dayAppts = weekAppts.filter((a) => dayKey(a.starts_at) === date);

  const { data: contactRows } = await supabase.from("contacts").select("*").in("id", [...new Set(dayAppts.map((a) => a.contact_id))]);
  const contacts = byId(contactRows as Contact[]);
  const people = byId(team);
  const missingStaff = [...new Set(dayAppts.map((a) => a.staff_id).filter((s): s is string => !!s && !people.has(s)))];
  if (missingStaff.length) {
    const { data } = await supabase.from("profiles").select("*").in("id", missingStaff);
    for (const p of (data ?? []) as typeof team) people.set(p.id, p);
  }

  const appts: GridAppt[] = dayAppts.map((a) => ({
    ...a,
    contactName: contacts.get(a.contact_id)?.full_name ?? "Client",
    staffName: a.staff_id ? (people.get(a.staff_id)?.full_name ?? "Praticien") : null,
  }));

  /* Colonnes : praticiens du périmètre + ceux qui ont un RDV ce jour */
  const practitioners = team.filter((p) => p.role === "staff");
  const colIds = new Set<string>(practitioners.map((p) => p.id));
  appts.forEach((a) => a.staff_id && colIds.add(a.staff_id));
  let columns: GridColumn[] = [...colIds].map((id) => {
    const p = people.get(id);
    return { id, name: p?.full_name ?? "Praticien", job: p?.job_title ?? null };
  });
  columns.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  if (appts.some((a) => !a.staff_id)) columns.push({ id: null, name: "Sans praticien", job: "À attribuer" });
  if (staffFilter) columns = columns.filter((c) => (staffFilter === "aucun" ? c.id === null : c.id === staffFilter));
  if (!columns.length && staffFilter && staffFilter !== "aucun") {
    const p = people.get(staffFilter);
    columns = [{ id: staffFilter, name: p?.full_name ?? "Praticien", job: p?.job_title ?? null }];
  }

  /* Chiffres du jour */
  const live = appts.filter((a) => a.status !== "annule");
  const welcomed = live.filter((a) => a.status === "arrive" || a.status === "termine");
  const absents = live.filter((a) => a.status === "absent");
  const cancelled = appts.length - live.length;
  const expected = live.filter((a) => a.status !== "absent").reduce((s, a) => s + Number(a.price_mad), 0);
  const doneRevenue = live.filter((a) => a.status === "termine").reduce((s, a) => s + Number(a.price_mad), 0);
  const isToday = date === today;
  const nowMin = isToday ? minutesOf(new Date().toISOString()) : null;

  /* Liens */
  const href = (o: { date?: string; staff?: string | null; sel?: string | null }) => {
    const p = new URLSearchParams();
    const d = o.date ?? date;
    if (d !== today) p.set("date", d);
    const st = o.staff === undefined ? staffFilter : o.staff;
    if (st) p.set("staff", st);
    if (o.sel) p.set("sel", o.sel);
    const s = p.toString();
    return `/agenda${s ? `?${s}` : ""}`;
  };
  const selected = sp.sel ? appts.find((a) => a.id === sp.sel) ?? null : null;
  const staffChips = [...practitioners].sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"));
  const newHref = `/agenda/nouveau?date=${date}${staffFilter && staffFilter !== "aucun" ? `&staff=${staffFilter}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda"
        subtitle={
          <>
            <span className="capitalize">{dayLabel(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
            {" · "}
            {scope.current ? <b style={{ color: scope.current.color }}>{scope.current.short}</b> : `${scope.allowed.length} établissements`}
          </>
        }
        actions={
          <LinkButton href={newHref} className="h-11 rounded-2xl">
            <CalendarPlus className="size-4" /> Nouveau rendez-vous
          </LinkButton>
        }
      />

      {/* Tuiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile
          tone="brand"
          label={isToday ? "RDV aujourd'hui" : "RDV du jour"}
          value={live.length}
          sub={`${live.filter((a) => a.status === "confirme").length} confirmés · ${cancelled} annulé${cancelled > 1 ? "s" : ""}`}
          icon={<CalendarDays />}
          watermark={<CalendarDays />}
        />
        <SolidTile
          tone="green"
          label="Arrivés / terminés"
          value={welcomed.length}
          sub={`${live.filter((a) => a.status === "arrive").length} en cours sur place`}
          icon={<CalendarCheck2 />}
          watermark={<CalendarCheck2 />}
          trendLabel={live.length ? `${pct(welcomed.length, live.length)} %` : undefined}
          trendUp={null}
        />
        <SolidTile
          tone="accent"
          label="Absents"
          value={absents.length}
          sub={live.length ? `${pct(absents.length, live.length)} % des rendez-vous` : "Aucun rendez-vous"}
          icon={<UserX />}
          watermark={<UserX />}
        />
        <SolidTile
          tone="violet"
          label="CA prévu du jour"
          value={madShort(expected)}
          sub={`Terminés : ${mad(doneRevenue)}`}
          icon={<CircleDollarSign />}
          watermark={<CircleDollarSign />}
        />
      </div>

      {/* Navigation semaine */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link href={href({ date: addDaysKey(date, -7), sel: null })} aria-label="Semaine précédente" className="grid size-10 place-items-center rounded-xl border border-line bg-white text-slate-600 transition hover:border-brand-200 hover:text-brand-600">
              <ChevronLeft className="size-5" />
            </Link>
            <Link href={href({ date: addDaysKey(date, 7), sel: null })} aria-label="Semaine suivante" className="grid size-10 place-items-center rounded-xl border border-line bg-white text-slate-600 transition hover:border-brand-200 hover:text-brand-600">
              <ChevronRight className="size-5" />
            </Link>
            <p className="ml-1 font-display text-sm font-bold capitalize text-ink">
              {dayLabel(monday, { day: "numeric", month: "short" })} – {dayLabel(week[6]!, { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <form action="/agenda" className="hidden items-center gap-2 sm:flex">
              {staffFilter && <input type="hidden" name="staff" value={staffFilter} />}
              <input type="date" name="date" defaultValue={date} aria-label="Aller à la date" className="h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-50" />
              <button type="submit" className="h-10 rounded-xl border border-line bg-white px-3 text-sm font-semibold text-slate-600 hover:bg-canvas">
                Aller
              </button>
            </form>
            <Link
              href={href({ date: today, sel: null })}
              className={cn("inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition", isToday ? "bg-accent-50 text-accent-700" : "bg-accent-500 text-white shadow-sm shadow-accent-500/25 hover:bg-accent-600")}
            >
              <Clock className="size-4" /> Aujourd&apos;hui
            </Link>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1 sm:gap-2">
          {week.map((d) => {
            const n = weekAppts.filter((a) => a.status !== "annule" && dayKey(a.starts_at) === d).length;
            const active = d === date;
            const isNow = d === today;
            return (
              <Link
                key={d}
                href={href({ date: d, sel: null })}
                className={cn(
                  "relative flex min-w-0 flex-col items-center rounded-2xl px-1 py-2 transition sm:py-2.5",
                  active ? "bg-brand-500 text-white shadow-lg shadow-brand-500/25" : "text-slate-600 hover:bg-canvas",
                  isNow && !active && "ring-2 ring-inset ring-accent-300",
                )}
              >
                <span className={cn("text-[10px] font-bold uppercase tracking-wide sm:text-[11px]", active ? "text-white/80" : "text-muted")}>{dayLabel(d, { weekday: "short" }).replace(".", "")}</span>
                <span className="font-display text-lg font-extrabold leading-tight sm:text-xl">{Number(d.slice(8, 10))}</span>
                <span
                  className={cn(
                    "mt-0.5 rounded-full px-1.5 text-[10px] font-bold sm:px-2 sm:text-[11px]",
                    active ? "bg-white/20 text-white" : n ? "bg-brand-50 text-brand-600" : "text-slate-300",
                  )}
                >
                  {n}
                  <span className="hidden sm:inline"> RDV</span>
                </span>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Filtre praticien */}
      {staffChips.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <Link
            href={href({ staff: null, sel: null })}
            className={cn("inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition", !staffFilter ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-slate-600 hover:border-brand-200")}
          >
            <Users className="size-4" /> Tous
          </Link>
          {staffChips.map((p) => (
            <Link
              key={p.id}
              href={href({ staff: p.id, sel: null })}
              className={cn(
                "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-sm font-semibold transition",
                staffFilter === p.id ? "border-brand-500 bg-brand-500 text-white" : "border-line bg-white text-slate-600 hover:border-brand-200",
              )}
            >
              <Avatar name={p.full_name} size={30} />
              {p.full_name}
            </Link>
          ))}
        </div>
      )}

      {/* Vue du jour */}
      {appts.length === 0 && columns.length === 0 ? (
        <Card>
          <Empty icon={<CalendarDays className="size-6" />} title="Aucun rendez-vous ce jour" text="Ajoutez un rendez-vous ou choisissez un autre jour dans la semaine." action={<LinkButton href={newHref}><CalendarPlus className="size-4" /> Nouveau rendez-vous</LinkButton>} />
        </Card>
      ) : (
        <>
          {/* Bureau : grille horaire */}
          <div className="hidden md:block">
            <DayGrid appts={appts} columns={columns} nowMin={nowMin} selHref={(id) => href({ sel: id })} />
            {appts.length === 0 && <p className="mt-3 text-center text-sm text-muted">Aucun rendez-vous ce jour pour ce filtre.</p>}
          </div>

          {/* Mobile : liste chronologique */}
          <div className="space-y-3 md:hidden">
            {appts.length === 0 && (
              <Card>
                <Empty icon={<CalendarDays className="size-6" />} title="Aucun rendez-vous ce jour" action={<LinkButton href={newHref}><CalendarPlus className="size-4" /> Ajouter</LinkButton>} />
              </Card>
            )}
            {appts.map((a, i) => {
              const end = new Date(new Date(a.starts_at).getTime() + a.duration_min * 60000).toISOString();
              const off = a.status === "annule" || a.status === "absent";
              const prev = appts[i - 1];
              const showNow = nowMin !== null && minutesOf(a.starts_at) >= nowMin && (!prev || minutesOf(prev.starts_at) < nowMin);
              return (
                <div key={a.id}>
                  {showNow && (
                    <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-accent-600">
                      <span className="size-2.5 rounded-full bg-accent-500 ring-4 ring-accent-100" />
                      Maintenant
                      <span className="h-0.5 flex-1 bg-accent-500" />
                    </div>
                  )}
                  <Card className={cn("overflow-hidden border-l-4 p-4", off && "opacity-60")} style={{ borderLeftColor: entity(a.entity_id)?.color }}>
                    <div className="flex items-start gap-3">
                      <div className="w-12 shrink-0 text-center">
                        <p className="font-display text-base font-extrabold text-ink">{fmtTime(a.starts_at)}</p>
                        <p className="text-[11px] text-muted">{a.duration_min} min</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link href={`/contacts/${a.contact_id}`} className={cn("block truncate font-bold text-ink hover:text-brand-600", off && "line-through")}>
                          {a.contactName}
                        </Link>
                        <p className="truncate text-sm text-slate-600">{a.service}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          {a.room && (
                            <span className="inline-flex items-center gap-1">
                              <DoorOpen className="size-3" /> {a.room}
                            </span>
                          )}
                          {a.staffName && (
                            <span className="inline-flex items-center gap-1">
                              <UserRound className="size-3" /> {a.staffName}
                            </span>
                          )}
                          <span>jusqu&apos;à {fmtTime(end)}</span>
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset", APPT_TONE[a.status].pill)}>{APPT_STATUS_LABEL[a.status]}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                      <EntityBadge id={a.entity_id} />
                      <span className="font-display text-sm font-extrabold text-ink">{mad(Number(a.price_mad))}</span>
                    </div>
                    <div className="mt-3">
                      <AppointmentActions id={a.id} status={a.status} compact />
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Détail d'un rendez-vous */}
      {selected && <AppointmentSheet a={selected} contact={contacts.get(selected.contact_id) ?? null} closeHref={href({ sel: null })} />}
    </div>
  );
}

function AppointmentSheet({ a, contact, closeHref }: { a: GridAppt; contact: Contact | null; closeHref: string }) {
  const end = new Date(new Date(a.starts_at).getTime() + a.duration_min * 60000).toISOString();
  return (
    <Sheet
      closeHref={closeHref}
      icon={<EntityMark id={a.entity_id} size={44} />}
      title={a.service}
      subtitle={
        <span className="inline-flex flex-wrap items-center gap-2">
          {dayLabel(dayKey(a.starts_at), { weekday: "long", day: "numeric", month: "long" })} · {fmtTime(a.starts_at)} – {fmtTime(end)}
        </span>
      }
    >
      <div className="flex items-center gap-3 rounded-2xl bg-canvas p-3">
        <Avatar name={a.contactName} size={42} />
        <div className="min-w-0 flex-1">
          <Link href={`/contacts/${a.contact_id}`} className="block truncate font-bold text-ink hover:text-brand-600">
            {a.contactName}
          </Link>
          {contact?.phone && (
            <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand-600">
              <Phone className="size-3" /> {contact.phone}
            </a>
          )}
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset", APPT_TONE[a.status].pill)}>{APPT_STATUS_LABEL[a.status]}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl border border-line p-3">
          <dt className="text-xs text-muted">Établissement</dt>
          <dd className="mt-1">
            <EntityBadge id={a.entity_id} />
          </dd>
        </div>
        <div className="rounded-2xl border border-line p-3">
          <dt className="text-xs text-muted">Prix</dt>
          <dd className="mt-1 font-display font-extrabold text-ink">{mad(Number(a.price_mad))}</dd>
        </div>
        <div className="rounded-2xl border border-line p-3">
          <dt className="text-xs text-muted">Praticien</dt>
          <dd className="mt-1 truncate font-semibold text-ink">{a.staffName ?? "Non attribué"}</dd>
        </div>
        <div className="rounded-2xl border border-line p-3">
          <dt className="text-xs text-muted">Salle / cabine</dt>
          <dd className="mt-1 truncate font-semibold text-ink">{a.room ?? "—"}</dd>
        </div>
      </dl>
      {a.notes && (
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
          <StickyNote className="mt-0.5 size-4 shrink-0" /> {a.notes}
        </p>
      )}
      {a.status === "annule" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Ban className="size-4" /> Ce rendez-vous a été annulé.
        </p>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <AppointmentActions id={a.id} status={a.status} />
      </div>
    </Sheet>
  );
}
