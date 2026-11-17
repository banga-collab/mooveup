import type { Settings } from "@/lib/settings";

const nf = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v: number) => `${nf.format(v)} MAD`;

/** Montants HT / TVA / TTC à partir d'un prix saisi TTC */
export function vatSplit(totalTtc: number, vatRate: number) {
  const rate = Math.max(0, Number(vatRate) || 0);
  const ht = Math.round((totalTtc / (1 + rate / 100)) * 100) / 100;
  return { ht, tva: Math.round((totalTtc - ht) * 100) / 100, ttc: totalTtc, rate };
}

/**
 * Bloc légal d'une facture marocaine : détail HT / TVA / TTC (prix saisis TTC),
 * identifiants de l'entreprise (ICE, RC, IF, patente) et pied de facture.
 */
export function InvoiceLegal({ settings, totalTtc }: { settings: Settings; totalTtc: number }) {
  const { ht, tva, ttc, rate } = vatSplit(Number(totalTtc) || 0, settings.vat_rate);
  const ids = [
    settings.ice && `ICE ${settings.ice}`,
    settings.rc && `RC ${settings.rc}`,
    settings.if_number && `IF ${settings.if_number}`,
    settings.patente && `Patente ${settings.patente}`,
  ].filter(Boolean);
  const contact = [settings.address, settings.phone && `Tél. ${settings.phone}`, settings.email].filter(Boolean);

  return (
    <div className="print-break space-y-4">
      <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
        <div className="flex justify-between gap-6">
          <dt className="text-muted">Total HT</dt>
          <dd className="tabular-nums text-ink">{money(ht)}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt className="text-muted">TVA {rate.toLocaleString("fr-FR")} %</dt>
          <dd className="tabular-nums text-ink">{money(tva)}</dd>
        </div>
        <div className="flex justify-between gap-6 border-t border-line pt-1.5">
          <dt className="font-medium text-ink">Total TTC</dt>
          <dd className="font-semibold tabular-nums text-ink">{money(ttc)}</dd>
        </div>
      </dl>
      <div className="border-t border-line pt-3 text-center text-[11px] leading-relaxed text-muted">
        <p className="font-medium text-slate-600">{settings.company_name}</p>
        {contact.length > 0 && <p>{contact.join(" · ")}</p>}
        {ids.length > 0 ? <p className="tabular-nums">{ids.join(" · ")}</p> : <p className="text-amber-700">Identifiants légaux (ICE, RC, IF) à renseigner dans Paramètres</p>}
        {settings.invoice_footer && <p className="mt-1">{settings.invoice_footer}</p>}
      </div>
    </div>
  );
}
