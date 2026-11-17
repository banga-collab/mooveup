"use client";

import { useEffect, useRef } from "react";
import { buttonClass } from "@/components/ui";

/** Formulaire POST envoyé automatiquement (redirection vers la passerelle de paiement) */
export function AutoSubmit({ action, params, label }: { action: string; params: Record<string, string>; label: string }) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const t = setTimeout(() => form.current?.submit(), 800);
    return () => clearTimeout(t);
  }, []);
  return (
    <form ref={form} method="post" action={action} className="mt-6 w-full max-w-xs">
      {Object.entries(params).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" className={buttonClass("brand", "h-11 w-full")}>
        {label}
      </button>
    </form>
  );
}
