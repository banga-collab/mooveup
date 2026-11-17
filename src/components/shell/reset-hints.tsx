"use client";

import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/components/ui";
import { resetHints } from "./hint";
import { writeLocal } from "./prefs";

/** Réaffiche les infobulles et le bandeau de prise en main */
export function ResetHintsButton() {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        resetHints();
        writeLocal("mu:onboarding-hidden", false);
        setDone(true);
      }}
      className={buttonClass("secondary")}
    >
      {done ? <Check /> : <RotateCcw />}
      {done ? t("help.hints.done") : t("help.hints.reset")}
    </button>
  );
}
