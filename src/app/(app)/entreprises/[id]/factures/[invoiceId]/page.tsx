import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSettings } from "@/lib/settings";
import { entity } from "@/lib/entities";
import type { CompanyInvoice, CompanyInvoiceLine } from "@/lib/types-corporate";
import { PAY_LABEL, cn, fmtDate, mad, waLink } from "@/lib/utils";
import { BackLink } from "@/components/back-link";
import { ContactLink } from "@/components/quick-view/contact-link";
import { InvoiceLegal } from "@/components/finance/invoice-legal";
import { PrintButton } from "@/components/loyalty/print-button";
import { buttonClass } from "@/components/ui";
import { InvoiceStatusBadge, isOverdue, isUnpaid } from "@/components/corporate/bits";
import { CancelInvoiceButton, PaidForm, RemindMenu, SendInvoiceButton } from "@/components/corporate/client-bits";
import { conventionSummary, monthLabel } from "@/components/corporate/calc";
import { loadCompany } from "@/components/corporate/data";
import { markInvoicePaid } from "@/actions/corporate";

export const metadata = { title: "Facture entreprise" };

const nf2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v: number) => `${nf2.format(Number(v) || 0)}`;

export default async function CompanyInvoicePage({ params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  await requireManager();
  const { id, invoiceId } = await params;
  const [scope, settings, supabase] = await Promise.all([getScope(), getSettings(), createClient()]);
  const company = await loadCompany(supabase, scope, id);
  if (!company) notFound();
  const { data } = await supabase.from("company_invoices").select("*").eq("id", invoiceId).maybeSingle();
  const inv = data as CompanyInvoice | null;
  if (!inv || inv.company_id !== company.id) notFound();
  const { data: lineRows } = await supabase.from("company_invoice_lines").select("*").eq("invoice_id", inv.id);
  const lines = ((lineRows ?? []) as CompanyInvoiceLine[]).sort((a, b) => a.label.localeCompare(b.label, "fr"));
  const total = Number(inv.total_mad);
  const employeeTotal = lines.reduce((a, l) => a + Number(l.employee_mad), 0);
  const month = monthLabel(inv.month);

  const reminder = `Bonjour${company.hr_name ? ` ${company.hr_name}` : ""}, sauf erreur de notre part, la facture ${inv.number} de ${mad(total)} (${month}, convention salariés ${company.name}) arrivait à échéance le ${fmtDate(inv.due_on)}. Merci de nous indiquer la date de règlement. Cordialement, ${settings.company_name}`;
  const mail = company.hr_email ? `mailto:${company.hr_email}?subject=${encodeURIComponent(`Facture ${inv.number} - ${settings.company_name}`)}&body=${encodeURIComponent(reminder)}` : null;
  const ents = company.entity_ids.map((e) => entity(e)?.short).filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackLink href={`/entreprises/${company.id}?tab=factures`} label={company.name} />

      {/* Actions */}
      <div className="no-print flex flex-wrap items-center gap-2">
        {inv.status === "a_envoyer" && <SendInvoiceButton id={inv.id} />}
        <PrintButton />
        <a href={`/entreprises/${company.id}/factures/${inv.id}/csv`} className={buttonClass("secondary")} download>
          <Download /> Export CSV (RH)
        </a>
        {isUnpaid(inv) && <RemindMenu id={inv.id} whatsapp={waLink(company.hr_phone, reminder)} email={mail} phone={company.hr_phone} />}
        {isUnpaid(inv) && (
          <div className="sm:ml-auto">
            <CancelInvoiceButton id={inv.id} number={inv.number} />
          </div>
        )}
        {isUnpaid(inv) && <PaidForm action={markInvoicePaid.bind(null, inv.id)} />}
      </div>

      {(isOverdue(inv) || inv.reminders_count > 0 || inv.status === "payee") && (
        <p className={cn("no-print rounded-lg border px-4 py-2.5 text-[13px]", inv.status === "payee" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800")}>
          {inv.status === "payee"
            ? `Payée le ${fmtDate(inv.paid_on ?? inv.issued_on)}${inv.paid_method ? ` par ${PAY_LABEL[inv.paid_method].toLowerCase()}` : ""}${inv.paid_ref ? ` · réf. ${inv.paid_ref}` : ""}.`
            : `${isOverdue(inv) ? `Échéance dépassée depuis le ${fmtDate(inv.due_on)}. ` : ""}${inv.reminders_count ? `${inv.reminders_count} relance${inv.reminders_count > 1 ? "s" : ""}, la dernière le ${fmtDate(inv.last_reminder_at!)}.` : "Aucune relance pour l'instant."}`}
        </p>
      )}

      {/* Facture */}
      <article className="rounded-xl border border-line bg-white print:rounded-none print:border-0">
        <div className="p-5 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Moov'Up" className="h-9 w-auto shrink-0 object-contain" />
              <div className="min-w-0 border-l border-line pl-3">
                <p className="text-sm font-semibold leading-tight text-ink">{settings.company_name}</p>
                <p className="text-xs text-muted">{settings.address}</p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-muted">Facture</p>
              <p className="text-lg font-semibold tabular-nums text-ink">{inv.number}</p>
              <p className="text-[13px] text-slate-600">Émise le {fmtDate(inv.issued_on, { day: "numeric", month: "long", year: "numeric" })}</p>
              <div className="mt-1 no-print">
                <InvoiceStatusBadge invoice={inv} />
              </div>
            </div>
          </header>

          <dl className="mt-6 grid gap-4 border-y border-line py-4 text-sm sm:grid-cols-3 [&>*]:min-w-0">
            <div>
              <dt className="text-xs text-muted">Facturé à</dt>
              <dd className="mt-0.5 font-medium text-ink">{company.name}</dd>
              {company.address && <dd className="text-xs text-muted">{company.address}</dd>}
              {company.ice && <dd className="text-xs tabular-nums text-muted">ICE {company.ice}</dd>}
              {company.hr_name && <dd className="text-xs text-muted">À l&apos;attention de {company.hr_name}</dd>}
            </div>
            <div>
              <dt className="text-xs text-muted">Période</dt>
              <dd className="mt-0.5 font-medium capitalize text-ink">{month}</dd>
              <dd className="text-xs text-muted">{ents}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Convention</dt>
              <dd className="mt-0.5 text-[13px] text-ink">{conventionSummary(company)}</dd>
              <dd className="text-xs text-muted">Échéance : {fmtDate(inv.due_on)}</dd>
            </div>
          </dl>

          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="h-10 pr-2 font-medium">Salarié</th>
                  <th className="h-10 px-2 font-medium">Détail</th>
                  <th className="h-10 px-2 text-right font-medium">Net</th>
                  <th className="h-10 px-2 text-right font-medium">Part salarié</th>
                  <th className="h-10 pl-2 text-right font-medium">Part entreprise</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-line align-top">
                    <td className="py-2.5 pr-2">
                      {l.contact_id ? <ContactLink id={l.contact_id} name={l.label} className="print:no-underline" /> : <span className="font-medium text-ink">{l.label}</span>}
                      {l.matricule && <span className="block font-mono text-[11px] text-muted">{l.matricule}</span>}
                    </td>
                    <td className="px-2 py-2.5 text-xs text-slate-600">{l.detail}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-slate-600">{money(l.net_mad)}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-slate-600">{money(l.employee_mad)}</td>
                    <td className="whitespace-nowrap py-2.5 pl-2 text-right font-medium tabular-nums text-ink">{money(l.company_mad)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line text-[13px]">
                  <td className="py-2.5 pr-2 text-muted" colSpan={2}>
                    {lines.length} salarié{lines.length > 1 ? "s" : ""} · montants en MAD TTC
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-slate-600">{money(Number(inv.net_mad))}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 text-right tabular-nums text-slate-600">{money(employeeTotal)}</td>
                  <td className="whitespace-nowrap py-2.5 pl-2 text-right font-semibold tabular-nums text-ink">{money(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="mt-4 text-xs text-muted">La part salarié est réglée directement par chaque salarié dans nos établissements ; seule la part entreprise est due au titre de cette facture.</p>

          <div className="mt-6">
            <InvoiceLegal settings={settings} totalTtc={total} />
          </div>
        </div>
      </article>
    </div>
  );
}
