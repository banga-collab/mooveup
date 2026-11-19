import { escXml, fmtMad, fmtNum, fmtShort } from "./format";
import type { ChartSpec } from "./types";

/* Graphiques en SVG statique pour les exports PDF (aucune dépendance, rendu net à l'impression). */

export const PALETTE = ["#1a6d8e", "#74b2ca", "#94a3b8", "#12495f", "#cbd5e1", "#e8782a"];
const AXIS = "#6b7280";
const GRID = "#e5e7eb";
const FONT = `font-family="Inter, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"`;

type Unit = "mad" | "num" | "pct" | undefined;
const axisFmt = (v: number, u: Unit) => (u === "pct" ? `${Math.round(v)} %` : fmtShort(v));
export const valueFmt = (v: number, u: Unit) => (u === "pct" ? `${Math.round(v * 10) / 10} %` : u === "mad" ? fmtMad(v) : fmtNum(v));

function niceStep(max: number, ticks = 4) {
  if (max <= 0) return 1;
  const raw = max / ticks;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const m = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return m * p;
}

function scale(maxValue: number) {
  const step = niceStep(maxValue);
  const top = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}

const t = (x: number, y: number, s: string, attrs = "") => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" ${attrs}>${escXml(s)}</text>`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function legend(items: { name: string; color: string; dashed?: boolean }[], w: number) {
  let x = 0;
  const parts = items.map((it) => {
    const g = `<g transform="translate(${x},0)">${it.dashed ? `<line x1="0" y1="5" x2="12" y2="5" stroke="${it.color}" stroke-width="2" stroke-dasharray="3 2"/>` : `<rect x="2" y="1" width="8" height="8" rx="4" fill="${it.color}"/>`}${t(16, 9, it.name, `font-size="10" fill="#374151"`)}</g>`;
    x += 26 + it.name.length * 5.6;
    return g;
  });
  return `<g transform="translate(${Math.max(0, w - x)},0)">${parts.join("")}</g>`;
}

function svgWrap(w: number, h: number, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;display:block" ${FONT} role="img">${body}</svg>`;
}

function yAxis(ticks: number[], top: number, x0: number, x1: number, y0: number, h: number, unit: Unit) {
  return ticks
    .map((v) => {
      const y = y0 + h - (v / top) * h;
      return `<line x1="${x0}" x2="${x1}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>${t(x0 - 6, y + 3, axisFmt(v, unit), `font-size="9.5" fill="${AXIS}" text-anchor="end"`)}`;
    })
    .join("");
}

function xLabels(labels: string[], x0: number, gw: number, y: number) {
  const every = Math.ceil(labels.length / 14);
  return labels.map((l, i) => (i % every ? "" : t(x0 + gw * i + gw / 2, y, cap(l), `font-size="9.5" fill="${AXIS}" text-anchor="middle"`))).join("");
}

function bars(c: Extract<ChartSpec, { type: "bars" }>, W: number) {
  const multi = c.series.length > 1;
  const H = 230;
  const top = multi ? 24 : 12;
  const left = 54;
  const right = 8;
  const bottom = 22;
  const pw = W - left - right;
  const ph = H - top - bottom;
  const n = Math.max(1, c.labels.length);
  const colors = c.series.map((s, i) => s.color ?? PALETTE[i % PALETTE.length]!);
  const max = c.stacked
    ? Math.max(0, ...c.labels.map((_, i) => c.series.reduce((a, s) => a + Math.max(0, s.values[i] ?? 0), 0)))
    : Math.max(0, ...c.series.flatMap((s) => s.values));
  const { top: vmax, ticks } = scale(max);
  const gw = pw / n;
  let body = yAxis(ticks, vmax, left, W - right, top, ph, c.unit);
  const yOf = (v: number) => top + ph - (v / vmax) * ph;
  for (let i = 0; i < n; i++) {
    if (c.stacked || !multi) {
      const bw = Math.min(36, gw * 0.62);
      const x = left + gw * i + (gw - bw) / 2;
      let acc = 0;
      c.series.forEach((s, k) => {
        const v = Math.max(0, s.values[i] ?? 0);
        if (!v) return;
        const y1 = yOf(acc + v);
        const y0 = yOf(acc);
        body += `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0.5, y0 - y1).toFixed(1)}" fill="${colors[k]}" fill-opacity="${multi ? 0.85 : 1}"/>`;
        acc += v;
      });
      if (!multi && n <= 14 && acc > 0) body += t(x + bw / 2, yOf(acc) - 4, fmtShort(acc), `font-size="9" fill="#374151" text-anchor="middle"`);
    } else {
      const bw = Math.min(26, (gw * 0.8) / c.series.length);
      const start = left + gw * i + (gw - bw * c.series.length) / 2;
      c.series.forEach((s, k) => {
        const v = Math.max(0, s.values[i] ?? 0);
        const y = yOf(v);
        body += `<rect x="${(start + k * bw).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 1).toFixed(1)}" height="${Math.max(0, top + ph - y).toFixed(1)}" fill="${colors[k]}"/>`;
      });
    }
  }
  body += `<line x1="${left}" x2="${W - right}" y1="${top + ph}" y2="${top + ph}" stroke="#cbd5e1"/>`;
  body += xLabels(c.labels, left, gw, H - 6);
  if (multi) body += legend(c.series.map((s, i) => ({ name: s.name, color: colors[i]! })), W);
  return svgWrap(W, H, body);
}

