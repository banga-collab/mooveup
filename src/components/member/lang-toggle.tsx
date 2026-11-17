"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { setLang } from "@/actions/preferences";
import { useLang } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { useMt } from "./use-mt";

/** Bascule français / arabe (cookie « lang », partagé avec le reste de l'application) */
export function LangToggle({ className }: { className?: string }) {
  const lang = useLang();
  const t = useMt();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setLang(lang === "ar" ? "fr" : "ar");
          router.refresh();
        })
      }
      className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-slate-600 transition hover:bg-slate-100 hover:text-ink disabled:opacity-50", className)}
    >
      <Languages className="size-4 text-slate-400" />
      {t("m.lang")}
    </button>
  );
}
