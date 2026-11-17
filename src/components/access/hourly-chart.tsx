import { cn } from "@/lib/utils";

/** Fréquentation par heure : aujourd'hui (bleu) devant la moyenne des 30 derniers jours (gris) */
export function HourlyChart({ data, currentHour }: { data: { hour: number; today: number; avg: number }[]; currentHour: number }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.today, d.avg)));
  const peak = [...data].sort((a, b) => b.avg - a.avg).slice(0, 3).map((d) => d.hour);
  return (
    <div>
      <div className="flex h-40 items-end gap-1 sm:gap-1.5" role="img" aria-label="Entrées par heure, aujourd'hui et en moyenne">
        {data.map((d) => (
          <div key={d.hour} className="group relative flex h-full min-w-0 flex-1 items-end justify-center" title={`${d.hour} h : ${d.today} aujourd'hui · ${d.avg} en moyenne`}>
            <span className="absolute bottom-0 w-full rounded-t bg-slate-100" style={{ height: `${(d.avg / max) * 100}%` }} />
            <span
              className={cn("relative w-1/2 rounded-t", d.hour === currentHour ? "bg-brand-600" : "bg-brand-500")}
              style={{ height: `${(d.today / max) * 100}%`, minHeight: d.today ? 2 : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 sm:gap-1.5">
        {data.map((d) => (
          <span key={d.hour} className={cn("min-w-0 flex-1 text-center text-[10.5px] tabular-nums", d.hour === currentHour ? "font-semibold text-ink" : "text-slate-400")}>
            {d.hour % 2 === 0 ? d.hour : ""}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-brand-500" /> Aujourd&apos;hui
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-slate-200" /> Moyenne des 30 derniers jours
        </span>
        <span className="sm:ml-auto">
          Heures de pointe : {peak.sort((a, b) => a - b).map((h) => `${h} h`).join(", ")}
        </span>
      </div>
    </div>
  );
}
