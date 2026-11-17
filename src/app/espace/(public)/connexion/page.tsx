import Link from "next/link";
import { redirect } from "next/navigation";
import { LogIn } from "lucide-react";
import { DEMO, demoDb } from "@/lib/demo";
import { DEMO_MEMBER_PASSWORD, demoMemberAccounts, getMember } from "@/lib/member-auth";
import { getLang } from "@/lib/i18n";
import { demoMemberLogin, memberLogin } from "@/actions/member";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Avatar, Field, Input } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { mt, type MKey } from "@/components/member/i18n";
import type { Contact } from "@/lib/types";

export const metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function MemberLoginPage() {
  const [member, lang] = await Promise.all([getMember(), getLang()]);
  if (member) redirect("/espace");
  const t = (k: MKey) => mt(lang, k);

  const demos = DEMO
    ? demoMemberAccounts().map((a) => ({ account: a, contact: ((demoDb().contacts ?? []) as Contact[]).find((c) => c.id === a.contact_id) ?? null }))
    : [];

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">{t("m.login.title")}</h1>
      <p className="mt-1 text-[13px] text-muted">{t("m.login.subtitle")}</p>

      <ActionForm action={memberLogin} className="mt-6 space-y-4 rounded-xl border border-line bg-white p-5">
        <Field label={t("m.login.id")}>
          <Input name="id" required autoComplete="username" placeholder="vous@exemple.ma" />
        </Field>
        <Field label={t("m.login.password")}>
          <Input name="password" type="password" required autoComplete="current-password" />
        </Field>
        <SubmitButton variant="brand" className="h-11 w-full text-sm" pendingText="…">
          <LogIn /> {t("m.login.btn")}
        </SubmitButton>
      </ActionForm>

      <p className="mt-4 text-center text-[13px] text-muted">
        {t("m.login.noAccount")}{" "}
        <Link href="/espace/inscription" className="font-medium text-brand-600 hover:text-brand-700">
          {t("m.login.signup")}
        </Link>
      </p>

      {demos.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[13px] font-semibold text-ink">{t("m.login.demo")}</h2>
          <p className="mt-0.5 text-xs text-muted">
            Clients fictifs de la démo · mot de passe <span className="font-mono text-slate-600">{DEMO_MEMBER_PASSWORD}</span>
          </p>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
            {demos.map(({ account, contact }) => (
              <li key={account.user_id}>
                <form action={demoMemberLogin} className="flex items-center gap-3 px-4 py-3">
                  <input type="hidden" name="user_id" value={account.user_id} />
                  <Avatar name={contact?.full_name ?? "?"} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{contact?.full_name ?? "Compte non rattaché"}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {contact?.entity_ids.slice(0, 2).map((e) => <EntityBadge key={e} id={e} />)}
                      <span className="truncate">{account.email ?? account.phone}</span>
                    </span>
                  </span>
                  <SubmitButton variant="secondary" className="h-9" pendingText="…">
                    {t("m.login.demoAs")}
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-10 text-center text-xs text-muted">
        {t("m.login.team")}{" "}
        <Link href="/login" className="font-medium text-slate-600 hover:text-ink">
          {t("m.login.teamLink")}
        </Link>
      </p>
    </div>
  );
}
