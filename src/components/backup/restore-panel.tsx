"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileJson, Loader2, RotateCcw, Upload, X } from "lucide-react";
import { finishRestore, restoreChunk } from "@/actions/backup";
import { Badge, Button, Card, CardHeader, ErrorNote, Input, tableClass } from "@/components/ui";
import { showToast } from "@/components/toaster";
import { cn } from "@/lib/utils";
import { fmtSize, parseBackup } from "./format";

type Known = { table: string; label: string };
type Preview = { name: string; size: number; created_at: string | null; source: string | null; tables: Record<string, Record<string, unknown>[]> };
type Progress = { done: number; total: number; table: string | null; errors: { table: string; message: string }[]; finished: boolean };

const CONFIRM_WORD = "RESTAURER";
/** Taille max d'un paquet envoyé au serveur (limite des server actions : 1 Mo) */
const MAX_CHUNK_BYTES = 700_000;
const MAX_CHUNK_ROWS = 500;

function chunks(rows: Record<string, unknown>[]) {
  const out: Record<string, unknown>[][] = [];
  let cur: Record<string, unknown>[] = [];
  let size = 0;
  for (const r of rows) {
    const s = JSON.stringify(r).length;
    if (cur.length && (cur.length >= MAX_CHUNK_ROWS || size + s > MAX_CHUNK_BYTES)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(r);
    size += s;
  }
  if (cur.length) out.push(cur);
  return out;
}

const fmtN = (n: number) => n.toLocaleString("fr-FR");

/**
 * Restauration d'un fichier de sauvegarde : lecture et aperçu dans le navigateur,
 * double confirmation, puis envoi table par table (mode fusion par id).
 */
export function RestorePanel({ known, demo }: { known: Known[]; demo: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [ack, setAck] = useState(false);
  const [word, setWord] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);

  const order = known.map((k) => k.table);
  const labels = new Map(known.map((k) => [k.table, k.label]));
  const running = !!progress && !progress.finished;

  const reset = () => {
    setPreview(null);
    setError(null);
    setAck(false);
    setWord("");
    setProgress(null);
    if (input.current) input.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    reset();
    if (!file) return;
    setReading(true);
    try {
      const parsed = parseBackup(JSON.parse(await file.text()));
      if (!parsed.ok) setError(parsed.error);
      else setPreview({ name: file.name, size: file.size, created_at: parsed.created_at, source: parsed.source, tables: parsed.tables });
    } catch {
      setError("Fichier illisible : ce n'est pas un fichier JSON valide. Choisissez le fichier « moovup-sauvegarde-AAAA-MM-JJ.json » téléchargé depuis cette page.");
    } finally {
      setReading(false);
    }
  };

  const rows = preview
    ? Object.entries(preview.tables)
        .map(([table, list]) => ({ table, count: list.length, known: order.includes(table) }))
        .sort((a, b) => (a.known === b.known ? (a.known ? order.indexOf(a.table) - order.indexOf(b.table) : a.table.localeCompare(b.table)) : a.known ? -1 : 1))
    : [];
  const toRestore = rows.filter((r) => r.known && r.count > 0);
  const totalRows = toRestore.reduce((a, r) => a + r.count, 0);
  const ignored = rows.filter((r) => !r.known);
  const canRun = !!preview && toRestore.length > 0 && ack && word.trim().toUpperCase() === CONFIRM_WORD && !running;

  const run = async () => {
    if (!preview || !canRun) return;
    const state: Progress = { done: 0, total: totalRows, table: null, errors: [], finished: false };
    setProgress({ ...state });
    let written = 0;
    for (const { table } of toRestore) {
      state.table = table;
      setProgress({ ...state });
      for (const part of chunks(preview.tables[table] ?? [])) {
        try {
          const r = await restoreChunk(table, part);
          if (r.ok) written += r.written;
          else state.errors.push({ table, message: r.error });
        } catch {
          state.errors.push({ table, message: `${labels.get(table) ?? table} : envoi interrompu (connexion ?)` });
        }
        state.done += part.length;
        setProgress({ ...state });
      }
    }
    state.finished = true;
    state.table = null;
    setProgress({ ...state });
    const failed = [...new Set(state.errors.map((e) => e.table))];
    try {
      await finishRestore({ file: preview.name, tables: toRestore.length, rows: written, failed });
    } catch {
      showToast("Restauration terminée, mais le journal n'a pas pu être mis à jour", "info");
    }
    router.refresh();
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Card>
      <CardHeader
        title="Restaurer une sauvegarde"
        subtitle={
          demo
            ? "Mode démo : la restauration remplit la base de démonstration en mémoire."
            : "Mode fusion : les lignes ayant le même identifiant sont remplacées, les autres ajoutées. Rien n'est supprimé."
        }
        icon={<RotateCcw />}
        action={
          preview && !running ? (
            <button type="button" onClick={reset} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-[13px] text-slate-500 hover:bg-slate-100 hover:text-ink">
              <X className="size-4" /> Changer de fichier
            </button>
          ) : null
        }
      />
      <div className="space-y-4 px-5 pb-5">
        {!preview && (
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-line px-4 py-8 text-center transition hover:border-brand-400 hover:bg-slate-50",
              reading && "pointer-events-none opacity-60",
            )}
          >
            {reading ? <Loader2 className="size-5 animate-spin text-slate-400" /> : <Upload className="size-5 text-slate-400" />}
            <span className="text-sm font-medium text-ink">{reading ? "Lecture du fichier…" : "Choisir un fichier de sauvegarde (.json)"}</span>
            <span className="text-xs text-muted">Le fichier est d&apos;abord lu dans votre navigateur : rien n&apos;est modifié avant votre double confirmation.</span>
            <input ref={input} type="file" accept="application/json,.json" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        )}

        <ErrorNote message={error} />

        {preview && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3.5 py-3 text-[13px]">
              <span className="inline-flex min-w-0 items-center gap-1.5 font-medium text-ink">
                <FileJson className="size-4 shrink-0 text-slate-400" />
                <span className="truncate">{preview.name}</span>
              </span>
              <span className="text-muted">{fmtSize(preview.size)}</span>
              {preview.created_at && (
                <span className="text-muted">
                  Créée le {new Date(preview.created_at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Casablanca" })}
                </span>
              )}
              {preview.source === "demo" && <Badge tone="amber">Données de démo</Badge>}
            </div>

            <div className="overflow-x-auto rounded-lg border border-line">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>Table</th>
                    <th className="!text-right">Lignes du fichier</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const errs = progress?.errors.filter((e) => e.table === r.table) ?? [];
                    const isCurrent = progress?.table === r.table;
                    return (
                      <tr key={r.table}>
                        <td>
                          <span className="block font-medium text-ink">{labels.get(r.table) ?? r.table}</span>
                          <span className="font-mono text-[11px] text-muted">{r.table}</span>
                        </td>
                        <td className="text-right font-semibold tabular-nums">{fmtN(r.count)}</td>
                        <td>
                          {!r.known ? (
                            <Badge tone="gray">Ignorée (table inconnue)</Badge>
                          ) : r.count === 0 ? (
                            <Badge tone="gray">Vide</Badge>
                          ) : errs.length ? (
                            <span title={errs[0]!.message}>
                              <Badge tone="red" dot>
                                Erreur
                              </Badge>
                            </span>
                          ) : isCurrent ? (
                            <Badge tone="brand">
                              <Loader2 className="size-3 animate-spin" /> En cours
                            </Badge>
                          ) : progress && order.indexOf(r.table) < order.indexOf(progress.table ?? "") ? (
                            <Badge tone="green" dot>
                              Fusionnée
                            </Badge>
                          ) : progress?.finished ? (
                            <Badge tone="green" dot>
                              Fusionnée
                            </Badge>
                          ) : (
                            <Badge tone="brand">Sera fusionnée</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[13px] text-muted">
              <span className="font-semibold tabular-nums text-ink">{fmtN(totalRows)}</span> lignes dans <span className="font-semibold tabular-nums text-ink">{toRestore.length}</span> tables {progress?.finished ? "traitées" : "seront fusionnées"}
              {ignored.length ? ` · ${ignored.length} table(s) inconnue(s) ignorée(s)` : ""}.
            </p>

            {progress ? (
              <div className="space-y-3" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Avancement de la restauration">
                  <div className={cn("h-full rounded-full transition-all", progress.errors.length ? "bg-amber-500" : "bg-brand-500")} style={{ width: `${pct}%` }} />
                </div>
                {progress.finished ? (
                  progress.errors.length ? (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-800">
                      <p className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="size-4" /> Restauration terminée avec {progress.errors.length} erreur(s)
                      </p>
                      <ul className="list-disc space-y-0.5 pl-5 text-xs">
                        {progress.errors.slice(0, 8).map((e, i) => (
                          <li key={i}>{e.message}</li>
                        ))}
                      </ul>
                      <p className="text-xs">
                        Les autres tables ont bien été fusionnées. Une erreur sur « Équipe (profils) » est normale si les comptes n&apos;existent pas encore : créez-les d&apos;abord, puis relancez la restauration.
                      </p>
                    </div>
                  ) : (
                    <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-3 text-[13px] font-medium text-emerald-700">
                      <CheckCircle2 className="size-4" /> Restauration terminée : {fmtN(progress.done)} lignes fusionnées.
                    </p>
                  )
                ) : (
                  <p className="flex items-center gap-2 text-[13px] text-muted">
                    <Loader2 className="size-4 animate-spin" /> {labels.get(progress.table ?? "") ?? progress.table} · {fmtN(progress.done)} / {fmtN(progress.total)} lignes ({pct} %). Ne fermez pas la page.
                  </p>
                )}
              </div>
            ) : toRestore.length === 0 ? (
              <ErrorNote message="Ce fichier ne contient aucune ligne à restaurer." />
            ) : (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50/40 p-4">
                <p className="flex items-start gap-2 text-[13px] text-red-700">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Les fiches existantes ayant le même identifiant seront <strong>remplacées</strong> par la version du fichier. Téléchargez d&apos;abord une sauvegarde de l&apos;état actuel (bouton « Tout télécharger » en haut de la page).
                  </span>
                </p>
                <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-ink">
                  <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-4 accent-[#1a6d8e]" />
                  <span>1. J&apos;ai compris : les données actuelles ayant le même identifiant seront remplacées.</span>
                </label>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end [&>*]:min-w-0">
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] text-ink">
                      2. Tapez <span className="font-mono font-semibold">{CONFIRM_WORD}</span> pour confirmer
                    </span>
                    <Input value={word} onChange={(e) => setWord(e.target.value)} disabled={!ack} placeholder={CONFIRM_WORD} autoComplete="off" spellCheck={false} aria-label={`Tapez ${CONFIRM_WORD} pour confirmer`} />
                  </label>
                  <Button type="button" variant="danger" disabled={!canRun} onClick={run} className="h-10">
                    <RotateCcw /> Restaurer {fmtN(totalRows)} lignes
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
