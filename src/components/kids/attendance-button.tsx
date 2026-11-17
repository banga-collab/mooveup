"use client";

import { useEffect, useOptimistic, useRef, useTransition } from "react";
import { showToast } from "@/components/toaster";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/lib/types-care";

const ON: Record<AttendanceStatus, string> = {
  present: "border-emerald-500 bg-emerald-500 text-white",
  absent: "border-red-500 bg-red-500 text-white",
  excuse: "border-amber-400 bg-amber-400 text-white",
};
const LABEL: Record<AttendanceStatus, [string, string]> = { present: ["P", "Présent"], absent: ["A", "Absent"], excuse: ["E", "Excusé"] };

/** Événement partagé par les boutons P / A / E d'un même enfant (même conteneur) */
const EVT = "moovup:attendance";

/**
 * Bouton de pointage (présent / absent / excusé) relié à une server action.
 * Mise à jour optimiste : le bouton cliqué s'allume et ses voisins s'éteignent
 * aussitôt ; tout revient en arrière avec un message si le serveur refuse.
 */
export function AttendanceButton({ action, status, active }: { action: () => Promise<{ error?: string } | void>; status: AttendanceStatus; active: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [on, setOn] = useOptimistic(active);
  const [pending, start] = useTransition();

  // Les voisins (P / A / E du même enfant) suivent le choix immédiatement
  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const onPick = (e: Event) => setOn((e as CustomEvent<AttendanceStatus | null>).detail === status);
    parent.addEventListener(EVT, onPick);
    return () => parent.removeEventListener(EVT, onPick);
  }, [setOn, status]);

  const pick = () => {
    const next = on ? null : status; // second clic sur le même statut : efface
    start(async () => {
      ref.current?.parentElement?.dispatchEvent(new CustomEvent(EVT, { detail: next }));
      let err: string | null = null;
      try {
        const res = await action();
        err = res && typeof res === "object" && res.error ? res.error : null;
      } catch {
        err = "Connexion perdue : le pointage n'a pas été enregistré.";
      }
      if (err) showToast(err, "error");
    });
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={pick}
      aria-pressed={on}
      aria-label={LABEL[status][1]}
      title={LABEL[status][1]}
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-xs font-semibold transition active:scale-95 sm:h-8 sm:min-w-[74px]",
        on ? ON[status] : "border-line bg-white text-slate-500 hover:border-slate-300 hover:text-ink",
        pending && "cursor-progress",
      )}
    >
      <span className="sm:hidden" aria-hidden>
        {LABEL[status][0]}
      </span>
      <span className="hidden sm:inline">{LABEL[status][1]}</span>
    </button>
  );
}
