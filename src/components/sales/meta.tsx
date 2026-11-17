import { Banknote, CalendarRange, ConciergeBell, CreditCard, FileText, Landmark, Layers, Package, Smartphone, type LucideIcon } from "lucide-react";
import type { CatalogKind, PayMethod, SaleStatus } from "@/lib/types";
import { PAY_LABEL, SALE_STATUS_LABEL, cn } from "@/lib/utils";

export const METHOD_ORDER: PayMethod[] = ["especes", "carte", "virement", "cheque", "en_ligne"];

export const METHOD_META: Record<PayMethod, { icon: LucideIcon; short: string; color: string }> = {
  especes: { icon: Banknote, short: "Espèces", color: "#059669" },
  carte: { icon: CreditCard, short: "Carte", color: "#1a6d8e" },
  virement: { icon: Landmark, short: "Virement", color: "#7c4dcc" },
  cheque: { icon: FileText, short: "Chèque", color: "#b4774a" },
  en_ligne: { icon: Smartphone, short: "En ligne", color: "#e8782a" },
};

export const KIND_ORDER: CatalogKind[] = ["abonnement", "pack", "prestation", "produit"];

export const KIND_META: Record<CatalogKind, { icon: LucideIcon; plural: string; color: string; soft: string }> = {
  abonnement: { icon: CalendarRange, plural: "Abonnements", color: "#1a6d8e", soft: "#eef6f9" },
  pack: { icon: Layers, plural: "Packs de séances", color: "#7c4dcc", soft: "#f4effc" },
  prestation: { icon: ConciergeBell, plural: "Prestations", color: "#e8782a", soft: "#fdf3eb" },
  produit: { icon: Package, plural: "Produits", color: "#059669", soft: "#ecfdf5" },
};

const STATUS_CLS: Record<SaleStatus, string> = {
  payee: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  partielle: "bg-amber-50 text-amber-700 ring-amber-100",
  impayee: "bg-red-50 text-red-700 ring-red-100",
  remboursee: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function SaleStatusBadge({ status, className }: { status: SaleStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", STATUS_CLS[status], className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {SALE_STATUS_LABEL[status]}
    </span>
  );
}

export function MethodChip({ method }: { method: PayMethod }) {
  const m = METHOD_META[method];
  const I = m.icon;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-slate-600" title={PAY_LABEL[method]}>
      <span className="grid size-6 place-items-center rounded-lg" style={{ background: `${m.color}14`, color: m.color }}>
        <I className="size-3.5" />
      </span>
      {m.short}
    </span>
  );
}

/** Détail de la durée / validité d'un article du catalogue */
export function itemDetail(i: { kind: CatalogKind; duration_min: number | null; duration_days: number | null; sessions_count: number | null; stock: number | null }) {
  if (i.kind === "abonnement") return i.duration_days ? durationLabel(i.duration_days) : "Durée libre";
  if (i.kind === "pack") return [i.sessions_count ? `${i.sessions_count} séance${i.sessions_count > 1 ? "s" : ""}` : null, i.duration_days ? `valable ${durationLabel(i.duration_days)}` : null].filter(Boolean).join(" · ");
  if (i.kind === "prestation") return i.duration_min ? (i.duration_min >= 60 && i.duration_min % 60 === 0 ? `${i.duration_min / 60} h` : `${i.duration_min} min`) : "";
  return i.stock === null ? "Stock non suivi" : `${i.stock} en stock`;
}

export function durationLabel(days: number) {
  if (days === 365 || days === 366) return "1 an";
  if (days % 30 === 0 && days >= 30) return `${days / 30} mois`;
  if (days % 7 === 0 && days >= 7) return `${days / 7} sem.`;
  return `${days} j`;
}

/** Seuil de stock bas */
export const LOW_STOCK = 5;
