import { redirect } from "next/navigation";
import { Hourglass, LogOut } from "lucide-react";
import { getMember } from "@/lib/member-auth";
import { getLang } from "@/lib/i18n";
import { memberLogout } from "@/actions/member";
import { buttonClass } from "@/components/ui";
import { mt, type MKey } from "@/components/member/i18n";

export const metadata = { title: "Compte en attente" };
export const dynamic = "force-dynamic";

/** Compte créé mais pas encore rattaché à une fiche client */
export default async function MemberPendingPage() {
  const [member, lang] = await Promise.all([getMember(), getLang()]);
  if (!member) redirect("/espace/connexion");
  if (member.contact) redirect("/espace");
  const t = (k: MKey) => mt(lang, k);
  return (
    <div className="flex flex-col items-center text-center">
      <Hourglass className="size-8 text-slate-400" />
      <h1 className="mt-3 text-xl font-semibold text-ink">{t("m.wait.title")}</h1>
      <p className="mt-2 text-[13px] text-muted">{t("m.wait.text")}</p>
      {member.account.email && <p className="mt-3 text-xs text-slate-500">{member.account.email}</p>}
      <form action={memberLogout} className="mt-6">
        <button type="submit" className={buttonClass("secondary", "h-10")}>
          <LogOut /> {t("m.profile.logout")}
        </button>
      </form>
    </div>
  );
}
