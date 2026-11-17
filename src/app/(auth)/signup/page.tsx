import { getLang, t } from "@/lib/i18n";
import { AuthForm } from "../auth-form";

export async function generateMetadata() {
  return { title: t(await getLang(), "auth.signup") };
}

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
