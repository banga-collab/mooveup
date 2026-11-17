/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sauvegardes du CRM : liste des tables, export JSON/CSV en flux,
 * sauvegarde automatique dans Supabase Storage et restauration (fusion par id).
 *
 * - Démo : lit et écrit directement la base mémoire (`demoDb()`).
 * - Réel : pagination par 1000 lignes ; aucune donnée d'authentification
 *   (schéma `auth`) n'est exportée, seulement les tables `public`.
 */
import { createClient as createSupabase, type SupabaseClient } from "@supabase/supabase-js";
import { DEMO, demoDb } from "./demo";
import { dayKey } from "./utils";
import { createClient } from "./supabase/server";
import { BACKUP_FORMAT, BACKUP_VERSION } from "@/components/backup/format";
import "@/lib/supabase/paginate";

export { BACKUP_FORMAT, BACKUP_VERSION, parseBackup } from "@/components/backup/format";
export const BACKUP_BUCKET = "sauvegardes";
export const BACKUP_KEEP = 30;
export const PAGE_SIZE = 1000;
export const BACKUP_ACTIONS = ["sauvegarde.export", "sauvegarde.csv", "sauvegarde.auto", "sauvegarde.manuelle", "sauvegarde.restauration"] as const;

/**
 * Tables connues, dans l'ordre de création (respecte les clés étrangères pour la restauration).
 * Bloc régénéré par `node scripts/build-sql.mjs` à partir de `supabase/*.sql`.
 */
export const KNOWN_TABLES: string[] = [
  // <tables>
  "profiles",
  "contacts",
  "leads",
  "catalog_items",
  "subscriptions",
  "appointments",
  "sales",
  "sale_items",
  "activities",
  "tasks",
  "campaigns",
  "settings",
  "cash_sessions",
  "expenses",
  "audit_log",
  "loyalty_ledger",
  "gift_cards",
  "gift_card_uses",
  "referrals",
  "automation_rules",
  "message_log",
  "reviews",
  "member_cards",
  "checkins",
  "online_bookings",
  "care_profiles",
  "treatment_records",
  "consents",
  "care_photos",
  "kids_groups",
  "kids_members",
  "kids_children",
  "kids_attendance",
  "shifts",
  "time_entries",
  "commission_rules",
  "suppliers",
  "stock_settings",
  "stock_movements",
  "purchase_orders",
  "appointment_series",
  "companies",
  "company_employees",
  "company_invoices",
  "company_invoice_lines",
  "company_events",
  "monthly_targets",
  "member_accounts",
  "member_requests",
  "saved_views",
  "notification_reads",
  "undo_log",
  // </tables>
];

/** Libellés lisibles (les tables non listées affichent leur nom technique) */
export const TABLE_LABELS: Record<string, string> = {
  profiles: "Équipe (profils)",
  contacts: "Clients & contacts",
  leads: "Prospects",
  catalog_items: "Catalogue",
  subscriptions: "Abonnements",
  appointments: "Rendez-vous",
  sales: "Ventes",
  sale_items: "Lignes de vente",
  activities: "Historique des fiches clients",
  tasks: "Tâches",
  campaigns: "Campagnes",
  settings: "Paramètres",
  cash_sessions: "Clôtures de caisse",
  expenses: "Dépenses",
  audit_log: "Journal des actions",
  loyalty_ledger: "Points de fidélité",
  gift_cards: "Cartes cadeaux",
  gift_card_uses: "Utilisations des cartes cadeaux",
  referrals: "Parrainages",
  automation_rules: "Règles de rappels",
  message_log: "Messages WhatsApp envoyés",
  reviews: "Avis clients",
  member_cards: "Cartes membres",
  checkins: "Entrées",
  online_bookings: "Réservations en ligne",
  care_profiles: "Dossiers clinique & institut",
  treatment_records: "Fiches de soin",
  consents: "Consentements",
  care_photos: "Photos avant/après",
  kids_groups: "Kids : groupes",
  kids_members: "Kids : inscriptions",
  kids_children: "Kids : enfants",
  kids_attendance: "Kids : présences",
  shifts: "Planning équipe",
  time_entries: "Pointages",
  commission_rules: "Règles de commission",
  suppliers: "Fournisseurs",
  stock_settings: "Réglages du stock",
  stock_movements: "Mouvements de stock",
  purchase_orders: "Commandes fournisseurs",
  appointment_series: "Rendez-vous récurrents",
  saved_views: "Vues enregistrées",
  notification_reads: "Notifications lues",
  undo_log: "Annulations récentes",
  companies: "Entreprises (B2B)",
  company_employees: "Entreprises : salariés",
  company_events: "Entreprises : événements",
  company_invoices: "Entreprises : factures",
  company_invoice_lines: "Entreprises : lignes de facture",
  member_accounts: "Espace membre : comptes",
  member_requests: "Espace membre : demandes",
  monthly_targets: "Objectifs mensuels",
};

