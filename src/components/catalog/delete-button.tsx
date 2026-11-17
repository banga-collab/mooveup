"use client";

import { Trash2 } from "lucide-react";

/** Petit bouton icône de suppression avec confirmation */
export function DeleteIconButton({ message, label = "Supprimer" }: { message: string; label?: string }) {
  return (
    <button
      type="submit"
      title={label}
      aria-label={label}
      className="grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
