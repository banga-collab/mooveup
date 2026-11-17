"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { mad, madShort } from "@/lib/utils";

export type ForecastRow = { label: string; real?: number; forecast?: number; band?: [number, number]; mtd?: number; flags?: ("ramadan" | "ete")[] };

const BLUE = "var(--color-brand-500)";
const AXIS = { fontSize: 11, fill: "var(--color-muted)" };
const FLAG: Record<string, string> = { ramadan: "Ramadan", ete: "Été" };

/** CA mensuel : réel en trait plein, prévision en pointillés, zone d'incertitude grisée */
export function ForecastChart({ data }: { data: ForecastRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 18, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-line)" />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} style={{ textTransform: "capitalize" }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => madShort(Number(v))} />
        <Tooltip content={<Tip />} cursor={{ stroke: "var(--color-line)" }} />
        <Area type="monotone" dataKey="band" stroke="none" fill={BLUE} fillOpacity={0.1} isAnimationActive={false} connectNulls />
        <Line type="monotone" dataKey="real" stroke={BLUE} strokeWidth={2} dot={{ r: 2.5, fill: BLUE, strokeWidth: 0 }} isAnimationActive={false} />
        <Line type="monotone" dataKey="forecast" stroke={BLUE} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 2.5, fill: "var(--color-white, #fff)", stroke: BLUE, strokeWidth: 1.5 }} isAnimationActive={false} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

type TipProps = { active?: boolean; payload?: { payload: ForecastRow }[]; label?: string };

function Tip({ active, payload, label }: TipProps) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const isForecast = row.real === undefined;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-semibold capitalize text-ink">
        {label}
        {row.flags?.length ? <span className="ml-1.5 font-normal normal-case text-muted">· {row.flags.map((f) => FLAG[f]).join(", ")}</span> : null}
      </p>
      {isForecast ? (
        <>
          <p className="text-slate-600">
            Prévision : <span className="font-semibold tabular-nums text-ink">{mad(row.forecast)}</span>
          </p>
          {row.band && (
            <p className="text-muted tabular-nums">
              Fourchette : {madShort(row.band[0])} – {madShort(row.band[1])} MAD
            </p>
          )}
          {row.mtd !== undefined && <p className="text-muted tabular-nums">Réel à date : {mad(row.mtd)}</p>}
        </>
      ) : (
        <p className="text-slate-600">
          Réel : <span className="font-semibold tabular-nums text-ink">{mad(row.real)}</span>
        </p>
      )}
    </div>
  );
}
