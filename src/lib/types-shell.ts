/** Types de la coquille de l'application (recherche, notifications, préférences, vues) */

export type Theme = "light" | "dark" | "system";

/** Vue enregistrée (filtres d'une liste) affichée dans la barre latérale */
export type SavedView = {
  id: string;
  user_id: string;
  label: string;
  /** Chemin + paramètres, ex. « /contacts?statut=client&etab=lady » */
  href: string;
  /** Nom d'icône lucide (facultatif) */
  icon?: string | null;
  created_at: string;
};

/** Notification marquée comme lue par un membre */
export type NotificationRead = {
  id: string;
  user_id: string;
  /** Clé stable de la notification (catégorie + signature des éléments) */
  key: string;
  read_at: string;
};

export type NotificationKind = "rdv" | "stock" | "caisse" | "abonnement" | "impaye" | "avis" | "tache" | "reservation" | "prospect";

export type AppNotification = {
  key: string;
  kind: NotificationKind;
  /** Gravité : alerte (orange) ou info */
  tone: "alert" | "info";
  count: number;
  /** Clé de traduction du titre ({n} = nombre) */
  titleKey: string;
  /** Détail court (noms, montants…), en français */
  detail: string;
  href: string;
  read: boolean;
};

/** Groupes de la recherche globale */
export type SearchGroup =
  | "clients"
  | "ventes"
  | "rdv"
  | "prospects"
  | "abonnements"
  | "catalogue"
  | "cartes"
  | "taches"
  | "fournisseurs"
  | "campagnes"
  | "equipe";

export type SearchResult = {
  id: string;
  group: SearchGroup;
  label: string;
  /** Texte secondaire (téléphone, date, montant…) */
  sub?: string;
  href: string;
  entity_ids?: string[];
  /** Pour un client : identifiant (actions rapides « Encaisser », « RDV pour ») */
  contact_id?: string;
};

export type OnboardingStep = { id: string; done: boolean; href: string };
