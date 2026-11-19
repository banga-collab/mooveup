import Link from "next/link";
import type { ReactNode } from "react";
import { Ban, CalendarDays, CalendarPlus, CircleDollarSign, DoorOpen, Phone, Repeat, SearchX, StickyNote, UserCheck, UserRound, UserX, Zap } from "lucide-react";
import { getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getTeam } from "@/lib/data";
import { APPT_STATUS_LABEL, addDaysKey, agadirToIso, cn, dayKey, fmtTime, mad, madShort, pct } from "@/lib/utils";
import type { AppointmentStatus, Contact } from "@/lib/types";
import type { AppointmentSeries, SeriesAppointment } from "@/lib/types-agenda";
import { REPEAT_LABEL } from "@/lib/types-agenda";
import { Avatar, Card, DescList, Empty, LinkButton } from "@/components/ui";
import { EntityBadge, EntityMark } from "@/components/entity-icon";
import { entity } from "@/lib/entities";
import { KpiStrip, type KpiItem } from "@/components/kpi-strip";
import { TabletAction } from "@/components/tablet/dock";
import { AgendaBar, type BarDay, type BarSelect } from "@/components/agenda/agenda-bar";
import { ContactLink } from "@/components/quick-view/contact-link";
import { AppointmentActions, ApptStatusScope, LiveStatusBadge } from "@/components/agenda/appointment-actions";
import { TimeGrid, type GridAppt, type GridColumn } from "@/components/agenda/day-grid";
import { addMonthsKey, daysBetween, matchText, minutesOf } from "@/components/agenda/recurrence";
import { MonthView } from "@/components/agenda/month-view";
import { PeriodList, periodTotals } from "@/components/agenda/period-list";
import { PeriodExport } from "@/components/agenda/period-export";
import { Sheet } from "@/components/agenda/sheet";
import { UndoToast } from "@/components/agenda/undo-toast";

export const metadata = { title: "Agenda" };

