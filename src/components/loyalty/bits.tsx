import type { GiftCard, GiftCardStatus, LedgerKind } from "@/lib/types-loyalty";
import { dayKey } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";

/** Statut réel d'une carte (une carte active dont la date est passée est expirée) */
export function giftState(c: Pick<GiftCard, "status" | "expires_on">): GiftCardStatus {
  return c.status === "active" && c.expires_on < dayKey() ? "expiree" : c.status;
}

const GIFT: Record<GiftCardStatus, { label: string; tone: "green" | "gray" | "amber" | "red" }> = {
  active: { label: "Active", tone: "green" },
  epuisee: { label: "Utilisée", tone: "gray" },
  expiree: { label: "Expirée", tone: "amber" },
  annulee: { label: "Annulée", tone: "red" },
};

export function GiftStatusBadge({ card }: { card: Pick<GiftCard, "status" | "expires_on"> }) {
  const s = GIFT[giftState(card)];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

/** Établissements où la carte est valable */
export function ValidAt({ ids }: { ids: string[] }) {
  if (!ids.length) return <span className="text-xs text-muted">Tout le groupe</span>;
  return <EntityDots ids={ids} />;
}

export const LEDGER_LABEL: Record<LedgerKind, string> = {
  gain: "Achat",
  utilisation: "Points utilisés",
  parrainage: "Bonus parrainage",
  ajustement: "Ajustement",
  annulation: "Remboursement",
};

/** +120 / −300 */
export function PointsDelta({ points }: { points: number }) {
  return (
    <span className={points >= 0 ? "font-semibold tabular-nums text-emerald-600" : "font-semibold tabular-nums text-slate-500"}>
      {points >= 0 ? "+" : "−"}
      {new Intl.NumberFormat("fr-FR").format(Math.abs(points))}
    </span>
  );
}

export const pts = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} pts`;
