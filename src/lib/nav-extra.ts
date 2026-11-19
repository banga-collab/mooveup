import { Handshake, MessageSquareWarning, QrCode, Truck } from "lucide-react";
import type { NavItem } from "./nav";
import type { Role } from "./types";

const MGMT: Role[] = ["direction", "manager"];

/**
 * Entrées de menu du module « Fournisseurs, collaborations, réclamations ».
 * `group` = identifiant du groupe de `NAV` où insérer l'entrée, `after` = entrée qui la précède.
 */
export const NAV_EXTRA: (NavItem & { group: string; after?: string })[] = [
  { group: "pilotage", after: "/depenses", href: "/fournisseurs", label: "Fournisseurs", icon: Truck, roles: MGMT, keywords: "fournisseurs ice rib achats prestataires dépenses répertoire" },
  { group: "pilotage", after: "/campagnes", href: "/collaborations", label: "Collaborations", icon: Handshake, roles: MGMT, keywords: "partenariats sponsoring influenceurs marques associations événements" },
  { group: "quotidien", after: "/taches", href: "/reclamations", label: "Réclamations", icon: MessageSquareWarning, keywords: "plaintes pannes signalement qr propreté sécurité" },
];

/** Raccourci (palette de commandes) : affiches QR à imprimer */
export const QUICK_EXTRA = [{ href: "/reclamations/qr", label: "QR codes de signalement", key: "qa.qr", icon: QrCode }];
