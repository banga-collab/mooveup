"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, ArrowDownLeft, ArrowUpRight, Check, Loader2, LockOpen, Plus, Printer, ReceiptText, Trash2, X } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { cn, fmtTime, mad, PAY_LABEL } from "@/lib/utils";
import type { PayMethod } from "@/lib/types";
import { METHOD_META, METHOD_ORDER } from "./meta";
import { Numpad, amountOf, applyKey } from "./numpad";
import { Ticket, TicketPrintStyle } from "./ticket";
import type { PosCashMove, PosPayment, TicketData } from "./pos-types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const fmtAmount = (n: number) => String(r2(n)).replace(".", ",");

/** Fenêtre modale sobre (Échap pour fermer) */
export function Modal({ title, subtitle, onClose, children, wide }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cn("max-h-[100dvh] w-full overflow-y-auto rounded-t-xl border border-line bg-white sm:max-h-[92dvh] sm:rounded-xl", wide ? "sm:max-w-3xl" : "sm:max-w-md")}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-line bg-white px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{title}</p>
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="-mr-2 grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Fermer (Échap)">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700" role="alert">
      <AlertCircle className="mt-0.5 size-4 shrink-0" /> {message}
    </p>
  );
}

function MethodPicker({ value, onChange }: { value: PayMethod; onChange: (m: PayMethod) => void }) {
  return (
    <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="Mode de paiement">
      {METHOD_ORDER.map((m) => {
        const meta = METHOD_META[m];
        const I = meta.icon;
        const on = m === value;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(m)}
            title={PAY_LABEL[m]}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-lg border px-0.5 py-2.5 text-[11px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
              on ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            <I className={cn("size-4", on ? "text-brand-600" : "text-slate-400")} />
            <span className="w-full truncate text-center">{meta.short}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Encaissement : paiement mixte (plusieurs modes), rendu de monnaie, pavé numérique.
 * `onValidate(payments)` reçoit les paiements (espèces : montant net + montant remis).
 */
export function PaymentDialog({
  total,
  hasContact,
  pending,
  error,
  onClose,
  onValidate,
}: {
  total: number;
  hasContact: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onValidate: (payments: PosPayment[], credit: boolean) => void;
}) {
  const [method, setMethod] = useState<PayMethod>("especes");
  const [parts, setParts] = useState<{ method: PayMethod; amount: number }[]>([]);
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const nonCash = r2(parts.filter((p) => p.method !== "especes").reduce((a, p) => a + p.amount, 0));
  const cash = r2(parts.filter((p) => p.method === "especes").reduce((a, p) => a + p.amount, 0));
  const covered = r2(nonCash + cash);
  const remaining = r2(Math.max(0, total - covered));
  const typed = amountOf(text);
  // Aperçu avec le montant en cours de saisie
  const previewCash = method === "especes" ? cash + typed : cash;
  const previewNonCash = method === "especes" ? nonCash : nonCash + typed;
  const previewRest = r2(Math.max(0, total - previewCash - previewNonCash));
  const change = r2(Math.max(0, previewCash - Math.max(0, total - previewNonCash)));

  useEffect(() => {
    inputRef.current?.focus();
  }, [method]);

  const quick = useMemo(() => {
    if (remaining <= 0) return [];
    const ups = [10, 50, 100, 200].map((s) => Math.ceil(remaining / s) * s).filter((v) => v > remaining);
    return [...new Set(ups)].slice(0, 3);
  }, [remaining]);

  const add = (amount = typed) => {
    setLocalError(null);
    if (amount <= 0) return false;
    if (method !== "especes" && amount > remaining + 0.001) {
      setLocalError(`Le paiement ${METHOD_META[method].short.toLowerCase()} ne peut pas dépasser le reste (${mad(remaining)}).`);
      return false;
    }
    setParts((ps) => [...ps, { method, amount: r2(amount) }]);
    setText("");
    return true;
  };

  const build = (extra?: { method: PayMethod; amount: number }) => {
    const all = extra ? [...parts, extra] : parts;
    const nc = all.filter((p) => p.method !== "especes");
    const tendered = r2(all.filter((p) => p.method === "especes").reduce((a, p) => a + p.amount, 0));
    const out: PosPayment[] = nc.map((p) => ({ method: p.method, amount: p.amount }));
    if (tendered > 0) out.push({ method: "especes", amount: tendered, tendered });
    return out;
  };

  const validate = (credit = false) => {
    setLocalError(null);
    let extra: { method: PayMethod; amount: number } | undefined;
    if (typed > 0) {
      if (method !== "especes" && typed > remaining + 0.001) return setLocalError(`Le paiement ne peut pas dépasser le reste (${mad(remaining)}).`);
      extra = { method, amount: r2(typed) };
    } else if (!parts.length && !credit) {
      // Aucun montant saisi : montant exact dans le mode choisi
      extra = { method, amount: total };
    }
    const payments = build(extra);
    const paid = payments.reduce((a, p) => a + p.amount, 0);
    if (paid + 0.001 < total && !credit) return setLocalError(`Il reste ${mad(r2(total - paid))} à encaisser.`);
    if (paid + 0.001 < total && !hasContact) return setLocalError("Choisissez le client dans le panier pour un paiement partiel ou à crédit.");
    onValidate(payments, credit);
  };

  return (
    <Modal title="Encaissement" subtitle="Plusieurs modes possibles : ajoutez chaque paiement" onClose={onClose} wide>
      <div className="grid gap-5 p-5 md:grid-cols-[1fr_280px] [&>*]:min-w-0">
        <div className="space-y-4">
          <div className="flex items-baseline justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span className="text-[13px] text-muted">Total à payer</span>
            <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-ink">{mad(total)}</span>
          </div>

          <MethodPicker value={method} onChange={setMethod} />

          <div>
            <label htmlFor="pos-amount" className="mb-1.5 block text-[13px] font-medium text-slate-700">
              {method === "especes" ? "Montant remis par le client" : `Montant ${METHOD_META[method].short.toLowerCase()}`}
            </label>
            <div className="flex gap-2">
              <span className="relative min-w-0 flex-1">
                <input
                  id="pos-amount"
                  ref={inputRef}
                  value={text}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder={fmtAmount(remaining)}
                  onChange={(e) => setText(e.target.value.replace(/[^\d,.]/g, "").replace(".", ","))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      validate();
                    }
                  }}
                  className="h-12 w-full rounded-lg border border-line bg-white pl-3 pr-14 text-xl font-semibold tabular-nums text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">MAD</span>
              </span>
              <button type="button" onClick={() => add()} disabled={typed <= 0} className={buttonClass("secondary", "h-12 px-3")} title="Ajouter ce paiement et en saisir un autre">
                <Plus /> <span className="hidden sm:inline">Ajouter</span>
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setText(fmtAmount(remaining))} className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-ink">
                Montant exact
              </button>
              {method === "especes" &&
                quick.map((v) => (
                  <button key={v} type="button" onClick={() => setText(fmtAmount(v))} className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-3 text-xs font-medium tabular-nums text-slate-600 hover:border-slate-300 hover:text-ink">
                    {mad(v)}
                  </button>
                ))}
            </div>
          </div>

          {parts.length > 0 && (
            <ul className="divide-y divide-line rounded-lg border border-line">
              {parts.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3.5 py-2 text-sm">
                  <span className="text-slate-600">{PAY_LABEL[p.method]}</span>
                  <span className="ml-auto font-semibold tabular-nums">{mad(p.amount)}</span>
                  <button type="button" onClick={() => setParts((ps) => ps.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Retirer ce paiement">
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <dt>Déjà réglé</dt>
              <dd className="tabular-nums">{mad(covered)}</dd>
            </div>
            <div className={cn("flex justify-between", previewRest > 0 ? "font-medium text-amber-700" : "text-slate-600")}>
              <dt>Reste</dt>
              <dd className="tabular-nums">{mad(previewRest)}</dd>
            </div>
          </dl>
          {change > 0 && (
            <p className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 text-emerald-800">
              <span className="text-sm">Rendu monnaie</span>
              <span className="text-2xl font-semibold tabular-nums">{mad(change)}</span>
            </p>
          )}

          <ErrorLine message={localError ?? error} />
        </div>

        <div className="space-y-3">
          <Numpad onKey={(k) => setText((v) => applyKey(v, k))} />
          <button type="button" onClick={() => validate()} disabled={pending} className={buttonClass("primary", "h-14 w-full text-base font-semibold")}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />} Valider
            <span className="ml-1 rounded bg-white/20 px-1.5 text-[11px] font-medium">Entrée</span>
          </button>
          {hasContact && (
            <button type="button" onClick={() => validate(true)} disabled={pending} className={buttonClass("secondary", "w-full")}>
              Valider avec reste dû
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Ticket après encaissement : imprimer, nouvelle vente */
export function TicketDialog({ ticket, onClose }: { ticket: TicketData; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        window.print();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <Modal title={`Vente ${ticket.number} enregistrée`} subtitle={ticket.change > 0 ? `Rendu monnaie : ${mad(ticket.change)}` : `Total ${mad(ticket.total)}`} onClose={onClose}>
      <TicketPrintStyle />
      <div className="space-y-4 p-5">
        {ticket.change > 0 && (
          <p className="flex items-center justify-between rounded-lg bg-emerald-50 px-4 py-3 text-emerald-800">
            <span className="text-sm">Rendu monnaie</span>
            <span className="text-2xl font-semibold tabular-nums">{mad(ticket.change)}</span>
          </p>
        )}
        <div className="max-h-[46dvh] overflow-y-auto rounded-lg border border-line bg-slate-50 py-3">
          <Ticket t={ticket} className="border border-line" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => window.print()} className={buttonClass("secondary")}>
            <Printer /> Imprimer
          </button>
          <Link href={`/ventes/${ticket.sale_id}`} className={buttonClass("secondary")}>
            <ReceiptText /> Voir la vente
          </Link>
        </div>
        <button type="button" onClick={onClose} className={buttonClass("brand", "h-12 w-full text-[15px]")} autoFocus>
          Nouvelle vente <span className="ml-1 rounded bg-white/20 px-1.5 text-[11px] font-medium">Entrée</span>
        </button>
      </div>
    </Modal>
  );
}

/** Ouverture de caisse : fond de caisse obligatoire avant la première vente */
export function OpenRegister({ entityShort, defaultFloat, canOpen, onOpen }: { entityShort: string; defaultFloat: number; canOpen: boolean; onOpen: (float: number) => Promise<string | null> }) {
  const [text, setText] = useState(fmtAmount(defaultFloat));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () =>
    start(async () => {
      setError(null);
      const err = await onOpen(amountOf(text));
      if (err) setError(err);
    });
  return (
    <div className="mx-auto max-w-md rounded-xl border border-line bg-white">
      <div className="border-b border-line px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <LockOpen className="size-4 text-slate-400" /> Ouvrir la caisse · {entityShort}
        </p>
        <p className="mt-1 text-[13px] text-muted">Comptez les espèces du tiroir (fond de caisse) avant la première vente de la journée.</p>
      </div>
      {canOpen ? (
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-slate-700">Fond de caisse</span>
            <span className="relative block">
              <input
                value={text}
                inputMode="decimal"
                autoFocus
                onChange={(e) => setText(e.target.value.replace(/[^\d,.]/g, "").replace(".", ","))}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), submit())}
                className="h-14 w-full rounded-lg border border-line bg-white pl-4 pr-14 text-2xl font-semibold tabular-nums text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">MAD</span>
            </span>
          </label>
          <Numpad onKey={(k) => setText((v) => applyKey(v, k))} />
          <ErrorLine message={error} />
          <button type="button" onClick={submit} disabled={pending} className={buttonClass("brand", "h-12 w-full text-[15px]")}>
            {pending ? <Loader2 className="animate-spin" /> : <LockOpen />} Ouvrir la caisse
          </button>
        </div>
      ) : (
        <p className="p-5 text-sm text-slate-600">Demandez à la réception ou à un manager d&apos;ouvrir la caisse de {entityShort}.</p>
      )}
    </div>
  );
}

const REASONS: Record<"depot" | "retrait", string[]> = {
  depot: ["Appoint de monnaie", "Retour de banque", "Correction de caisse"],
  retrait: ["Remise en banque", "Achat de fournitures", "Course / livraison", "Avance sur salaire"],
};

/** Entrées / sorties d'espèces (dépôt, retrait avec motif) */
export function CashMoveDialog({ moves, onClose, onSubmit }: { moves: PosCashMove[]; onClose: () => void; onSubmit: (kind: "depot" | "retrait", amount: number, reason: string) => Promise<string | null> }) {
  const [kind, setKind] = useState<"depot" | "retrait">("retrait");
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const totalIn = moves.filter((m) => m.kind === "depot").reduce((a, m) => a + m.amount, 0);
  const totalOut = moves.filter((m) => m.kind === "retrait").reduce((a, m) => a + m.amount, 0);
  const submit = () =>
    start(async () => {
      setError(null);
      const err = await onSubmit(kind, amountOf(text), reason);
      if (err) setError(err);
      else {
        setText("");
        setReason("");
      }
    });
  return (
    <Modal title="Entrées et sorties d'espèces" subtitle={`Aujourd'hui : + ${mad(totalIn)} · − ${mad(totalOut)}`} onClose={onClose}>
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
          {(["depot", "retrait"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn("inline-flex h-10 items-center justify-center gap-1.5 rounded-md text-sm font-medium transition", kind === k ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink")}
            >
              {k === "depot" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
              {k === "depot" ? "Dépôt (entrée)" : "Retrait (sortie)"}
            </button>
          ))}
        </div>
        <span className="relative block">
          <input
            value={text}
            inputMode="decimal"
            autoFocus
            placeholder="0"
            aria-label="Montant"
            onChange={(e) => setText(e.target.value.replace(/[^\d,.]/g, "").replace(".", ","))}
            className="h-12 w-full rounded-lg border border-line bg-white pl-3 pr-14 text-xl font-semibold tabular-nums text-ink focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">MAD</span>
        </span>
        <Numpad onKey={(k) => setText((v) => applyKey(v, k))} />
        <div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={160}
            placeholder={kind === "retrait" ? "Motif du retrait (obligatoire)" : "Motif (facultatif)"}
            aria-label="Motif"
            className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {REASONS[kind].map((r) => (
              <button key={r} type="button" onClick={() => setReason(r)} className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-ink">
                {r}
              </button>
            ))}
          </div>
        </div>
        <ErrorLine message={error} />
        <button type="button" onClick={submit} disabled={pending || amountOf(text) <= 0} className={buttonClass("brand", "h-11 w-full")}>
          {pending && <Loader2 className="animate-spin" />} Enregistrer le {kind === "depot" ? "dépôt" : "retrait"}
        </button>

        {moves.length > 0 && (
          <ul className="divide-y divide-line border-t border-line pt-1">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2 text-[13px]">
                <span className="w-11 shrink-0 tabular-nums text-muted">{fmtTime(m.at)}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600">
                  {m.reason || (m.kind === "depot" ? "Dépôt" : "Retrait")} <span className="text-muted">· {m.by}</span>
                </span>
                <span className={cn("shrink-0 font-semibold tabular-nums", m.kind === "depot" ? "text-emerald-600" : "text-ink")}>
                  {m.kind === "depot" ? "+" : "−"} {mad(m.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
