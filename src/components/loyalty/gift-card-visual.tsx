import type { GiftCard } from "@/lib/types-loyalty";
import { entity } from "@/lib/entities";
import { fmtDate, mad } from "@/lib/utils";

/** Carte cadeau imprimable, sobre (format carte de visite agrandi) */
export function GiftCardVisual({ card }: { card: GiftCard }) {
  const valid = card.entity_ids.length ? card.entity_ids.map((id) => entity(id)?.short).filter(Boolean).join(" · ") : "Les 7 établissements Moov'Up";
  return (
    <div className="mx-auto aspect-[1.6/1] w-full max-w-md rounded-xl border border-line bg-white p-6 print:max-w-[12cm] print:border-slate-400">
      <div className="flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Carte cadeau</p>
            <p className="mt-1 text-sm font-semibold text-ink">Groupe Moov&apos;Up · Agadir</p>
          </div>
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-ink">{mad(card.amount_mad)}</p>
        </div>
        <div>
          {card.beneficiary_name && (
            <p className="text-[13px] text-muted">
              Pour <span className="font-medium text-ink">{card.beneficiary_name}</span>
              {card.buyer_name && card.buyer_name !== card.beneficiary_name ? ` · de la part de ${card.buyer_name}` : ""}
            </p>
          )}
          {card.message && <p className="mt-1 text-[13px] italic text-slate-600">« {card.message} »</p>}
        </div>
        <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
          <div className="min-w-0">
            <p className="truncate text-[11px] text-muted">Valable : {valid}</p>
            <p className="text-[11px] text-muted">Jusqu&apos;au {fmtDate(card.expires_on)}</p>
          </div>
          <p className="shrink-0 font-mono text-base font-semibold tracking-wider text-ink">{card.code}</p>
        </div>
      </div>
    </div>
  );
}
