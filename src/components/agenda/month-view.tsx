import Link from "next/link";
import { entity } from "@/lib/entities";
import { cn, dayKey, fmtTime } from "@/lib/utils";
import type { GridAppt } from "./day-grid";

const WEEKDAYS = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const SHOWN = 3;

/** « Fatima Zahra Benali » → « Fatima B. » */
const shortName = (full: string) => {
  const p = full.trim().split(/\s+/);
  return p.length < 2 ? full : `${p[0]} ${p[p.length - 1]![0]}.`;
};

/**
 * Vue mois : grille lun → dim. Chaque jour affiche le nombre de RDV et les premiers
 * (heure + client, couleur de l'établissement) puis « +N ». Un clic ouvre la journée.
 */
export function MonthView({
  days,
  month,
  today,
  appts,
  dayHref,
}: {
  /** Jours de la grille (semaines complètes) */
  days: string[];
  /** "AAAA-MM" du mois affiché */
  month: string;
  today: string;
  appts: GridAppt[];
  dayHref: (d: string) => string;
}) {
  const byDay = new Map<string, GridAppt[]>();
  for (const a of appts) {
    const k = dayKey(a.starts_at);
    const arr = byDay.get(k);
    if (arr) arr.push(a);
    else byDay.set(k, [a]);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white" data-month-view>
      <div className="grid grid-cols-7 border-b border-line bg-slate-50/60">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 py-2 text-center text-[11.5px] font-medium capitalize text-muted sm:px-2 sm:text-start">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 [&>*]:min-w-0">
        {days.map((d, i) => {
          const list = (byDay.get(d) ?? []).filter((a) => a.status !== "annule");
          const inMonth = d.startsWith(month);
          const isToday = d === today;
          const extra = Math.max(0, list.length - SHOWN);
          return (
            <Link
              key={d}
              href={dayHref(d)}
              scroll={false}
              aria-label={`${d.slice(8, 10)} : ${list.length} rendez-vous, voir la journée`}
              className={cn(
                "group flex min-h-[64px] flex-col gap-1 border-line p-1 transition hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/50 sm:min-h-[112px] sm:p-1.5",
                i % 7 !== 0 && "border-s",
                i >= 7 && "border-t",
                !inMonth && "bg-slate-50/50",
              )}
              data-month-day
            >
              <span className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-[12.5px] font-semibold tabular-nums",
                    isToday ? "bg-accent-500 text-white" : inMonth ? "text-ink" : "text-slate-400",
                  )}
                >
                  {Number(d.slice(8, 10))}
                </span>
                {list.length > 0 && <span className={cn("hidden rounded px-1 text-[11px] font-semibold tabular-nums sm:inline", inMonth ? "bg-slate-100 text-slate-600" : "text-slate-400")}>{list.length}</span>}
              </span>
              {/* Mobile : points de couleur ; bureau / tablette : premiers rendez-vous */}
              {list.length > 0 && (
                <span className="flex flex-col items-start gap-0.5 sm:hidden" aria-hidden>
                  <span className="flex gap-0.5">
                    {list.slice(0, 3).map((a) => (
                      <span key={a.id} className="size-1.5 rounded-full" style={{ background: entity(a.entity_id)?.color ?? "#1a6d8e" }} />
                    ))}
                  </span>
                  <span className="text-[10.5px] font-semibold tabular-nums text-slate-500">{list.length}</span>
                </span>
              )}
              <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {list.slice(0, SHOWN).map((a) => (
                  <span
                    key={a.id}
                    className={cn("flex min-w-0 items-center gap-1 rounded border-s-2 px-1 py-px text-[11.5px] leading-tight", a.status === "absent" && "opacity-55")}
                    style={{ borderInlineStartColor: entity(a.entity_id)?.color ?? "#1a6d8e", background: inMonth ? entity(a.entity_id)?.soft : undefined }}
                    title={`${fmtTime(a.starts_at)} · ${a.contactName} · ${a.service}`}
                  >
                    <span className="shrink-0 tabular-nums text-slate-500">{fmtTime(a.starts_at)}</span>
                    <span className="truncate font-medium text-ink">{shortName(a.contactName)}</span>
                  </span>
                ))}
                {extra > 0 && <span className="px-1 text-[11.5px] font-medium text-brand-600 group-hover:underline">+{extra} autre{extra > 1 ? "s" : ""}</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
