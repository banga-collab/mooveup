"use client";

import { useOptimistic, useRef, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { showToast } from "@/components/toaster";
import { cn } from "@/lib/utils";

type ActionResult = { error?: string } | void | undefined;
type Action = () => Promise<ActionResult>;

/** Message d'erreur d'une action (résultat { error } ou exception réseau) */
async function run(action: Action, fallback: string): Promise<string | null> {
  try {
    const res = await action();
    return res && typeof res === "object" && res.error ? res.error : null;
  } catch {
    return fallback;
  }
}

/** Ligne de liste (<li>) qui contient le contrôle, pour l'effet immédiat */
function rowOf(el: HTMLElement | null) {
  return el?.closest("li") ?? null;
}

/**
 * Case à cocher ronde : coche immédiatement (mise à jour optimiste),
 * revient en arrière avec un message si le serveur refuse.
 */
export function TaskCheck({ action, done }: { action: Action; done: boolean }) {
  const [optDone, setOptDone] = useOptimistic(done);
  const [, start] = useTransition();
  const ref = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const next = !optDone;
    const row = rowOf(ref.current);
    start(async () => {
      setOptDone(next);
      row?.classList.toggle("opacity-60", next);
      const err = await run(action, "Connexion perdue : la tâche n'a pas été mise à jour.");
      if (err) {
        row?.classList.toggle("opacity-60", !next);
        showToast(err, "error");
      }
    });
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={toggle}
      role="checkbox"
      aria-checked={optDone}
      aria-label={optDone ? "Rouvrir la tâche" : "Marquer comme terminée"}
      title={optDone ? "Rouvrir" : "Terminer"}
      className="group/check grid size-9 shrink-0 place-items-center rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <span
        className={cn(
          "grid size-5 place-items-center rounded-full border-[1.5px] transition",
          optDone ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white text-transparent group-hover/check:border-brand-500 group-hover/check:text-brand-500",
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    </button>
  );
}

/** Suppression sans confirmation : la ligne disparaît tout de suite, « Annuler » pendant 5 s */
export function TaskDelete({ action }: { action: Action }) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLButtonElement>(null);

  const remove = () => {
    const row = rowOf(ref.current);
    start(async () => {
      if (row) row.hidden = true;
      const err = await run(action, "Connexion perdue : la tâche n'a pas été supprimée.");
      if (err) {
        if (row) row.hidden = false;
        showToast(err, "error");
      }
    });
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={remove}
      disabled={pending}
      aria-label="Supprimer la tâche"
      title="Supprimer (annulable)"
      className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-300 transition hover:bg-red-50 hover:text-red-600 focus-visible:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <Trash2 className="size-4" />
    </button>
  );
}
