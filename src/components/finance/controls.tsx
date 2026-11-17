"use client";

import type { ComponentProps } from "react";
import { Printer, Trash2 } from "lucide-react";
import { buttonClass, Select } from "@/components/ui";

/** Bouton « Imprimer » */
export function PrintButton({ label = "Imprimer" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("secondary")}>
      <Printer /> {label}
    </button>
  );
}

/** Liste déroulante qui applique le filtre dès qu'on la change (formulaire GET) */
export function AutoSubmitSelect(props: ComponentProps<"select">) {
  return <Select {...props} onChange={(e) => e.currentTarget.form?.requestSubmit()} />;
}

/** Petit bouton de suppression avec confirmation */
export function DeleteIconButton({ message, label }: { message: string; label: string }) {
  return (
    <button
      type="submit"
      aria-label={label}
      title={label}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
      className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 [&_svg]:size-4"
    >
      <Trash2 />
    </button>
  );
}
