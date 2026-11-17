import Link from "next/link";
import { ChevronRight, Receipt } from "lucide-react";
import { memberReadDb, requireMember } from "@/lib/member-auth";
import { mad } from "@/lib/utils";
import type { Sale } from "@/lib/types";
import { EntityBadge } from "@/components/entity-icon";
import { Badge, Empty } from "@/components/ui";
import { MCard, MTitle, SALE_STATUS, getMt } from "@/components/member/parts";
import { mDate } from "@/components/member/i18n";

export const metadata = { title: "Mes achats" };
export const dynamic = "force-dynamic";

export default async function MemberPurchasesPage() {
  const [{ contact }, { lang, t }] = await Promise.all([requireMember(), getMt()]);
  const db = await memberReadDb();
  const { data } = await db.from("sales").select("*").eq("contact_id", contact.id).order("sold_at", { ascending: false }).limit(100);
  const sales = (data ?? []) as Sale[];

  return (
    <div>
      <MTitle title={t("m.nav.purchases")} subtitle={sales.length ? `${sales.length} ticket${sales.length > 1 ? "s" : ""}` : undefined} />
      <MCard>
        {sales.length ? (
          <ul className="divide-y divide-line">
            {sales.map((s) => (
              <li key={s.id}>
                <Link href={`/espace/achats/${s.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">
                      {mDate(lang, s.sold_at, { day: "numeric", month: "short", year: "numeric" })}
                      <span className="ms-2 font-mono text-xs font-normal text-muted">{s.number}</span>
                    </p>
                    <p className="mt-0.5">
                      <EntityBadge id={s.entity_id} />
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-sm font-semibold tabular-nums text-ink">{mad(s.total_mad)}</p>
                    <Badge tone={SALE_STATUS[s.status].tone}>{SALE_STATUS[s.status][lang]}</Badge>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-slate-300 rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<Receipt />} title={t("m.buy.none")} />
        )}
      </MCard>
    </div>
  );
}