export const tableLabel = (t: string) => TABLE_LABELS[t] ?? t;

const TABLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;
export const isTableName = (t: unknown): t is string => typeof t === "string" && TABLE_NAME.test(t);

/** Codes d'erreur PostgREST / Postgres signifiant « table absente » */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined) {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || err.code === "PGRST106" || /does not exist|could not find the table/i.test(err.message ?? "");
}

/** Toutes les tables à sauvegarder : tables connues + tables de la base de démo */
export function listTables(): string[] {
  const out = [...KNOWN_TABLES];
  if (DEMO) {
    for (const t of Object.keys(demoDb()).sort()) if (!out.includes(t) && isTableName(t)) out.push(t);
  }
  return out;
}

/** Nom du fichier : moovup-sauvegarde-AAAA-MM-JJ.json (jour à Agadir) */
export function backupFileName(d: Date = new Date()) {
  return `moovup-sauvegarde-${dayKey(d)}.json`;
}
export const BACKUP_FILE_RE = /^moovup-sauvegarde-\d{4}-\d{2}-\d{2}\.json$/;

/* ---------- Clients ---------- */

/** Client avec la clé service (contourne la RLS) ; null si la clé manque. En démo : base mémoire. */
export async function serviceDb(): Promise<SupabaseClient | null> {
  if (DEMO) return createClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Profil direction connecté, sinon null (pour les routes, sans redirection) */
export async function directionOrNull() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return data && (data as { role: string }).role === "direction" ? (data as { id: string; full_name: string; email: string; role: string }) : null;
}

/* ---------- Comptage ---------- */

export type TableCount = { table: string; label: string; count: number | null; missing: boolean; error: string | null };

export async function countTable(supabase: SupabaseClient, table: string): Promise<TableCount> {
  const base = { table, label: tableLabel(table) };
  if (DEMO) {
    const rows = demoDb()[table];
    return { ...base, count: rows?.length ?? 0, missing: false, error: null };
  }
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return { ...base, count: null, missing: isMissingTable(error), error: error.message || "Erreur de lecture" };
  return { ...base, count: count ?? 0, missing: false, error: null };
}

export async function countTables(supabase: SupabaseClient, tables = listTables()) {
  const out: TableCount[] = [];
  // Par lots de 8 pour ne pas saturer la base
  for (let i = 0; i < tables.length; i += 8) out.push(...(await Promise.all(tables.slice(i, i + 8).map((t) => countTable(supabase, t)))));
  return out;
}

/* ---------- Lecture paginée ---------- */

/** Lit une table page par page (1000 lignes), triée par clé primaire si possible */
export async function* readPages(supabase: SupabaseClient, table: string): AsyncGenerator<Record<string, any>[]> {
  if (DEMO) {
    const rows = demoDb()[table] ?? [];
    for (let i = 0; i < rows.length; i += PAGE_SIZE) yield rows.slice(i, i + PAGE_SIZE).map((r) => ({ ...r }));
    return;
  }
  let order: string | null = table === "undo_log" ? "token" : "id";
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select("*");
    if (order) q = q.order(order, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE_SIZE - 1);
    if (error) {
      // Table sans colonne « id » : on relit sans tri
      if (order && from === 0 && !isMissingTable(error) && /column|order/i.test(error.message)) {
        order = null;
        continue;
      }
      throw Object.assign(new Error(error.message), { code: error.code });
    }
    if (!data?.length) return;
    yield data as Record<string, any>[];
    if (data.length < PAGE_SIZE) return;
    from += PAGE_SIZE;
  }
}

/* ---------- Export JSON en flux ---------- */

export type BackupStats = { tables: number; rows: number; counts: Record<string, number>; errors: Record<string, string>; missing: string[] };

export function emptyStats(): BackupStats {
  return { tables: 0, rows: 0, counts: {}, errors: {}, missing: [] };
}

