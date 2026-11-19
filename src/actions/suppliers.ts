"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { flash } from "@/lib/flash";
import { str } from "@/lib/utils";
import { norm } from "@/lib/search-match";
import type { EntityId } from "@/lib/entities";
import type { FormState } from "@/components/action-form";
import type { ExpenseRow, SupplierFull } from "@/lib/types-business";
import { storeImages } from "@/components/complaints/store-image";

const clip = (v: FormDataEntryValue | null, n: number) => str(v)?.slice(0, n) ?? null;

async function mgmt() {
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
  if (me.role !== "direction" && me.role !== "manager") redirect("/");
  return { me, scope };
}

/** Fournisseur visible dans le périmètre (aucun établissement = commun au groupe) */
function visible(s: SupplierFull, allowed: string[]) {
  return !(s.entity_ids ?? []).length || (s.entity_ids ?? []).some((e) => allowed.includes(e));
}

/** Crée ou modifie la fiche complète d'un fournisseur */
export async function saveSupplierFull(id: string | null, _state: FormState, fd: FormData): Promise<FormState> {
  const { me, scope } = await mgmt();
  const name = clip(fd.get("name"), 120);
  if (!name) return { error: "Indiquez le nom du fournisseur." };
  const allowed = scope.allowed.map((e) => e.id as string);
  const entity_ids = fd.getAll("entity_ids").map(String).filter((e) => allowed.includes(e)) as EntityId[];
  const ice = clip(fd.get("ice"), 20)?.replace(/\s/g, "") ?? null;
  if (ice && !/^\d{15}$/.test(ice)) return { error: "L'ICE doit comporter 15 chiffres (ou laissez le champ vide)." };
  const email = clip(fd.get("email"), 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Adresse e-mail invalide." };
  const rib = clip(fd.get("rib"), 40)?.replace(/\s/g, "") ?? null;
  if (rib && !/^\d{24}$/.test(rib)) return { error: "Le RIB marocain comporte 24 chiffres (ou laissez le champ vide)." };
  const categories = [...new Set(fd.getAll("categories").map(String).filter(Boolean))].slice(0, 12);

  const supabase = await createClient();
  let current: SupplierFull | null = null;
  if (id) {
    const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
    current = data as SupplierFull | null;
    if (!current || !visible(current, allowed)) return { error: "Fournisseur introuvable." };
  }
  // Doublon de nom
  const { data: same } = await supabase.from("suppliers").select("id, name").ilike("name", name);
  if (((same ?? []) as { id: string; name: string }[]).some((s) => s.id !== id && norm(s.name) === norm(name))) return { error: `Un fournisseur « ${name} » existe déjà.` };

  const docs = await storeImages(supabase, fd.getAll("documents"), `fournisseurs/${id ?? "nouveau"}`);
  const row = {
    name,
    legal_name: clip(fd.get("legal_name"), 160),
    ice,
    contact_name: clip(fd.get("contact_name"), 120),
    phone: clip(fd.get("phone"), 30),
    whatsapp: clip(fd.get("whatsapp"), 30),
    email,
    address: clip(fd.get("address"), 240),
    city: clip(fd.get("city"), 60),
    categories,
    entity_ids,
    payment_terms: clip(fd.get("payment_terms"), 80),
    rib,
    notes: clip(fd.get("notes"), 2000),
    documents: [...(current?.documents ?? []), ...docs],
    active: current?.active ?? true,
  };

  let savedId = id;
  if (id) {
    await supabase.from("suppliers").update(row).eq("id", id);
  } else {
    const { data, error } = await supabase.from("suppliers").insert({ ...row, product_ids: [] }).select().single();
    if (error || !data) return { error: "Impossible d'enregistrer le fournisseur." };
    savedId = (data as SupplierFull).id;
    // Rattache les anciennes dépenses saisies avec ce nom
    await linkExpensesByName(savedId, name, scope.ids);
  }
  await logAudit({
    action: id ? "fournisseur.modification" : "fournisseur.ajout",
    entity_id: entity_ids[0] ?? null,
    target_type: "supplier",
    target_id: savedId,
    summary: `Fournisseur ${id ? "modifié" : "ajouté"} : ${name}`,
    actor: me,
  });
  await flash(id ? "Fiche fournisseur enregistrée" : `Fournisseur « ${name} » ajouté`);
  revalidatePath("/fournisseurs");
  revalidatePath("/stock");
  redirect(`/fournisseurs/${savedId}`);
}

/** Rattache les dépenses sans fiche dont le nom de fournisseur correspond */
async function linkExpensesByName(supplierId: string, name: string, ids: string[]) {
  const supabase = await createClient();
  const { data } = await supabase.from("expenses").select("*").in("entity_id", ids).ilike("supplier", name);
  const rows = ((data ?? []) as ExpenseRow[]).filter((x) => !x.supplier_id && x.supplier && norm(x.supplier) === norm(name));
  if (rows.length) await supabase.from("expenses").update({ supplier_id: supplierId, supplier: name }).in("id", rows.map((x) => x.id));
  return rows.length;
}

/** Crée la fiche d'un fournisseur saisi en texte libre dans les dépenses et y rattache ses dépenses */
export async function createSupplierFromName(name: string) {
  const { me, scope } = await mgmt();
  const clean = name.trim().slice(0, 120);
  if (!clean) redirect("/fournisseurs");
  const supabase = await createClient();
  const { data: same } = await supabase.from("suppliers").select("*").ilike("name", clean);
  let sup = ((same ?? []) as SupplierFull[]).find((s) => norm(s.name) === norm(clean)) ?? null;
  if (!sup) {
    const { data: exp } = await supabase.from("expenses").select("*").in("entity_id", scope.ids).ilike("supplier", clean);
    const rows = ((exp ?? []) as ExpenseRow[]).filter((x) => x.supplier && norm(x.supplier) === norm(clean));
    const ents = [...new Set(rows.map((x) => x.entity_id))];
    const cats = [...new Set(rows.map((x) => x.category))];
    const { data } = await supabase
      .from("suppliers")
      .insert({ name: clean, contact_name: null, phone: null, email: null, city: "Agadir", entity_ids: ents, product_ids: [], notes: null, categories: cats, documents: [], active: true })
      .select()
      .single();
    sup = data as SupplierFull | null;
    if (!sup) redirect("/fournisseurs");
    await logAudit({ action: "fournisseur.ajout", entity_id: ents[0] ?? null, target_type: "supplier", target_id: sup.id, summary: `Fournisseur ajouté depuis les dépenses : ${clean}`, actor: me });
  }
  const n = await linkExpensesByName(sup.id, sup.name, scope.ids);
  await flash(`Fiche « ${sup.name} » créée · ${n} dépense${n > 1 ? "s" : ""} rattachée${n > 1 ? "s" : ""}`);
  revalidatePath("/fournisseurs");
  revalidatePath("/depenses");
  redirect(`/fournisseurs/${sup.id}/modifier`);
}

/** Archive / réactive un fournisseur (on garde l'historique des dépenses) */
export async function toggleSupplierActive(id: string) {
  const { me, scope } = await mgmt();
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  const sup = data as SupplierFull | null;
  if (!sup || !visible(sup, scope.allowed.map((e) => e.id))) redirect("/fournisseurs");
  const active = sup.active === false;
  await supabase.from("suppliers").update({ active }).eq("id", id);
  await logAudit({ action: "fournisseur.statut", entity_id: sup.entity_ids?.[0] ?? null, target_type: "supplier", target_id: id, summary: `Fournisseur ${active ? "réactivé" : "archivé"} : ${sup.name}`, actor: me });
  await flash(active ? "Fournisseur réactivé" : "Fournisseur archivé");
  revalidatePath("/fournisseurs");
  redirect(`/fournisseurs/${id}`);
}

/** Retire un document / une photo de la fiche */
export async function removeSupplierDocument(id: string, index: number) {
  const { scope } = await mgmt();
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  const sup = data as SupplierFull | null;
  if (!sup || !visible(sup, scope.allowed.map((e) => e.id))) redirect("/fournisseurs");
  const documents = (sup.documents ?? []).filter((_, i) => i !== index);
  await supabase.from("suppliers").update({ documents }).eq("id", id);
  await flash("Document retiré");
  revalidatePath(`/fournisseurs/${id}`);
  redirect(`/fournisseurs/${id}`);
}
