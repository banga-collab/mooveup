import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { navFor } from "@/lib/nav";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Menu" };

export default async function MorePage() {
  const me = await getProfile();
  return (
    <>
      <PageHeader title="Menu" subtitle="Toutes les sections du CRM" />
      <div className="space-y-5">
        {navFor(me.role).map((g) => (
          <div key={g.label}>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{g.label}</p>
            <Card className="divide-y divide-line overflow-hidden">
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className="flex items-center gap-3 px-4 py-3.5 active:bg-canvas">
                  <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-500">
                    <it.icon className="size-[18px]" />
                  </span>
                  <span className="flex-1 font-semibold">{it.label}</span>
                  <ChevronRight className="size-4 text-slate-300" />
                </Link>
              ))}
            </Card>
          </div>
        ))}
      </div>
    </>
  );
}
