import {
  Activity,
  DatabaseBackup,
  Gauge,
  Handshake,
  MessageSquareWarning,
  Truck,
  BarChart3,
  Baby,
  Bot,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileBarChart,
  FileHeart,
  FileUp,
  Filter,
  Gift,
  LayoutDashboard,
  ListChecks,
  Lock,
  Megaphone,
  Package,
  Receipt,
  ScanLine,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Tablet,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

/**
 * Menu du CRM. `label` = texte français (référence) ; le texte affiché passe par
 * la traduction `navLabel(t, item)` → clé `nav.<chemin>` (ex. « nav.caisse », « nav.home »).
 */
export type NavItem = { href: string; label: string; icon: LucideIcon; roles?: Role[]; keywords?: string };
export type NavGroup = { id: string; label: string; items: NavItem[] };

const MGMT: Role[] = ["direction", "manager"];
const DESK: Role[] = ["direction", "manager", "reception"];

export const NAV: NavGroup[] = [
  {
    id: "quotidien",
    label: "Quotidien",
    items: [
      { href: "/", label: "Tableau de bord", icon: LayoutDashboard, keywords: "accueil" },
      { href: "/acces", label: "Accueil & entrées", icon: ScanLine, keywords: "qr check-in présence scanner" },
      { href: "/express", label: "Accueil express", icon: Zap, keywords: "rapide comptoir réception client" },
      { href: "/tablette", label: "Mode tablette accueil", icon: Tablet, roles: DESK, keywords: "borne tablette kiosque accueil" },
      { href: "/agenda", label: "Agenda", icon: CalendarDays, keywords: "rendez-vous rdv" },
      { href: "/contacts", label: "Clients", icon: Users, keywords: "contacts adhérents" },
      { href: "/prospects", label: "Prospects", icon: Filter, keywords: "pipeline leads" },
      { href: "/taches", label: "Tâches", icon: ListChecks, keywords: "relances à faire" },
      { href: "/reclamations", label: "Réclamations", icon: MessageSquareWarning, keywords: "plaintes pannes signalement qr propreté sécurité" },
    ],
  },
  {
    id: "ventes",
    label: "Ventes",
    items: [
      { href: "/caisse", label: "Caisse", icon: ShoppingCart, keywords: "encaisser vendre pos" },
      { href: "/cloture", label: "Clôture de caisse", icon: Lock, roles: DESK, keywords: "z fond de caisse espèces" },
      { href: "/ventes", label: "Ventes & factures", icon: Receipt, keywords: "tickets factures" },
      { href: "/abonnements", label: "Abonnements", icon: CreditCard, keywords: "renouvellement packs" },
      { href: "/fidelite", label: "Fidélité & cadeaux", icon: Gift, keywords: "points cartes cadeaux parrainage" },
      { href: "/catalogue", label: "Catalogue", icon: Package, keywords: "prix prestations produits" },
      { href: "/stock", label: "Stock", icon: Boxes, keywords: "inventaire fournisseurs produits" },
      { href: "/entreprises", label: "Entreprises partenaires", icon: Handshake, roles: MGMT, keywords: "conventions sociétés salariés facturation groupée rh b2b" },
    ],
  },
  {
    id: "metiers",
    label: "Métiers",
    items: [
      { href: "/dossiers", label: "Dossiers clinique & institut", icon: FileHeart, keywords: "consentements fiches techniques photos avant après" },
      { href: "/kids", label: "Kids", icon: Baby, keywords: "enfants groupes parents présence" },
      { href: "/planning", label: "Planning équipe", icon: CalendarClock, keywords: "pointage horaires commissions" },
    ],
  },
  {
    id: "pilotage",
    label: "Pilotage",
    items: [
      { href: "/pilotage", label: "Pilotage dirigeant", icon: Gauge, roles: MGMT, keywords: "prévisions churn risque objectifs marge dirigeant" },
      { href: "/rapports", label: "Rapports", icon: BarChart3, roles: MGMT, keywords: "statistiques chiffre" },
      { href: "/rapports-clients", label: "Rapports clients", icon: FileBarChart, roles: DESK, keywords: "rapport client bilan période export pdf" },
      { href: "/depenses", label: "Dépenses & marge", icon: Wallet, roles: MGMT, keywords: "charges coûts marge" },
      { href: "/fournisseurs", label: "Fournisseurs", icon: Truck, roles: MGMT, keywords: "fournisseurs ice rib achats prestataires dépenses répertoire" },
      { href: "/campagnes", label: "Campagnes", icon: Megaphone, roles: DESK, keywords: "whatsapp sms email marketing" },
      { href: "/collaborations", label: "Collaborations", icon: Handshake, roles: MGMT, keywords: "partenariats sponsoring influenceurs marques associations événements" },
      { href: "/automatisations", label: "Rappels automatiques", icon: Bot, roles: DESK, keywords: "whatsapp rappels automatisations" },
      { href: "/avis", label: "Avis clients", icon: Star, roles: DESK, keywords: "satisfaction google note" },
    ],
  },
  {
    id: "admin",
    label: "Administration",
    items: [
      { href: "/etablissements", label: "Établissements", icon: Building2 },
      { href: "/equipe", label: "Équipe & droits", icon: ShieldCheck, roles: MGMT },
      { href: "/journal", label: "Journal des actions", icon: ScrollText, roles: MGMT, keywords: "audit historique sécurité" },
      { href: "/import", label: "Importer", icon: FileUp, roles: MGMT, keywords: "excel csv import clients" },
      { href: "/parametres", label: "Paramètres", icon: Settings, roles: ["direction"], keywords: "ice tva whatsapp cmi" },
      { href: "/parametres/sauvegarde", label: "Sauvegarde", icon: DatabaseBackup, roles: ["direction"], keywords: "export backup restaurer csv json" },
      { href: "/parametres/systeme", label: "État du système", icon: Activity, roles: ["direction"], keywords: "mise en ligne vercel supabase variables cron" },
    ],
  },
];

/** Raccourcis rapides (palette de commandes) ; `key` = clé de traduction */
export const QUICK_ACTIONS: { href: string; label: string; key: string; icon: LucideIcon }[] = [
  { href: "/caisse", label: "Encaisser une vente", key: "qa.sale", icon: ShoppingCart },
  { href: "/contacts/nouveau", label: "Nouveau client", key: "qa.client", icon: Users },
  { href: "/agenda/nouveau", label: "Nouveau rendez-vous", key: "qa.rdv", icon: CalendarDays },
  { href: "/abonnements/nouveau", label: "Nouvel abonnement", key: "qa.sub", icon: CreditCard },
  { href: "/prospects/nouveau", label: "Nouveau prospect", key: "qa.lead", icon: Filter },
  { href: "/acces", label: "Scanner une entrée", key: "qa.scan", icon: ScanLine },
  { href: "/taches#nouvelle-tache", label: "Ajouter une tâche", key: "qa.task", icon: ClipboardList },
];

/** Barre du bas sur mobile (le reste est dans /plus) */
export const MOBILE = ["/", "/acces", "/agenda", "/caisse"];

export function navFor(role: Role) {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) })).filter((g) => g.items.length);
}

/** Clé de traduction d'une entrée du menu : "/" → "nav.home", "/caisse" → "nav.caisse" */
export function navKey(href: string) {
  return href === "/" ? "nav.home" : `nav.${href.slice(1).replace(/\//g, ".")}`;
}

type T = (key: string, vars?: Record<string, string | number>) => string;
/** Libellé traduit d'une entrée (retombe sur le français) */
export const navLabel = (t: T, it: Pick<NavItem, "href" | "label">) => {
  const k = navKey(it.href);
  const s = t(k);
  return s === k ? it.label : s;
};
/** Libellé traduit d'un groupe */
export const navGroupLabel = (t: T, g: Pick<NavGroup, "id" | "label">) => {
  const k = `nav.g.${g.id}`;
  const s = t(k);
  return s === k ? g.label : s;
};
