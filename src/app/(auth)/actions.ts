"use server";

import { cookies, headers } from "next/headers";
import { DEMO, DEMO_ACCOUNTS } from "@/lib/demo";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLang, t, type Lang } from "@/lib/i18n";

export type AuthState = { error?: string; success?: string } | undefined;

function translate(lang: Lang, msg: string) {
  if (/invalid login credentials/i.test(msg)) return t(lang, "auth.err.invalid");
  if (/email not confirmed/i.test(msg)) return t(lang, "auth.err.confirm");
  if (/already registered/i.test(msg)) return t(lang, "auth.err.exists");
  if (/password should be at least/i.test(msg)) return t(lang, "auth.err.short");
  if (/rate limit/i.test(msg)) return t(lang, "auth.err.rate");
  return msg;
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const lang = await getLang();
  if (DEMO) {
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const acc = DEMO_ACCOUNTS.find((a) => a.email === email && a.password === String(formData.get("password") ?? ""));
    if (!acc) return { error: t(lang, "auth.err.invalid") };
    (await cookies()).set("demo_user", acc.userId, { path: "/", httpOnly: true, sameSite: "lax" });
    redirect("/");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  });
  if (error) return { error: translate(lang, error.message) };
  redirect("/");
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const lang = await getLang();
  if (DEMO) return { error: t(lang, "auth.err.demo") };
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: t(lang, "auth.err.short") };
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
  if (error) return { error: translate(lang, error.message) };
  if (data.session) redirect("/");
  return { success: t(lang, "auth.created") };
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
