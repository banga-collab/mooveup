"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getScope, requireManager } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { EntityId } from "@/lib/entities";
import type { Contact } from "@/lib/types";
import { formatPhone, phoneDigits } from "@/components/contacts/helpers";

export type ImportRow = {
  line: number;
  full_name?: string;
  first_name?: string;
  phone?: string;
  email?: string;
  sex?: string;
  birth_date?: string;
  city?: string;
  tags?: string;
  notes?: string;
};

export type ImportReport = {
  created: number;
  updated: number;
  ignored: { line: number; reason: string }[];
  errors: { line: number; message: string }[];
};

const MAX_BATCH = 600;

const clean = (v: string | undefined, max = 200) => {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

function parseSex(v: string | undefined): "H" | "F" | null {
  const s = (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  if (["h", "m", "homme", "male", "masculin", "mr", "monsieur", "garcon"].includes(s)) return "H";
  if (["f", "femme", "female", "feminin", "mme", "madame", "mlle", "mademoiselle", "fille"].includes(s)) return "F";
  return null;
}

/** JJ/MM/AAAA, JJ-MM-AA, AAAA-MM-JJ ou numéro de série Excel → AAAA-MM-JJ */
function parseDate(v: string | undefined): string | null | "invalid" {
  const s = (v ?? "").trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) {
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (y < 100) y += y > Number(String(new Date().getFullYear()).slice(2)) ? 1900 : 2000;
  } else if (/^\d{5}$/.test(s)) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86_400_000);
    [y, m, d] = [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  } else return "invalid";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900 || dt.getTime() > Date.now()) return "invalid";
  return dt.toISOString().slice(0, 10);
}

/** Téléphone : Excel supprime souvent le 0 initial (612345678 → 06 12 34 56 78) */
function parsePhone(v: string | undefined) {
  const raw = (v ?? "").trim();
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.length === 9 && /^[5-7]/.test(d)) d = `0${d}`;
  return formatPhone(d.length >= 9 && !raw.startsWith("+") ? d : raw);
}

