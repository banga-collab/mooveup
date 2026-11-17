"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { mad, madShort } from "@/lib/utils";

/** CA vs dépenses par mois (barres groupées, bleu / gris) */
export function MarginChart({ data }: { data: { label: string; ca: number; depenses: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={4}>
        <CartesianGrid vertical={false} stroke="#eef1f4" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#66727e" }} tickLine={false} axisLine={false} style={{ textTransform: "capitalize" }} />
        <YAxis tick={{ fontSize: 11, fill: "#66727e" }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => madShort(Number(v))} />
        <Tooltip
          cursor={{ fill: "rgba(26,109,142,.05)" }}
          contentStyle={{ borderRadius: 10, border: "1px solid #e5e9ee", fontSize: 12, padding: "8px 12px", boxShadow: "none" }}
          labelStyle={{ fontWeight: 600, color: "#16212b", marginBottom: 4, textTransform: "capitalize" }}
          formatter={(v, n) => [mad(Number(v)), n]}
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="ca" name="Chiffre d'affaires" fill="#1a6d8e" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey="depenses" name="Dépenses" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
