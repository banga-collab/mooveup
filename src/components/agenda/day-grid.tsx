import Link from "next/link";
import { DoorOpen, UserRound } from "lucide-react";
import { entity } from "@/lib/entities";
import { APPT_STATUS_LABEL, cn, fmtTime, isoToAgadir } from "@/lib/utils";
import type { Appointment } from "@/lib/types";
import { Avatar } from "@/components/ui";
import { EntityIcon, shade } from "@/components/entity-icon";
import { APPT_TONE } from "./appointment-actions";

export type GridAppt = Appointment & { contactName: string; staffName: string | null };
export type GridColumn = { id: string | null; name: string; job: string | null };

export const DAY_START = 8;
export const DAY_END = 21;
const HOUR_PX = 72;
const PX = HOUR_PX / 60;

/** Minutes depuis minuit (heure d'Agadir) */
export function minutesOf(iso: string) {
  const { time } = isoToAgadir(iso);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

/** Répartit les rendez-vous qui se chevauchent dans des couloirs côte à côte */
function layout(list: GridAppt[]) {
  const sorted = [...list].sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
  const out: { a: GridAppt; lane: number; lanes: number }[] = [];
  let cluster: { a: GridAppt; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const n = laneEnds.length;
    cluster.forEach((c) => (c.lanes = n));
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const a of sorted) {
    const s = minutesOf(a.starts_at);
    const e = s + a.duration_min;
    if (s >= clusterEnd && cluster.length) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(e);
    } else laneEnds[lane] = e;
    cluster.push({ a, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, e);
  }
  if (cluster.length) flush();
  return out;
}

/** Grille horaire du jour : une colonne par praticien (bureau) */
export function DayGrid({ appts, columns, nowMin, selHref }: { appts: GridAppt[]; columns: GridColumn[]; nowMin: number | null; selHref: (id: string) => string }) {
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
  const height = (DAY_END - DAY_START) * HOUR_PX;
  const showNow = nowMin !== null && nowMin >= DAY_START * 60 && nowMin <= DAY_END * 60;

  return (
    <div className="overflow-x-auto rounded-3xl border border-line bg-white shadow-card">
      <div className="min-w-full" style={{ width: `max(100%, ${56 + columns.length * 190}px)` }}>
        {/* En-têtes praticiens */}
        <div className="flex border-b border-line bg-white">
          <div className="w-14 shrink-0" />
          {columns.map((c) => {
            const n = appts.filter((a) => a.staff_id === c.id && a.status !== "annule").length;
            return (
              <div key={c.id ?? "none"} className="flex min-w-[190px] flex-1 items-center gap-2.5 border-l border-line px-3 py-3">
                {c.id ? (
                  <Avatar name={c.name} size={32} />
                ) : (
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-canvas text-slate-400">
                    <UserRound className="size-4" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{c.name}</p>
                  <p className="truncate text-[11px] text-muted">{c.job ?? "—"}</p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 font-display text-xs font-extrabold", n ? "bg-brand-50 text-brand-600" : "bg-canvas text-slate-400")}>{n}</span>
              </div>
            );
          })}
        </div>

        <div className="relative flex" style={{ height: height + 16 }}>
          {/* Heures */}
          <div className="relative w-14 shrink-0">
            {hours.map((h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] font-semibold tabular-nums text-slate-400" style={{ top: (h - DAY_START) * HOUR_PX + 8 }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>

          {/* Lignes horaires */}
          <div className="pointer-events-none absolute inset-y-0 left-14 right-0">
            {hours.map((h) => (
              <div key={h}>
                <span className="absolute inset-x-0 border-t border-line" style={{ top: (h - DAY_START) * HOUR_PX + 8 }} />
                {h < DAY_END && <span className="absolute inset-x-0 border-t border-dashed border-line/70" style={{ top: (h - DAY_START) * HOUR_PX + 8 + HOUR_PX / 2 }} />}
              </div>
            ))}
          </div>

          {/* Colonnes */}
          {columns.map((c) => {
            const list = appts.filter((a) => a.staff_id === c.id);
            return (
              <div key={c.id ?? "none"} className="relative min-w-[190px] flex-1 border-l border-line">
                {layout(list).map(({ a, lane, lanes }) => {
                  const e = entity(a.entity_id);
                  const color = e?.color ?? "#1a6d8e";
                  const start = minutesOf(a.starts_at);
                  const top = Math.max(0, (start - DAY_START * 60) * PX) + 8;
                  const h = Math.max(26, a.duration_min * PX - 3);
                  const end = new Date(new Date(a.starts_at).getTime() + a.duration_min * 60000).toISOString();
                  const off = a.status === "annule" || a.status === "absent";
                  const done = a.status === "termine";
                  const tiny = h < 44;
                  return (
                    <Link
                      key={a.id}
                      href={selHref(a.id)}
                      scroll={false}
                      title={`${fmtTime(a.starts_at)} – ${fmtTime(end)} · ${a.contactName} · ${a.service}${a.room ? ` · ${a.room}` : ""} · ${APPT_STATUS_LABEL[a.status]}`}
                      className={cn(
                        "group absolute overflow-hidden rounded-xl border-l-4 px-2 py-1 text-left shadow-sm transition hover:z-10 hover:-translate-y-0.5 hover:shadow-pop",
                        off && "opacity-55",
                      )}
                      style={{
                        top,
                        height: h,
                        left: `calc(${(lane / lanes) * 100}% + 4px)`,
                        width: `calc(${100 / lanes}% - 8px)`,
                        borderLeftColor: color,
                        background: done ? "#f8fafc" : `linear-gradient(135deg, ${e?.soft ?? "#eef6f9"}, ${shade(e?.soft ?? "#eef6f9", -3)})`,
                        boxShadow: `inset 0 0 0 1px ${color}22`,
                      }}
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="font-display text-[11px] font-extrabold tabular-nums" style={{ color }}>
                          {fmtTime(a.starts_at)}
                        </span>
                        {tiny && <span className={cn("min-w-0 flex-1 truncate text-[12px] font-semibold text-ink", off && "line-through")}>{a.contactName}</span>}
                        <span className={cn("ml-auto size-2 shrink-0 rounded-full", APPT_TONE[a.status].dot)} />
                      </span>
                      {!tiny && (
                        <>
                          <span className={cn("block truncate text-[13px] font-bold leading-tight text-ink", off && "line-through")}>{a.contactName}</span>
                          <span className="flex items-center gap-1 truncate text-[11px] text-slate-600">
                            <EntityIcon id={a.entity_id} className="size-3 shrink-0" style={{ color }} />
                            <span className="truncate">{a.service}</span>
                          </span>
                          {a.room && h >= 70 && (
                            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-muted">
                              <DoorOpen className="size-3 shrink-0" />
                              {a.room}
                            </span>
                          )}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}

          {/* Maintenant */}
          {showNow && (
            <div className="pointer-events-none absolute left-11 right-0 z-[5] flex items-center" style={{ top: ((nowMin ?? 0) - DAY_START * 60) * PX + 8 }}>
              <span className="size-2.5 -translate-x-1/2 rounded-full bg-accent-500 ring-4 ring-accent-100" />
              <span className="h-0.5 flex-1 bg-accent-500" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
