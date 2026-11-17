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

/* Palette sobre : bleu Moov'Up, gris ; les couleurs d'établissement sont atténuées */
export const CHART_BLUE = "#1a6d8e";
export const CHART_MUTED = "#cbd5e1";
const ENTITY_OPACITY = 0.78;

const AXIS = { fontSize: 11, fill: "#6b7280" };
const GRID = "#f0f2f5";
const TIP = {
  contentStyle: { borderRadius: 8, border: "1px solid #e8ebef", boxShadow: "0 4px 12px -4px rgb(16 24 40 / .12)", fontSize: 12, padding: "8px 10px" },
  labelStyle: { fontWeight: 600, color: "#111827", marginBottom: 4, textTransform: "capitalize" as const },
  itemStyle: { padding: 0 },
  cursor: { fill: "rgba(15,23,42,.04)" },
};
const LEGEND = { iconType: "circle" as const, iconSize: 7, wrapperStyle: { fontSize: 12, color: "#475569", paddingTop: 8 } };

const money = (v: unknown) => mad(Number(v));

export type Slice = { name: string; value: number; color: string };

/** CA mensuel empilé par établissement (couleurs atténuées) */
export function StackedRevenue({ data, series }: { data: Record<string, string | number>[]; series: { key: string; name: string; color: string }[] }) {
  const single = series.length === 1;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} style={{ textTransform: "capitalize" }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => madShort(Number(v))} />
        <Tooltip {...TIP} formatter={(v, n) => [money(v), n]} />
        {!single && <Legend {...LEGEND} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="ca"
            fill={single ? CHART_BLUE : s.color}
            fillOpacity={single ? 1 : ENTITY_OPACITY}
            radius={i === series.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            maxBarSize={36}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barres simples (une couleur) */
export function MonthBars({ data, color = CHART_BLUE, height = 240 }: { data: { label: string; value: number }[]; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} style={{ textTransform: "capitalize" }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => madShort(Number(v))} />
        <Tooltip {...TIP} formatter={(v) => [money(v), "CA"]} />
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Anneau avec total au centre et légende chiffrée */
export function Donut({ data, isMoney = true, centerLabel, muted = false }: { data: Slice[]; isMoney?: boolean; centerLabel: string; muted?: boolean }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const fmt = (v: number) => (isMoney ? mad(v) : String(v));
  const op = muted ? ENTITY_OPACITY : 1;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-[176px] w-[176px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip {...TIP} formatter={(v, n) => [fmt(Number(v)), n]} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={84} paddingAngle={1.5} stroke="#fff" strokeWidth={2}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} fillOpacity={op} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-base font-semibold tabular-nums text-ink">{isMoney ? madShort(total) : total}</p>
            <p className="text-xs text-muted">{centerLabel}</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 divide-y divide-line">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2 py-1.5 text-[13px]">
            <span className="size-2 shrink-0 rounded-full" style={{ background: d.color, opacity: op }} />
            <span className="min-w-0 flex-1 truncate text-slate-700">{d.name}</span>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{total ? Math.round((d.value / total) * 100) : 0} %</span>
            <span className="w-24 shrink-0 text-right font-medium tabular-nums text-ink">{fmt(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Évolution mensuelle (ligne + aplat léger) */
export function AreaTrend({ data, color = CHART_BLUE, name }: { data: { label: string; value: number }[]; color?: string; name: string }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} style={{ textTransform: "capitalize" }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip {...TIP} formatter={(v) => [String(v), name]} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.75} fill={color} fillOpacity={0.06} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Prospects gagnés / perdus par source */
export function ConversionBars({ data }: { data: { source: string; gagnes: number; perdus: number; taux: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, data.length * 34 + 40)}>
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
        <Legend {...LEGEND} />
        <Bar dataKey="gagnes" name="Gagnés" stackId="p" fill={CHART_BLUE} maxBarSize={18} />
        <Bar dataKey="perdus" name="Perdus" stackId="p" fill={CHART_MUTED} radius={[0, 3, 3, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barres horizontales (montants ou pourcentages) — une seule couleur par défaut */
export function HBars({ data, unit = "mad", height, color = CHART_BLUE }: { data: (Partial<Slice> & { name: string; value: number; hint?: string })[]; unit?: "mad" | "pct"; height?: number; color?: string }) {
  const fmt = (v: number) => (unit === "mad" ? mad(v) : `${v} %`);
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(180, data.length * 34 + 20)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis
          type="number"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (unit === "mad" ? madShort(Number(v)) : `${v} %`)}
          domain={unit === "pct" ? [0, (max: number) => Math.max(10, Math.ceil(max / 5) * 5)] : undefined}
        />
        <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={104} />
        <Tooltip
          {...TIP}
          formatter={(v, _n, item) => {
            const hint = (item?.payload as { hint?: string } | undefined)?.hint;
            return [hint ? `${fmt(Number(v))} · ${hint}` : fmt(Number(v)), unit === "mad" ? "Montant" : "Taux"];
          }}
        />
        <Bar dataKey="value" fill={color} radius={[0, 3, 3, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
