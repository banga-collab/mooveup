import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { exportTableResponse } from "@/lib/export/server";
import { EXPORT_FORMATS, type ExportColumn, type ExportFormat, type ExportKind, type ExportRow, type ExportTableInput, type ExportValue } from "@/lib/export/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ROWS = 100_000;
const MAX_COLS = 80;
const KINDS: ExportKind[] = ["money", "int", "num", "pct", "text"];

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

const text = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max) : "");

function value(v: unknown): ExportValue {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v;
  return String(v).slice(0, 5000);
}

/** Valide la charge envoyée par `exportTable` (JSON ou formulaire `payload`) */
function parse(raw: unknown): ExportTableInput | string {
  if (!raw || typeof raw !== "object") return "Demande d'export illisible.";
  const o = raw as Record<string, unknown>;
  const format = text(o.format) as ExportFormat;
  if (!EXPORT_FORMATS.includes(format)) return "Format d'export inconnu (Excel, PDF ou CSV).";
  if (!Array.isArray(o.columns) || !o.columns.length) return "Aucune colonne à exporter.";
  if (o.columns.length > MAX_COLS) return `Trop de colonnes (${MAX_COLS} au plus).`;
  if (!Array.isArray(o.rows)) return "Aucune ligne à exporter.";
  if (o.rows.length > MAX_ROWS) return `Trop de lignes (${MAX_ROWS.toLocaleString("fr-FR")} au plus) : affinez les filtres.`;
  const columns: ExportColumn[] = [];
  for (const c of o.columns as Record<string, unknown>[]) {
    const key = text(c?.key, 80);
    if (!key) continue;
    columns.push({
      key,
      label: text(c.label, 120) || key,
      numeric: c.numeric === true,
      kind: KINDS.includes(c.kind as ExportKind) ? (c.kind as ExportKind) : undefined,
    });
  }
  const keys = columns.map((c) => c.key);
  const toRow = (r: unknown): ExportRow => {
    const src = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const out: ExportRow = {};
    for (const k of keys) out[k] = value(src[k]);
    return out;
  };
  const filters = Array.isArray(o.filters)
    ? (o.filters as unknown[]).slice(0, 20).map((f) => (typeof f === "string" ? f.slice(0, 200) : { label: text((f as Record<string, unknown>)?.label, 80), value: text((f as Record<string, unknown>)?.value, 300) }))
    : [];
  return {
    format,
    title: text(o.title, 140) || "Export",
    subtitle: text(o.subtitle, 200) || undefined,
    fileName: text(o.fileName, 80) || undefined,
    columns,
    rows: (o.rows as unknown[]).map(toRow),
    totals: o.totals ? toRow(o.totals) : undefined,
    filters,
  };
}

/** Export d'un tableau envoyé par le navigateur (vue filtrée, colonnes visibles) */
export async function POST(req: Request) {
  await getProfile(); // connecté (sinon redirection vers la connexion)
  let raw: unknown;
  try {
    const type = req.headers.get("content-type") ?? "";
    if (type.includes("application/json")) raw = await req.json();
    else {
      const form = await req.formData();
      raw = JSON.parse(String(form.get("payload") ?? ""));
    }
  } catch {
    return bad("Demande d'export illisible : rechargez la page puis réessayez.");
  }
  const input = parse(raw);
  if (typeof input === "string") return bad(input);
  return exportTableResponse(input, req);
}