function hbars(c: Extract<ChartSpec, { type: "hbars" }>, W: number) {
  const rowH = 24;
  const H = Math.max(40, c.items.length * rowH + 6);
  const labelW = 150;
  const valueW = 110;
  const pw = W - labelW - valueW;
  const max = Math.max(1e-9, ...c.items.map((i) => i.value));
  const vmax = c.unit === "pct" ? Math.max(10, Math.ceil(max / 5) * 5) : max;
  const body = c.items
    .map((it, i) => {
      const y = i * rowH + 4;
      const w = Math.max(it.value > 0 ? 1.5 : 0, (it.value / vmax) * pw);
      const label = it.label.length > 26 ? `${it.label.slice(0, 25)}…` : it.label;
      return (
        t(labelW - 8, y + 12, label, `font-size="10" fill="#374151" text-anchor="end"`) +
        `<rect x="${labelW}" y="${y + 3}" width="${pw}" height="12" rx="2" fill="#f1f5f9"/>` +
        `<rect x="${labelW}" y="${y + 3}" width="${w.toFixed(1)}" height="12" rx="2" fill="${it.color ?? PALETTE[0]}"/>` +
        t(labelW + pw + 8, y + 12, valueFmt(it.value, c.unit) + (it.hint ? ` · ${it.hint}` : ""), `font-size="9.5" fill="#111827"`)
      );
    })
    .join("");
  return svgWrap(W, H, body);
}

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p = (a: number) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return { x0: x0!, y0: y0!, x1: x1!, y1: y1!, large: a1 - a0 > Math.PI ? 1 : 0 };
}

