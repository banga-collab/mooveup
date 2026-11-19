/**
 * Les établissements du groupe Moov'Up (Agadir).
 * Liste de départ côté code (couleurs, icônes, type d'activité) ; la liste réelle vient de la table
 * `establishments` (voir lib/establishments.ts) et est enregistrée ici au chargement (`registerEntities`),
 * pour que `entity(id)`, `ENTITIES` et `ENTITY_IDS` connaissent aussi les établissements ajoutés depuis l'application.
 */
export type EntityKind = "sport" | "beaute" | "clinique";

/** Identifiants des établissements d'origine (les nouveaux établissements ont un identifiant libre, typé de la même façon) */
export type EntityId = "sports" | "lady" | "kids" | "power" | "clinic" | "institut" | "evolve";

/** Icônes proposées pour un établissement (lucide, voir components/entity-icon.tsx) */
export const ENTITY_ICONS = [
  "Dumbbell",
  "Flower2",
  "Smile",
  "Zap",
  "Stethoscope",
  "Sparkles",
  "Scissors",
  "Building2",
  "Waves",
  "Bike",
  "HeartPulse",
  "Baby",
  "Trophy",
  "Leaf",
  "Gem",
  "Coffee",
  "Store",
  "Activity",
] as const;
export type EntityIconName = (typeof ENTITY_ICONS)[number];

export type EntityAudience = "Mixte" | "Femmes" | "Enfants" | "Hommes";

export type Entity = {
  id: EntityId;
  name: string;
  short: string;
  kind: EntityKind;
  /** Couleur principale (hex) */
  color: string;
  /** Couleur claire pour les fonds */
  soft: string;
  /** Nom d'icône lucide (voir components/entity-icon.tsx) */
  icon: EntityIconName;
  tagline: string;
  /** Activités / familles de prestations proposées */
  activities: string[];
  /** Public principal */
  audience: EntityAudience;
  address?: string;
  phone?: string;
  /** false = désactivé (masqué des sélecteurs, données conservées) */
  active?: boolean;
  /** Établissement inconnu (valeur par défaut) */
  unknown?: boolean;
};

const DEFAULTS: Entity[] = [
  {
    id: "sports",
    name: "Complexe Moov'Up Sports",
    short: "Moov'Up Sports",
    kind: "sport",
    color: "#1a6d8e",
    soft: "#eef6f9",
    icon: "Dumbbell",
    tagline: "Musculation, fitness, piscine et football",
    activities: ["Musculation", "Fitness", "Piscine", "Football", "Coaching personnel", "Cours collectifs"],
    audience: "Mixte",
  },
  {
    id: "lady",
    name: "Lady Moov'Up",
    short: "Lady Moov'Up",
    kind: "sport",
    color: "#d9467a",
    soft: "#fdf0f5",
    icon: "Flower2",
    tagline: "Fitness 100 % féminin",
    activities: ["Fitness", "Zumba", "Yoga", "Pilates", "Aquagym", "Coaching personnel"],
    audience: "Femmes",
  },
  {
    id: "kids",
    name: "Moov'Up Kids",
    short: "Moov'Up Kids",
    kind: "sport",
    color: "#e9a213",
    soft: "#fdf7e7",
    icon: "Smile",
    tagline: "Sport et éveil pour les enfants",
    activities: ["Natation enfants", "Football école", "Gym enfants", "Arts martiaux", "Stages vacances", "Anniversaires"],
    audience: "Enfants",
  },
  {
    id: "power",
    name: "Moov'Up Power Gym",
    short: "Power Gym",
    kind: "sport",
    color: "#c2410c",
    soft: "#fdf1ea",
    icon: "Zap",
    tagline: "Musculation et force",
    activities: ["Musculation", "Powerlifting", "CrossTraining", "Cardio", "Coaching personnel"],
    audience: "Mixte",
  },
  {
    id: "clinic",
    name: "Anais Beauty Clinic",
    short: "Anais Clinic",
    kind: "clinique",
    color: "#7c4dcc",
    soft: "#f4effc",
    icon: "Stethoscope",
    tagline: "Médecine esthétique",
    activities: ["Consultation", "Injections", "Laser", "Peeling", "Soins du visage médicaux", "Amincissement"],
    audience: "Mixte",
  },
  {
    id: "institut",
    name: "Anais Institut",
    short: "Anais Institut",
    kind: "beaute",
    color: "#b4774a",
    soft: "#faf3ee",
    icon: "Sparkles",
    tagline: "Beauté, hammam et bien-être",
    activities: ["Hammam", "Massage", "Épilation", "Soins du visage", "Manucure / pédicure", "Coiffure"],
    audience: "Femmes",
  },
  {
    id: "evolve",
    name: "Evolve Hommes",
    short: "Evolve Hommes",
    kind: "beaute",
    color: "#334155",
    soft: "#f1f4f7",
    icon: "Scissors",
    tagline: "Barbier et soins pour hommes",
    activities: ["Coupe", "Barbe", "Soins du visage", "Hammam", "Massage"],
    audience: "Hommes",
  },
];

