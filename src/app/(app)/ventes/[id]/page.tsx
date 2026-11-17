import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, ShoppingCart, Undo2, UserRound } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { entity } from "@/lib/entities";
import { cn, fmtDate, fmtTime, mad } from "@/lib/utils";
import type { Contact, Profile, Sale, SaleItem } from "@/lib/types";
import { addPayment, refundSale } from "@/actions/sales";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { LinkButton, buttonClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { MethodChip, SaleStatusBadge } from "@/components/sales/meta";
import { PaymentPanel, PrintButton } from "@/components/sales/ticket-actions";
import { InvoiceLegal } from "@/components/finance/invoice-legal";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Ticket de vente" };

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [me, scope, settings] = await Promise.all([getProfile(), getScope(), getSettings()]);
  const supabase = await createClient();

  const { data } = await supabase.from("sales").select("*").eq("id", id).maybeSingle();
  const sale = data as Sale | null;
  if (!sale || !scope.allowed.some((e) => e.id === sale.entity_id)) notFound();

  const [{ data: lineRows }, { data: cRow }, { data: pRow }] = await Promise.all([
    supabase.from("sale_items").select("*").eq("sale_id", sale.id),
    sale.contact_id ? supabase.from("contacts").select("*").eq("id", sale.contact_id).maybeSingle() : Promise.resolve({ data: null }),
    sale.sold_by ? supabase.from("profiles").select("*").eq("id", sale.sold_by).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const lines = (lineRows ?? []) as SaleItem[];
  const contact = cRow as Contact | null;
  const seller = pRow as Profile | null;
  const e = entity(sale.entity_id)!;

  const total = Number(sale.total_mad);
  const paid = Number(sale.paid_mad);
  const discount = Number(sale.discount_mad);
  const gross = lines.reduce((a, l) => a + Number(l.qty) * Number(l.unit_price_mad), 0);
  const rest = sale.status === "remboursee" ? 0 : Math.max(0, total - paid);
  const refunded = sale.status === "remboursee";
  const canRefund = !refunded && me.role !== "staff";

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <BackLink href="/ventes" label="Ventes & factures" />

      {sp.ok === "1" && (
        <div className="no-print flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 animate-fade-up" role="status">
          <CircleCheck className="size-5 shrink-0 text-emerald-600" />
          <p className="min-w-0 flex-1 text-sm text-emerald-900">
            <span className="font-medium">Vente enregistrée</span>
            <span className="text-emerald-800">
              {" "}
              · {sale.number} · <span className="tabular-nums">{mad(total)}</span>
              {rest > 0 ? ` · reste ${mad(rest)}` : ""}
            </span>
          </p>
          <Link href="/caisse" className={buttonClass("secondary", "shrink-0")}>
            <ShoppingCart /> Nouvelle vente
          </Link>
        </div>
      )}

      {/* Actions */}
      <div className="no-print flex flex-wrap items-center gap-2">
        {rest > 0 && <PaymentPanel action={addPayment.bind(null, sale.id)} rest={rest} method={sale.method} />}
        <PrintButton />
        {contact && (
          <LinkButton href={`/contacts/${contact.id}`} variant="ghost">
            <UserRound /> Fiche client
          </LinkButton>
        )}
        {sp.ok !== "1" && (
          <LinkButton href="/caisse" variant="ghost">
            <ShoppingCart /> Nouvelle vente
          </LinkButton>
        )}
        {canRefund && (
          <form action={refundSale.bind(null, sale.id)} className="sm:ml-auto">
            <ConfirmButton message={`Rembourser la vente ${sale.number} (${mad(paid)}) ? Les produits seront remis en stock.`} className="border-transparent">
              <Undo2 /> Rembourser
            </ConfirmButton>
          </form>
        )}
      </div>

      {/* Ticket */}
      <article className="rounded-xl border border-line bg-white print:rounded-none print:border-0">
        <div className="p-5 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Moov'Up" className="h-9 w-auto shrink-0 object-contain" />
              <div className="min-w-0 border-l border-line pl-3">
                <p className="text-sm font-semibold leading-tight text-ink">{e.name}</p>
                <p className="text-xs text-muted">N°40 Hay El Mohammadi, Agadir</p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-muted">{rest > 0 ? "Facture" : "Ticket"}</p>
              <p className="text-lg font-semibold tabular-nums text-ink">{sale.number}</p>
              <p className="text-[13px] text-slate-600">
                {fmtDate(sale.sold_at, { day: "numeric", month: "long", year: "numeric" })} à {fmtTime(sale.sold_at)}
              </p>
            </div>
          </header>

          <dl className="mt-6 grid gap-4 border-y border-line py-4 text-sm sm:grid-cols-3 [&>*]:min-w-0">
            <div>
              <dt className="text-xs text-muted">Client</dt>
              <dd className="mt-0.5 truncate font-medium text-ink">
                {contact ? (
                  <Link href={`/contacts/${contact.id}`} className="hover:text-brand-600 print:no-underline">
                    {contact.full_name}
                  </Link>
                ) : (
                  "Client de passage"
                )}
              </dd>
              {contact?.phone && <dd className="text-xs tabular-nums text-muted">{contact.phone}</dd>}
            </div>
            <div>
              <dt className="text-xs text-muted">Établissement</dt>
              <dd className="mt-1">
                <EntityBadge id={e.id} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Statut</dt>
              <dd className="mt-1">
                <SaleStatusBadge status={sale.status} />
              </dd>
            </div>
          </dl>

          {/* Lignes */}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="h-10 pr-2 font-medium">Article</th>
                  <th className="h-10 px-2 text-right font-medium">Qté</th>
                  <th className="hidden h-10 px-2 text-right font-medium sm:table-cell">Prix unit.</th>
                  <th className="h-10 pl-2 text-right font-medium">Montant</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="py-3 pr-2 text-ink">
                      {l.label}
                      <span className="block text-xs tabular-nums text-muted sm:hidden">{mad(Number(l.unit_price_mad))} l&apos;unité</span>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">{Number(l.qty)}</td>
                    <td className="hidden whitespace-nowrap px-2 py-3 text-right tabular-nums text-slate-600 sm:table-cell">{mad(Number(l.unit_price_mad))}</td>
                    <td className="whitespace-nowrap py-3 pl-2 text-right font-medium tabular-nums text-ink">{mad(Number(l.qty) * Number(l.unit_price_mad))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totaux */}
          <div className="mt-2 flex justify-end border-t border-line pt-4">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              {discount > 0 && (
                <>
                  <div className="flex justify-between text-slate-600">
                    <dt>Sous-total</dt>
                    <dd className="tabular-nums">{mad(gross || total + discount)}</dd>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <dt>Remise</dt>
                    <dd className="tabular-nums">− {mad(discount)}</dd>
                  </div>
                </>
              )}
              <div className="flex items-baseline justify-between pt-1">
                <dt className="font-medium text-ink">Total</dt>
                <dd className={cn("text-2xl font-semibold tracking-tight tabular-nums text-ink", refunded && "text-slate-400 line-through")}>{mad(total)}</dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Payé</dt>
                <dd className="tabular-nums">{mad(paid)}</dd>
              </div>
              <div className={cn("flex justify-between", rest > 0 ? "font-medium text-red-600" : "text-slate-600")}>
                <dt>Reste à payer</dt>
                <dd className="tabular-nums">{mad(rest)}</dd>
              </div>
              {refunded && (
                <div className="flex justify-between font-medium text-slate-600">
                  <dt>Vente remboursée</dt>
                  <dd />
                </div>
              )}
            </dl>
          </div>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-xs text-muted">
            <span className="flex items-center gap-2">
              Paiement : <MethodChip method={sale.method} />
            </span>
            <span>Vendeur : {seller?.full_name ?? "—"}</span>
          </footer>
          {sale.notes && <p className="mt-3 rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600">Note : {sale.notes}</p>}

          <InvoiceLegal settings={settings} totalTtc={total} />

          <p className="mt-6 text-center text-xs text-muted">Merci de votre visite et à bientôt chez {e.short}.</p>
        </div>
      </article>
    </div>
  );
}
