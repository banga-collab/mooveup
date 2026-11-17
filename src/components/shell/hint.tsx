"use client";

import { useEffect, useState } from "react";
import { Lightbulb, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { readLocal, writeLocal } from "./prefs";

const KEY = "mu:hints";

/** Remet toutes les infobulles à zéro (page /aide) */
export function resetHints() {
  writeLocal(KEY, []);
}

/**
 * Infobulle de première utilisation, affichée une seule fois par navigateur (mémorisée en localStorage).
 *
 * En bandeau :   <Hint id="caisse-scan">Scannez la carte du client pour l'ajouter au ticket.</Hint>
 * Sur un bouton : <Hint id="agenda-glisser" target={<Button>…</Button>}>Glissez un RDV pour le déplacer.</Hint>
 */
export function Hint({
  id,
  title,
  children,
  target,
  className,
}: {
  /** Identifiant unique et stable (ex. « caisse-scan ») */
  id: string;
  title?: string;
  children: React.ReactNode;
  /** Élément auquel accrocher la bulle (sinon : petit bandeau dans le flux) */
  target?: React.ReactNode;
  className?: string;
}) {
  const t = useT();
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(!readLocal<string[]>(KEY, []).includes(id));
  }, [id]);
  const close = () => {
    setShow(false);
    writeLocal(KEY, [...new Set([...readLocal<string[]>(KEY, []), id])]);
  };

  const bubble = (
    <div role="note" className={cn("flex items-start gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2.5 text-[13px] text-brand-800", target ? "absolute start-0 top-full z-30 mt-2 w-72 shadow-pop" : "mb-4", !target && className)}>
      <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-brand-900">{title}</p>}
        <div>{children}</div>
      </div>
      <button type="button" onClick={close} className="-me-1 -mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-brand-600 hover:bg-brand-100" aria-label={t("hint.dismiss")} title={t("hint.dismiss")}>
        <X className="size-3.5" />
      </button>
    </div>
  );

  if (!target) return show ? bubble : null;
  return (
    <span className={cn("relative inline-block", className)}>
      {target}
      {show && bubble}
    </span>
  );
}
