import Link from "next/link";
import { ChevronRight, LogOut, Receipt, Star } from "lucide-react";
import { requireMember } from "@/lib/member-auth";
import { DEMO } from "@/lib/demo";
import { changeMemberPassword, memberLogout, updateMemberProfile } from "@/actions/member";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Field, Input, buttonClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { LangToggle } from "@/components/member/lang-toggle";
import { MCard, MTitle, getMt } from "@/components/member/parts";

export const metadata = { title: "Profil" };
export const dynamic = "force-dynamic";

export default async function MemberProfilePage() {
  const [{ contact, account }, { t }] = await Promise.all([requireMember(), getMt()]);

  return (
    <div className="space-y-4">
      <MTitle title={t("m.nav.profile")} />

      <section className="flex items-center gap-3 rounded-xl border border-line bg-white p-4">
        <Avatar name={contact.full_name} size={44} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{contact.full_name}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-2">
            {contact.entity_ids.map((e) => (
              <EntityBadge key={e} id={e} />
            ))}
          </p>
        </div>
      </section>

      <MCard title={t("m.profile.contact")}>
        <ActionForm action={updateMemberProfile} className="space-y-4 px-4 pb-4 pt-2">
          <Field label={t("m.profile.phone")}>
            <Input name="phone" type="tel" inputMode="tel" required defaultValue={contact.phone ?? ""} autoComplete="tel" />
          </Field>
          <Field label={t("m.profile.email")}>
            <Input name="email" type="email" defaultValue={contact.email ?? ""} autoComplete="email" />
          </Field>
          <label className="flex min-h-9 items-center gap-2.5 text-[13px] text-slate-700">
            <input type="checkbox" name="whatsapp_optin" defaultChecked={contact.whatsapp_optin} className="size-4 shrink-0" />
            {t("m.profile.wa")}
          </label>
          <SubmitButton variant="brand" className="h-10">
            {t("m.profile.save")}
          </SubmitButton>
        </ActionForm>
      </MCard>

      <MCard title={t("m.profile.password")}>
        <ActionForm action={changeMemberPassword} className="space-y-4 px-4 pb-4 pt-2">
          <input type="text" name="username" autoComplete="username" defaultValue={account.email ?? ""} className="hidden" aria-hidden readOnly />
          <Field label={t("m.profile.newPassword")} hint={DEMO ? "Démonstration : non modifiable" : "8 caractères minimum"}>
            <Input name="password" type="password" minLength={8} required autoComplete="new-password" />
          </Field>
          <SubmitButton variant="secondary" className="h-10">
            {t("m.profile.passwordBtn")}
          </SubmitButton>
        </ActionForm>
      </MCard>

      <MCard title={t("m.profile.more")}>
        <ul className="divide-y divide-line">
          <MoreLink href="/espace/achats" icon={<Receipt />} label={t("m.nav.purchases")} />
          <MoreLink href="/espace/avis" icon={<Star />} label={t("m.nav.reviews")} />
          <li className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="text-sm text-ink">{t("m.profile.language")}</span>
            <LangToggle />
          </li>
        </ul>
      </MCard>

      <form action={memberLogout}>
        <button type="submit" className={buttonClass("danger", "h-11 w-full")}>
          <LogOut /> {t("m.profile.logout")}
        </button>
      </form>
    </div>
  );
}

function MoreLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <li>
      <Link href={href} className="flex h-12 items-center gap-3 px-4 text-sm text-ink transition hover:bg-slate-50 [&_svg]:size-4">
        <span className="text-slate-400">{icon}</span>
        <span className="flex-1">{label}</span>
        <ChevronRight className="text-slate-300 rtl:rotate-180" />
      </Link>
    </li>
  );
}
