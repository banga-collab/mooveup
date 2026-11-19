"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDirection } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { logAudit } from "@/lib/audit";
import { str } from "@/lib/utils";
import { ENTITY_ICONS, type EntityAudience, type EntityIconName, type EntityKind } from "@/lib/entities";
import { loadEstablishments, slugify, type Establishment } from "@/lib/establishments";
import type { FormState } from "@/components/action-form";

const KINDS: EntityKind[] = ["sport", "beaute", "clinique"];
const AUDIENCES: EntityAudience[] = ["Mixte", "Femmes", "Enfants", "Hommes"];

/** Lignes de la table : si elle est vide (première modification), on y recopie la liste actuelle */
async function ensureTable() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("establishments").select("id");
  if (error) return { supabase, error: "La table des établissements n'existe pas encore : exécutez supabase/establishments.sql." };
  if (!(data ?? []).length) {
    const list = await loadEstablishments();
    await supabase.from("establishments").insert(
      list.map((e, i) => ({
        id: e.id,
        name: e.name,
        short: e.short,
        kind: e.kind,
        color: e.color,
        icon: e.icon,
        tagline: e.tagline,
        activities: e.activities,
        audience: e.audience,
        address: e.address ?? "",
        phone: e.phone ?? "",
        active: e.active !== false,
        position: i + 1,
      })),
    );
  }
  return { supabase, error: null };
}

function refresh() {
  revalidatePath("/", "layout");
}

/** Crée (id null) ou modifie un établissement */
export async function saveEstablishment(id: string | null, _state: FormState, fd: FormData): Promise<FormState> {
  const me = await requireDirection();
  const name = str(fd.get("name"))?.slice(0, 80);
  if (!name) return { error: "Indiquez le nom de l'établissement." };
  const short = (str(fd.get("short")) ?? name).slice(0, 32);
  const kind = str(fd.get("kind")) as EntityKind;
  if (!KINDS.includes(kind)) return { error: "Choisissez le type d'activité." };
  const color = (str(fd.get("color")) ?? "").toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) return { error: "Choisissez une couleur." };
  const icon = (str(fd.get("icon")) ?? "Building2") as EntityIconName;
  if (!ENTITY_ICONS.includes(icon)) return { error: "Choisissez une icône dans la liste." };
  const audience = (str(fd.get("audience")) ?? "Mixte") as EntityAudience;
  if (!AUDIENCES.includes(audience)) return { error: "Choisissez le public." };
  const activities = [
    ...new Set(
      String(fd.get("activities") ?? "")
        .split(/[,\n;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].slice(0, 20);

  const row = {
    name,
    short,
    kind,
    color,
    icon,
    audience,
    activities,
    tagline: (str(fd.get("tagline")) ?? "").slice(0, 120),
    address: (str(fd.get("address")) ?? "").slice(0, 200),
    phone: (str(fd.get("phone")) ?? "").slice(0, 30),
  };

  const { supabase, error } = await ensureTable();
  if (error) return { error };
  const list = await loadEstablishments();

  if (id) {
    if (!list.some((e) => e.id === id)) return { error: "Établissement introuvable." };
    const { error: err } = await supabase.from("establishments").update(row).eq("id", id);
    if (err) return { error: "Impossible d'enregistrer les modifications. Réessayez." };
    await logAudit({ action: "etablissement.modification", entity_id: id, target_type: "establishment", target_id: id, summary: `Établissement ${name} modifié`, actor: me });
    await flash(`${short} enregistré`);
    refresh();
    redirect(`/etablissements/${id}`);
  }

  if (list.some((e) => e.name.toLowerCase() === name.toLowerCase())) return { error: `Un établissement s'appelle déjà « ${name} ».` };
  const base = slugify(str(fd.get("slug")) ?? short) || "etablissement";
  if (base.length < 2) return { error: "Identifiant trop court : utilisez au moins 2 lettres." };
  let slug = base;
  for (let n = 2; list.some((e) => e.id === slug); n++) slug = `${base}-${n}`;
  const position = list.length + 1;

  const { error: err } = await supabase.from("establishments").insert({ id: slug, ...row, active: true, position } satisfies Omit<Establishment, "created_at">);
  if (err) return { error: "Impossible de créer l'établissement. Réessayez." };
  await logAudit({ action: "etablissement.creation", entity_id: slug, target_type: "establishment", target_id: slug, summary: `Établissement ${name} ajouté`, actor: me });
  await flash(`${short} ajouté au groupe`);
  refresh();
  redirect(`/etablissements/${slug}`);
}

/** Désactive / réactive un établissement (les données sont conservées) */
export async function toggleEstablishment(id: string) {
  const me = await requireDirection();
  const { supabase, error } = await ensureTable();
  if (error) {
    await flash(error, "error");
    redirect("/etablissements");
  }
  const list = await loadEstablishments();
  const e = list.find((x) => x.id === id);
  if (!e) redirect("/etablissements");
  const next = e.active === false;
  if (!next && list.filter((x) => x.active !== false).length <= 1) {
    await flash("Impossible de désactiver le dernier établissement actif.", "error");
    redirect("/etablissements");
  }
  await supabase.from("establishments").update({ active: next }).eq("id", id);
  await logAudit({
    action: next ? "etablissement.reactivation" : "etablissement.desactivation",
    entity_id: id,
    target_type: "establishment",
    target_id: id,
    summary: `Établissement ${e.name} ${next ? "réactivé" : "désactivé"}`,
    actor: me,
  });
  await flash(next ? `${e.short} réactivé` : `${e.short} désactivé · ses données sont conservées`);
  refresh();
  redirect(next ? `/etablissements/${id}` : "/etablissements");
}
