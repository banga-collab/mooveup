import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, ShoppingCart, Undo2, UserRound } from "lucide-react";
import { getProfile, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { entity } from "@/lib/entities";
import { cn, fmtDate, fmtTime, mad, PAY_LABEL } from "@/lib/utils";
import type { Contact, Profile, Sale, SaleItem } from "@/lib/types";
import { addPayment, refundSale } from "@/actions/sales";
import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { buttonClass, LinkButton } from "@/components/ui";
import { EntityMark } from "@/components/entity-icon";
import { MethodChip, SaleStatusBadge } from "@/components/sales/meta";
import { PaymentPanel, PrintButton } from "@/components/sales/ticket-actions";

export const metadata = { title: "Ticket de vente" };

export default async function SalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [me, scope] = await Promise.all([getProfile(), getScope()]);
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
        <div className="no-print flex items-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 p-4 text-white shadow-lg shadow-emerald-600/20 animate-fade-up">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/20 ring-1 ring-white/30">
            <CircleCheck className="size-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display font-extrabold">Vente enregistrée</p>
            <p className="text-sm text-white/85">
              Ticket {sale.number} · {mad(total)}
              {rest > 0 ? ` · reste ${mad(rest)}` : ""}
            </p>
          </div>
          <Link href="/caisse" className="hidden h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-3.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50 sm:inline-flex">
            <ShoppingCart className="size-4" /> Nouvelle vente
          </Link>
        </div>
      )}

      {/* Actions */}
      <div className="no-print flex flex-wrap items-center gap-2">
        <PrintButton />
        {rest > 0 && <PaymentPanel action={addPayment.bind(null, sale.id)} rest={rest} method={sale.method} />}
        {contact && (
          <LinkButton href={`/contacts/${contact.id}`} variant="secondary">
            <UserRound className="size-4" /> Fiche client
          </LinkButton>
        )}
        <Link href="/caisse" className={buttonClass("secondary")}>
          <ShoppingCart className="size-4" /> Nouvelle vente
        </Link>
        {canRefund && (
          <form action={refundSale.bind(null, sale.id)} className="sm:ml-auto">
            <ConfirmButton message={`Rembourser la vente ${sale.number} (${mad(paid)}) ? Les produits seront remis en stock.`}>
              <Undo2 className="size-4" /> Rembourser
            </ConfirmButton>
          </form>
        )}
      </div>

      {/* Ticket */}
      <article className="relative overflow-hidden rounded-3xl border border-line bg-white shadow-card print:rounded-none print:border-0 print:shadow-none">
        <div className="h-2" style={{ background: `linear-gradient(90deg, ${e.color}, ${e.color}99)` }} />
        {refunded && (
          <span className="pointer-events-none absolute right-6 top-24 rotate-[-12deg] rounded-xl border-4 border-red-500/70 px-4 py-1 font-display text-2xl font-extrabold uppercase tracking-widest text-red-500/70">
            Remboursée
          </span>
        )}
        <div className="p-5 sm:p-8">
          <header className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Moov'Up" className="h-12 w-auto shrink-0 object-contain" />
              <div className="min-w-0">
                <p className="font-display text-lg font-extrabold leading-tight" style={{ color: e.color }}>
                  {e.name}
                </p>
                <p className="text-xs text-muted">N°40 Hay El Mohammadi, Agadir</p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{rest > 0 ? "Facture" : "Ticket"}</p>
              <p className="font-display text-xl font-extrabold">{sale.number}</p>
              <p className="text-sm text-slate-600">
                {fmtDate(sale.sold_at, { day: "numeric", month: "long", year: "numeric" })} à {fmtTime(sale.sold_at)}
              </p>
            </div>
          </header>

          <div className="mt-6 grid gap-3 rounded-2xl bg-canvas p-4 text-sm sm:grid-cols-3 [&>*]:min-w-0">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Client</p>
              <p className="truncate font-semibold">{contact?.full_name ?? "Client de passage"}</p>
              {contact?.phone && <p className="text-xs text-muted">{contact.phone}</p>}
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Établissement</p>
              <p className="flex items-center gap-2 font-semibold">
                <EntityMark id={e.id} size={22} className="rounded-md" />
                <span className="truncate">{e.short}</span>
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Statut</p>
              <SaleStatusBadge status={sale.status} />
            </div>
          </div>

          {/* Lignes */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[320px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-wider text-muted">
                  <th className="py-2 pr-2">Article</th>
                  <th className="px-2 py-2 text-center">Qté</th>
                  <th className="hidden px-2 py-2 text-right sm:table-cell">Prix unit.</th>
                  <th className="py-2 pl-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {lines.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 pr-2 font-medium">
                      {l.label}
                      <span className="block text-xs text-muted sm:hidden">{mad(Number(l.unit_price_mad))} l&apos;unité</span>
                    </td>
                    <td className="px-2 py-3 text-center">{Number(l.qty)}</td>
                    <td className="hidden whitespace-nowrap px-2 py-3 text-right text-slate-600 sm:table-cell">{mad(Number(l.unit_price_mad))}</td>
                    <td className="whitespace-nowrap py-3 pl-2 text-right font-semibold">{mad(Number(l.qty) * Number(l.unit_price_mad))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totaux */}
          <div className="mt-4 flex justify-end">
            <dl className="w-full max-w-xs space-y-1.5 text-sm">
              {discount > 0 && (
                <>
                  <div className="flex justify-between text-slate-600">
                    <dt>Sous-total</dt>
                    <dd>{mad(gross || total + discount)}</dd>
                  </div>
                  <div className="flex justify-between text-accent-700">
                    <dt>Remise</dt>
                    <dd>− {mad(discount)}</dd>
                  </div>
                </>
              )}
              <div className="flex items-end justify-between border-t border-line pt-2">
                <dt className="font-semibold">Total</dt>
                <dd className="font-display text-2xl font-extrabold" style={{ color: e.color }}>
                  {mad(total)}
                </dd>
              </div>
              <div className="flex justify-between text-slate-600">
                <dt>Payé</dt>
                <dd className="font-semibold">{mad(paid)}</dd>
              </div>
              <div className={cn("flex justify-between", rest > 0 ? "font-bold text-accent-700" : "text-slate-600")}>
                <dt>Reste à payer</dt>
                <dd>{mad(rest)}</dd>
              </div>
            </dl>
          </div>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-line pt-4 text-xs text-muted">
            <span className="flex items-center gap-2">
              Mode de paiement : <MethodChip method={sale.method} />
              <span className="sr-only">{PAY_LABEL[sale.method]}</span>
            </span>
            <span>Vendeur : {seller?.full_name ?? "—"}</span>
          </footer>
          {sale.notes && <p className="mt-3 rounded-xl bg-canvas px-3.5 py-2.5 text-xs text-slate-600">Note : {sale.notes}</p>}
          <p className="mt-6 text-center text-xs font-semibold" style={{ color: e.color }}>
            Merci de votre visite et à bientôt chez {e.short} !
          </p>
        </div>
      </article>
    </div>
  );
}
