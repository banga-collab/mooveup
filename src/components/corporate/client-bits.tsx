"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Ban, Banknote, BellRing, Mail, MessageCircle, Phone, Send, UserMinus } from "lucide-react";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select, buttonClass } from "@/components/ui";
import { showToast } from "@/components/toaster";
import { cancelInvoice, markInvoiceSent, remindInvoice, removeEmployee, toggleEmployee } from "@/actions/corporate";
import { PAY_LABEL, cn, dayKey } from "@/lib/utils";

/* ---------- Salariés ---------- */

/** Interrupteur actif / inactif, mise à jour immédiate */
export function EmployeeToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const [on, setOn] = useOptimistic(active);
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${name} : ${on ? "actif" : "inactif"}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOn(!on);
          const r = await toggleEmployee(id);
          showToast(r.ok ? r.message : r.error, r.ok ? "success" : "error");
        })
      }
      className="inline-flex min-h-9 items-center gap-2 rounded-md px-1 text-[13px] text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <span className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full transition", on ? "bg-brand-500" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", on ? "left-[18px]" : "left-0.5")} />
      </span>
      {on ? "Actif" : "Inactif"}
    </button>
  );
}

export function RemoveEmployeeButton({ id, name }: { id: string; name: string }) {
  return (
    <form action={removeEmployee.bind(null, id)}>
      <button type="submit" className={buttonClass("ghost", "h-9 px-2 text-slate-400 hover:text-red-600")} aria-label={`Retirer ${name}`} title="Retirer (annulable)">
        <UserMinus />
      </button>
    </form>
  );
}

/* ---------- Mois ---------- */

export function MonthSelect({ months, value, param = "mois" }: { months: { key: string; label: string }[]; value: string; param?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label="Mois"
      value={value}
      disabled={pending}
      className="h-9 w-auto min-w-44 text-[13px] capitalize"
      onChange={(e) => {
        const next = new URLSearchParams(sp.toString());
        next.set(param, e.target.value);
        start(() => router.replace(`${path}?${next.toString()}`, { scroll: false }));
      }}
    >
      {months.map((m) => (
        <option key={m.key} value={m.key}>
          {m.label}
        </option>
      ))}
    </Select>
  );
}

/* ---------- Facture ---------- */

export function SendInvoiceButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={buttonClass("brand")}
      onClick={() =>
        start(async () => {
          const r = await markInvoiceSent(id);
          showToast(r.ok ? r.message : r.error, r.ok ? "success" : "error");
        })
      }
    >
      <Send /> Marquer envoyée
    </button>
  );
}

export function PaidForm({ action, defaultMethod = "virement" }: { action: (s: FormState, fd: FormData) => Promise<FormState>; defaultMethod?: string }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className={buttonClass("secondary")} onClick={() => setOpen(true)}>
        <Banknote /> Enregistrer le paiement
      </button>
    );
  }
  return (
    <div className="w-full rounded-xl border border-line bg-white p-4">
      <ActionForm action={action} className="grid gap-3 sm:grid-cols-4 sm:items-end [&>*]:min-w-0">
        <Field label="Payée le">
          <Input type="date" name="paid_on" defaultValue={dayKey()} max={dayKey()} required />
        </Field>
        <Field label="Mode">
          <Select name="method" defaultValue={defaultMethod}>
            {Object.entries(PAY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Référence" hint="N° de virement ou de chèque">
          <Input name="ref" placeholder="Facultatif" />
        </Field>
        <div className="flex gap-2 sm:pb-[22px]">
          <SubmitButton variant="brand">Valider</SubmitButton>
          <button type="button" className={buttonClass("ghost")} onClick={() => setOpen(false)}>
            Fermer
          </button>
        </div>
      </ActionForm>
    </div>
  );
}

/** Relance : ouvre WhatsApp / e-mail / téléphone vers le RH et note la relance */
export function RemindMenu({ id, whatsapp, email, phone }: { id: string; whatsapp: string | null; email: string | null; phone: string | null }) {
  const [, start] = useTransition();
  const ref = useRef<HTMLDetailsElement>(null);
  const note = (channel: "whatsapp" | "email" | "telephone") => {
    if (ref.current) ref.current.open = false;
    start(async () => {
      const r = await remindInvoice(id, channel);
      showToast(r.ok ? r.message : r.error, r.ok ? "success" : "error");
    });
  };
  const item = "flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-ink hover:bg-slate-50 [&_svg]:size-4 [&_svg]:text-slate-400";
  return (
    <details ref={ref} className="relative">
      <summary className={cn(buttonClass("secondary"), "list-none [&::-webkit-details-marker]:hidden")}>
        <BellRing /> Relancer
      </summary>
      <div className="absolute left-0 z-20 mt-1 w-60 rounded-lg border border-line bg-white p-1 shadow-pop sm:left-auto sm:right-0">
        {whatsapp ? (
          <a href={whatsapp} target="_blank" rel="noreferrer" className={item} onClick={() => note("whatsapp")}>
            <MessageCircle /> WhatsApp au contact RH
          </a>
        ) : null}
        {email ? (
          <a href={email} className={item} onClick={() => note("email")}>
            <Mail /> E-mail au contact RH
          </a>
        ) : null}
        {phone ? (
          <a href={`tel:${phone.replace(/\s/g, "")}`} className={item} onClick={() => note("telephone")}>
            <Phone /> Appeler ({phone})
          </a>
        ) : null}
        {!whatsapp && !email && !phone && <p className="px-2.5 py-2 text-[13px] text-muted">Ajoutez le téléphone ou l&apos;e-mail du RH dans l&apos;onglet Convention.</p>}
      </div>
    </details>
  );
}

export function CancelInvoiceButton({ id, number }: { id: string; number: string }) {
  return (
    <form action={cancelInvoice.bind(null, id)}>
      <button type="submit" className={buttonClass("ghost", "text-slate-500 hover:text-red-600")} title={`Annuler ${number} (annulable 5 s)`}>
        <Ban /> Annuler la facture
      </button>
    </form>
  );
}
