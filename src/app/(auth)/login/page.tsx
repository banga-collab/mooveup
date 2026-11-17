import { DEMO, DEMO_ACCOUNTS } from "@/lib/demo";
import { getLang, t } from "@/lib/i18n";
import { AuthForm } from "../auth-form";

export async function generateMetadata() {
  return { title: t(await getLang(), "auth.login") };
}

export default function LoginPage() {
  const demo = DEMO ? DEMO_ACCOUNTS.map(({ email, password, label, name, space }) => ({ email, password, label, name, space })) : undefined;
  return <AuthForm mode="login" demoAccounts={demo} />;
}
