"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { importContacts, type ImportReport, type ImportRow } from "@/actions/import";
import { Button, Card, CardHeader, ErrorNote, LinkButton, Select, tableClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { cn } from "@/lib/utils";
import { FIELDS, decode, guessMapping, parseCsv, templateCsv, type ImportField } from "./csv";

const BATCH = 500;
const MAX_ROWS = 10_000;

type Parsed = { name: string; headers: string[]; rows: string[][]; delimiter: string };

export function Importer({ entities, defaultEntities }: { entities: { id: string; name: string }[]; defaultEntities: string[] }) {
  const [file, setFile] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Record<ImportField, number | null> | null>(null);
  const [chosen, setChosen] = useState<string[]>(defaultEntities);
  const [dupMode, setDupMode] = useState<"ignore" | "update">("ignore");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = async (f: File | undefined) => {
    setError(null);
    setReport(null);
    if (!f) return;
    if (!/\.(csv|txt)$/i.test(f.name)) {
      setError("Choisissez un fichier .csv. Depuis Excel : Fichier › Enregistrer sous › « CSV (séparateur : point-virgule) ».");
      return;
    }
    if (f.size > 15 * 1024 * 1024) {
      setError("Fichier trop volumineux (15 Mo maximum).");
      return;
    }
    const parsed = parseCsv(decode(await f.arrayBuffer()));
    if (!parsed.headers.length || !parsed.rows.length) {
      setError("Le fichier est vide ou illisible. La première ligne doit contenir les noms de colonnes.");
      return;
    }
    if (parsed.rows.length > MAX_ROWS) {
      setError(`Le fichier contient ${parsed.rows.length} lignes : découpez-le en fichiers de ${MAX_ROWS} lignes maximum.`);
      return;
    }
    setFile({ name: f.name, ...parsed });
    setMapping(guessMapping(parsed.headers));
  };

  const mapped = useMemo<ImportRow[]>(() => {
    if (!file || !mapping) return [];
    return file.rows.map((r, i) => {
      const row: ImportRow = { line: i + 2 };
      for (const f of FIELDS) {
        const col = mapping[f.id];
        if (col !== null && r[col] !== undefined) row[f.id] = r[col];
      }
      return row;
    });
  }, [file, mapping]);

  const run = async () => {
    if (!file || !mapping) return;
    if (mapping.full_name === null && mapping.first_name === null) return setError("Indiquez au moins la colonne du nom.");
    if (!chosen.length) return setError("Choisissez au moins un établissement.");
    setError(null);
    const total: ImportReport = { created: 0, updated: 0, ignored: [], errors: [] };
    setProgress({ done: 0, total: mapped.length });
    try {
      for (let i = 0; i < mapped.length; i += BATCH) {
        const r = await importContacts({
          rows: mapped.slice(i, i + BATCH),
          entity_ids: chosen,
          duplicates: dupMode,
          fileName: file.name,
          last: i + BATCH >= mapped.length,
          totals: { created: total.created, updated: total.updated },
        });
        total.created += r.created;
        total.updated += r.updated;
        total.ignored.push(...r.ignored);
        total.errors.push(...r.errors);
        setProgress({ done: Math.min(mapped.length, i + BATCH), total: mapped.length });
        if (r.errors.some((e) => e.line === 0)) break;
      }
      setReport(total);
    } catch {
      setError("L'import a été interrompu. Les lignes déjà traitées sont enregistrées ; relancez avec « Ignorer » les doublons.");
      setReport(total);
    } finally {
      setProgress(null);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "modele-import-clients.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    setMapping(null);
    setReport(null);
    setError(null);
    if (input.current) input.current.value = "";
  };

  /* ---------- Rapport final ---------- */
  if (report) {
    return (
      <div className="space-y-5">
        <ErrorNote message={error} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 [&>*]:min-w-0">
          {(
            [
              ["Créés", report.created, "text-emerald-700"],
              ["Mis à jour", report.updated, "text-brand-700"],
              ["Ignorés", report.ignored.length, "text-slate-700"],
              ["Erreurs", report.errors.length, report.errors.length ? "text-red-700" : "text-slate-700"],
            ] as const
          ).map(([label, n, tone]) => (
            <Card key={label} className="p-4">
              <p className="text-[13px] text-muted">{label}</p>
              <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone)}>{n}</p>
            </Card>
          ))}
        </div>
        {report.errors.length > 0 && (
          <Card>
            <CardHeader title="Lignes non importées" subtitle="Corrigez-les dans le fichier puis relancez l'import (les doublons seront ignorés)." />
            <div className="max-h-96 overflow-auto border-t border-line">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className="w-20">Ligne</th>
                    <th>Problème</th>
                  </tr>
                </thead>
                <tbody>
                  {report.errors.map((e, i) => (
                    <tr key={i}>
                      <td className="tabular-nums text-muted">{e.line || "—"}</td>
                      <td className="text-red-700">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {report.ignored.length > 0 && (
          <details className="rounded-xl border border-line bg-white">
            <summary className="cursor-pointer px-5 py-3.5 text-sm font-semibold text-ink">Lignes ignorées ({report.ignored.length})</summary>
            <div className="max-h-80 overflow-auto border-t border-line">
              <table className={tableClass}>
                <tbody>
                  {report.ignored.map((e, i) => (
                    <tr key={i}>
                      <td className="w-20 tabular-nums text-muted">{e.line}</td>
                      <td>{e.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/contacts" variant="brand">
            Voir les clients
          </LinkButton>
          <Button variant="secondary" onClick={reset}>
            Importer un autre fichier
          </Button>
        </div>
      </div>
    );
  }

  /* ---------- Choix du fichier ---------- */
  if (!file || !mapping) {
    return (
      <div className="space-y-5">
        <ErrorNote message={error} />
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void load(e.dataTransfer.files[0]);
          }}
          className={cn("flex cursor-pointer flex-col items-center rounded-xl border border-dashed bg-white px-6 py-12 text-center transition", drag ? "border-brand-400 bg-brand-50/40" : "border-line hover:border-slate-300")}
        >
          <Upload className="size-6 text-slate-400" />
          <p className="mt-3 text-sm font-medium text-ink">Déposez votre fichier .csv ici, ou cliquez pour le choisir</p>
          <p className="mt-1 text-[13px] text-muted">Séparateur « ; » ou « , » · encodage UTF-8 ou Windows (Excel)</p>
          <input ref={input} type="file" accept=".csv,text/csv,.txt" className="sr-only" onChange={(e) => void load(e.target.files?.[0])} />
        </label>
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <FileSpreadsheet className="size-4 text-slate-400" /> Votre fichier est dans Excel ?
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-muted">
                <li>Ouvrez le fichier, gardez une seule ligne d&apos;en-têtes (Nom, Téléphone…) en première ligne.</li>
                <li>
                  Fichier › Enregistrer sous › choisissez <span className="font-medium text-ink">CSV (séparateur : point-virgule)</span> ou CSV UTF-8.
                </li>
                <li>Déposez le fichier .csv ci-dessus : les colonnes sont reconnues automatiquement.</li>
              </ol>
            </div>
            <Button variant="secondary" onClick={downloadTemplate}>
              <Download /> Télécharger un modèle CSV
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  /* ---------- Correspondance et aperçu ---------- */
  const used = FIELDS.filter((f) => mapping[f.id] !== null);
  const sample = (col: number) => file.rows.find((r) => r[col])?.[col] ?? "";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-5 py-3.5">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <FileSpreadsheet className="size-4 shrink-0 text-slate-400" />
          <span className="truncate font-medium text-ink">{file.name}</span>
          <span className="shrink-0 text-muted">
            · {file.rows.length} ligne{file.rows.length > 1 ? "s" : ""} · séparateur « {file.delimiter} »
          </span>
        </p>
        <Button variant="ghost" onClick={reset}>
          Changer de fichier
        </Button>
      </div>

      <Card>
        <CardHeader title="Correspondance des colonnes" subtitle="Vérifiez la colonne du fichier utilisée pour chaque information." />
        <div className="grid gap-x-6 gap-y-4 border-t border-line p-5 sm:grid-cols-2 [&>*]:min-w-0">
          {FIELDS.map((f) => (
            <label key={f.id} className="block">
              <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-slate-700">
                <span>
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </span>
                {mapping[f.id] !== null && <span className="truncate text-xs font-normal text-muted">ex. {sample(mapping[f.id]!)}</span>}
              </span>
              <Select value={mapping[f.id] ?? ""} onChange={(e) => setMapping({ ...mapping, [f.id]: e.target.value === "" ? null : Number(e.target.value) })}>
                <option value="">— Ne pas importer —</option>
                {file.headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `Colonne ${i + 1}`}
                  </option>
                ))}
              </Select>
              {f.hint && <span className="mt-1 block text-xs text-muted">{f.hint}</span>}
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Aperçu" subtitle={`Les ${Math.min(10, mapped.length)} premières lignes, telles qu'elles seront importées`} />
        <div className="overflow-x-auto border-t border-line">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Ligne</th>
                {used.map((f) => (
                  <th key={f.id}>{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mapped.slice(0, 10).map((r) => (
                <tr key={r.line}>
                  <td className="tabular-nums text-muted">{r.line}</td>
                  {used.map((f) => (
                    <td key={f.id} className="max-w-[220px] truncate">
                      {r[f.id] || <span className="text-slate-300">—</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-[13px] font-medium text-slate-700">Établissement(s) à attribuer</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {entities.map((e) => {
                const on = chosen.includes(e.id);
                return (
                  <label key={e.id} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition", on ? "border-brand-300 bg-brand-50/50" : "border-line hover:border-slate-300")}>
                    <input type="checkbox" checked={on} onChange={() => setChosen(on ? chosen.filter((x) => x !== e.id) : [...chosen, e.id])} className="size-4" />
                    <EntityBadge id={e.id} />
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-[13px] font-medium text-slate-700">Client déjà enregistré (même téléphone)</p>
            <div className="mt-2 space-y-2 text-[13px]">
              {(
                [
                  ["ignore", "Ignorer la ligne", "La fiche existante reste inchangée."],
                  ["update", "Mettre à jour la fiche", "Les informations du fichier remplacent celles de la fiche ; établissements et tags sont ajoutés."],
                ] as const
              ).map(([id, label, hint]) => (
                <label key={id} className="flex cursor-pointer items-start gap-2.5">
                  <input type="radio" name="dup" checked={dupMode === id} onChange={() => setDupMode(id)} className="mt-0.5 size-4" />
                  <span>
                    <span className="font-medium text-ink">{label}</span>
                    <span className="block text-xs text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <ErrorNote message={error} />
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="brand" onClick={run} disabled={!!progress}>
          {progress ? <Loader2 className="animate-spin" /> : <Upload />}
          {progress ? `Import en cours… ${progress.done} / ${progress.total}` : `Importer ${mapped.length} client${mapped.length > 1 ? "s" : ""}`}
        </Button>
        <span className="text-xs text-muted">Les clients importés ont le statut « Client ».</span>
      </div>
    </div>
  );
}
