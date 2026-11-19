"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { ArrowRight, ConciergeBell, Eye, EyeOff, Languages, Loader2, MailCheck, ShieldCheck, Store } from "lucide-react";
import { signIn, signUp, type AuthState } from "./actions";
import { setLang } from "@/actions/preferences";
import { useLang, useT } from "@/lib/i18n/client";
import { LANGS, type Lang } from "@/lib/i18n/core";
import { ErrorNote, Field, Input, buttonClass } from "@/components/ui";

type DemoAccount = { email: string; password: string; label: string; name: string; space: string };

const ROLE_OF: Record<string, string> = { Direction: "direction", Manager: "manager", "Réception": "reception" };

/** Choix de la langue avant connexion : Français / العربية / English */
export function LangSwitch() {
  const lang = useLang();
  const t = useT();
  const [pending, start] = useTransition();
  const [target, setTarget] = useState<Lang | null>(null);
  return (
    <div role="radiogroup" aria-label={t("user.lang")} className="inline-flex items-center gap-0.5 rounded-lg p-0.5">
      <Languages className="mx-1 size-4 text-slate-400" aria-hidden />
      {LANGS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={lang === id}
          lang={id}
          disabled={pending}
          onClick={() => {
            if (id === lang) return;
            setTarget(id);
            start(() => setLang(id));
          }}
          className={`inline-flex h-9 items-center gap-1 rounded-md px-2 text-[13px] font-medium transition disabled:opacity-60 ${lang === id ? "bg-slate-100 text-ink" : "text-slate-500 hover:bg-slate-50 hover:text-ink"}`}
        >
          {pending && target === id && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {label}
        </button>
      ))}
    </div>
  );
}

export function AuthForm({ mode, demoAccounts }: { mode: "login" | "signup"; demoAccounts?: DemoAccount[] }) {
  const t = useT();
  const emailRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fill = (a: DemoAccount) => {
    if (emailRef.current) emailRef.current.value = a.email;
    if (passRef.current) passRef.current.value = a.password;
    formRef.current?.requestSubmit();
  };
  const [state, action, pending] = useActionState<AuthState, FormData>(mode === "login" ? signIn : signUp, undefined);
  const [show, setShow] = useState(false);
  const space = (a: DemoAccount) => {
    const k = `auth.demo.${ROLE_OF[a.label] ?? "x"}`;
    const s = t(k);
    return s === k ? a.space : s;
  };

  if (state?.success) {
    return (
      <div className="rounded-xl border border-line p-6 text-center">
        <span className="mx-auto grid size-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
          <MailCheck className="size-5" />
        </span>
        <p className="mt-3 text-sm font-semibold text-ink">{t("auth.checkMail")}</p>
        <p className="mt-1 text-[13px] text-muted">{state.success}</p>
        <Link href="/login" className="mt-5 inline-block text-[13px] font-medium text-brand-600 hover:underline">
          {t("auth.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-7">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{mode === "login" ? t("auth.login") : t("auth.signup")}</h1>
        <p className="mt-1 text-[13px] text-muted">{mode === "login" ? t("auth.loginText") : t("auth.signupText")}</p>
      </div>
      <form ref={formRef} action={action} className="space-y-4">
        {mode === "signup" && (
          <Field label={t("auth.fullName")}>
            <Input name="full_name" required autoComplete="name" placeholder={t("auth.fullNamePh")} />
          </Field>
        )}
        <Field label={t("auth.email")}>
          <Input ref={emailRef} name="email" type="email" required autoComplete="email" placeholder="toi@exemple.com" dir="ltr" className="text-start" />
        </Field>
        <Field label={t("auth.password")}>
          <span className="relative block">
            <Input
              ref={passRef}
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={mode === "signup" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder={mode === "signup" ? t("auth.passwordMin") : "••••••••"}
              className="pe-11"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute end-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              aria-label={show ? t("auth.hidePassword") : t("auth.showPassword")}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </Field>
        <ErrorNote message={state?.error} />
        <button type="submit" disabled={pending} className={buttonClass("brand", "h-10 w-full text-sm")}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {mode === "login" ? t("auth.loginBtn") : t("auth.signup")}
        </button>
      </form>
      {demoAccounts && (
        <div className="mt-7">
          <div className="mb-3 flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-line" /> {t("auth.demoAccounts")} <span className="h-px flex-1 bg-line" />
          </div>
          <div className="space-y-2">
            {demoAccounts.map((a) => {
              const Icon = a.label === "Réception" ? ConciergeBell : a.label === "Manager" ? Store : ShieldCheck;
              return (
                <button
                  key={a.email}
                  type="button"
                  onClick={() => fill(a)}
                  disabled={pending}
                  className="group flex w-full items-center gap-3 rounded-lg border border-line bg-white px-3 py-2.5 text-start transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-60"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-500">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink">{space(a)}</span>
                    <span className="block truncate text-xs text-muted" dir="ltr">
                      {a.email} · <span className="font-mono">{a.password}</span>
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-slate-300 transition group-hover:text-brand-500 rtl:rotate-180" aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      )}
      <p className="mt-6 text-center text-[13px] text-muted">
        {mode === "login" ? (
          <>
            {t("auth.newMember")}{" "}
            <Link href="/signup" className="font-medium text-brand-600 hover:underline">
              {t("auth.createAccount")}
            </Link>
          </>
        ) : (
          <>
            {t("auth.haveAccount")}{" "}
            <Link href="/login" className="font-medium text-brand-600 hover:underline">
              {t("auth.loginBtn")}
            </Link>
          </>
        )}
      </p>
    </>
  );
}
