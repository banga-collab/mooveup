import Link from "next/link";
import { Archive, Clock, Database, Download, FileSpreadsheet, HardDrive, History, ShieldCheck } from "lucide-react";
import { requireDirection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DEMO } from "@/lib/demo";
import { fmtDate, fmtTime, relative } from "@/lib/utils";
import {
  BACKUP_ACTIONS,
  BACKUP_KEEP,
  backupFileName,
  countTables,
  listStoredBackups,
  listTables,
  serviceDb,
  tableLabel,
  type StoredFile,
} from "@/lib/backup";
import { backupNow } from "@/actions/backup";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { Badge, Card, CardHeader, Empty, Kpi, PageHeader, buttonClass, tableClass } from "@/components/ui";
import { RestorePanel } from "@/components/backup/restore-panel";
import { fmtSize } from "@/components/backup/format";

export const metadata = { title: "Sauvegarde" };
export const dynamic = "force-dynamic";

type AuditRow = { id: string; action: string; summary: string; actor_name: string; created_at: string; meta: Record<string, unknown> | null };

const KIND: Record<string, { label: string; tone: "brand" | "green" | "gray" | "amber" | "red" }> = {
  "sauvegarde.export": { label: "Téléchargement", tone: "brand" },
  "sauvegarde.csv": { label: "Export CSV", tone: "gray" },
  "sauvegarde.auto": { label: "Automatique", tone: "green" },
  "sauvegarde.manuelle": { label: "Manuelle", tone: "green" },
  "sauvegarde.restauration": { label: "Restauration", tone: "amber" },
};

const DL = "/parametres/sauvegarde/telecharger";

