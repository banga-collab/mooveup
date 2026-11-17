"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** Bouton d'envoi avec confirmation (variante au choix) */
export function ConfirmSubmit({
  message,
  children,
  variant = "secondary",
  className,
}: {
  message: string;
  children: React.ReactNode;
  variant?: "brand" | "secondary" | "danger" | "ghost" | "dark";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass(variant, className)}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </button>
  );
}