/** Anneau seul (la légende est rendue en HTML à côté) */
export function donutSvg(c: Extract<ChartSpec, { type: "donut" }>) {
  const S = 170;
  const cx = S / 2;
  const cy = S / 2;
  const R = 80;
  const r = 52;
  const total = c.items.reduce((a, i) => a + Math.max(0, i.value), 0);
  let body = "";
  if (!total) body = `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="#e5e7eb" stroke-width="${R - r}"/>`;
  else {
    let a = 0;
    for (const it of c.items) {
      const v = Math.max(0, it.value);
      if (!v) continue;
      const da = (v / total) * Math.PI * 2;
      if (da >= Math.PI * 2 - 1e-6) {
        body += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${it.color}" stroke-width="${R - r}"/>`;
      } else {
        const o = arc(cx, cy, R, a, a + da);
        const i = arc(cx, cy, r, a, a + da);
        body += `<path d="M${o.x0.toFixed(2)} ${o.y0.toFixed(2)} A${R} ${R} 0 ${o.large} 1 ${o.x1.toFixed(2)} ${o.y1.toFixed(2)} L${i.x1.toFixed(2)} ${i.y1.toFixed(2)} A${r} ${r} 0 ${i.large} 0 ${i.x0.toFixed(2)} ${i.y0.toFixed(2)} Z" fill="${it.color}" stroke="#fff" stroke-width="1.5"/>`;
      }
      a += da;
    }
  }
  body += t(cx, cy + 2, c.unit === "num" ? fmtNum(total) : fmtShort(total), `font-size="15" font-weight="600" fill="#111827" text-anchor="middle"`);
  if (c.center) body += t(cx, cy + 17, c.center, `font-size="9.5" fill="${AXIS}" text-anchor="middle"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" ${FONT} role="img">${body}</svg>`;
}

function line(c: Extract<ChartSpec, { type: "line" }>, W: number) {
  const multi = c.series.length > 1;
  const H = 230;
  const top = multi ? 24 : 12;
  const left = 54;
  const right = 10;
  const bottom = 22;
  const pw = W - left - right;
  const ph = H - top - bottom;
  const n = Math.max(1, c.labels.length);
  const gw = pw / n;
  const vals = [...c.series.flatMap((s) => s.values), ...(c.band?.high ?? [])].filter((v): v is number => v !== null && Number.isFinite(v));
  const { top: vmax, ticks } = scale(Math.max(0, ...vals));
  const X = (i: number) => left + gw * i + gw / 2;
  const Y = (v: number) => top + ph - (v / vmax) * ph;
  let body = yAxis(ticks, vmax, left, W - right, top, ph, c.unit);
  if (c.band) {
    const idx = c.labels.map((_, i) => i).filter((i) => c.band!.low[i] !== null && c.band!.high[i] !== null);
    if (idx.length > 1) {
      const up = idx.map((i) => `${X(i).toFixed(1)},${Y(c.band!.high[i]!).toFixed(1)}`);
      const down = [...idx].reverse().map((i) => `${X(i).toFixed(1)},${Y(c.band!.low[i]!).toFixed(1)}`);
      body += `<polygon points="${[...up, ...down].join(" ")}" fill="#94a3b8" fill-opacity="0.18"/>`;
    }
  }
  const colors = c.series.map((s, i) => s.color ?? PALETTE[i % PALETTE.length]!);
  c.series.forEach((s, k) => {
    // segments continus (les valeurs nulles coupent la ligne)
    let seg: string[] = [];
    const segs: string[][] = [];
    s.values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        if (seg.length) segs.push(seg);
        seg = [];
      } else seg.push(`${X(i).toFixed(1)},${Y(v).toFixed(1)}`);
    });
    if (seg.length) segs.push(seg);
    for (const pts of segs) {
      if (s.area && pts.length > 1) {
        const first = pts[0]!.split(",")[0];
        const last = pts[pts.length - 1]!.split(",")[0];
        body += `<polygon points="${first},${top + ph} ${pts.join(" ")} ${last},${top + ph}" fill="${colors[k]}" fill-opacity="0.08"/>`;
      }
      body += `<polyline points="${pts.join(" ")}" fill="none" stroke="${colors[k]}" stroke-width="2" ${s.dashed ? 'stroke-dasharray="5 3"' : ""} stroke-linejoin="round"/>`;
      if (pts.length <= 24) body += pts.map((p) => `<circle cx="${p.split(",")[0]}" cy="${p.split(",")[1]}" r="2.4" fill="${colors[k]}"/>`).join("");
    }
  });
  body += `<line x1="${left}" x2="${W - right}" y1="${top + ph}" y2="${top + ph}" stroke="#cbd5e1"/>`;
  body += xLabels(c.labels, left, gw, H - 6);
  if (multi || c.band) body += legend([...c.series.map((s, i) => ({ name: s.name, color: colors[i]!, dashed: s.dashed })), ...(c.band ? [{ name: "Fourchette", color: "#cbd5e1" }] : [])], W);
  return svgWrap(W, H, body);
}

/** SVG d'un graphique (largeur logique `W`, mise à l'échelle par le navigateur) */
export function chartSvg(c: ChartSpec, W = 680): string {
  if (c.type === "bars") return bars(c, W);
  if (c.type === "hbars") return hbars(c, W);
  if (c.type === "line") return line(c, W);
  return donutSvg(c);
}