export default async function SauvegardePage({ searchParams }: { searchParams: Promise<{ q?: string; etat?: string }> }) {
  await requireDirection();
  const sp = await searchParams;
  const supabase = await createClient();
  const svc = await serviceDb();
  const db = svc ?? supabase;

  const [counts, history, stored] = await Promise.all([
    countTables(db, listTables()),
    supabase
      .from("audit_log")
      .select("*")
      .in("action", [...BACKUP_ACTIONS])
      .order("created_at", { ascending: false })
      .limit(40)
      .then((r) => (r.data ?? []) as AuditRow[]),
    !DEMO && svc
      ? listStoredBackups(svc).then(
          (files) => ({ files, error: null as string | null }),
          (e: unknown) => ({ files: [] as StoredFile[], error: e instanceof Error ? e.message : "Stockage inaccessible" }),
        )
      : Promise.resolve({ files: [] as StoredFile[], error: null as string | null }),
  ]);

  const present = counts.filter((c) => !c.missing);
  const totalRows = present.reduce((a, c) => a + (c.count ?? 0), 0);
  const lastSaved = history.find((h) => (h.action === "sauvegarde.auto" || h.action === "sauvegarde.manuelle") && !h.meta?.failed) ?? null;
  const lastAny = stored.files[0]?.created_at ?? lastSaved?.created_at ?? null;

  const etat = sp.etat ?? "";
  const shown = counts.filter(
    (c) =>
      matchesQuery(sp.q, c.table, c.label) &&
      (!etat || (etat === "donnees" && (c.count ?? 0) > 0) || (etat === "vides" && c.count === 0) || (etat === "absentes" && (c.missing || c.error))),
  );
  const nData = counts.filter((c) => (c.count ?? 0) > 0).length;
  const nEmpty = counts.filter((c) => c.count === 0).length;
  const nMissing = counts.filter((c) => c.missing || c.error).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Sauvegarde"
        subtitle={`Toutes les données du CRM, sans les mots de passe · fichier ${backupFileName()}`}
        actions={
          <>
            <ActionForm action={backupNow}>
              <SubmitButton variant="secondary" pendingText="Sauvegarde…">
                <HardDrive /> Sauvegarder dans le stockage
              </SubmitButton>
            </ActionForm>
            <a href={DL} download className={buttonClass("brand")}>
              <Download /> Tout télécharger (JSON)
            </a>
          </>
        }
      />

      {DEMO && (
        <p className="rounded-lg border border-line bg-white px-4 py-3 text-[13px] text-muted">
          Mode démo : les sauvegardes sont générées à partir de la base de démonstration ; la sauvegarde automatique est simulée (aucun fichier stocké).
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Kpi label="Tables" value={present.length} delta={nMissing ? `${nMissing} absente(s) ou illisible(s)` : "toutes présentes"} positive={nMissing ? false : undefined} icon={<Database />} />
        <Kpi label="Lignes au total" value={totalRows.toLocaleString("fr-FR")} icon={<Archive />} />
        <Kpi
          label="Dernière sauvegarde"
          value={lastAny ? relative(lastAny) : "Jamais"}
          delta={lastAny ? `${fmtDate(lastAny)} à ${fmtTime(lastAny)}` : "Planifiée chaque nuit"}
          positive={lastAny ? undefined : false}
          icon={<Clock />}
        />
        <Kpi label="Conservées" value={DEMO ? "—" : `${stored.files.length} / ${BACKUP_KEEP}`} delta="dans le bucket « sauvegardes »" icon={<ShieldCheck />} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_380px] [&>*]:min-w-0">
        <Card>
          <CardHeader title="Tables" subtitle="Téléchargez une table en CSV (Excel) ou tout le CRM en un seul fichier JSON" icon={<Database />} />
          <div className="px-5 pb-3">
            <ListToolbar
              placeholder="Rechercher une table…"
              className="mb-0"
              filters={[
                {
                  param: "etat",
                  options: [
                    { value: "donnees", label: "Avec données", count: nData },
                    { value: "vides", label: "Vides", count: nEmpty },
                    { value: "absentes", label: "Absentes", count: nMissing },
                  ],
                },
              ]}
            />
          </div>
          {shown.length === 0 ? (
            <Empty icon={<Database />} title="Aucune table ne correspond" text="Modifiez la recherche ou retirez le filtre." action={<Link href="/parametres/sauvegarde" className={buttonClass("secondary")}>Tout afficher</Link>} />
          ) : (
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>Table</th>
                    <th className="!text-right">Lignes</th>
                    <th className="!text-right">
                      <span className="sr-only">Télécharger</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.table}>
                      <td>
                        <span className="block font-medium text-ink">{c.label}</span>
                        <span className="font-mono text-[11px] text-muted">{c.table}</span>
                      </td>
                      <td className="text-right">
                        {c.missing ? (
                          <Badge tone="red" dot>
                            Absente
                          </Badge>
                        ) : c.error ? (
                          <span title={c.error}>
                            <Badge tone="amber" dot>
                              Illisible
                            </Badge>
                          </span>
                        ) : (
                          <span className="font-semibold tabular-nums">{(c.count ?? 0).toLocaleString("fr-FR")}</span>
                        )}
                      </td>
                      <td className="text-right">
                        {!c.missing && !c.error && (
                          <a href={`${DL}?table=${encodeURIComponent(c.table)}`} download className={buttonClass("ghost", "h-9 px-2.5")} aria-label={`Télécharger ${tableLabel(c.table)} en CSV`}>
                            <FileSpreadsheet /> CSV
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {nMissing > 0 && (
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              Table absente : exécutez <code className="font-mono text-ink">supabase/000_tout.sql</code> dans Supabase (SQL Editor). Voir{" "}
              <Link href="/parametres/systeme" className="font-medium text-brand-600 hover:underline">
                État du système
              </Link>
              .
            </p>
          )}
        </Card>

        <div className="space-y-5">
          {!DEMO && (
            <Card>
              <CardHeader title="Sauvegardes automatiques" subtitle={`Chaque nuit vers 2 h · ${BACKUP_KEEP} dernières conservées`} icon={<HardDrive />} />
              {stored.error ? (
                <p className="px-5 pb-5 text-[13px] text-red-600">Stockage inaccessible : {stored.error}</p>
              ) : !svc ? (
                <p className="px-5 pb-5 text-[13px] text-muted">Ajoutez la variable SUPABASE_SERVICE_ROLE_KEY pour activer la sauvegarde automatique.</p>
              ) : stored.files.length === 0 ? (
                <Empty icon={<HardDrive />} title="Aucune sauvegarde stockée" text="La première sera faite cette nuit. Vous pouvez aussi cliquer sur « Sauvegarder dans le stockage »." />
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {stored.files.slice(0, 10).map((f) => (
                    <li key={f.name} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">{f.name}</p>
                        <p className="text-xs text-muted">
                          {f.created_at ? `${fmtDate(f.created_at)} à ${fmtTime(f.created_at)}` : "—"} · {fmtSize(f.size)}
                        </p>
                      </div>
                      <a href={`${DL}?fichier=${encodeURIComponent(f.name)}`} download className={buttonClass("ghost", "h-9 px-2.5")} aria-label={`Télécharger ${f.name}`}>
                        <Download />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Historique" subtitle="Téléchargements, sauvegardes et restaurations" icon={<History />} />
            {history.length === 0 ? (
              <Empty icon={<History />} title="Aucune sauvegarde pour l'instant" text="Téléchargez une première sauvegarde complète pour la garder en lieu sûr." />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {history.slice(0, 15).map((h) => {
                  const k = KIND[h.action] ?? { label: h.action, tone: "gray" as const };
                  const failed = !!h.meta?.failed;
                  return (
                    <li key={h.id} className="px-5 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <Badge tone={failed ? "red" : k.tone} dot>
                          {failed ? "Échec" : k.label}
                        </Badge>
                        <span className="text-xs tabular-nums text-muted" title={`${fmtDate(h.created_at)} ${fmtTime(h.created_at)}`}>
                          {relative(h.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] text-ink">{h.summary}</p>
                      <p className="text-xs text-muted">{h.actor_name}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <RestorePanel known={listTables().map((t) => ({ table: t, label: tableLabel(t) }))} demo={DEMO} />
    </div>
  );
}
