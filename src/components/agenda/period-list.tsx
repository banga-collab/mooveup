import Link from "next/link";
import type { ReactNode } from "react";
import { APPT_STATUS_LABEL, cn, dayKey, fmtTime, mad } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import type { GridAppt } from "./day-grid";
import { APPT_TONE } from "./status";

const dayTitle = (key: string) => new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));

/** Totaux d'une liste de rendez-vous (annulés exclus du CA et du nombre) */
export function periodTotals(list: GridAppt[]) {
  let count = 0;
  let expected = 0;
  let honored = 0;
  let absent = 0;
  let cancelled = 0;
  for (const a of list) {
    if (a.status === "annule") {
      cancelled++;
      continue;
    }
    count++;
    if (a.status === "absent") absent++;
    else expected += Number(a.price_mad);
    if (a.status === "arrive" || a.status === "termine") honored++;
  }
  return { count, expected, honored, absent, cancelled };
}

/**
 * Vue liste d'une période : rendez-vous groupés par jour, totaux en tête,
 * export (Excel / PDF / CSV) fourni par la page.
 */
export function PeriodList({ appts, today, selHref, dayHref, toolbar }: { appts: GridAppt[]; today: string; selHref: (id: string) => string; dayHref: (d: string) => string; toolbar?: ReactNode }) {
  const t = periodTotals(appts);
  const groups: { day: string; list: GridAppt[] }[] = [];
  for (const a of appts) {
    const d = dayKey(a.starts_at);
    const last = groups.at(-1);
    if (last?.day === d) last.list.push(a);
    else groups.push({ day: d, list: [a] });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white" data-period-list>
      {/* Totaux */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-line p-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-1 sm:grid-cols-4">
          <Total label="Rendez-vous" value={t.count} sub={t.cancelled ? `+ ${t.cancelled} annulé${t.cancelled > 1 ? "s" : ""}` : undefined} />
          <Total label="CA prévu" value={mad(t.expected)} />
          <Total label="Honorés" value={t.honored} sub={t.count ? `${Math.round((t.honored / t.count) * 100)} %` : undefined} />
          <Total label="Absents" value={t.absent} sub={t.count ? `${Math.round((t.absent / t.count) * 100)} %` : undefined} alert={t.absent > 0} />
        </div>
        {toolbar && <div className="shrink-0 px-1">{toolbar}</div>}
      </div>

      {groups.map(({ day, list }) => {
        const dt = periodTotals(list);
        return (
          <section key={day} aria-label={dayTitle(day)}>
            <h2 className="sticky top-0 z-[1] flex items-center gap-2 border-b border-line bg-slate-50/95 px-4 py-2 text-[13px] backdrop-blur">
              <Link href={dayHref(day)} className={cn("font-semibold capitalize hover:text-brand-600", day === today ? "text-accent-600" : "text-ink")}>
                {dayTitle(day)}
              </Link>
              {day === today && <Badge tone="accent">Aujourd&apos;hui</Badge>}
              <span className="ms-auto shrink-0 text-xs tabular-nums text-muted">
                {dt.count} RDV · {mad(dt.expected)}
              </span>
            </h2>
            <ul className="divide-y divide-line">
              {list.map((a) => {
                const off = a.status === "annule" || a.status === "absent";
                return (
                  <li key={a.id}>
                    <Link href={selHref(a.id)} scroll={false} className="flex min-w-0 items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50" data-row>
                      <span className="w-11 shrink-0 text-sm font-semibold tabular-nums text-ink">{fmtTime(a.starts_at)}</span>
                      <span className={cn("min-w-0 flex-1", off && "opacity-60")}>
                        <span className={cn("block truncate text-[13px] font-medium text-ink", a.status === "annule" && "line-through")}>{a.contactName}</span>
                        <span className="block truncate text-xs text-muted">
                          {a.service} · {a.duration_min} min{a.staffName ? <span className="sm:hidden"> · {a.staffName}</span> : null}
                        </span>
                      </span>
                      <span className="hidden w-36 shrink-0 truncate text-[13px] text-slate-600 sm:block">{a.staffName ?? "—"}</span>
                      <span className="hidden w-32 shrink-0 lg:block">
                        <EntityBadge id={a.entity_id} />
                      </span>
                      <span className="shrink-0">
                        <Badge tone={APPT_TONE[a.status].tone}>{APPT_STATUS_LABEL[a.status]}</Badge>
                      </span>
                      <span className="hidden w-20 shrink-0 text-end text-[13px] font-semibold tabular-nums text-ink sm:block">{mad(Number(a.price_mad))}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function Total({ label, value, sub, alert }: { label: string; value: ReactNode; sub?: string; alert?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg px-2.5 py-1.5">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className={cn("truncate text-lg font-semibold tabular-nums", alert ? "text-red-600" : "text-ink")}>
        {value}
        {sub && <span className="ms-1.5 text-xs font-normal text-muted">{sub}</span>}
      </p>
    </div>
  );
}
