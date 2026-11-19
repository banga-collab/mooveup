import { readFile } from "node:fs/promises";
import path from "node:path";
import { getProfile, getScope } from "@/lib/auth";
import { ENTITIES } from "@/lib/entities";
import { logAudit } from "@/lib/audit";
import { ROLE_LABEL, dayKey, fmtDate, fmtTime } from "@/lib/utils";
import { buildCsv } from "./csv";
import { fileBase, filtersText, headerLines, rowCount, sheetsOf, tableDoc } from "./doc";
import { slug } from "./format";
import { buildPrintHtml } from "./html";
import { buildXlsx, pngSize, type XlsxLogo } from "./xlsx";
import { EXPORT_FORMATS, type ExportFormat, type ExportMeta, type ExportTableInput, type ReportDoc } from "./types";

/*
 * Côté serveur : qui exporte, quand, sur quel périmètre, puis la réponse HTTP du fichier.
 * Utilisation dans une route :  return exportResponse(doc, readFormat(req, "xlsx"), req);
 */

/** Métadonnées d'export de l'utilisateur connecté (heure d'Agadir) */
export async function exportMeta(): Promise<ExportMeta> {
  const [p, scope] = await Promise.all([getProfile(), getScope()]);
  const now = new Date();
  const ids = scope.ids;
  const scopeLabel = scope.current
    ? scope.current.name
    : ids.length >= ENTITIES.length
      ? `Tous les établissements (${ids.length})`
      : ENTITIES.filter((e) => ids.includes(e.id))
          .map((e) => e.short)
          .join(", ");
  return {
    by: p.full_name || p.email,
    role: ROLE_LABEL[p.role] ?? p.role,
    at: `${fmtDate(now, { day: "2-digit", month: "2-digit", year: "numeric" })} à ${fmtTime(now)}`,
    day: dayKey(now),
    scope: scopeLabel,
  };
}

/** Format demandé dans l'URL (`?format=xlsx|pdf|csv`) */
export function readFormat(req: Request | URLSearchParams, def: ExportFormat = "xlsx"): ExportFormat {
  const sp = req instanceof URLSearchParams ? req : new URL(req.url).searchParams;
  const f = (sp.get("format") ?? "").toLowerCase();
  const alias = f === "excel" || f === "xls" ? "xlsx" : f;
  return (EXPORT_FORMATS as string[]).includes(alias) ? (alias as ExportFormat) : def;
}

let logoCache: XlsxLogo | null | undefined;
async function loadLogo(origin?: string): Promise<XlsxLogo | null> {
  if (logoCache !== undefined) return logoCache;
  let data: Uint8Array | null = null;
  try {
    data = new Uint8Array(await readFile(path.join(process.cwd(), "public", "logo.png")));
  } catch {
    if (origin) {
      try {
        const r = await fetch(new URL("/logo.png", origin), { cache: "force-cache" });
        if (r.ok) data = new Uint8Array(await r.arrayBuffer());
      } catch {
        /* sans logo */
      }
    }
  }
  const size = data ? pngSize(data) : null;
  logoCache = data && size ? { data, ...size } : null;
  return logoCache;
}

function disposition(kind: "attachment" | "inline", name: string) {
  const ascii = name.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Construit le fichier (sans authentification ni journal) */
export async function renderExport(doc: ReportDoc, format: ExportFormat, meta: ExportMeta, origin?: string): Promise<Response> {
  const sheets = sheetsOf(doc);
  const count = rowCount(doc, sheets);
  const base = `${slug(fileBase(doc))}_${meta.day}`;
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" };

  if (format === "pdf") {
    const html = buildPrintHtml(doc, meta, count);
    return new Response(html, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Disposition": disposition("inline", `${base}.html`) } });
  }
  const header = headerLines(doc, meta, count);
  if (format === "csv") {
    const csv = buildCsv({ header: header.map((h) => h.text), sheets });
    return new Response(csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": disposition("attachment", `${base}.csv`) } });
  }
  const logo = await loadLogo(origin);
  const bytes = buildXlsx({ sheets, header, logo, footer: `Groupe Moov'Up · ${doc.title} · ${meta.at}`, title: doc.title, author: meta.by });
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      ...headers,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": disposition("attachment", `${base}.xlsx`),
    },
  });
}

/**
 * Réponse d'export complète : métadonnées de l'utilisateur connecté, fichier,
 * et trace dans le journal (`audit_log`, action « export »).
 */
export async function exportResponse(doc: ReportDoc, format: ExportFormat, req?: Request): Promise<Response> {
  const [meta, profile, scope] = await Promise.all([exportMeta(), getProfile(), getScope()]);
  const res = await renderExport(doc, format, meta, req ? new URL(req.url).origin : undefined);
  const count = rowCount(doc, sheetsOf(doc));
  const filters = filtersText(doc);
  await logAudit({
    action: "export",
    entity_id: scope.current?.id ?? null,
    target_type: "export",
    target_id: null,
    summary: `Export ${format === "xlsx" ? "Excel" : format.toUpperCase()} : ${doc.title} (${count} ligne${count > 1 ? "s" : ""})${filters ? ` · ${filters}` : ""}`,
    actor: profile,
    meta: { format, title: doc.title, count },
  });
  return res;
}

/** Export d'un tableau simple (route `/api/export`) */
export function exportTableResponse(input: ExportTableInput, req?: Request) {
  return exportResponse(tableDoc(input), input.format, req);
}