/** Les 7 établissements d'origine (liste fixe, repli si la table est indisponible) */
export const DEFAULT_ENTITIES: readonly Entity[] = DEFAULTS.map((e) => ({ ...e, active: true }));

/** Établissements connus (complétée par `registerEntities` avec ceux de la base) */
export const ENTITIES: Entity[] = DEFAULTS.map((e) => ({ ...e, active: true }));

export const ENTITY_IDS: EntityId[] = ENTITIES.map((e) => e.id);

/** Couleur neutre des établissements inconnus */
export const FALLBACK_COLOR = "#64748b";

/** Teinte claire d'une couleur hex (mélange avec du blanc) */
export function softOf(hex: string, keep = 0.08) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#f1f5f9";
  const n = parseInt(m[1]!, 16);
  const mix = (c: number) => Math.round(255 - (255 - c) * keep);
  const r = mix(n >> 16);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Valeur par défaut propre pour un identifiant inconnu (couleur et icône génériques) */
export function fallbackEntity(id: string): Entity {
  const name =
    id
      .split(/[-_.\s]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || "Établissement";
  return {
    id: id as EntityId,
    name,
    short: name,
    kind: "sport",
    color: FALLBACK_COLOR,
    soft: "#f1f5f9",
    icon: "Building2",
    tagline: "",
    activities: [],
    audience: "Mixte",
    active: true,
    unknown: true,
  };
}

const byIdCache = new Map<string, Entity>();
const fallbackCache = new Map<string, Entity>();
const reindex = () => {
  byIdCache.clear();
  for (const e of ENTITIES) byIdCache.set(e.id, e);
};
reindex();

/**
 * Établissement par identifiant. Identifiant vide → undefined ;
 * identifiant inconnu → valeur par défaut (couleur grise, icône bâtiment).
 */
export function entity(id: string | null | undefined): Entity | undefined {
  if (!id) return undefined;
  const e = byIdCache.get(id);
  if (e) return e;
  let f = fallbackCache.get(id);
  if (!f) fallbackCache.set(id, (f = fallbackEntity(id)));
  return f;
}

/** L'identifiant correspond-il à un établissement connu ? */
export function isEntityId(id: string | null | undefined): id is EntityId {
  return !!id && byIdCache.has(id);
}

/** Enregistre la liste lue en base : met à jour ENTITIES / ENTITY_IDS sur place */
export function registerEntities(list: Entity[]) {
  if (!list.length) return;
  for (const next of list) {
    const cur = ENTITIES.find((e) => e.id === next.id);
    if (cur) Object.assign(cur, next);
    else ENTITIES.push({ ...next });
  }
  ENTITY_IDS.splice(0, ENTITY_IDS.length, ...ENTITIES.map((e) => e.id));
  fallbackCache.clear();
  reindex();
}

export const KIND_LABEL: Record<EntityKind, string> = {
  sport: "Sport",
  beaute: "Beauté & bien-être",
  clinique: "Médecine esthétique",
};

export const AUDIENCES: EntityAudience[] = ["Mixte", "Femmes", "Enfants", "Hommes"];
