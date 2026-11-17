import { AuthForm } from "../auth-form";

export const metadata = { title: "Créer un compte" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
