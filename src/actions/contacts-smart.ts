"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getScope } from "@/lib/auth";
import { ENTITY_IDS, type EntityId } from "@/lib/entities";
import { flash } from "@/lib/flash";
import type { Contact } from "@/lib/types";
import { phoneDigits } from "@/components/contacts/helpers";

export type SimilarContact = {
  id: string;
  full_name: string;
  phone: string | null;
  entity_ids: EntityId[];
  /** Même numéro de téléphone (doublon quasi certain) */
  samePhone: boolean;
  /** Nom très proche */
  sameName: boolean;
};

export type SimilarResult = {
  hits: SimilarContact[];
  /** Le numéro existe déjà chez un client d'un autre établissement (nom masqué) */
  phoneElsewhere: boolean;
};

/** Sans accents, minuscules, espaces simples */
const norm = (s: string | null | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]+/g, " ")
    .trim();

/** Distance d'édition bornée (fautes de frappe : « Bennani » / « Benani ») */
function close(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * Fiches proches pendant la saisie : nom (≥ 3 lettres, accents ignorés, fautes légères)
 * ou téléphone (≥ 6 chiffres, 06… / +212… / 00212… équivalents).
 */
export async function findSimilar(input: { name?: string; phone?: string; exceptId?: string }): Promise<SimilarResult> {
  const name = norm(input.name).slice(0, 80);
  const digits = phoneDigits(String(input.phone ?? "").slice(0, 30));
  const useName = name.replace(/\s/g, "").length >= 3;
  const usePhone = digits.length >= 6;
  if (!useName && !usePhone) return { hits: [], phoneElsewhere: false };

  const scope = await getScope();
  const allowedIds = scope.allowed.map((e) => e.id);
  const supabase = await createClient();

  // Le numéro est vérifié sur tout le groupe (comme à l'enregistrement), le nom seulement dans le périmètre
  const [{ data: mineRows }, phoneRows] = await Promise.all([
    supabase.from("contacts").select("id, full_name, phone, entity_ids").overlaps("entity_ids", allowedIds),
    usePhone ? supabase.from("contacts").select("id, full_name, phone, entity_ids").ilike("phone", `%${digits.slice(-2)}%`) : Promise.resolve({ data: [] }),
  ]);
  const mine = (mineRows ?? []) as Pick<Contact, "id" | "full_name" | "phone" | "entity_ids">[];
  const tokens = name.split(" ").filter((t) => t.length >= 2);

  const hits: SimilarContact[] = [];
  for (const c of mine) {
    if (c.id === input.exceptId) continue;
    const d = phoneDigits(c.phone);
    const samePhone = usePhone && d.length >= 6 && (d === digits || (digits.length >= 9 && d.endsWith(digits.slice(-9))));
    const partialPhone = usePhone && !samePhone && d.includes(digits);
    let sameName = false;
    let nameScore = 0;
    if (useName && tokens.length) {
      const n = norm(c.full_name);
      const words = n.split(" ");
      sameName = n === name;
      // Chaque mot saisi commence un mot de la fiche, ou en est très proche
      const matched = tokens.filter((t) => words.some((w) => w.startsWith(t) || (t.length >= 4 && (close(w, t) || close(w.slice(0, t.length), t)))));
      nameScore = matched.length / tokens.length;
    }
    if (samePhone || partialPhone || sameName || nameScore === 1) {
      hits.push({ id: c.id, full_name: c.full_name, phone: c.phone, entity_ids: c.entity_ids, samePhone, sameName: sameName || nameScore === 1 });
    }
  }
  hits.sort((a, b) => Number(b.samePhone) - Number(a.samePhone) || Number(b.sameName) - Number(a.sameName) || a.full_name.localeCompare(b.full_name, "fr"));

  const others = ((phoneRows.data ?? []) as Pick<Contact, "id" | "phone" | "entity_ids">[]).filter(
    (c) => c.id !== input.exceptId && phoneDigits(c.phone) === digits && !c.entity_ids.some((e) => allowedIds.includes(e)),
  );
  return { hits: hits.slice(0, 6), phoneElsewhere: usePhone && digits.length >= 9 && others.length > 0 };
}

/** « Utiliser cette fiche » : rattache la fiche existante aux établissements cochés puis l'ouvre */
export async function attachExistingContact(id: string, entityIds: string[]): Promise<void> {
  const scope = await getScope();
  const allowedIds = scope.allowed.map((e) => e.id);
  const supabase = await createClient();
  const { data } = await supabase.from("contacts").select("id, entity_ids").eq("id", id).maybeSingle();
  const contact = data as Pick<Contact, "id" | "entity_ids"> | null;
  if (!contact || !contact.entity_ids.some((e) => allowedIds.includes(e))) redirect("/contacts");
  const add = entityIds.filter((e): e is EntityId => allowedIds.includes(e as EntityId) && !contact.entity_ids.includes(e as EntityId));
  if (add.length) {
    const entity_ids = ENTITY_IDS.filter((e) => contact.entity_ids.includes(e) || add.includes(e));
    await supabase.from("contacts").update({ entity_ids }).eq("id", id);
    revalidatePath("/", "layout");
  }
  await flash(add.length ? "Fiche existante rattachée" : "Fiche existante ouverte");
  redirect(`/contacts/${id}`);
}
