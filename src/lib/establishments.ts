/**
 * Établissements en base (table `establishments`), avec repli sur la liste fixe de entities.ts.
 * Chaque lecture enregistre la liste dans entities.ts (entity(), ENTITIES, ENTITY_IDS).
 */
import { cache } from "react";
import { createClient } from "./supabase/server";
import { DEFAULT_ENTITIES, ENTITY_ICONS, registerEntities, softOf, type Entity, type EntityAudience, type EntityIconName, type EntityId, type EntityKind } from "./entities";

export type Establishment = {
  /** Identifiant court (slug), ex. « sports », « agadir-bay » */
  id: string;
  name: string;
  short: string;
  kind: EntityKind;
  color: string;
  icon: EntityIconName;
  tagline: string;
  activities: string[];
  audience: EntityAudience;
  address: string;
  phone: string;
  active: boolean;
  position: number;
  created_at: string;
};

const KINDS: EntityKind[] = ["sport", "beaute", "clinique"];
const AUD: EntityAudience[] = ["Mixte", "Femmes", "Enfants", "Hommes"];

export function toEntity(r: Partial<Establishment> & { id: string }): Entity {
  const base = DEFAULT_ENTITIES.find((e) => e.id === r.id);
  const color = /^#[0-9a-f]{6}$/i.test(r.color ?? "") ? r.color! : (base?.color ?? "#64748b");
  return {
    id: r.id as EntityId,
    name: r.name || base?.name || r.id,
    short: r.short || r.name || base?.short || r.id,
    kind: KINDS.includes(r.kind as EntityKind) ? (r.kind as EntityKind) : (base?.kind ?? "sport"),
    color,
    soft: base && base.color === color ? base.soft : softOf(color),
    icon: ENTITY_ICONS.includes(r.icon as EntityIconName) ? (r.icon as EntityIconName) : (base?.icon ?? "Building2"),
    tagline: r.tagline ?? base?.tagline ?? "",
    activities: Array.isArray(r.activities) ? r.activities : (base?.activities ?? []),
    audience: AUD.includes(r.audience as EntityAudience) ? (r.audience as EntityAudience) : (base?.audience ?? "Mixte"),
    address: r.address ?? "",
    phone: r.phone ?? "",
    active: r.active !== false,
  };
}

/**
 * Tous les établissements (actifs et désactivés), dans l'ordre d'affichage.
 * Table absente ou vide → les 7 établissements d'origine.
 */
export const loadEstablishments = cache(async (): Promise<Entity[]> => {
  let list: Entity[] = DEFAULT_ENTITIES.map((e) => ({ ...e }));
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("establishments").select("*").order("position");
    const rows = (data ?? []) as Establishment[];
    if (!error && rows.length) list = [...rows].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0)).map(toEntity);
  } catch {
    // Repli sur la liste fixe
  }
  registerEntities(list);
  return list;
});

/** Établissements actifs */
export async function activeEstablishments() {
  return (await loadEstablishments()).filter((e) => e.active !== false);
}

/** Identifiant court à partir d'un nom : « Moov'Up Bay » → « moovup-bay » */
export function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}
