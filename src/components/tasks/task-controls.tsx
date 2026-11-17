"use client";

import { useFormStatus } from "react-dom";
import { Check, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

function CheckInner({ done }: { done: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={done ? "Rouvrir la tâche" : "Marquer comme terminée"}
      title={done ? "Rouvrir" : "Terminer"}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full border-2 transition active:scale-90",
        done ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600" : "border-slate-300 bg-white text-transparent hover:border-emerald-500 hover:text-emerald-500",
      )}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin text-slate-400" /> : <Check className="size-4" strokeWidth={3} />}
    </button>
  );
}

/** Case à cocher ronde reliée à une server action */
export function TaskCheck({ action, done }: { action: () => Promise<void>; done: boolean }) {
  return (
    <form action={action} className="pt-0.5">
      <CheckInner done={done} />
    </form>
  );
}

function DeleteInner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Supprimer la tâche"
      title="Supprimer"
      onClick={(e) => {
        if (!confirm("Supprimer cette tâche ?")) e.preventDefault();
      }}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-600"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
    </button>
  );
}

export function TaskDelete({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <DeleteInner />
    </form>
  );
}
