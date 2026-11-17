import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { memberReadDb, memberSettings, requireMember } from "@/lib/member-auth";
import { entity } from "@/lib/entities";
import { PAY_LABEL, mad } from "@/lib/utils";
import type { Sale, SaleItem } from "@/lib/types";
import { Badge } from "@/components/ui";
import { PrintButton } from "@/components/member/print-button";
import { SALE_STATUS, getMt } from "@/components/member/parts";
import { mDate, mTime } from "@/components/member/i18n";

export const metadata = { title: "Ticket" };
export const dynamic = "force-dynamic";

/** Ticket d'achat imprimable (« Enregistrer en PDF » depuis l'impression) */
export default async function MemberTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ contact }, { lang, t }, { id }, settings] = await Promise.all([requireMember(), getMt(), params, memberSettings()]);
  const db = await memberReadDb();
  const { data } = await db.from("sales").select("*").eq("id", id).eq("contact_id", contact.id).maybeSingle();
  const sale = data as Sale | null;
  if (!sale) notFound();
  const { data: lineRows } = await db.from("sale_items").select("*").eq("sale_id", sale.id);
  const lines = (lineRows ?? []) as SaleItem[];
  const ent = entity(sale.entity_id);
  const left = Math.max(0, sale.total_mad - sale.paid_mad);

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <Link href="/espace/achats" className="inline-flex h-10 items-center gap-1 text-[13px] font-medium text-slate-600 hover:text-ink">
          <ChevronLeft className="size-4 rtl:rotate-180" /> {t("m.nav.purchases")}
        </Link>
        <PrintButton />
      </div>

      <article className="rounded-xl border border-line bg-white p-5 print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <Image src="/logo.png" alt="Moov'Up" width={473} height={136} className="h-auto w-24" />
            <p className="mt-2 text-sm font-semibold text-ink">{ent?.name ?? settings.company_name}</p>
            <p className="text-xs text-muted">{settings.address}</p>
            <p className="text-xs text-muted">{settings.phone}</p>
            {settings.ice && <p className="text-xs text-muted">ICE {settings.ice}</p>}
          </div>
          <div className="text-end">
            <p className="text-xs text-muted">{t("m.buy.ticket")}</p>
            <p className="font-mono text-sm font-semibold text-ink">{sale.number}</p>
            <p className="mt-1 text-xs text-muted">
              {mDate(lang, sale.sold_at, { day: "numeric", month: "long", year: "numeric" })} · {mTime(sale.sold_at)}
            </p>
            <div className="mt-1.5">
              <Badge tone={SALE_STATUS[sale.status].tone}>{SALE_STATUS[sale.status][lang]}</Badge>
            </div>
          </div>
        </header>

        <p className="mt-3 text-[13px] text-slate-600">{contact.full_name}</p>

        <table className="mt-3 w-full text-sm">
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="py-2.5 pe-3 text-ink">
                  {l.label}
                  {l.qty > 1 && <span className="ms-1 text-xs text-muted">× {l.qty}</span>}
                </td>
                <td className="py-2.5 text-end tabular-nums text-ink">{mad(l.qty * l.unit_price_mad)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-sm">
          {sale.discount_mad > 0 && (
            <Row label={t("m.buy.discount")} value={`− ${mad(sale.discount_mad)}`} />
          )}
          <Row label={t("m.buy.total")} value={mad(sale.total_mad)} strong />
          <Row label={t("m.buy.paid")} value={mad(sale.paid_mad)} />
          {left > 0 && sale.status !== "remboursee" && <Row label={t("m.buy.left")} value={mad(left)} accent />}
          <Row label={t("m.buy.method")} value={PAY_LABEL[sale.method]} />
        </dl>

        {settings.invoice_footer && <p className="mt-5 text-center text-xs text-muted">{settings.invoice_footer}</p>}
      </article>
    </div>
  );
}

function Row({ label, value, strong, accent }: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={strong ? "text-base font-semibold tabular-nums text-ink" : accent ? "font-semibold tabular-nums text-accent-700" : "tabular-nums text-ink"}>{value}</dd>
    </div>
  );
}
