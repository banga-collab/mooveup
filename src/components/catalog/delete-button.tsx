"use client";

import { Trash2 } from "lucide-react";

/** Petit bouton icône de suppression avec confirmation */
export function DeleteIconButton({ message }: { message: string }) {
  return (
    <button
      type="submit"
      title="Supprimer"
      aria-label="Supprimer"
      className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600"
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      <Trash2 className="size-4" />
    </button>
  );
}
