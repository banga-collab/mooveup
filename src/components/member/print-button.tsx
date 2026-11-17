"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { useMt } from "./use-mt";

/** Impression du ticket (ou « Enregistrer en PDF » depuis la fenêtre d'impression) */
export function PrintButton() {
  const t = useMt();
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary", "no-print h-10")}>
      <Printer /> {t("m.buy.print")}
    </button>
  );
}
