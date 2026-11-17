import type { ReactNode } from "react";

/** Valeur brute d'une cellule (tri + export CSV) */
export type CellValue = string | number | boolean | null | undefined;

export type DataColumn = {
  /** Identifiant (utilisé dans l'URL `?tri=`) */
  key: string;
  /** Libellé de l'en-tête (et de l'export) */
  label: string;
  /** Montant / nombre : aligné à droite, chiffres tabulaires */
  numeric?: boolean;
  align?: "left" | "right" | "center";
  /** Triable (défaut : oui) */
  sortable?: boolean;
  /** Masquable dans le menu « Colonnes » (défaut : oui, sauf la 1re colonne) */
  hideable?: boolean;
  /** Masquée par défaut */
  hidden?: boolean;
  /** Exclue de l'export CSV (ex. colonne d'actions) */
  noExport?: boolean;
  /** Libellé visible uniquement pour les lecteurs d'écran (ex. « Actions ») */
  srOnly?: boolean;
  /** Classes de la cellule <td> */
  className?: string;
  /** Classes de l'en-tête <th> */
  headClassName?: string;
  /**
   * Place dans la carte mobile (< 640 px) :
   * title (en haut à gauche, défaut : 1re colonne), right (en haut à droite),
   * subtitle (sous le titre), footer (bas de carte, ex. actions), hide (non affichée).
   * Sans valeur : ligne « libellé : valeur ».
   */
  card?: "title" | "right" | "subtitle" | "footer" | "hide";
};

export type DataRow = {
  id: string;
  /** Ligne cliquable : ouvre ce lien (Ctrl/⌘ + clic : nouvel onglet) */
  href?: string;
  /** Contenu affiché par colonne */
  cells: Record<string, ReactNode>;
  /** Valeur brute pour le tri et l'export (défaut : la cellule si c'est du texte ou un nombre) */
  values?: Record<string, CellValue>;
  /** Classes de la ligne (ex. ligne grisée) */
  className?: string;
};

/** Action groupée sur les lignes sélectionnées */
export type BulkAction = {
  label: string;
  icon?: ReactNode;
  variant?: "secondary" | "danger" | "brand";
  /** Message de confirmation (actions destructrices) */
  confirm?: string;
  /** Lignes concernées (défaut : toutes) — l'action ne s'applique qu'à l'intersection avec la sélection */
  ids?: string[];
  /** Appelée une fois avec tous les identifiants… */
  run?: (ids: string[]) => Promise<unknown>;
  /** …ou une fois par identifiant (server action existante à un argument) */
  each?: (id: string) => Promise<unknown>;
  /** Message affiché une fois l'action terminée (n = nombre de lignes traitées) */
  done?: string;
};
