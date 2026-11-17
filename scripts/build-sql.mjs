#!/usr/bin/env node
/**
 * Régénère `supabase/000_tout.sql` : un seul script qui enchaîne tous les
 * fichiers `supabase/*.sql` dans le bon ordre (schema, finance, loyalty, access,
 * care, ops, puis les autres par ordre alphabétique), suivi des compléments de
 * mise en ligne (bucket privé « sauvegardes »).
 *
 * Met aussi à jour la liste des tables connues de la page Sauvegarde
 * (bloc `<tables>` de `src/lib/backup.ts`).
 *
 * Usage : node scripts/build-sql.mjs
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase");
const OUT = "000_tout.sql";
const FIRST = ["schema.sql", "finance.sql", "loyalty.sql", "access.sql", "care.sql", "ops.sql"];

const all = readdirSync(dir).filter((f) => f.endsWith(".sql") && f !== OUT && !f.startsWith("000_"));
const files = [...FIRST.filter((f) => all.includes(f)), ...all.filter((f) => !FIRST.includes(f)).sort()];

/* ---------- Contrôle d'idempotence (avertissements seulement) ---------- */
const warnings = [];
const tables = [];
for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  const lines = sql.split(/\r?\n/);
  lines.forEach((line, i) => {
    const l = line.trim().toLowerCase();
    if (l.startsWith("--")) return;
    if (/^create table\b/.test(l) && !l.includes("if not exists")) warnings.push(`${f}:${i + 1} create table sans « if not exists »`);
    if (/^create (unique )?index\b/.test(l) && !l.includes("if not exists")) warnings.push(`${f}:${i + 1} create index sans « if not exists »`);
    if (/^create function\b/.test(l)) warnings.push(`${f}:${i + 1} create function sans « or replace »`);
    if (/^create policy\b/.test(l)) {
      const name = /create policy\s+("[^"]+"|\S+)/.exec(line.trim())?.[1];
      const before = lines.slice(Math.max(0, i - 3), i).join("\n").toLowerCase();
      if (!name || !before.includes(`drop policy if exists ${name.toLowerCase()}`)) warnings.push(`${f}:${i + 1} create policy ${name ?? ""} sans « drop policy if exists » juste avant`);
    }
    if (/^create trigger\b/.test(l)) {
      const before = lines.slice(Math.max(0, i - 3), i).join("\n").toLowerCase();
      if (!before.includes("drop trigger if exists")) warnings.push(`${f}:${i + 1} create trigger sans « drop trigger if exists »`);
    }
  });
  for (const m of sql.matchAll(/create table\s+(?:if not exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)) {
    const t = m[1].toLowerCase();
    if (!tables.includes(t)) tables.push(t);
  }
}

/* ---------- Compléments de mise en ligne ---------- */
const EXTRA = `-- ---------- Compléments de mise en ligne ----------
-- Bucket privé des sauvegardes automatiques (écrit par /api/backup avec la clé service).
-- Aucune règle d'accès : seule la clé service (serveur) peut y lire et écrire.
insert into storage.buckets (id, name, public) values ('sauvegardes', 'sauvegardes', false)
  on conflict (id) do nothing;
`;

const header = `-- =====================================================================
--  Moov'Up CRM : SCRIPT COMPLET DE LA BASE (à exécuter en une seule fois)
--  Supabase → SQL Editor → New query → coller tout ce fichier → Run.
--
--  Fichier GÉNÉRÉ par « node scripts/build-sql.mjs » : ne pas le modifier à la main.
--  Si un module ajoute ou modifie un fichier supabase/*.sql, régénère-le
--  avec cette commande puis ré-exécute-le (il est idempotent : on peut le
--  relancer sans perdre de données).
--
--  Ordre : ${files.join(", ")}
--  Généré le ${new Date().toISOString().slice(0, 10)}
-- =====================================================================
`;

const body = files
  .map((f) => {
    const sql = readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n").trimEnd();
    const bar = "-- " + "#".repeat(69);
    return `${bar}\n-- ##  ${f}\n${bar}\n\n${sql}\n`;
  })
  .join("\n\n");

writeFileSync(join(dir, OUT), `${header}\n${body}\n\n${EXTRA}`, "utf8");
console.log(`supabase/${OUT} régénéré (${files.length} fichiers : ${files.join(", ")}).`);

/* ---------- Liste des tables de la page Sauvegarde ---------- */
const lib = join(root, "src", "lib", "backup.ts");
if (existsSync(lib)) {
  const src = readFileSync(lib, "utf8");
  const re = /(\/\/ <tables>)[\s\S]*?(\r?\n[ \t]*\/\/ <\/tables>)/;
  if (re.test(src)) {
    const list = tables.map((t) => `  "${t}",`).join("\n");
    const next = src.replace(re, (_, a, b) => `${a}\n${list}${b}`);
    if (next !== src) {
      writeFileSync(lib, next, "utf8");
      console.log(`src/lib/backup.ts : ${tables.length} tables connues.`);
    }
  }
}

if (warnings.length) {
  console.warn(`\nÀ vérifier (le script doit pouvoir être relancé sans erreur) :`);
  for (const w of warnings) console.warn("  - " + w);
}
