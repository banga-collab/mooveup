import Link from "next/link";
import type { ReactNode } from "react";
import { Ban, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, DoorOpen, Phone, Repeat, SearchX, StickyNote, UserRound, Zap } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getTeam } from "@/lib/data";
import { APPT_STATUS_LABEL, addDaysKey, agadirToIso, cn, dayKey, fmtTime, mad, madShort, pct } from "@/lib/utils";
import type { AppointmentStatus, Contact } from "@/lib/types";
import type { AppointmentSeries, SeriesAppointment } from "@/lib/types-agenda";
import { REPEAT_LABEL } from "@/lib/types-agenda";
import { Avatar, Card, DescList, Empty, Input, LinkButton, PageHeader, Segmented, buttonClass } from "@/components/ui";
import { EntityBadge, EntityMark } from "@/components/entity-icon";
import { ListToolbar, type FilterGroup } from "@/components/list-toolbar";
import { ContactLink } from "@/components/quick-view/contact-link";
import { AppointmentActions, ApptStatusScope, LiveStatusBadge } from "@/components/agenda/appointment-actions";
import { TimeGrid, type GridAppt, type GridColumn } from "@/components/agenda/day-grid";
import { matchText, minutesOf } from "@/components/agenda/recurrence";
import { Sheet } from "@/components/agenda/sheet";
import { UndoToast } from "@/components/agenda/undo-toast";

export const metadata = { title: "Agenda" };

