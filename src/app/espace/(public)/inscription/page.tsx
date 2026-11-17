import Link from "next/link";
import { redirect } from "next/navigation";
import { MailCheck } from "lucide-react";
import { getMember } from "@/lib/member-auth";
import { getLang } from "@/lib/i18n";
import { memberSignup } from "@/actions/member";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui";
import { mt, type MKey } from "@/components/member/i18n";

export const metadata = { title: "Créer mon espace" };
export const dynamic = "force-dynamic";

export default async function MemberSignupPage({ searchParams }: { searchParams: Promise<{ envoye?: string }> }) {
  const [member, lang, sp] = await Promise.all([getMember(), getLang(), searchParams]);
  if (member) redirect("/espace");
  const t = (k: MKey) => mt(lang, k);

  if (sp.envoye) {
    return (
      <div className="flex flex-col items-center text-center">
        <MailCheck className="size-8 text-slate-400" />
        <h1 className="mt-3 text-xl font-semibold text-ink">{t("m.signup.check")}</h1>
        <p className="mt-1 text-[13px] text-muted">{t("m.signup.checkText")}</p>
        <Link href="/espace/connexion" className="mt-6 text-[13px] font-medium text-brand-600">
          {t("m.login.btn")}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">{t("m.signup.title")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("m.signup.subtitle")}</p>
      <ActionForm action={memberSignup} className="mt-6 space-y-4 rounded-xl border border-line bg-white p-5">
        <Field label={t("m.signup.name")}>
          <Input name="full_name" required minLength={3} maxLength={80} autoComplete="name" />
        </Field>
        <Field label={t("m.profile.email")}>
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label={t("m.profile.phone")}>
          <Input name="phone" type="tel" inputMode="tel" placeholder="06 12 34 56 78" autoComplete="tel" />
        </Field>
        <Field label={t("m.login.password")} hint="8 caractères minimum">
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <label className="flex items-start gap-2.5 text-[13px] text-slate-600">
          <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0" />
          <span>{t("m.signup.consent")}</span>
        </label>
        <SubmitButton variant="brand" className="h-11 w-full text-sm" pendingText="…">
          {t("m.signup.btn")}
        </SubmitButton>
      </ActionForm>
      <p className="mt-4 text-center text-[13px] text-muted">
        {t("m.signup.has")}{" "}
        <Link href="/espace/connexion" className="font-medium text-brand-600 hover:text-brand-700">
          {t("m.login.btn")}
        </Link>
      </p>
    </div>
  );
}
