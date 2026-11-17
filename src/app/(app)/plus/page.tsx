import Link from "next/link";
import { ChevronRight, CircleHelp, Rocket } from "lucide-react";
import { getProfile } from "@/lib/auth";
import { navFor, navGroupLabel, navLabel } from "@/lib/nav";
import { getLang, t } from "@/lib/i18n";
import { Card, PageHeader } from "@/components/ui";

export async function generateMetadata() {
  return { title: t(await getLang(), "nav.menu") };
}

const row = "flex min-h-12 items-center gap-3 px-4 py-3 transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none active:bg-slate-100";

export default async function MorePage() {
  const [me, lang] = await Promise.all([getProfile(), getLang()]);
  const tr = (k: string, v?: Record<string, string | number>) => t(lang, k, v);
  return (
    <>
      <PageHeader title={tr("nav.menu")} subtitle={tr("plus.subtitle")} />
      <div className="space-y-5">
        {navFor(me.role).map((g) => (
          <section key={g.id}>
            <h2 className="mb-2 px-1 text-xs font-medium text-muted">{navGroupLabel(tr, g)}</h2>
            <Card className="divide-y divide-line overflow-hidden">
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} className={row}>
                  <it.icon className="size-4 shrink-0 text-slate-400" />
                  <span className="flex-1 text-sm font-medium text-ink">{navLabel(tr, it)}</span>
                  <ChevronRight className="size-4 text-slate-300 rtl:rotate-180" />
                </Link>
              ))}
            </Card>
          </section>
        ))}
        <section>
          <h2 className="mb-2 px-1 text-xs font-medium text-muted">{tr("plus.help")}</h2>
          <Card className="divide-y divide-line overflow-hidden">
            <Link href="/demarrer" className={row}>
              <Rocket className="size-4 shrink-0 text-slate-400" />
              <span className="flex-1 text-sm font-medium text-ink">{tr("user.onboarding")}</span>
              <ChevronRight className="size-4 text-slate-300 rtl:rotate-180" />
            </Link>
            <Link href="/aide" className={row}>
              <CircleHelp className="size-4 shrink-0 text-slate-400" />
              <span className="flex-1 text-sm font-medium text-ink">{tr("user.help")}</span>
              <ChevronRight className="size-4 text-slate-300 rtl:rotate-180" />
            </Link>
          </Card>
        </section>
      </div>
    </>
  );
}
