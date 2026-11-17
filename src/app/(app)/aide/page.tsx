import Link from "next/link";
import { CalendarDays, Moon, Rocket, ScanLine, Search, ShoppingCart, Users } from "lucide-react";
import { Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { ShortcutsList } from "@/components/shell/shortcuts-listener";
import { ResetHintsButton } from "@/components/shell/reset-hints";
import { getLang, t } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: t(await getLang(), "help.title") };
}

const GUIDE = [
  { id: "search", icon: Search, href: null },
  { id: "client", icon: Users, href: "/contacts/nouveau" },
  { id: "sale", icon: ShoppingCart, href: "/caisse" },
  { id: "rdv", icon: CalendarDays, href: "/agenda" },
  { id: "entry", icon: ScanLine, href: "/acces" },
  { id: "prefs", icon: Moon, href: null },
] as const;

export default async function HelpPage() {
  const lang = await getLang();
  return (
    <>
      <PageHeader
        title={t(lang, "help.title")}
        subtitle={t(lang, "help.subtitle")}
        actions={
          <Link href="/demarrer" className={buttonClass("secondary")}>
            <Rocket /> {t(lang, "user.onboarding")}
          </Link>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
        <Card>
          <CardHeader title={t(lang, "help.guide")} />
          <ol className="divide-y divide-line">
            {GUIDE.map((g, i) => (
              <li key={g.id} className="flex items-start gap-3 px-5 py-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500">
                  <g.icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">
                    {i + 1}. {t(lang, `help.${g.id}`)}
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{t(lang, `help.${g.id}.text`)}</p>
                  {g.href && (
                    <Link href={g.href} className="mt-1.5 inline-block text-[13px] font-medium text-brand-600 hover:underline">
                      {t(lang, "help.open")}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink">{t(lang, "sc.title")}</h2>
            <ShortcutsList />
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-ink">{t(lang, "help.hints")}</h2>
            <p className="mb-3 mt-1 text-[13px] text-muted">{t(lang, "help.hints.text")}</p>
            <ResetHintsButton />
          </Card>
        </div>
      </div>
    </>
  );
}
