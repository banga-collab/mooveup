import { Clock, LogIn, LogOut } from "lucide-react";
import { entity } from "@/lib/entities";
import { agadirToIso, cn, dayKey, fmtTime } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import type { Shift, TimeEntry } from "@/lib/types-ops";
import { punch } from "@/actions/planning";
import { Avatar, Badge, Card, CardHeader, Empty, buttonClass, tableClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { NoResults, sortRows, type SortDir } from "@/components/reports/list-kit";
import { SortTh } from "@/components/reports/sort-th";
import { entryMinutes, fmtHours, hhmm, shiftMinutes } from "./lib";

const LATE_TOLERANCE = 5;

function lateness(shift: Shift | undefined, entry: TimeEntry | undefined) {
  if (!shift?.start_time || !entry) return 0;
  const planned = new Date(agadirToIso(shift.date, hhmm(shift.start_time))).getTime();
  return Math.round((new Date(entry.clock_in).getTime() - planned) / 60000);
}

/** Onglet Pointage : bouton personnel, tableau du jour, heures de la semaine */
export function PunchTab({
  me,
  team,
  manager,
  todayShifts,
  todayEntries,
  weekShifts,
  weekEntries,
  etat = null,
  sort = { key: "membre", dir: "asc" },
  filtered = false,
  q = "",
  clear = "/planning?onglet=pointage",
}: {
  /** Filtre d'état du tableau du jour */
  etat?: "present" | "retard" | "absent" | null;
  /** Tri du tableau « Heures de la semaine » */
  sort?: { key: "membre" | "prevu" | "pointe" | "retards"; dir: SortDir };
  filtered?: boolean;
  q?: string;
  clear?: string;
  me: Profile;
  team: Profile[];
  manager: boolean;
  todayShifts: Shift[];
  todayEntries: TimeEntry[];
  weekShifts: Shift[];
  weekEntries: TimeEntry[];
}) {
  const now = Date.now();
  const today = dayKey();
  const myShift = todayShifts.find((s) => s.profile_id === me.id && s.kind === "travail");
  const myEntries = todayEntries.filter((e) => e.profile_id === me.id).sort((a, b) => (a.clock_in < b.clock_in ? -1 : 1));
  const myOpen = myEntries.find((e) => !e.clock_out);
  const myWorked = myEntries.reduce((a, e) => a + entryMinutes(e, now), 0);
  const myOff = todayShifts.find((s) => s.profile_id === me.id && s.kind !== "travail");

  // Tableau du jour : toute personne prévue ou ayant pointé
  const ids = [...new Set([...todayShifts.filter((s) => s.kind === "travail").map((s) => s.profile_id), ...todayEntries.map((e) => e.profile_id)])];
  const people = team.filter((p) => ids.includes(p.id));
  const allRows = people
    .map((p) => {
      const shift = todayShifts.filter((s) => s.profile_id === p.id && s.kind === "travail").sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)))[0];
      const entries = todayEntries.filter((e) => e.profile_id === p.id).sort((a, b) => (a.clock_in < b.clock_in ? -1 : 1));
      const first = entries[0];
      const last = entries.at(-1);
      const late = lateness(shift, first);
      const startMs = shift?.start_time ? new Date(agadirToIso(today, hhmm(shift.start_time))).getTime() : null;
      return { p, shift, first, last, late, startMs };
    })
    .sort((a, b) => (a.shift?.start_time ?? "99").localeCompare(b.shift?.start_time ?? "99"));
  const lateCount = allRows.filter((r) => r.late > LATE_TOLERANCE).length;
  const missing = allRows.filter((r) => !r.first && r.startMs && r.startMs + 15 * 60000 < now).length;
  const rows = allRows.filter(
    (r) =>
      !etat ||
      (etat === "present" ? !!r.first : etat === "retard" ? r.late > LATE_TOLERANCE : !r.first && !!r.startMs && r.startMs + 15 * 60000 < now),
  );

  // Heures de la semaine
  const weekAll = team
    .map((p) => {
      const planned = weekShifts.filter((s) => s.profile_id === p.id).reduce((a, s) => a + shiftMinutes(s), 0);
      const entries = weekEntries.filter((e) => e.profile_id === p.id);
      const worked = entries.reduce((a, e) => a + entryMinutes(e, now), 0);
      const lates = entries.filter((e) => {
        const s = weekShifts.find((x) => x.profile_id === p.id && x.date === e.date && x.kind === "travail");
        return lateness(s, e) > LATE_TOLERANCE;
      }).length;
      return { p, planned, worked, lates };
    })
    .filter((r) => r.planned || r.worked);
  const week = sortRows(
    weekAll,
    (r) => (sort.key === "prevu" ? r.planned : sort.key === "pointe" ? r.worked : sort.key === "retards" ? r.lates : r.p.full_name),
    sort.dir,
  );

  const action = punch.bind(null, null);

  return (
    <div className="space-y-6">
      {/* Mon pointage */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", myOpen ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400")}>
              <Clock className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{myOpen ? `Au travail depuis ${fmtTime(myOpen.clock_in)}` : myEntries.length ? "Départ pointé" : "Pas encore pointé aujourd'hui"}</p>
              <p className="mt-0.5 text-[13px] text-muted">
                {myShift ? (
                  <>
                    Prévu {hhmm(myShift.start_time)}–{hhmm(myShift.end_time)} · {entity(myShift.entity_id)?.short}
                  </>
                ) : myOff ? (
                  myOff.kind === "repos" ? "Jour de repos prévu" : "En congé aujourd'hui"
                ) : (
                  "Aucun créneau prévu aujourd'hui"
                )}
                {myWorked > 0 && <> · {fmtHours(myWorked)} pointées</>}
              </p>
            </div>
          </div>
          <form action={action} className="sm:shrink-0">
            <button type="submit" className={buttonClass(myOpen ? "dark" : "brand", "h-12 w-full px-6 text-[15px] sm:w-auto")}>
              {myOpen ? <LogOut /> : <LogIn />}
              {myOpen ? "Pointer le départ" : "Pointer l'arrivée"}
            </button>
          </form>
        </div>
      </Card>

      {/* Aujourd'hui */}
      <Card>
        <CardHeader
          title="Aujourd'hui"
          subtitle={`${allRows.filter((r) => r.first).length} présent(s) sur ${allRows.length} prévu(s)${lateCount ? ` · ${lateCount} retard(s)` : ""}${missing ? ` · ${missing} non pointé(s)` : ""}`}
        />
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>Membre</th>
                  <th>Établissement</th>
                  <th>Prévu</th>
                  <th>Arrivée</th>
                  <th>Départ</th>
                  <th>État</th>
                  {manager && <th className="text-right" />}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, shift, first, last, late, startMs }) => {
                  const open = last && !last.clock_out;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={p.full_name} size={28} />
                          <span className="whitespace-nowrap font-medium text-ink">{p.full_name}</span>
                        </div>
                      </td>
                      <td>
                        <EntityBadge id={shift?.entity_id ?? first?.entity_id} />
                      </td>
                      <td className="whitespace-nowrap tabular-nums text-slate-600">{shift ? `${hhmm(shift.start_time)}–${hhmm(shift.end_time)}` : "—"}</td>
                      <td className={cn("whitespace-nowrap tabular-nums", late > LATE_TOLERANCE ? "font-semibold text-accent-600" : "text-ink")}>{first ? fmtTime(first.clock_in) : "—"}</td>
                      <td className="whitespace-nowrap tabular-nums text-ink">{last?.clock_out ? fmtTime(last.clock_out) : "—"}</td>
                      <td>
                        {first ? (
                          late > LATE_TOLERANCE ? (
                            <Badge tone="accent">Retard {late} min</Badge>
                          ) : open ? (
                            <Badge tone="green" dot>
                              Présent
                            </Badge>
                          ) : (
                            <Badge tone="gray">Parti</Badge>
                          )
                        ) : startMs && startMs + 15 * 60000 < now ? (
                          <Badge tone="red">Non pointé</Badge>
                        ) : (
                          <Badge tone="gray">À venir</Badge>
                        )}
                      </td>
                      {manager && (
                        <td className="text-right">
                          {p.id !== me.id && (
                            <form action={punch.bind(null, p.id)}>
                              <button type="submit" className={buttonClass("ghost", "h-8 px-2.5")}>
                                {open ? "Pointer le départ" : "Pointer l'arrivée"}
                              </button>
                            </form>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : filtered && (allRows.length > 0 || q) ? (
          <NoResults q={q} href={clear} what="membre" />
        ) : (
          <Empty icon={<Clock />} title="Personne n'est prévu aujourd'hui" text="Ajoutez des créneaux dans l'onglet Planning pour suivre les arrivées." />
        )}
      </Card>

      {/* Semaine */}
      <Card>
        <CardHeader title="Heures de la semaine" subtitle="Prévu au planning et pointé, du lundi à aujourd'hui inclus pour le pointé" />
        {week.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <SortTh col="membre" label="Membre" def />
                  <SortTh col="prevu" label="Prévu (semaine)" align="right" first="desc" />
                  <SortTh col="pointe" label="Pointé" align="right" first="desc" />
                  <SortTh col="retards" label="Retards" align="right" first="desc" />
                </tr>
              </thead>
              <tbody>
                {week.map(({ p, planned, worked, lates }) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap font-medium text-ink">{p.full_name}</td>
                    <td className="text-right tabular-nums text-slate-600">{planned ? fmtHours(planned) : "—"}</td>
                    <td className="text-right font-semibold tabular-nums text-ink">{worked ? fmtHours(worked) : "—"}</td>
                    <td className={cn("text-right tabular-nums", lates ? "font-semibold text-accent-600" : "text-slate-400")}>{lates || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : filtered && q ? (
          <NoResults q={q} href={clear} what="membre" />
        ) : (
          <Empty icon={<Clock />} title="Aucune heure cette semaine" />
        )}
      </Card>
    </div>
  );
}
