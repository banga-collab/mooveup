"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CheckCircle2, Loader2, RotateCcw, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Notification locale de l'agenda avec bouton « Annuler » (5 s).
 * `notify({ m, undo })` depuis n'importe quel composant client ; `<UndoToast />` l'affiche.
 */
type Note = { id: number; m: string; t: "success" | "error"; undo?: () => Promise<void> | void; busy?: boolean };

let current: Note | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function notify(n: { m: string; t?: "success" | "error"; undo?: () => Promise<void> | void }) {
  current = { id: Date.now(), t: n.t ?? "success", m: n.m, undo: n.undo };
  emit();
}

const close = (id?: number) => {
  if (id === undefined || current?.id === id) {
    current = null;
    emit();
  }
};

export function UndoToast() {
  const note = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
    () => null,
  );

  useEffect(() => {
    if (!note || note.busy) return;
    const t = setTimeout(() => close(note.id), note.undo ? 5000 : 3500);
    return () => clearTimeout(t);
  }, [note]);

  if (!note) return null;
  const undo = async () => {
    if (!note.undo || note.busy) return;
    current = { ...note, busy: true };
    emit();
    try {
      await note.undo();
    } finally {
      close(note.id);
    }
  };
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 lg:bottom-6">
      <div key={note.id} role="status" aria-live="polite" className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-xl bg-ink py-2 pl-4 pr-2 text-sm text-white shadow-pop animate-toast">
        {note.t === "error" ? <XCircle className="size-4 shrink-0 text-red-400" /> : <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />}
        <span className="min-w-0 flex-1">{note.m}</span>
        {note.undo && (
          <button
            type="button"
            onClick={undo}
            className={cn("inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-sky-300 hover:bg-white/10", note.busy && "opacity-70")}
          >
            {note.busy ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Annuler
          </button>
        )}
        <button type="button" onClick={() => close(note.id)} className="grid size-8 place-items-center rounded-lg text-white/60 hover:text-white" aria-label="Fermer">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
