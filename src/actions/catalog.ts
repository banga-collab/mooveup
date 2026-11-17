"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseNum, str } from "@/lib/utils";
import type { CatalogItem, CatalogKind } from "@/lib/types";
import type { FormState } from "@/components/action-form";

const KINDS: CatalogKind[] = ["abonnement", "pack", "prestation", "produit"];

/** Droits d'écriture : direction et managers, sur leurs établissements */
async function guard() {
  const [profile, scope] = await Promise.all([getProfile(), getScope()]);
  const ok = profile.role === "direction" || profile.role === "manager";
  return { ok, scope, supabase: await createClient() };
}

async function loadItem(id: string) {
  const g = await guard();
  if (!g.ok) return { ...g, item: null };
  const { data } = await g.supabase.from("catalog_items").select("*").eq("id", id).maybeSingle();
  const item = data as CatalogItem | null;
  if (!item || !g.scope.allowed.some((e) => e.id === item.entity_id)) return { ...g, item: null };
  return { ...g, item };
}

const intOrNull = (v: FormDataEntryValue | null) => {
  const n = parseNum(v);
  return n === null ? null : Math.max(0, Math.round(n));
};

/** Création (id = null) ou modification d'un article */
export async function saveCatalogItem(id: string | null, _state: FormState, formData: FormData): Promise<FormState> {
  const g = id ? await loadItem(id) : { ...(await guard()), item: null };
  if (!g.ok) return { error: "Seules la direction et les managers peuvent modifier le catalogue." };
  if (id && !g.item) return { error: "Article introuvable." };

  const entity_id = String(formData.get("entity_id") ?? "");
  if (!g.scope.allowed.some((e) => e.id === entity_id)) return { error: "Choisissez un établissement autorisé." };
  const kind = String(formData.get("kind") ?? "") as CatalogKind;
  if (!KINDS.includes(kind)) return { error: "Choisissez un type d'article." };
  const name = str(formData.get("name"));
  if (!name) return { error: "Le nom est obligatoire." };
  const price = parseNum(formData.get("price_mad"));
  if (price === null || price < 0) return { error: "Indiquez un prix valide." };

  const row = {
    entity_id,
    kind,
    name: name.slice(0, 160),
    category: (str(formData.get("category")) ?? "").slice(0, 80),
    price_mad: Math.round(price * 100) / 100,
    duration_min: kind === "prestation" ? intOrNull(formData.get("duration_min")) : null,
    duration_days: kind === "abonnement" || kind === "pack" ? intOrNull(formData.get("duration_days")) : null,
    sessions_count: kind === "pack" ? intOrNull(formData.get("sessions_count")) : null,
    stock: kind === "produit" ? intOrNull(formData.get("stock")) : null,
    active: formData.get("active") === "on",
  };
  if (kind === "abonnement" && !row.duration_days) return { error: "Indiquez la durée de l'abonnement (en jours)." };
  if (kind === "pack" && !row.sessions_count) return { error: "Indiquez le nombre de séances du pack." };

  const { error } = id ? await g.supabase.from("catalog_items").update(row).eq("id", id) : await g.supabase.from("catalog_items").insert(row);
  if (error) return { error: error.message };

  revalidatePath("/catalogue");
  revalidatePath("/caisse");
  redirect(`/catalogue?type=${kind}#${entity_id}`);
}

/** Active / désactive un article */
export async function toggleCatalogItem(id: string) {
  const { item, supabase } = await loadItem(id);
  if (item) {
    await supabase.from("catalog_items").update({ active: !item.active }).eq("id", id);
    revalidatePath("/catalogue");
    revalidatePath("/caisse");
  }
}

/** Supprime un article (les ventes passées gardent leur libellé) */
export async function deleteCatalogItem(id: string) {
  const { item, supabase } = await loadItem(id);
  if (item) {
    await supabase.from("catalog_items").delete().eq("id", id);
    revalidatePath("/catalogue");
    revalidatePath("/caisse");
  }
  redirect("/catalogue");
}