function parseTags(v: string | undefined) {
  const out: string[] = [];
  for (const t of (v ?? "").split(/[,;|]/)) {
    const s = t.trim().replace(/\s+/g, " ").slice(0, 40);
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(0, 12);
}

/**
 * Importe un lot de lignes (le navigateur envoie le fichier par lots de 500 lignes).
 * Doublons détectés par téléphone : ignorés ou mis à jour.
 */
export async function importContacts(input: { rows: ImportRow[]; entity_ids: string[]; duplicates: "ignore" | "update"; fileName: string; last: boolean; totals?: { created: number; updated: number } }): Promise<ImportReport> {
  const profile = await requireManager();
  const scope = await getScope();
  const allowed = scope.allowed.map((e) => e.id);
  const report: ImportReport = { created: 0, updated: 0, ignored: [], errors: [] };

  const entityIds = [...new Set(input.entity_ids)].filter((e): e is EntityId => allowed.includes(e as EntityId));
  if (!entityIds.length || entityIds.length !== new Set(input.entity_ids).size) {
    report.errors.push({ line: 0, message: "Choisissez au moins un établissement autorisé." });
    return report;
  }
  const rows = (input.rows ?? []).slice(0, MAX_BATCH);
  const supabase = await createClient();

  // Clients existants indexés par téléphone
  const { data: existingRows } = await supabase.from("contacts").select("id, full_name, phone, email, entity_ids, tags, sex, birth_date, city, notes");
  const byPhone = new Map<string, Contact>();
  for (const c of (existingRows ?? []) as Contact[]) {
    const d = phoneDigits(c.phone);
    if (d.length >= 9) byPhone.set(d, c);
  }

  const toCreate: (Partial<Contact> & { line: number })[] = [];
  for (const r of rows) {
    const line = Number(r.line) || 0;
    const last = clean(r.full_name, 80);
    const first = clean(r.first_name, 60);
    const fullName = first && last ? `${first} ${last}` : (last ?? first);
    if (!fullName) {
      report.errors.push({ line, message: "Nom manquant" });
      continue;
    }
    const phone = parsePhone(r.phone);
    const digits = phoneDigits(phone);
    if (phone && digits.length < 9) {
      report.errors.push({ line, message: `Téléphone incomplet : « ${r.phone} »` });
      continue;
    }
    const birth = parseDate(r.birth_date);
    if (birth === "invalid") {
      report.errors.push({ line, message: `Date de naissance illisible : « ${r.birth_date} »` });
      continue;
    }
    const emailRaw = clean(r.email, 120)?.toLowerCase() ?? null;
    const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
    const values = {
      full_name: fullName,
      phone,
      email,
      sex: parseSex(r.sex),
      birth_date: birth,
      city: clean(r.city, 60),
      tags: parseTags(r.tags),
      notes: clean(r.notes, 1000),
    };

    const dup = digits.length >= 9 ? byPhone.get(digits) : undefined;
    if (dup) {
      const visible = !dup.entity_ids.length || dup.entity_ids.some((e) => allowed.includes(e));
      if (!visible) {
        report.errors.push({ line, message: "Numéro déjà enregistré pour un client d'un autre établissement" });
        continue;
      }
      if (!dup.id) {
        report.ignored.push({ line, reason: `Même téléphone qu'une ligne précédente du fichier (${dup.full_name})` });
        continue;
      }
      if (input.duplicates === "ignore") {
        report.ignored.push({ line, reason: `Déjà enregistré : ${dup.full_name}` });
        continue;
      }
      const patch: Partial<Contact> = {
        full_name: values.full_name,
        entity_ids: [...new Set([...dup.entity_ids, ...entityIds])],
        tags: [...new Set([...(dup.tags ?? []), ...values.tags])],
      };
      if (values.email) patch.email = values.email;
      if (values.sex) patch.sex = values.sex;
      if (values.birth_date) patch.birth_date = values.birth_date;
      if (values.city) patch.city = values.city;
      if (values.notes) patch.notes = dup.notes && !dup.notes.includes(values.notes) ? `${dup.notes}\n${values.notes}` : values.notes;
      const { error } = await supabase.from("contacts").update(patch).eq("id", dup.id);
      if (error) report.errors.push({ line, message: "Mise à jour refusée" });
      else {
        report.updated++;
        Object.assign(dup, patch);
      }
      continue;
    }

    const row = { ...values, entity_ids: entityIds, status: "client" as const, source: null, guardian_name: null, owner_id: profile.id, whatsapp_optin: true, line };
    toCreate.push(row);
    // Doublon à l'intérieur du fichier : la ligne suivante sera traitée comme un doublon
    if (digits.length >= 9) byPhone.set(digits, { ...(row as unknown as Contact), id: "" });
  }

  if (toCreate.length) {
    const { data: created, error } = await supabase
      .from("contacts")
      .insert(toCreate.map(({ line, ...c }) => (void line, c)))
      .select("id");
    if (error) {
      for (const r of toCreate) report.errors.push({ line: r.line, message: "Enregistrement refusé par la base" });
    } else {
      const ids = ((created ?? []) as { id: string }[]).map((c) => c.id);
      report.created = ids.length;
      if (ids.length) {
        await supabase.from("activities").insert(
          ids.map((id) => ({ contact_id: id, entity_id: entityIds[0], kind: "note", body: `Fiche importée depuis « ${input.fileName.slice(0, 80)} »`, author_id: profile.id })),
        );
      }
    }
  }

  if (input.last) {
    const created = (input.totals?.created ?? 0) + report.created;
    const updated = (input.totals?.updated ?? 0) + report.updated;
    await logAudit({
      action: "contacts.import",
      entity_id: entityIds[0] ?? null,
      target_type: "import",
      target_id: null,
      summary: `Import « ${input.fileName.slice(0, 80)} » : ${created} créés, ${updated} mis à jour`,
      actor: profile,
    });
    revalidatePath("/contacts");
  }
  return report;
}
