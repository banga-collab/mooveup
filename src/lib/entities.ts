/**
 * Les établissements du groupe Moov'Up (Agadir).
 * Liste fixe côté code : couleurs, icônes et type d'activité.
 */
export type EntityKind = "sport" | "beaute" | "clinique";

export type EntityId = "sports" | "lady" | "kids" | "power" | "clinic" | "institut" | "evolve";

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
  icon: "Dumbbell" | "Flower2" | "Smile" | "Zap" | "Stethoscope" | "Sparkles" | "Scissors";
  tagline: string;
  /** Activités / familles de prestations proposées */
  activities: string[];
  /** Public principal */
  audience: "Mixte" | "Femmes" | "Enfants" | "Hommes";
};

export const ENTITIES: Entity[] = [
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

export const ENTITY_IDS = ENTITIES.map((e) => e.id);

export function entity(id: string | null | undefined): Entity | undefined {
  return ENTITIES.find((e) => e.id === id);
}

export const KIND_LABEL: Record<EntityKind, string> = {
  sport: "Sport",
  beaute: "Beauté & bien-être",
  clinique: "Médecine esthétique",
};
