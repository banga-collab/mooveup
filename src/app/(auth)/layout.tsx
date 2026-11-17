import Image from "next/image";
import { Building2, Filter, LineChart } from "lucide-react";
import { getLang, t } from "@/lib/i18n";
import { LangSwitch } from "./auth-form";

const POINTS = [
  [Building2, "auth.point1"],
  [Filter, "auth.point2"],
  [LineChart, "auth.point3"],
] as const;

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[1fr_1fr]">
      {/* Panneau de marque : bleu uni, sans motif */}
      <aside className="hidden flex-col justify-between bg-brand-700 p-12 text-white lg:flex">
        <p className="text-[13px] font-medium text-white/80">{t(lang, "auth.group")}</p>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">{t(lang, "auth.headline")}</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/80">{t(lang, "auth.pitch")}</p>
          <ul className="mt-10 space-y-3 text-sm text-white">
            {POINTS.map(([Icon, key]) => (
              <li key={key} className="flex items-center gap-3">
                <Icon className="size-4 shrink-0 text-white/70" aria-hidden />
                {t(lang, key)}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/70">© {new Date().getFullYear()} Groupe Moov&apos;Up</p>
      </aside>

      {/* Formulaire */}
      <main className="relative flex flex-col items-center justify-center px-5 py-10 sm:px-10">
        <div className="absolute end-4 top-4">
          <LangSwitch />
        </div>
        <div className="w-full max-w-[380px]">
          <Image src="/logo.png" alt="Moov'Up" width={473} height={136} priority className="mx-auto mb-10 h-auto w-44" />
          {children}
        </div>
      </main>
    </div>
  );
}
