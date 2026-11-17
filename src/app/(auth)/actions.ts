"use server";

import { cookies, headers } from "next/headers";
import { DEMO, DEMO_ACCOUNTS } from "@/lib/demo";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; success?: string } | undefined;

function translate(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou mot de passe incorrect.";
  if (/email not confirmed/i.test(msg)) return "Confirme d'abord ton e-mail (vérifie ta boîte de réception).";
  if (/already registered/i.test(msg)) return "Un compte existe déjà avec cet e-mail.";
  if (/password should be at least/i.test(msg)) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (/rate limit/i.test(msg)) return "Trop de tentatives. Réessaie dans quelques minutes.";
  return msg;
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  if (DEMO) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const acc = DEMO_ACCOUNTS.find((a) => a.email === email && a.password === String(formData.get("password") ?? ""));
    if (!acc) return { error: "E-mail ou mot de passe incorrect." };
    (await cookies()).set("demo_user", acc.userId, { path: "/", httpOnly: true, sameSite: "lax" });
    redirect("/");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: translate(error.message) };
  redirect("/");
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  if (DEMO) return { error: "Création de compte désactivée en mode démo : utilise un des comptes de démonstration." };
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Le mot de passe doit contenir au moins 8 caractères." };
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: String(formData.get("email") ?? "").trim(),
    password,
    options: {
      data: { full_name: String(formData.get("full_name") ?? "").trim() },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) return { error: translate(error.message) };
  if (data.session) redirect("/");
  return { success: "Compte créé ! Un e-mail de confirmation vient de t'être envoyé. Clique sur le lien pour activer ton compte." };
}

export async function signOut() {
  if (DEMO) {
    (await cookies()).delete("demo_user");
    redirect("/login");
  }
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
