import type { AutomationKey } from "@/lib/types-loyalty";

/** Définition d'une règle de rappel automatique (le texte et l'état sont modifiables) */
export type AutomationDef = {
  key: AutomationKey;
  label: string;
  /** Qui reçoit le message */
  audience: string;
  /** Quand */
  timing: string;
  defaultMessage: string;
  defaultEnabled: boolean;
  /** Variables utiles pour cette règle */
  vars: string[];
  /** Heure minimale d'envoi (Agadir) pour la route planifiée */
  hour: number;
  /** Pas de nouvel envoi au même client avant N jours (1 = une fois par jour) */
  cooldownDays: number;
  /** Un seul envoi par objet (rendez-vous, abonnement…) */
  perRef: boolean;
};

export const VAR_LABEL: Record<string, string> = {
  prenom: "Prénom",
  etablissement: "Établissement",
  date: "Date",
  heure: "Heure",
  service: "Prestation",
  lien: "Lien d'avis",
  montant: "Montant dû",
};

export const SAMPLE_VARS: Record<string, string> = {
  prenom: "Salma",
  etablissement: "Lady Moov'Up",
  date: "mercredi 18 novembre",
  heure: "18:30",
  service: "Cours de Pilates",
  lien: "moovup.ma/r/7K2PQX",
  montant: "350 MAD",
};

export const AUTOMATIONS: AutomationDef[] = [
  {
    key: "rdv_veille",
    label: "Rappel de rendez-vous la veille",
    audience: "Clients ayant un rendez-vous prévu ou confirmé demain",
    timing: "La veille à partir de 18 h",
    defaultMessage:
      "Bonjour {prenom}, petit rappel : votre rendez-vous « {service} » chez {etablissement} est prévu demain {date} à {heure}. En cas d'empêchement, répondez simplement à ce message. À demain !",
    defaultEnabled: true,
    vars: ["prenom", "etablissement", "date", "heure", "service"],
    hour: 18,
    cooldownDays: 1,
    perRef: true,
  },
  {
    key: "rdv_confirmation",
    label: "Confirmation de rendez-vous",
    audience: "Rendez-vous à venir pris dans les dernières 24 h",
    timing: "Dès la prise du rendez-vous",
    defaultMessage: "Bonjour {prenom}, votre rendez-vous « {service} » chez {etablissement} est bien enregistré pour le {date} à {heure}. Merci de votre confiance !",
    defaultEnabled: true,
    vars: ["prenom", "etablissement", "date", "heure", "service"],
    hour: 8,
    cooldownDays: 1,
    perRef: true,
  },
  {
    key: "abo_j7",
    label: "Abonnement qui expire dans 7 jours",
    audience: "Abonnements actifs qui se terminent dans 7 jours",
    timing: "7 jours avant la fin, à partir de 10 h",
    defaultMessage: "Bonjour {prenom}, votre abonnement « {service} » chez {etablissement} se termine le {date}. Pensez à le renouveler à l'accueil pour continuer sans interruption !",
    defaultEnabled: true,
    vars: ["prenom", "etablissement", "date", "service"],
    hour: 10,
    cooldownDays: 1,
    perRef: true,
  },
  {
    key: "abo_j1",
    label: "Abonnement qui expire demain",
    audience: "Abonnements actifs qui se terminent demain",
    timing: "La veille de la fin, à partir de 10 h",
    defaultMessage: "Bonjour {prenom}, votre abonnement « {service} » chez {etablissement} se termine demain ({date}). Passez à l'accueil pour le renouveler, on vous attend !",
    defaultEnabled: true,
    vars: ["prenom", "etablissement", "date", "service"],
    hour: 10,
    cooldownDays: 1,
    perRef: true,
  },
  {
    key: "inactif_21",
    label: "Client inactif depuis 21 jours",
    audience: "Abonnés actifs d'un établissement sportif sans passage depuis 21 jours",
    timing: "Une fois, puis au plus tous les 14 jours",
    defaultMessage:
      "Bonjour {prenom}, cela fait un moment qu'on ne vous a pas vu chez {etablissement} ! Votre abonnement est toujours actif : on vous attend pour reprendre en douceur. Besoin d'un programme adapté ? Répondez à ce message.",
    defaultEnabled: true,
    vars: ["prenom", "etablissement", "service"],
    hour: 11,
    cooldownDays: 14,
    perRef: false,
  },
  {
    key: "anniversaire",
    label: "Anniversaire",
    audience: "Clients dont c'est l'anniversaire aujourd'hui",
    timing: "Le jour même à partir de 9 h",
    defaultMessage: "Joyeux anniversaire {prenom} ! Toute l'équipe {etablissement} vous souhaite une excellente journée. Une petite attention vous attend lors de votre prochaine visite.",
    defaultEnabled: true,
    vars: ["prenom", "etablissement"],
    hour: 9,
    cooldownDays: 300,
    perRef: false,
  },
  {
    key: "avis",
    label: "Remerciement et demande d'avis",
    audience: "Après un rendez-vous terminé ou une première visite",
    timing: "Dans les 36 h, au plus une demande par mois et par client",
    defaultMessage: "Merci {prenom} pour votre visite chez {etablissement} ! Votre avis compte beaucoup pour nous, il ne prend que 30 secondes : {lien}",
    defaultEnabled: true,
    vars: ["prenom", "etablissement", "service", "lien"],
    hour: 10,
    cooldownDays: 30,
    perRef: true,
  },
  {
    key: "impaye",
    label: "Relance d'impayé",
    audience: "Ventes impayées ou partielles depuis plus de 3 jours",
    timing: "Au plus une relance par semaine",
    defaultMessage: "Bonjour {prenom}, sauf erreur de notre part, il reste {montant} à régler chez {etablissement} (achat du {date}). Vous pourrez régulariser lors de votre prochaine visite. Merci !",
    defaultEnabled: false,
    vars: ["prenom", "etablissement", "date", "montant", "service"],
    hour: 11,
    cooldownDays: 7,
    perRef: false,
  },
];

export const AUTOMATION_KEYS = AUTOMATIONS.map((a) => a.key);

export function automationDef(key: string | null | undefined) {
  return AUTOMATIONS.find((a) => a.key === key);
}

/** Remplace {prenom}, {etablissement}… (variables inconnues laissées telles quelles) */
export function renderTemplate(tpl: string, vars: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));
}
