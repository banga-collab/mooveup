"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonClass } from "./ui";
import { useActionPending } from "./action-form";

export function SubmitButton({
  children,
  variant = "primary",
  className,
  pendingText = "Enregistrement…",
}: {
  children: React.ReactNode;
  variant?: "primary" | "brand" | "secondary" | "danger";
  className?: string;
  pendingText?: string;
}) {
  const status = useFormStatus();
  const ctxPending = useActionPending();
  const pending = status.pending || ctxPending;
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, className)}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" /> {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
