"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { mad, madShort } from "@/lib/utils";

const AXIS = { fontSize: 11, fill: "#66727e" };
const GRID = "#eef1f4";
const TIP = {
  contentStyle: { borderRadius: 12, border: "1px solid #e5e9ee", boxShadow: "0 10px 30px -10px rgb(16 24 40 / .18)", fontSize: 12, padding: "8px 12px" },
  labelStyle: { fontWeight: 700, color: "#16212b", marginBottom: 4, textTransform: "capitalize" as const },
  cursor: { fill: "rgba(26,109,142,.06)" },
};

const money = (v: unknown) => mad(Number(v));

export type Slice = { name: string; value: number; color: string };

/** CA mensuel empilé par établissement */
export function StackedRevenue({ data, series }: { data: Record<string, string | number>[]; series: { key: string; name: string; color: string }[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} style={{ textTransform: "capitalize" }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => madShort(Number(v))} />
        <Tooltip {...TIP} formatter={(v, n) => [money(v), n]} />
        {series.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} stackId="ca" fill={s.color} radius={i === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} maxBarSize={44} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barres simples (une couleur) */
export function MonthBars({ data, color, height = 240 }: { data: { label: string; value: number }[]; color: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => madShort(Number(v))} />
        <Tooltip {...TIP} formatter={(v) => [money(v), "CA"]} />
        <Bar dataKey="value" fill={color} radius={[8, 8, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Anneau avec total au centre et légende */
export function Donut({ data, isMoney = true, centerLabel }: { data: Slice[]; isMoney?: boolean; centerLabel: string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const fmt = (v: number) => (isMoney ? mad(v) : String(v));
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-[200px] w-[200px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...TIP} formatter={(v, n) => [fmt(Number(v)), n]} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="#fff" strokeWidth={2}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-lg font-extrabold text-ink">{isMoney ? madShort(total) : total}</p>
            <p className="text-[11px] font-medium text-muted">{centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-2">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-700">{d.name}</span>
            <span className="shrink-0 text-xs font-semibold text-muted">{total ? Math.round((d.value / total) * 100) : 0} %</span>
            <span className="w-24 shrink-0 text-right font-display text-[13px] font-bold">{fmt(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Nouveaux contacts par mois */
export function AreaTrend({ data, color, name }: { data: { label: string; value: number }[]; color: string; name: string }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip {...TIP} formatter={(v) => [String(v), name]} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill="url(#area-fill)" dot={{ r: 3, fill: "#fff", stroke: color, strokeWidth: 2 }} activeDot={{ r: 5 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Prospects gagnés / perdus par source */
export function ConversionBars({ data }: { data: { source: string; gagnes: number; perdus: number; taux: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 38 + 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="source" tick={AXIS} tickLine={false} axisLine={false} width={96} />
        <Tooltip
          {...TIP}
          labelFormatter={(l, p) => {
            const row = p?.[0]?.payload as { taux?: number } | undefined;
            return `${l} · ${row?.taux ?? 0} % de réussite`;
          }}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="gagnes" name="Gagnés" stackId="p" fill="#059669" maxBarSize={22} />
        <Bar dataKey="perdus" name="Perdus" stackId="p" fill="#f3b4b4" radius={[0, 6, 6, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barres horizontales colorées (montants ou pourcentages) */
export function HBars({ data, unit = "mad", height }: { data: (Slice & { hint?: string })[]; unit?: "mad" | "pct"; height?: number }) {
  const fmt = (v: number) => (unit === "mad" ? mad(v) : `${v} %`);
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(200, data.length * 40 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v) => (unit === "mad" ? madShort(Number(v)) : `${v} %`)} domain={unit === "pct" ? [0, (max: number) => Math.max(10, Math.ceil(max / 5) * 5)] : undefined} />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={104} />
        <Tooltip
          {...TIP}
          formatter={(v, _n, item) => {
            const hint = (item?.payload as { hint?: string } | undefined)?.hint;
            return [hint ? `${fmt(Number(v))} · ${hint}` : fmt(Number(v)), unit === "mad" ? "Montant" : "Taux"];
          }}
        />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={24}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
