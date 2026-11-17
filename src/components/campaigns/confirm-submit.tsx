"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** Bouton d'envoi avec confirmation et indicateur de chargement */
export function ConfirmSubmit({ message, children, variant = "primary", className }: { message?: string; children: ReactNode; variant?: "primary" | "brand" | "secondary" | "danger"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(variant, className)}
      onClick={(e) => {
        if (message && !confirm(message)) e.preventDefault();
      }}
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