const dayLabel = (key: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
const STATUSES = Object.keys(APPT_STATUS_LABEL) as AppointmentStatus[];

type SP = { date?: string; vue?: string; staff?: string; statut?: string; etab?: string; q?: string; sel?: string };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && !Number.isNaN(Date.parse(sp.date)) ? sp.date : today;
  const view: "jour" | "semaine" = sp.vue === "semaine" ? "semaine" : "jour";
  const dow = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDaysKey(date, -dow);
  const week = Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));

  /* Filtres */
  const team = await getTeam(scope);
  const etab = sp.etab ? (scope.ids.find((id) => id === sp.etab) ?? null) : null;
  const staffFilter = sp.staff && (sp.staff === "aucun" || team.some((p) => p.id === sp.staff)) ? sp.staff : null;
  const statusFilter = sp.statut && STATUSES.includes(sp.statut as AppointmentStatus) ? (sp.statut as AppointmentStatus) : null;
  const q = sp.q?.trim() || null;
  const entityIds = etab ? [etab] : scope.ids;

  const { data: weekRows } = await supabase
    .from("appointments")
    .select("*")
    .in("entity_id", entityIds)
    .gte("starts_at", agadirToIso(monday, "00:00"))
    .lt("starts_at", agadirToIso(addDaysKey(monday, 7), "00:00"))
    .order("starts_at");
  const rawWeek = (weekRows ?? []) as SeriesAppointment[];

  const contactIds = [...new Set(rawWeek.map((a) => a.contact_id))];
  const { data: contactRows } = contactIds.length ? await supabase.from("contacts").select("*").in("id", contactIds) : { data: [] };
  const contacts = byId(contactRows as Contact[]);
  const people = byId(team);
  const missingStaff = [...new Set(rawWeek.map((a) => a.staff_id).filter((s): s is string => !!s && !people.has(s)))];
  if (missingStaff.length) {
    const { data } = await supabase.from("profiles").select("*").in("id", missingStaff);
    for (const p of (data ?? []) as typeof team) people.set(p.id, p);
  }

  const all: GridAppt[] = rawWeek.map((a) => ({
    ...a,
    contactName: contacts.get(a.contact_id)?.full_name ?? "Client",
    staffName: a.staff_id ? (people.get(a.staff_id)?.full_name ?? "Praticien") : null,
  }));
  /* Recherche + praticien (avant le filtre de statut, pour compter les statuts) */
  const searched = all.filter(
    (a) =>
      (!staffFilter || (staffFilter === "aucun" ? !a.staff_id : a.staff_id === staffFilter)) &&
      matchText(q, a.contactName, a.service, contacts.get(a.contact_id)?.phone, a.staffName, a.room),
  );
  const weekAppts = statusFilter ? searched.filter((a) => a.status === statusFilter) : searched;
  const dayAppts = weekAppts.filter((a) => dayKey(a.starts_at) === date);
  const scopeList = view === "jour" ? dayAppts : weekAppts;
  const filtered = !!(q || staffFilter || statusFilter || etab);

  /* Colonnes (vue jour) : praticiens du périmètre + ceux qui ont un RDV ce jour */
  const practitioners = team.filter((p) => p.role === "staff" && (!etab || !p.entity_ids.length || p.entity_ids.includes(etab)));
  const colIds = new Set<string>(practitioners.map((p) => p.id));
  dayAppts.forEach((a) => a.staff_id && colIds.add(a.staff_id));
  let dayColumns: GridColumn[] = [...colIds].map((id) => {
    const p = people.get(id);
    return { key: id, label: p?.full_name ?? "Praticien", sub: p?.job_title ?? null, date, staffId: id, kind: "person" as const };
  });
  dayColumns.sort((a, b) => a.label.localeCompare(b.label, "fr"));
  if (dayAppts.some((a) => !a.staff_id) || staffFilter === "aucun") dayColumns.push({ key: "none", label: "Sans praticien", sub: "À attribuer", date, staffId: null, kind: "none" });
  if (staffFilter) dayColumns = dayColumns.filter((c) => (staffFilter === "aucun" ? c.staffId === null : c.staffId === staffFilter));
  if (!dayColumns.length && staffFilter && staffFilter !== "aucun") {
    const p = people.get(staffFilter);
    dayColumns = [{ key: staffFilter, label: p?.full_name ?? "Praticien", sub: p?.job_title ?? null, date, staffId: staffFilter, kind: "person" }];
  }
  /* Une recherche masque les praticiens sans résultat */
  if (q) dayColumns = dayColumns.filter((c) => dayAppts.some((a) => (a.staff_id ?? "none") === c.key));

  /* Chiffres (jour ou semaine) */
  const live = scopeList.filter((a) => a.status !== "annule");
  const welcomed = live.filter((a) => a.status === "arrive" || a.status === "termine");
  const absents = live.filter((a) => a.status === "absent");
  const cancelled = scopeList.length - live.length;
  const expected = live.filter((a) => a.status !== "absent").reduce((s, a) => s + Number(a.price_mad), 0);
  const doneRevenue = live.filter((a) => a.status === "termine").reduce((s, a) => s + Number(a.price_mad), 0);
  const isToday = date === today;
  const nowMin = week.includes(today) ? minutesOf(new Date().toISOString()) : null;

  const perDay = new Map<string, number>();
  for (const a of weekAppts) {
    if (a.status === "annule") continue;
    const k = dayKey(a.starts_at);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }

  /* Liens (conservent la vue et les filtres) */
  const href = (o: { date?: string; vue?: "jour" | "semaine"; sel?: string | null }) => {
    const p = new URLSearchParams();
    const d = o.date ?? date;
    if (d !== today) p.set("date", d);
    if ((o.vue ?? view) === "semaine") p.set("vue", "semaine");
    if (staffFilter) p.set("staff", staffFilter);
    if (statusFilter) p.set("statut", statusFilter);
    if (etab) p.set("etab", etab);
    if (q) p.set("q", q);
    if (o.sel) p.set("sel", o.sel);
    const s = p.toString();
    return `/agenda${s ? `?${s}` : ""}`;
  };
  const weekColumns: GridColumn[] = week.map((d) => ({
    key: d,
    label: dayLabel(d, { weekday: "short", day: "numeric" }).replace(".", ""),
    sub: `${perDay.get(d) ?? 0} RDV`,
    date: d,
    staffId: null,
    kind: "day",
    today: d === today,
    href: href({ date: d, vue: "jour", sel: null }),
  }));

  const selected = sp.sel ? (all.find((a) => a.id === sp.sel) ?? null) : null;
  let selectedSeries: AppointmentSeries | null = null;
  if (selected?.series_id) {
    const { data } = await supabase.from("appointment_series").select("*").eq("id", selected.series_id).maybeSingle();
    selectedSeries = data as AppointmentSeries | null;
  }
  const newHref = `/agenda/nouveau?date=${date}${staffFilter && staffFilter !== "aucun" ? `&staff=${staffFilter}` : ""}`;

  /* Filtres en puces (les compteurs portent sur le jour ou la semaine affichés) */
  const inView = (a: GridAppt) => view === "semaine" || dayKey(a.starts_at) === date;
  const filters: FilterGroup[] = [];
  if (scope.ids.length > 1)
    filters.push({
      param: "etab",
      label: "Tous les établissements",
      options: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ value: e.id, label: e.short, count: etab && etab !== e.id ? undefined : all.filter((a) => inView(a) && a.entity_id === e.id).length })),
    });
  const staffChips = [...practitioners].sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"));
  if (staffChips.length)
    filters.push({
      param: "staff",
      label: "Tous les praticiens",
      options: [...staffChips.map((p) => ({ value: p.id, label: p.full_name, count: all.filter((a) => inView(a) && a.staff_id === p.id).length })), { value: "aucun", label: "Sans praticien" }],
    });
  filters.push({
    param: "statut",
    label: "Tous les statuts",
    options: STATUSES.map((s) => ({ value: s, label: APPT_STATUS_LABEL[s], count: searched.filter((a) => inView(a) && a.status === s).length })),
  });

  const clearHref = `/agenda${date !== today || view === "semaine" ? `?${new URLSearchParams({ ...(date !== today ? { date } : {}), ...(view === "semaine" ? { vue: "semaine" } : {}) }).toString()}` : ""}`;
  const empty = (
    <Card>
      <Empty
        icon={filtered ? <SearchX /> : <CalendarDays />}
        title={filtered ? "Aucun rendez-vous ne correspond" : view === "jour" ? "Aucun rendez-vous ce jour" : "Aucun rendez-vous cette semaine"}
        text={filtered ? "Modifiez la recherche ou retirez des filtres." : "Ajoutez un rendez-vous ou choisissez une autre date."}
        action={
          filtered ? (
            <LinkButton href={clearHref} variant="secondary">
              Effacer les filtres
            </LinkButton>
          ) : (
            <LinkButton href={newHref} variant="brand">
              <CalendarPlus /> Nouveau rendez-vous
            </LinkButton>
          )
        }
      />
    </Card>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agenda"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span className="capitalize">
              {view === "jour" ? dayLabel(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : `Semaine du ${dayLabel(monday, { day: "numeric", month: "long" })}`}
            </span>
            <span className="text-slate-300">·</span>
            {scope.current ? <EntityBadge id={scope.current.id} /> : <span>{scope.allowed.length} établissements</span>}
          </span>
        }
        actions={
          <>
            <LinkButton href="/express" variant="secondary" title="Client, rendez-vous ou abonnement et paiement en un seul écran">
              <Zap /> Accueil express
            </LinkButton>
            <LinkButton href={newHref} variant="brand">
              <CalendarPlus /> Nouveau rendez-vous
            </LinkButton>
          </>
        }
      />

      {/* Chiffres */}
      <Card className="grid grid-cols-2 sm:grid-cols-4 sm:divide-x sm:divide-line [&>*]:min-w-0">
        <DayStat
          label={view === "semaine" ? "RDV de la semaine" : isToday ? "RDV aujourd'hui" : "RDV du jour"}
          value={live.length}
          sub={`${live.filter((a) => a.status === "confirme").length} confirmés · ${cancelled} annulé${cancelled > 1 ? "s" : ""}`}
        />
        <DayStat label="Accueillis" value={welcomed.length} sub={live.length ? `${pct(welcomed.length, live.length)} % · ${live.filter((a) => a.status === "arrive").length} sur place` : "—"} />
        <DayStat label="Absents" value={absents.length} sub={live.length ? `${pct(absents.length, live.length)} % des RDV` : "—"} alert={absents.length > 0} />
        <DayStat label="CA prévu" value={madShort(expected)} sub={`Terminés : ${mad(doneRevenue)}`} />
      </Card>

      {/* Navigation semaine + vue */}
      <Card className="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Link href={href({ date: addDaysKey(date, -7), sel: null })} aria-label="Semaine précédente" className={buttonClass("ghost", "w-9 px-0")}>
              <ChevronLeft />
            </Link>
            <Link href={href({ date: addDaysKey(date, 7), sel: null })} aria-label="Semaine suivante" className={buttonClass("ghost", "w-9 px-0")}>
              <ChevronRight />
            </Link>
            <p className="ml-1 text-sm font-semibold capitalize text-ink">
              {dayLabel(monday, { day: "numeric", month: "short" })} – {dayLabel(week[6]!, { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              active={view}
              items={[
                { id: "jour", href: href({ vue: "jour", sel: null }), label: "Jour" },
                { id: "semaine", href: href({ vue: "semaine", sel: null }), label: "Semaine" },
              ]}
            />
            <form action="/agenda" className="hidden items-center gap-2 lg:flex">
              {view === "semaine" && <input type="hidden" name="vue" value="semaine" />}
              {staffFilter && <input type="hidden" name="staff" value={staffFilter} />}
              {statusFilter && <input type="hidden" name="statut" value={statusFilter} />}
              {etab && <input type="hidden" name="etab" value={etab} />}
              {q && <input type="hidden" name="q" value={q} />}
              <Input type="date" name="date" defaultValue={date} aria-label="Aller à la date" className="h-9 w-auto" />
              <button type="submit" className={buttonClass("secondary")}>
                Aller
              </button>
            </form>
            {!isToday && (
              <Link href={href({ date: today, sel: null })} className={buttonClass("secondary")}>
                Aujourd&apos;hui
              </Link>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1">
          {week.map((d) => {
            const n = perDay.get(d) ?? 0;
            const active = view === "jour" && d === date;
            const isNow = d === today;
            return (
              <Link
                key={d}
                href={href({ date: d, vue: "jour", sel: null })}
                aria-current={active ? "date" : undefined}
                className={cn(
                  "flex min-w-0 flex-col items-center rounded-lg px-1 py-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                  active ? "bg-brand-500 text-white" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <span className={cn("text-[11px] capitalize", active ? "text-white/80" : "text-muted")}>{dayLabel(d, { weekday: "short" }).replace(".", "")}</span>
                <span className={cn("text-base font-semibold leading-tight tabular-nums sm:text-lg", isNow && !active && "text-accent-600")}>{Number(d.slice(8, 10))}</span>
                <span className={cn("text-[11px] tabular-nums", active ? "text-white/80" : n ? "text-slate-500" : "text-slate-300")}>
                  {n}
                  <span className="hidden sm:inline"> RDV</span>
                </span>
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Recherche et filtres */}
      <ListToolbar placeholder="Client, téléphone, prestation…" filters={filters} className="mb-0" />

      {view === "jour" ? (
        dayAppts.length === 0 && (dayColumns.length === 0 || filtered) ? (
          empty
        ) : (
          <>
            {/* Bureau / tablette : grille horaire interactive */}
            <div className="hidden md:block">
              <TimeGrid mode="day" appts={dayAppts} columns={dayColumns} today={today} nowMin={nowMin} hrefBase={href({ sel: null })} />
              <GridHelp />
            </div>
            {/* Mobile : liste chronologique */}
            <div className="md:hidden">{dayAppts.length === 0 ? empty : <MobileList appts={dayAppts} contacts={contacts} nowMin={isToday ? nowMin : null} />}</div>
          </>
        )
      ) : weekAppts.length === 0 && filtered ? (
        empty
      ) : (
        <>
          <div className="hidden md:block">
            <TimeGrid mode="week" appts={weekAppts} columns={weekColumns} today={today} nowMin={nowMin} hrefBase={href({ sel: null })} />
            <GridHelp week />
          </div>
          <div className="space-y-4 md:hidden">
            {weekAppts.length === 0
              ? empty
              : week
                  .filter((d) => weekAppts.some((a) => dayKey(a.starts_at) === d))
                  .map((d) => (
                    <section key={d}>
                      <h2 className="mb-2 text-[13px] font-semibold capitalize text-ink">
                        <Link href={href({ date: d, vue: "jour", sel: null })} className="hover:text-brand-600">
                          {dayLabel(d, { weekday: "long", day: "numeric", month: "long" })}
                        </Link>
                      </h2>
                      <MobileList appts={weekAppts.filter((a) => dayKey(a.starts_at) === d)} contacts={contacts} nowMin={d === today ? nowMin : null} />
                    </section>
                  ))}
          </div>
        </>
      )}

      {/* Détail d'un rendez-vous */}
      {selected && <AppointmentSheet a={selected} series={selectedSeries} contact={contacts.get(selected.contact_id) ?? null} closeHref={href({ sel: null })} />}
      <UndoToast />
    </div>
  );
}

function GridHelp({ week }: { week?: boolean }) {
  return (
    <p className="mt-2 text-center text-xs text-muted">
      Glissez un rendez-vous pour le déplacer{week ? " d'un jour à l'autre" : " (heure ou praticien)"}, tirez son bord inférieur pour changer la durée, cliquez sur un créneau libre pour en créer un.
      <span className="hidden lg:inline"> Au clavier : Alt + flèches.</span>
    </p>
  );
}

function DayStat({ label, value, sub, alert }: { label: string; value: ReactNode; sub: string; alert?: boolean }) {
  return (
    <div className="px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", alert ? "text-red-600" : "text-ink")}>{value}</p>
      <p className="truncate text-xs text-muted">{sub}</p>
    </div>
  );
}

function MobileList({ appts, contacts, nowMin }: { appts: GridAppt[]; contacts: Map<string, Contact>; nowMin: number | null }) {
  return (
    <Card className="divide-y divide-line">
      {appts.map((a, i) => {
        const end = new Date(new Date(a.starts_at).getTime() + a.duration_min * 60000).toISOString();
        const off = a.status === "annule" || a.status === "absent";
        const prev = appts[i - 1];
        const showNow = nowMin !== null && minutesOf(a.starts_at) >= nowMin && (!prev || minutesOf(prev.starts_at) < nowMin);
        const phone = contacts.get(a.contact_id)?.phone;
        return (
          <div key={a.id}>
            {showNow && (
              <div className="flex items-center gap-2 px-4 pt-2 text-[11px] font-medium text-accent-600">
                <span className="size-1.5 rounded-full bg-accent-500" />
                Maintenant
                <span className="h-px flex-1 bg-accent-200" />
              </div>
            )}
            <ApptStatusScope id={a.id} status={a.status}>
              <div className={cn("p-4", off && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <div className="w-12 shrink-0">
                    <p className="text-sm font-semibold tabular-nums text-ink">{fmtTime(a.starts_at)}</p>
                    <p className="text-[11px] tabular-nums text-muted">{a.duration_min} min</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <ContactLink id={a.contact_id} name={a.contactName} className={cn("block truncate text-sm", off && "line-through")} />
                    <p className="flex items-center gap-1 truncate text-[13px] text-slate-600">
                      {a.series_id && <Repeat className="size-3 shrink-0 text-slate-400" aria-label="Série" />}
                      <span className="truncate">{a.service}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
                      <EntityBadge id={a.entity_id} />
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
                      {phone && (
                        <a href={`tel:${phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:text-brand-600">
                          <Phone className="size-3" /> {phone}
                        </a>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <LiveStatusBadge status={a.status} />
                    <span className="text-[13px] font-semibold tabular-nums text-ink">{mad(Number(a.price_mad))}</span>
                  </div>
                </div>
                <div className="mt-3">
                  <AppointmentActions id={a.id} status={a.status} seriesId={a.series_id ?? null} compact />
                </div>
              </div>
            </ApptStatusScope>
          </div>
        );
      })}
    </Card>
  );
}

function AppointmentSheet({ a, series, contact, closeHref }: { a: GridAppt; series: AppointmentSeries | null; contact: Contact | null; closeHref: string }) {
  const end = new Date(new Date(a.starts_at).getTime() + a.duration_min * 60000).toISOString();
  const rows: [ReactNode, ReactNode][] = [
    ["Établissement", <EntityBadge key="e" id={a.entity_id} />],
    [
      "Prix",
      <span key="p" className="tabular-nums">
        {mad(Number(a.price_mad))}
      </span>,
    ],
    ["Praticien", a.staffName ?? "Non attribué"],
    ["Salle / cabine", a.room ?? "—"],
  ];
  if (series)
    rows.push([
      "Série",
      <span key="s" className="inline-flex items-center gap-1">
        <Repeat className="size-3.5 text-slate-400" /> {REPEAT_LABEL[series.freq]}
        {series.cancelled_at ? " · annulée" : ""}
      </span>,
    ]);
  return (
    <Sheet
      closeHref={closeHref}
      icon={<EntityMark id={a.entity_id} size={36} />}
      title={a.service}
      subtitle={
        <span className="capitalize">
          {dayLabel(dayKey(a.starts_at), { weekday: "long", day: "numeric", month: "long" })} · {fmtTime(a.starts_at)} – {fmtTime(end)}
        </span>
      }
    >
      <ApptStatusScope id={a.id} status={a.status}>
        <div className="flex items-center gap-3 rounded-lg border border-line p-3">
          <Avatar name={a.contactName} size={36} />
          <div className="min-w-0 flex-1">
            <ContactLink id={a.contact_id} name={a.contactName} className="block truncate text-sm" />
            {contact?.phone && (
              <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-brand-600">
                <Phone className="size-3" /> {contact.phone}
              </a>
            )}
          </div>
          <LiveStatusBadge status={a.status} />
        </div>

        <div className="mt-3">
          <DescList items={rows} />
        </div>
        {a.notes && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
            <StickyNote className="mt-0.5 size-4 shrink-0" /> {a.notes}
          </p>
        )}
        {a.status === "annule" && (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-muted">
            <Ban className="size-4" /> Ce rendez-vous a été annulé.
          </p>
        )}
        <div className="mt-5 border-t border-line pt-4">
          <AppointmentActions id={a.id} status={a.status} seriesId={a.series_id ?? null} />
        </div>
      </ApptStatusScope>
    </Sheet>
  );
}