async function* jsonChunks(supabase: SupabaseClient, tables: string[], stats: BackupStats): AsyncGenerator<string> {
  const head = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    created_at: new Date().toISOString(),
    source: DEMO ? "demo" : "supabase",
    note: "Sauvegarde des tables du CRM (schéma public). Les comptes de connexion (Supabase Auth) ne sont pas inclus.",
  };
  yield JSON.stringify(head).slice(0, -1) + ',"tables":{';
  let firstTable = true;
  for (const t of tables) {
    let n = 0;
    let opened = false;
    try {
      for await (const page of readPages(supabase, t)) {
        if (!opened) {
          yield (firstTable ? "" : ",") + JSON.stringify(t) + ":[";
          firstTable = false;
          opened = true;
        }
        let s = "";
        for (const r of page) {
          s += (n ? "," : "") + JSON.stringify(r);
          n++;
        }
        yield s;
      }
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (isMissingTable(err)) stats.missing.push(t);
      else stats.errors[t] = err.message ?? "Erreur de lecture";
    }
    if (opened) yield "]";
    else if (!stats.missing.includes(t)) {
      yield (firstTable ? "" : ",") + JSON.stringify(t) + ":[]";
      firstTable = false;
    }
    if (!stats.missing.includes(t)) {
      stats.counts[t] = n;
      stats.rows += n;
      stats.tables++;
    }
  }
  yield `},"counts":${JSON.stringify(stats.counts)},"errors":${JSON.stringify(stats.errors)}}`;
}

/** Flux d'octets (pull : une page à la fois, sans tout charger en mémoire) */
export function chunksToStream(gen: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await gen.next();
        if (done) controller.close();
        else controller.enqueue(enc.encode(value));
      } catch (e) {
        controller.error(e);
      }
    },
    async cancel() {
      await gen.return(undefined);
    },
  });
}

export function backupStream(supabase: SupabaseClient, stats: BackupStats = emptyStats(), tables = listTables()) {
  return chunksToStream(jsonChunks(supabase, tables, stats));
}

/* ---------- Export CSV d'une table ---------- */

