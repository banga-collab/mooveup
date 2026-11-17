"use client";

import { useOptimistic, useTransition } from "react";
import { Check, ListPlus, Loader2 } from "lucide-react";
import { createRetentionTask } from "@/actions/exec";
import { showToast } from "@/components/toaster";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/utils";

/** « Créer une tâche de relance » : passe tout de suite à « Tâche créée », revient en arrière si le serveur refuse */
export function RelanceButton({ contactId, entityId, score, reason, done }: { contactId: string; entityId: string; score: number; reason: string; done: boolean }) {
  const [optDone, setOptDone] = useOptimistic(done);
  const [pending, start] = useTransition();

  if (optDone)
    return (
      <span className="inline-flex h-9 items-center gap-1.5 whitespace-nowrap px-2 text-[13px] font-medium text-emerald-600">
        <Check className="size-4" /> Tâche créée
      </span>
    );

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOptDone(true);
          try {
            const res = await createRetentionTask({ contactId, entityId, score, reason });
            if (res?.error) showToast(res.error, "error");
          } catch {
            showToast("Connexion perdue : la tâche n'a pas été créée. Réessayez.", "error");
          }
        })
      }
      className={cn(buttonClass("secondary"), "px-2.5")}
      title="Créer une tâche de relance (échéance aujourd'hui si risque élevé)"
    >
      {pending ? <Loader2 className="animate-spin" /> : <ListPlus />}
      <span className="hidden lg:inline">Tâche de relance</span>
      <span className="lg:hidden">Tâche</span>
    </button>
  );
}
