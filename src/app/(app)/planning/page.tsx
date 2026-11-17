import Link from "next/link";
import { ChevronLeft, ChevronRight, Copy } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getTeam, lastMonths } from "@/lib/data";
import { addDaysKey, dayKey, fmtDate } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import type { Shift, TimeEntry } from "@/lib/types-ops";
import { copyPreviousWeek, deleteShift, saveShift } from "@/actions/planning";
import { Card, PageHeader, Segmented, buttonClass } from "@/components/ui";
import { ListToolbar, type FilterGroup } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { NoResults, ResultCount, clearHref, entityFilter, hasFilters, readSort, sortRows } from "@/components/reports/list-kit";
import { WeekBoard } from "@/components/planning/week-board";
import { PunchTab } from "@/components/planning/punch-tab";
import { CommissionsTab } from "@/components/planning/commissions-tab";
import { isDayKey, mondayOf, shiftMinutes } from "@/components/planning/lib";
import { computeCommissions } from "@/components/planning/compute";

export const metadata = { title: "Planning équipe" };

type Tab = "planning" | "pointage" | "commissions";

export default async function PlanningPage({ searchParams }: { searchParams: Promise<{ onglet?: string; semaine?: string; mois?: string; q?: string; etab?: string; creneaux?: string; etat?: string; tri?: string; ordre?: string }> }) {
  const [sp, me, scope] = await Promise.all([searchParams, getProfile(), getScope()]);
  const manager = me.role === "direction" || me.role === "manager";
  const tab: Tab = sp.onglet === "pointage" ? "pointage" : sp.onglet === "commissions" && manager ? "commissions" : "planning";
  const supabase = await createClient();
  const team = await getTeam(scope);
  const today = dayKey();
  const allowed = scope.allowed.map((e) => e.id as string);
  const entities = scope.allowed.filter((e) => scope.ids.includes(e.id));

  /* Recherche de membre (nom, poste, téléphone) + établissement, communs aux onglets */
  const q = (sp.q ?? "").trim();
  const etab = entities.some((e) => e.id === sp.etab) ? sp.etab! : null;
  const keep = (p: Profile) => matchesQuery(q, p.full_name, p.job_title, p.phone) && (!etab || !p.entity_ids.length || (p.entity_ids as string[]).includes(etab));
  const FILTERS = ["q", "etab", "creneaux", "etat", "tri", "ordre"];
  const clear = clearHref("/planning", sp, FILTERS);
  const isFiltered = hasFilters(sp, ["q", "etab", "creneaux", "etat"]);
  const baseFilters: FilterGroup[] = entityFilter(entities.map((e) => ({ id: e.id, short: e.short })));

  const tabs = [
    { id: "planning", label: "Planning", href: "/planning" },
    { id: "pointage", label: "Pointage", href: "/planning?onglet=pointage" },
    ...(manager ? [{ id: "commissions", label: "Commissions", href: "/planning?onglet=commissions" }] : []),
  ];

  /* ---------- Planning ---------- */
  if (tab === "planning") {
    const monday = mondayOf(isDayKey(sp.semaine) ? sp.semaine : today);
    const sunday = addDaysKey(monday, 6);
    const { data } = await supabase.from("shifts").select("*").gte("date", monday).lte("date", sunday);
    const teamIds = new Set(team.map((p) => p.id));
    const shifts = ((data ?? []) as Shift[]).filter((s) => teamIds.has(s.profile_id) && allowed.includes(s.entity_id));
    const days = Array.from({ length: 7 }, (_, i) => {
      const key = addDaysKey(monday, i);
      const noon = `${key}T12:00:00Z`;
      return {
        key,
        short: fmtDate(noon, { weekday: "short" }).replace(".", ""),
        num: fmtDate(noon, { day: "numeric" }),
        long: fmtDate(noon, { weekday: "long", day: "numeric", month: "long" }),
        today: key === today,
      };
    });
    const thisWeek = mondayOf(today);
    const label = `Semaine du ${fmtDate(`${monday}T12:00:00Z`, { day: "numeric", month: "long" })} au ${fmtDate(`${sunday}T12:00:00Z`, { day: "numeric", month: "long", year: "numeric" })}`;
    const nav = (m: string) => `/planning?semaine=${m}`;
    const hasShifts = shifts.length > 0;
    const planned = (id: string) => shifts.filter((s) => s.profile_id === id).reduce((a, s) => a + shiftMinutes(s), 0);
    const creneaux = sp.creneaux === "oui" || sp.creneaux === "non" ? sp.creneaux : null;
    const visible = sortRows(
      team.filter((p) => keep(p) && (!creneaux || (creneaux === "oui" ? shifts.some((s) => s.profile_id === p.id) : !shifts.some((s) => s.profile_id === p.id)))),
      (p) => (sp.tri === "heures" ? planned(p.id) : p.full_name),
      sp.tri === "heures" ? "desc" : "asc",
    );
    const visibleIds = new Set(visible.map((p) => p.id));

    return (
      <div className="space-y-5">
        <PageHeader
          title="Planning équipe"
          subtitle={label}
          actions={
            <>
              <div className="flex items-center rounded-lg border border-line bg-white">
                <Link href={nav(addDaysKey(monday, -7))} className="grid size-9 place-items-center text-slate-500 hover:text-ink" aria-label="Semaine précédente">
                  <ChevronLeft className="size-4" />
                </Link>
                <Link href={nav(thisWeek)} className="h-9 border-x border-line px-3 text-[13px] font-medium leading-9 text-ink hover:bg-slate-50">
                  Cette semaine
                </Link>
                <Link href={nav(addDaysKey(monday, 7))} className="grid size-9 place-items-center text-slate-500 hover:text-ink" aria-label="Semaine suivante">
                  <ChevronRight className="size-4" />
                </Link>
              </div>
              {manager && (
                <form action={copyPreviousWeek.bind(null, monday)}>
                  <button type="submit" className={buttonClass(hasShifts ? "secondary" : "brand")}>
                    <Copy /> Copier la semaine précédente
                  </button>
                </form>
              )}
            </>
          }
        />
        <Segmented items={tabs} active={tab} />
        {team.length > 0 && (
          <ListToolbar
            className="mb-0"
            placeholder="Rechercher un membre…"
            filters={[
              ...baseFilters,
              { param: "creneaux", label: "Tous", options: [{ value: "oui", label: "Planifiés" }, { value: "non", label: "Sans créneau" }] },
              { param: "tri", label: "Par nom", options: [{ value: "heures", label: "Heures prévues" }] },
            ]}
            right={<ResultCount shown={visible.length} total={team.length} filtered={isFiltered} unit="membre" />}
          />
        )}
        {team.length && !visible.length ? (
          <Card>
            <NoResults q={q} href={clear} what="membre" />
          </Card>
        ) : team.length ? (
          <WeekBoard
            key={visible.map((p) => p.id).join(",")}
            days={days}
            members={visible.map((p) => ({ id: p.id, name: p.full_name, job: p.job_title, entityIds: p.entity_ids.filter((e) => allowed.includes(e)) }))}
            entities={entities.map((e) => ({ id: e.id, short: e.short, color: e.color, soft: e.soft }))}
            shifts={isFiltered ? shifts.filter((s) => visibleIds.has(s.profile_id)) : shifts}
            canEdit={manager}
            save={saveShift}
            remove={deleteShift}
          />
        ) : (
          <p className="text-[13px] text-muted">Aucun membre de l&apos;équipe dans ce périmètre.</p>
        )}
        {manager && <p className="hidden text-xs text-muted md:block">Cliquez sur une case vide pour ajouter un créneau, sur un créneau pour le modifier ou le supprimer.</p>}
      </div>
    );
  }

  /* ---------- Pointage ---------- */
  if (tab === "pointage") {
    const monday = mondayOf(today);
    const sunday = addDaysKey(monday, 6);
    const [{ data: sh }, { data: te }] = await Promise.all([
      supabase.from("shifts").select("*").gte("date", monday).lte("date", sunday),
      supabase.from("time_entries").select("*").gte("date", monday).lte("date", sunday),
    ]);
    const teamIds = new Set([...team.map((p) => p.id), me.id]);
    const people = team.some((p) => p.id === me.id) ? team : [me, ...team];
    const weekShifts = ((sh ?? []) as Shift[]).filter((s) => teamIds.has(s.profile_id) && (allowed.includes(s.entity_id) || s.profile_id === me.id));
    const weekEntries = ((te ?? []) as TimeEntry[]).filter((e) => teamIds.has(e.profile_id) && (allowed.includes(e.entity_id) || e.profile_id === me.id));
    return (
      <div className="space-y-5">
        <PageHeader title="Planning équipe" subtitle={fmtDate(`${today}T12:00:00Z`, { weekday: "long", day: "numeric", month: "long" })} />
        <Segmented items={tabs} active={tab} />
        <ListToolbar
          className="mb-0"
          placeholder="Rechercher un membre…"
          filters={[
            ...baseFilters,
            {
              param: "etat",
              label: "Tous",
              options: [
                { value: "present", label: "Présents" },
                { value: "retard", label: "En retard" },
                { value: "absent", label: "Non pointés" },
              ],
            },
          ]}
        />
        <PunchTab
          me={me}
          team={people.filter(keep)}
          etat={sp.etat === "present" || sp.etat === "retard" || sp.etat === "absent" ? sp.etat : null}
          sort={readSort(sp, ["membre", "prevu", "pointe", "retards"] as const, "membre")}
          filtered={isFiltered}
          q={q}
          clear={clear}
          manager={manager}
          todayShifts={weekShifts.filter((s) => s.date === today)}
          todayEntries={weekEntries.filter((e) => e.date === today)}
          weekShifts={weekShifts}
          weekEntries={weekEntries}
        />
      </div>
    );
  }

  /* ---------- Commissions ---------- */
  const months = lastMonths(4);
  const month = months.some((m) => m.key === sp.mois) ? sp.mois! : months.at(-1)!.key;
  const [{ persons, rules, categories }, { data: pr }] = await Promise.all([computeCommissions(scope, month), supabase.from("profiles").select("*")]);
  const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(`${month}-15T12:00:00Z`));
  const profiles = byId(pr as Profile[]);
  const shownPersons = sortRows(
    persons.filter((p) => {
      const prof = profiles.get(p.profile_id);
      return matchesQuery(q, prof?.full_name, prof?.job_title, prof?.phone);
    }),
    (p) => (sp.tri === "nom" ? profiles.get(p.profile_id)?.full_name : sp.tri === "ca" ? p.caPrest + p.caProd : p.total),
    sp.tri === "nom" ? "asc" : "desc",
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Planning équipe" subtitle={`Commissions de ${monthLabel}`} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented items={tabs} active={tab} />
        <Segmented items={months.map((mo) => ({ id: mo.key, label: mo.label, href: `/planning?onglet=commissions&mois=${mo.key}` }))} active={month} />
      </div>
      <ListToolbar
        className="mb-0"
        placeholder="Rechercher un membre…"
        filters={[{ param: "tri", label: "Par commission", options: [{ value: "nom", label: "Par nom" }, { value: "ca", label: "Par chiffre d'affaires" }] }]}
        right={<ResultCount shown={shownPersons.length} total={persons.length} filtered={isFiltered} unit="personne" />}
      />
      <CommissionsTab
        visible={shownPersons}
        noResults={isFiltered && persons.length > 0 && !shownPersons.length ? <NoResults q={q} href={clear} what="membre" /> : null}
        monthLabel={monthLabel}
        monthKey={month}
        persons={persons}
        people={profiles}
        rules={rules}
        team={team}
        entities={entities.map((e) => ({ id: e.id, short: e.short }))}
        categories={categories}
      />
    </div>
  );
}
