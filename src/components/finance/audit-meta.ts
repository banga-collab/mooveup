import {
  Ban,
  CalendarX,
  FileText,
  HandCoins,
  Lock,
  LockOpen,
  Percent,
  Settings,
  ShieldCheck,
  Tag,
  Trash2,
  Undo2,
  UserCog,
  UserX,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AuditEntry } from "@/lib/types-finance";

export type AuditGroup = "ventes" | "clients" | "caisse" | "catalogue" | "equipe";

export const AUDIT_GROUPS: { id: AuditGroup | "all"; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "ventes", label: "Ventes" },
  { id: "clients", label: "Clients" },
  { id: "caisse", label: "Caisse" },
  { id: "catalogue", label: "Catalogue" },
  { id: "equipe", label: "Équipe" },
];

type Meta = { label: string; icon: LucideIcon; group: AuditGroup };

const ACTIONS: Record<string, Meta> = {
  "vente.remise": { label: "Remise accordée", icon: Percent, group: "ventes" },
  "vente.remboursement": { label: "Vente remboursée", icon: Undo2, group: "ventes" },
  "vente.paiement": { label: "Paiement enregistré", icon: HandCoins, group: "ventes" },
  "abonnement.resiliation": { label: "Abonnement résilié", icon: Ban, group: "ventes" },
  "contact.suppression": { label: "Client supprimé", icon: UserX, group: "clients" },
  "contact.retrait": { label: "Client retiré d'un établissement", icon: UserX, group: "clients" },
  "rdv.suppression": { label: "Rendez-vous supprimé", icon: CalendarX, group: "clients" },
  "caisse.ouverture": { label: "Caisse ouverte", icon: LockOpen, group: "caisse" },
  "caisse.cloture": { label: "Caisse clôturée", icon: Lock, group: "caisse" },
  "depense.ajout": { label: "Dépense ajoutée", icon: Wallet, group: "caisse" },
  "depense.suppression": { label: "Dépense supprimée", icon: Trash2, group: "caisse" },
  "catalogue.prix": { label: "Prix modifié", icon: Tag, group: "catalogue" },
  "catalogue.suppression": { label: "Article supprimé", icon: Trash2, group: "catalogue" },
  "equipe.role": { label: "Rôle modifié", icon: ShieldCheck, group: "equipe" },
  "equipe.acces": { label: "Accès modifié", icon: UserCog, group: "equipe" },
  "parametres.modification": { label: "Paramètres modifiés", icon: Settings, group: "equipe" },
};

const PREFIX_GROUP: Record<string, AuditGroup> = { vente: "ventes", abonnement: "ventes", contact: "clients", rdv: "clients", caisse: "caisse", depense: "caisse", catalogue: "catalogue", equipe: "equipe", parametres: "equipe" };

export function auditMeta(action: string): Meta {
  return ACTIONS[action] ?? { label: action, icon: FileText, group: PREFIX_GROUP[action.split(".")[0] ?? ""] ?? "equipe" };
}

/** Raison pour laquelle l'action est mise en évidence (null = action courante) */
export function sensitiveReason(e: AuditEntry, discountPct?: number): string | null {
  switch (e.action) {
    case "vente.remboursement":
      return "Remboursement";
    case "contact.suppression":
    case "rdv.suppression":
    case "catalogue.suppression":
    case "depense.suppression":
      return "Suppression";
    case "vente.remise": {
      const pct = Number(e.meta?.pct ?? discountPct ?? 0);
      return pct > 20 ? `Remise ${pct} %` : null;
    }
    case "caisse.cloture": {
      const diff = Number(e.meta?.diff ?? 0);
      return Math.abs(diff) > 20 ? `Écart ${diff > 0 ? "+" : ""}${diff} MAD` : null;
    }
    case "equipe.role":
      return "Droits";
    default:
      return null;
  }
}

/** Lien vers l'élément concerné */
export function auditHref(e: AuditEntry): string | null {
  const id = e.target_id;
  switch (e.target_type) {
    case "sale":
      return id ? `/ventes/${id}` : null;
    case "contact":
      return id ? `/contacts/${id}` : null;
    case "subscription":
      return e.meta?.contact_id ? `/contacts/${String(e.meta.contact_id)}?tab=abonnements` : "/abonnements";
    case "catalog_item":
      return id ? `/catalogue/${id}` : "/catalogue";
    case "cash_session":
      return id ? `/cloture/${id}` : "/cloture";
    case "expense":
      return e.meta?.month ? `/depenses?month=${String(e.meta.month)}` : "/depenses";
    case "profile":
      return "/equipe";
    case "settings":
      return "/parametres";
    case "appointment":
      return id ? `/agenda/${id}/modifier` : null;
    default:
      return null;
  }
}
