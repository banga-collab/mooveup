import { DEMO, DEMO_ACCOUNTS } from "@/lib/demo";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Connexion" };

export default function LoginPage() {
  const demo = DEMO ? DEMO_ACCOUNTS.map(({ email, password, label, name, space }) => ({ email, password, label, name, space })) : undefined;
  return <AuthForm mode="login" demoAccounts={demo} />;
}
