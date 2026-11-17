import {
  BarChart3,
  Building2,
  CalendarDays,
  CreditCard,
  Filter,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "./types";

export type NavItem = { href: string; label: string; icon: LucideIcon; roles?: Role[] };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Principal",
    items: [
      { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
      { href: "/contacts", label: "Clients & contacts", icon: Users },
      { href: "/prospects", label: "Prospects", icon: Filter },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/taches", label: "Tâches", icon: ListChecks },
    ],
  },
  {
    label: "Ventes",
    items: [
      { href: "/caisse", label: "Caisse", icon: ShoppingCart },
      { href: "/ventes", label: "Ventes & factures", icon: Receipt },
      { href: "/abonnements", label: "Abonnements", icon: CreditCard },
      { href: "/catalogue", label: "Catalogue", icon: Package },
    ],
  },
  {
    label: "Pilotage",
    items: [
      { href: "/campagnes", label: "Campagnes", icon: Megaphone, roles: ["direction", "manager", "reception"] },
      { href: "/rapports", label: "Rapports", icon: BarChart3, roles: ["direction", "manager"] },
      { href: "/etablissements", label: "Établissements", icon: Building2 },
      { href: "/equipe", label: "Équipe", icon: ShieldCheck, roles: ["direction", "manager"] },
    ],
  },
];

/** Barre du bas sur mobile (le reste est dans /plus) */
export const MOBILE = ["/", "/contacts", "/agenda", "/caisse"];

export function navFor(role: Role) {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || i.roles.includes(role)) })).filter((g) => g.items.length);
}
