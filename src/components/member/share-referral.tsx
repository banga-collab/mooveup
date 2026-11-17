"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { useMt } from "./use-mt";

/** Code de parrainage : partage WhatsApp + copie */
export function ShareReferral({ code, url }: { code: string; url: string }) {
  const t = useMt();
  const [copied, setCopied] = useState(false);
  const text = t("m.ref.message", { code, url });
  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 px-4 py-3">
        <span className="font-mono text-lg font-semibold tracking-wider text-ink">{code}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* presse-papiers indisponible */
            }
          }}
          className={buttonClass("ghost", "h-9")}
        >
          {copied ? <Check className="text-emerald-600" /> : <Copy />} {copied ? t("m.ref.copied") : t("m.ref.copy")}
        </button>
      </div>
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={buttonClass("brand", "mt-3 h-11 w-full text-sm")}>
        <MessageCircle /> {t("m.ref.share")}
      </a>
    </div>
  );
}