function csvCell(v: unknown) {
  if (v === null || v === undefined) return "";
  let s = typeof v === "object" ? JSON.stringify(v) : String(v);
  if (typeof v === "string" && /^[=@+\-\t\r]/.test(s) && !/^-?\d/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function* csvChunks(supabase: SupabaseClient, table: string): AsyncGenerator<string> {
  let cols: string[] | null = null;
  if (DEMO) {
    // En démo, les lignes n'ont pas toutes les mêmes colonnes : union de toutes les clés
    const set = new Set<string>();
    for (const r of demoDb()[table] ?? []) for (const k of Object.keys(r)) set.add(k);
    cols = [...set];
  }
  yield "﻿";
  let started = false;
  for await (const page of readPages(supabase, table)) {
    if (!cols) cols = Object.keys(page[0] ?? {});
    if (!started) {
      yield cols.map(csvCell).join(";") + "\r\n";
      started = true;
    }
    yield page.map((r) => cols!.map((c) => csvCell(r[c])).join(";")).join("\r\n") + "\r\n";
  }
  if (!started && cols?.length) yield cols.map(csvCell).join(";") + "\r\n";
}

export function tableCsvStream(supabase: SupabaseClient, table: string) {
  return chunksToStream(csvChunks(supabase, table));
}

/* ---------- Sauvegarde dans Supabase Storage ---------- */

export type StoredFile = { name: string; size: number | null; created_at: string | null };

async function ensureBucket(svc: SupabaseClient) {
  const { error } = await svc.storage.getBucket(BACKUP_BUCKET);
  if (!error) return;
  const { error: createErr } = await svc.storage.createBucket(BACKUP_BUCKET, { public: false });
  if (createErr && !/exist/i.test(createErr.message)) throw new Error(`Bucket « ${BACKUP_BUCKET} » : ${createErr.message}`);
}

/** Fichiers de sauvegarde présents dans le bucket, du plus récent au plus ancien */
export async function listStoredBackups(svc: SupabaseClient): Promise<StoredFile[]> {
  if (DEMO) return [];
  const { data, error } = await svc.storage.from(BACKUP_BUCKET).list("", { limit: 1000, sortBy: { column: "name", order: "desc" } });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((f) => BACKUP_FILE_RE.test(f.name))
    .map((f) => ({ name: f.name, size: (f.metadata as { size?: number } | null)?.size ?? null, created_at: f.updated_at ?? f.created_at ?? null }));
}

export type StoreResult = { ok: true; mode: "demo" | "storage"; file: string; stats: BackupStats; deleted: number } | { ok: false; error: string };

/**
 * Écrit la sauvegarde complète dans le bucket privé `sauvegardes` (clé service)
 * et ne garde que les 30 plus récentes. En démo : génère le fichier sans le stocker.
 */
export async function storeBackup(by?: { id: string; name: string }): Promise<StoreResult> {
  const action = by ? "sauvegarde.manuelle" : "sauvegarde.auto";
  const what = by ? "Sauvegarde manuelle" : "Sauvegarde automatique";
  const svc = await serviceDb();
  if (!svc) return { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY manquante : ajoutez la clé service dans les variables d'environnement." };
  const stats = emptyStats();
  const file = backupFileName();
  try {
    const stream = backupStream(svc, stats);
    if (DEMO) {
      // Démo : on lit le flux jusqu'au bout pour compter, sans rien stocker
      const reader = stream.getReader();
      while (!(await reader.read()).done) {
        /* lecture */
      }
      await logBackup(svc, action, `${what} simulée (démo) : ${stats.rows} lignes, ${stats.tables} tables`, { file, ...stats, mode: "demo" }, by);
      return { ok: true, mode: "demo", file, stats, deleted: 0 };
    }
    // Le fichier doit être complet avant l'envoi au stockage (taille connue)
    const blob = await new Response(stream).blob();
    await ensureBucket(svc);
    const { error } = await svc.storage.from(BACKUP_BUCKET).upload(file, blob, { contentType: "application/json", upsert: true });
    if (error) throw new Error(`Envoi au stockage : ${error.message}`);
    // Rotation : on garde les 30 plus récentes
    const files = await listStoredBackups(svc);
    const old = files.slice(BACKUP_KEEP).map((f) => f.name);
    if (old.length) await svc.storage.from(BACKUP_BUCKET).remove(old);
    await logBackup(svc, action, `${what} enregistrée dans le stockage : ${stats.rows} lignes, ${stats.tables} tables`, {
      file,
      size: blob.size,
      ...stats,
      deleted: old.length,
      mode: "storage",
    }, by);
    return { ok: true, mode: "storage", file, stats, deleted: old.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur inconnue";
    await logBackup(svc, action, `Échec — ${what.toLowerCase()} : ${message}`.slice(0, 480), { file, error: message, failed: true }, by);
    return { ok: false, error: message };
  }
}

/** Ligne de journal écrite par le serveur (sans utilisateur connecté) */
export async function logBackup(svc: SupabaseClient, action: (typeof BACKUP_ACTIONS)[number], summary: string, meta: Record<string, unknown>, actor?: { id: string; name: string }) {
  try {
    await svc.from("audit_log").insert({
      action,
      entity_id: null,
      target_type: "sauvegarde",
      target_id: typeof meta.file === "string" ? meta.file : null,
      summary: summary.slice(0, 500),
      actor_id: actor?.id ?? null,
      actor_name: actor?.name ?? "Sauvegarde automatique",
      meta,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* le journal ne bloque jamais une sauvegarde */
  }
}

/* ---------- Restauration (fusion par id) ---------- */

type Row = Record<string, any>;

/** Clé primaire d'une ligne pour la fusion (id, sinon token) */
function rowKey(r: Row): string | null {
  if (r.id !== undefined && r.id !== null) return "id:" + String(r.id);
  if (r.token !== undefined && r.token !== null) return "token:" + String(r.token);
  return null;
}

/** Fusionne des lignes dans une table : remplace celles qui ont le même id, ajoute les autres */
export async function mergeRows(db: SupabaseClient, table: string, rows: Row[]): Promise<{ written: number; error: string | null }> {
  if (!rows.length) return { written: 0, error: null };
  if (DEMO) {
    const mem = demoDb();
    const tbl = (mem[table] ??= []);
    const index = new Map<string, Row>();
    for (const r of tbl) {
      const k = rowKey(r);
      if (k) index.set(k, r);
    }
    const seen = new Set(tbl.map((r) => JSON.stringify(r)));
    let written = 0;
    for (const r of rows) {
      const k = rowKey(r);
      const ex = k ? index.get(k) : undefined;
      if (ex) {
        Object.assign(ex, r);
        written++;
      } else if (k || !seen.has(JSON.stringify(r))) {
        const copy = { ...r };
        tbl.push(copy);
        if (k) index.set(k, copy);
        written++;
      }
    }
    return { written, error: null };
  }
  // Réel : upsert sur la clé primaire de la table
  const { error } = await db.from(table).upsert(rows, { ignoreDuplicates: false });
  if (error) return { written: 0, error: error.message };
  return { written: rows.length, error: null };
}
