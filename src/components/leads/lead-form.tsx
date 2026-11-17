"use client";

import { startTransition, useActionState, useState } from "react";
import { AlertCircle, Loader2, Search, UserPlus } from "lucide-react";
import type { Entity } from "@/lib/entities";
import type { LeadSource } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { FormState } from "@/components/action-form";
import { buttonClass, Card, Field, Input, LinkButton, SectionTitle, Select } from "@/components/ui";
import { ContactPicker, type PickerContact } from "@/components/contact-picker";
import { SOURCES } from "@/components/contacts/helpers";

export function LeadForm({
  action,
  contacts,
  entities,
  team,
  defaultContact,
  defaultEntity,
  defaultOwner,
  defaultDate,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  contacts: (PickerContact & { source: LeadSource | null })[];
  entities: Entity[];
  team: { id: string; full_name: string }[];
  defaultContact: string | null;
  defaultEntity: string;
  defaultOwner: string;
  defaultDate: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [mode, setMode] = useState<"existing" | "new">(defaultContact || contacts.length ? "existing" : "new");
  const [entityId, setEntityId] = useState(defaultEntity);
  const [source, setSource] = useState<string>(contacts.find((c) => c.id === defaultContact)?.source ?? "passage");
  const [interest, setInterest] = useState("");
  const current = entities.find((e) => e.id === entityId);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
        </p>
      )}
      <input type="hidden" name="mode" value={mode} />
      {defaultContact && <input type="hidden" name="back" value="contact" />}

      <Card className="p-5 sm:p-6">
        <SectionTitle>Qui ?</SectionTitle>
        <div className="mb-4 inline-flex gap-0.5 rounded-lg bg-slate-100 p-0.5" role="tablist">
          {(
            [
              ["existing", "Contact existant", Search],
              ["new", "Nouveau contact", UserPlus],
            ] as const
          ).map(([k, l, Icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={cn(
                "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                mode === k ? "bg-white text-ink shadow-sm" : "text-slate-500 hover:text-ink",
              )}
            >
              <Icon className="size-4 shrink-0 text-slate-400" /> <span className="truncate">{l}</span>
            </button>
          ))}
        </div>
        {mode === "existing" ? (
          <ContactPicker
            contacts={contacts}
            defaultId={defaultContact}
            onChange={(c) => {
              const s = contacts.find((x) => x.id === c?.id)?.source;
              if (s) setSource(s);
            }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Nom complet *">
              <Input name="full_name" autoFocus placeholder="Ex. : Imane Tazi" autoComplete="off" />
            </Field>
            <Field label="Téléphone *" hint="Si le numéro existe déjà, la fiche existante est utilisée">
              <Input name="phone" type="tel" inputMode="tel" placeholder="06 12 34 56 78" />
            </Field>
          </div>
        )}

        <SectionTitle>Opportunité</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Établissement *">
            <span className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 z-10 size-2 -translate-y-1/2 rounded-full" style={{ background: current?.color ?? "#1a6d8e" }} />
              <Select name="entity_id" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="pl-7">
                {entities.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.short}
                  </option>
                ))}
              </Select>
            </span>
          </Field>
          <Field label="Source *">
            <Select name="source" value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Intérêt *" className="sm:col-span-2">
            <Input name="interest" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="Ex. : abonnement trimestriel, épilation laser…" />
          </Field>
        </div>
        {current && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {current.activities.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setInterest(a)}
                aria-pressed={interest === a}
                className={cn(
                  "inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                  interest === a ? "border-brand-500 bg-brand-50 text-brand-700" : "border-line bg-white text-slate-600 hover:border-slate-300",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
          <Field label="Valeur estimée (MAD)">
            <Input name="value_mad" inputMode="decimal" placeholder="Ex. : 1500" />
          </Field>
          <Field label="Responsable">
            <Select name="owner_id" defaultValue={defaultOwner}>
              <option value="">Personne</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prochaine action">
            <Input name="next_action_on" type="date" defaultValue={defaultDate} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <LinkButton href={defaultContact ? `/contacts/${defaultContact}?tab=prospects` : "/prospects"} variant="secondary">
          Annuler
        </LinkButton>
        <button type="submit" disabled={pending} className={buttonClass("brand")}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Enregistrement…" : "Créer le prospect"}
        </button>
      </div>
    </form>
  );
}