const dayLabel = (key: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...opts, timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
const STATUSES = Object.keys(APPT_STATUS_LABEL) as AppointmentStatus[];

type SP = { date?: string; vue?: string; staff?: string; statut?: string; etab?: string; q?: string; sel?: string; du?: string; au?: string };
type View = "jour" | "semaine" | "mois" | "liste";
const VIEWS: View[] = ["jour", "semaine", "mois", "liste"];
const isKey = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
/** Période maximale de la vue liste (jours) */
const MAX_PERIOD = 92;

export default async function AgendaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const [sp, scope] = await Promise.all([searchParams, getScope()]);
  const supabase = await createClient();
  const today = dayKey();
  const date = isKey(sp.date) ? sp.date : today;
  const view: View = VIEWS.includes(sp.vue as View) ? (sp.vue as View) : "jour";
  const mondayOf = (d: string) => addDaysKey(d, -((new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7));
  const monday = mondayOf(date);
  const week = Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));
  /* Mois (grille lun → dim, semaines complètes) */
  const month = date.slice(0, 7);
  const monthStart = `${month}-01`;
  const monthEnd = addDaysKey(addMonthsKey(monthStart, 1), -1);
  const gridStart = mondayOf(monthStart);
  const gridDays = Array.from({ length: 7 * Math.ceil((daysBetween(gridStart, monthEnd) + 1) / 7) }, (_, i) => addDaysKey(gridStart, i));
  /* Période (vue liste) : du … au inclus, par défaut la semaine affichée */
  let du = isKey(sp.du) ? sp.du : monday;
  let au = isKey(sp.au) ? sp.au : addDaysKey(monday, 6);
  if (au < du) [du, au] = [au, du];
  const clamped = daysBetween(du, au) >= MAX_PERIOD;
  if (clamped) au = addDaysKey(du, MAX_PERIOD - 1);
  const [from, to] = view === "mois" ? [gridStart, addDaysKey(gridDays.at(-1)!, 1)] : view === "liste" ? [du, addDaysKey(au, 1)] : [monday, addDaysKey(monday, 7)];

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
    .gte("starts_at", agadirToIso(from, "00:00"))
    .lt("starts_at", agadirToIso(to, "00:00"))
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
  /* Rendez-vous filtrés de la plage chargée (semaine, grille du mois ou période) */
  const weekAppts = statusFilter ? searched.filter((a) => a.status === statusFilter) : searched;
  const dayAppts = weekAppts.filter((a) => dayKey(a.starts_at) === date);
  const inMonth = (a: GridAppt) => dayKey(a.starts_at).startsWith(month);
  const scopeList = view === "jour" ? dayAppts : view === "mois" ? weekAppts.filter(inMonth) : weekAppts;
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

  /* Chiffres (jour, semaine, mois ou période) */
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
  const href = (o: { date?: string; vue?: View; sel?: string | null; du?: string; au?: string }) => {
    const p = new URLSearchParams();
    const v = o.vue ?? view;
    const d = o.date ?? date;
    if (d !== today && v !== "liste") p.set("date", d);
    if (v !== "jour") p.set("vue", v);
    if (v === "liste") {
      p.set("du", o.du ?? du);
      p.set("au", o.au ?? au);
    }
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

  /* Listes déroulantes (les compteurs portent sur le jour ou la semaine affichés) */
  const inView = (a: GridAppt) => (view === "jour" ? dayKey(a.starts_at) === date : view === "mois" ? inMonth(a) : true);
  const selects: BarSelect[] = [];
  if (scope.ids.length > 1)
    selects.push({
      param: "etab",
      label: "Tous les établissements",
      value: etab,
      options: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ value: e.id, label: e.short, count: etab && etab !== e.id ? undefined : all.filter((a) => inView(a) && a.entity_id === e.id).length })),
    });
  const staffChips = [...practitioners].sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"));
  if (staffChips.length)
    selects.push({
      param: "staff",
      label: "Tous les praticiens",
      value: staffFilter,
      options: [...staffChips.map((p) => ({ value: p.id, label: p.full_name, count: all.filter((a) => inView(a) && a.staff_id === p.id).length })), { value: "aucun", label: "Sans praticien" }],
    });
  selects.push({
    param: "statut",
    label: "Tous les statuts",
    value: statusFilter,
    options: STATUSES.map((s) => ({ value: s, label: APPT_STATUS_LABEL[s], count: searched.filter((a) => inView(a) && a.status === s).length })),
  });

  const span = daysBetween(du, au) + 1;
  const shift = (n: -1 | 1) =>
    view === "mois"
      ? href({ date: addMonthsKey(monthStart, n), sel: null })
      : view === "liste"
        ? href({ du: addDaysKey(du, n * span), au: addDaysKey(au, n * span), sel: null })
        : href({ date: addDaysKey(date, n * (view === "semaine" ? 7 : 1)), sel: null });
  const barWeek: BarDay[] = week.map((d) => ({
    key: d,
    wd: dayLabel(d, { weekday: "short" }).replace(".", ""),
    num: Number(d.slice(8, 10)),
    count: d >= from && d < to ? (perDay.get(d) ?? 0) : null,
    href: href({ date: d, vue: "jour", sel: null }),
    active: view === "jour" && d === date,
    today: d === today,
  }));
  const showsToday = view === "jour" ? isToday : view === "semaine" ? week.includes(today) : view === "mois" ? today.startsWith(month) : false;
  const nextMonth = addMonthsKey(`${today.slice(0, 7)}-01`, 1);
  const periods = [
    { label: "Cette semaine", du: mondayOf(today), au: addDaysKey(mondayOf(today), 6) },
    { label: "Ce mois", du: `${today.slice(0, 7)}-01`, au: addDaysKey(nextMonth, -1) },
    { label: "Mois prochain", du: nextMonth, au: addDaysKey(addMonthsKey(nextMonth, 1), -1) },
    { label: "30 prochains jours", du: today, au: addDaysKey(today, 29) },
  ].map((x) => ({ label: x.label, href: href({ vue: "liste", du: x.du, au: x.au, sel: null }), active: view === "liste" && du === x.du && au === x.au }));
  const periodLabel = `${dayLabel(du, { day: "numeric", month: "short", ...(du.slice(0, 4) !== au.slice(0, 4) ? { year: "numeric" } : {}) })} – ${dayLabel(au, { day: "numeric", month: "short", year: "numeric" })}`;
  const viewLabel = view === "semaine" ? "de la semaine" : view === "mois" ? "du mois" : view === "liste" ? "de la période" : isToday ? "aujourd'hui" : "du jour";
  const kpis: KpiItem[] = [
    {
      label: `RDV ${viewLabel}`,
      value: live.length,
      sub: `${live.filter((a) => a.status === "confirme").length} confirmés · ${cancelled} annulé${cancelled > 1 ? "s" : ""}`,
      icon: <CalendarDays />,
    },
    { label: "Accueillis", value: welcomed.length, sub: live.length ? `${pct(welcomed.length, live.length)} % · ${live.filter((a) => a.status === "arrive").length} sur place` : "—", icon: <UserCheck /> },
    { label: "Absents", value: absents.length, sub: live.length ? `${pct(absents.length, live.length)} % des RDV` : "—", icon: <UserX />, alert: absents.length > 0 },
    { label: "CA prévu", value: madShort(expected), sub: `Terminés : ${mad(doneRevenue)}`, icon: <CircleDollarSign /> },
  ];

  const clearQs = new URLSearchParams({
    ...(date !== today && view !== "liste" ? { date } : {}),
    ...(view !== "jour" ? { vue: view } : {}),
    ...(view === "liste" ? { du, au } : {}),
  }).toString();
  const clearHref = `/agenda${clearQs ? `?${clearQs}` : ""}`;
  const empty = (
    <Card>
      <Empty
        icon={filtered ? <SearchX /> : <CalendarDays />}
        title={filtered ? "Aucun rendez-vous ne correspond" : view === "jour" ? "Aucun rendez-vous ce jour" : view === "semaine" ? "Aucun rendez-vous cette semaine" : view === "mois" ? "Aucun rendez-vous ce mois-ci" : "Aucun rendez-vous sur cette période"}
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
    <div className="space-y-3">
      <TabletAction href={newHref} label="Nouveau RDV" icon={<CalendarPlus />} />
      {/* Titre + actions (compact) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Agenda</h1>
          <span className="truncate text-[13px] text-muted">{scope.current ? <EntityBadge id={scope.current.id} /> : `${scope.allowed.length} établissements`}</span>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href="/express" variant="secondary" title="Client, rendez-vous ou abonnement et paiement en un seul écran">
            <Zap /> <span className="hidden sm:inline">Accueil express</span>
          </LinkButton>
          <LinkButton href={newHref} variant="brand">
            <CalendarPlus /> Nouveau rendez-vous
          </LinkButton>
        </div>
      </div>

      {/* Navigation, vue, recherche et filtres sur une ligne */}
      <AgendaBar
        view={view}
        title={
          view === "jour"
            ? dayLabel(date, { weekday: "long", day: "numeric", month: "long" })
            : view === "mois"
              ? dayLabel(monthStart, { month: "long", year: "numeric" })
              : view === "liste"
                ? periodLabel
                : `${dayLabel(monday, { day: "numeric", month: "short" })} – ${dayLabel(week[6]!, { day: "numeric", month: "short", year: "numeric" })}`
        }
        date={date}
        du={du}
        au={au}
        periods={periods}
        prevHref={shift(-1)}
        nextHref={shift(1)}
        prevWeekHref={href({ date: addDaysKey(date, -7), sel: null })}
        nextWeekHref={href({ date: addDaysKey(date, 7), sel: null })}
        todayHref={showsToday ? null : href({ date: today, vue: view === "liste" ? "jour" : view, sel: null })}
        tabs={[
          { id: "jour", label: "Jour", href: href({ vue: "jour", date: view === "liste" ? du : date, sel: null }) },
          { id: "semaine", label: "Semaine", href: href({ vue: "semaine", date: view === "liste" ? du : date, sel: null }) },
          { id: "mois", label: "Mois", href: href({ vue: "mois", date: view === "liste" ? du : date, sel: null }) },
          { id: "liste", label: "Liste", href: href({ vue: "liste", sel: null }) },
        ]}
        week={barWeek}
        selects={selects}
      />

      {/* Chiffres : repliés par défaut (préférence mémorisée) */}
      <KpiStrip id="agenda" defaultCollapsed items={kpis} />

      {view === "liste" && clamped && <p className="text-[13px] text-amber-700">Période limitée à {MAX_PERIOD} jours : affichage jusqu&apos;au {dayLabel(au, { day: "numeric", month: "long", year: "numeric" })}.</p>}

      {view === "mois" ? (
        <MonthView days={gridDays} month={month} today={today} appts={weekAppts} dayHref={(d) => href({ date: d, vue: "jour", sel: null })} />
      ) : view === "liste" ? (
        weekAppts.length === 0 ? (
          empty
        ) : (
          <PeriodList
            appts={weekAppts}
            today={today}
            selHref={(id) => href({ sel: id })}
            dayHref={(d) => href({ date: d, vue: "jour", sel: null })}
            toolbar={
              <PeriodExport
                title={`Agenda · ${periodLabel}`}
                filters={[
                  ...(etab ? [{ label: "Établissement", value: entity(etab)?.short ?? etab }] : []),
                  ...(staffFilter ? [{ label: "Praticien", value: staffFilter === "aucun" ? "Sans praticien" : (people.get(staffFilter)?.full_name ?? "") }] : []),
                  ...(statusFilter ? [{ label: "Statut", value: APPT_STATUS_LABEL[statusFilter] }] : []),
                  ...(q ? [{ label: "Recherche", value: q }] : []),
                ]}
                rows={weekAppts.map((a) => ({
                  date: dayLabel(dayKey(a.starts_at), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }),
                  heure: fmtTime(a.starts_at),
                  duree: a.duration_min,
                  client: a.contactName,
                  telephone: contacts.get(a.contact_id)?.phone ?? "",
                  prestation: a.service,
                  praticien: a.staffName ?? "",
                  etablissement: entity(a.entity_id)?.short ?? "",
                  salle: a.room ?? "",
                  statut: APPT_STATUS_LABEL[a.status],
                  prix: Number(a.price_mad),
                }))}
                totals={{ date: "Total", client: `${periodTotals(weekAppts).count} RDV`, prix: periodTotals(weekAppts).expected }}
              />
            }
          />
        )
      ) : view === "jour" ? (
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
    <p className="mt-1.5 text-center text-[11.5px] text-muted" data-grid-help>
      Glissez un rendez-vous pour le déplacer{week ? " d'un jour à l'autre" : " (heure ou praticien)"}, tirez son bord inférieur pour changer la durée, cliquez sur un créneau libre pour en créer un.
      <span className="hidden lg:inline"> Au clavier : Alt + flèches.</span>
    </p>
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
