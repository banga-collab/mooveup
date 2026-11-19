import { PAY_LABEL } from "@/lib/utils";
import type { TicketData } from "./pos-types";

const n2 = (v: number) => v.toLocaleString("fr-MA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when = (iso: string) =>
  new Intl.DateTimeFormat("fr-MA", { timeZone: "Africa/Casablanca", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-2 text-[14px] font-bold" : "flex justify-between gap-2"}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * Ticket de caisse au format 80 mm (≈ 72 mm imprimables).
 * À l'impression, seul l'élément `.pos-ticket-print` est imprimé (voir TicketPrintStyle).
 */
export function Ticket({ t, className }: { t: TicketData; className?: string }) {
  return (
    <div className={`pos-ticket-print mx-auto w-[302px] max-w-full bg-white px-4 py-5 font-mono text-[12px] leading-snug text-black ${className ?? ""}`}>
      <div className="text-center">
        <p className="text-[14px] font-bold uppercase">{t.entity.name}</p>
        <p>{t.company.name}</p>
        {(t.entity.address || t.company.address) && <p>{t.entity.address || t.company.address}</p>}
        {(t.entity.phone || t.company.phone) && <p>Tél. {t.entity.phone || t.company.phone}</p>}
        {t.company.ice && <p>ICE {t.company.ice}</p>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <Row label={`Ticket ${t.number}`} value="" />
      <p>{when(t.sold_at)}</p>
      {t.cashier && <p>Caisse : {t.cashier}</p>}
      {t.client && <p>Client : {t.client}</p>}
      {t.refunded && <p className="mt-1 font-bold">*** VENTE REMBOURSÉE ***</p>}
      <div className="my-2 border-t border-dashed border-black" />
      <ul className="space-y-1">
        {t.lines.map((l, i) => (
          <li key={i}>
            <p className="break-words">{l.label}</p>
            <div className="flex justify-between gap-2">
              <span className="tabular-nums">
                {l.qty} x {n2(l.unit_price)}
              </span>
              <span className="tabular-nums">{n2(l.total)}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="my-2 border-t border-dashed border-black" />
      {t.discount > 0 && (
        <>
          <Row label="Sous-total" value={n2(t.gross)} />
          <Row label="Remise" value={`-${n2(t.discount)}`} />
        </>
      )}
      <Row label="TOTAL MAD" value={n2(t.total)} strong />
      <div className="mt-1.5 space-y-0.5">
        {t.payments.map((p, i) => (
          <Row key={i} label={PAY_LABEL[p.method]} value={n2(p.method === "especes" && t.tendered_cash > p.amount ? t.tendered_cash : p.amount)} />
        ))}
        {t.change > 0 && <Row label="Rendu monnaie" value={n2(t.change)} />}
        {t.rest > 0 && <Row label="Reste à payer" value={n2(t.rest)} strong />}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <p className="text-center">{t.company.footer || "Merci de votre visite !"}</p>
      <p className="mt-1 text-center text-[10px]">Prix TTC en dirhams</p>
    </div>
  );
}

/** Styles d'impression : n'imprime que le ticket, sur un rouleau de 80 mm */
export function TicketPrintStyle() {
  return (
    <style>{`@media print {
  @page { size: 80mm auto; margin: 0; }
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .pos-ticket-print, .pos-ticket-print * { visibility: visible !important; color: #000 !important; }
  .pos-ticket-print { position: absolute !important; left: 0; top: 0; width: 80mm !important; max-width: 80mm !important; padding: 3mm 4mm !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; }
}`}</style>
  );
}
