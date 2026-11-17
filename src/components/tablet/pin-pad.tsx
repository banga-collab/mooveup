"use client";

import { useEffect, useState } from "react";
import { Delete, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Pavé numérique plein écran (4 chiffres).
 * `confirm` : le code doit être saisi deux fois (création du code).
 */
export function PinPad({ title, confirm, onDone, onCancel, error }: { title: string; confirm?: boolean; onDone: (pin: string) => boolean | void; onCancel: () => void; error?: string }) {
  const t = useT();
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState<string | null>(null);
  const [wrong, setWrong] = useState<string | null>(null);

  const press = (d: string) => {
    setWrong(null);
    setPin((p) => (p.length >= 4 ? p : p + d));
  };
  const back = () => setPin((p) => p.slice(0, -1));

  // 4 chiffres saisis : validation
  useEffect(() => {
    if (pin.length < 4) return;
    const timer = setTimeout(() => {
      if (confirm && first === null) {
        setFirst(pin);
        setPin("");
        return;
      }
      if (confirm && first !== pin) {
        setFirst(null);
        setPin("");
        setWrong(t("tablette.pin.mismatch"));
        return;
      }
      if (onDone(pin) === false) {
        setPin("");
        setWrong(error ?? t("tablette.pin.wrong"));
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [pin, confirm, first, onDone, error, t]);

  // Clavier physique
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) {
        setWrong(null);
        setPin((p) => (p.length >= 4 ? p : p + e.key));
      } else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
      else if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[66] grid place-items-center bg-ink/40 p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-lg font-semibold text-ink">{confirm && first !== null ? t("tablette.pin.again") : title}</p>
          <button type="button" onClick={onCancel} className="grid size-11 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label={t("tablette.cancel")}>
            <X className="size-5" />
          </button>
        </div>
        <div className="my-6 flex justify-center gap-4" dir="ltr" aria-live="polite" aria-label={t("tablette.pin.digits", { n: pin.length })}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn("size-4 rounded-full border-2", i < pin.length ? "border-brand-500 bg-brand-500" : "border-slate-300")} />
          ))}
        </div>
        <p className="mb-3 min-h-5 text-center text-sm text-red-600">{wrong}</p>
        <div className="grid grid-cols-3 gap-3" dir="ltr">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} className="h-16 rounded-xl border border-line bg-white text-2xl font-semibold tabular-nums text-ink transition hover:bg-slate-50 active:bg-slate-100">
              {d}
            </button>
          ))}
          <span />
          <button type="button" onClick={() => press("0")} className="h-16 rounded-xl border border-line bg-white text-2xl font-semibold tabular-nums text-ink transition hover:bg-slate-50 active:bg-slate-100">
            0
          </button>
          <button type="button" onClick={back} className="grid h-16 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100" aria-label={t("tablette.pin.erase")}>
            <Delete className="size-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
