"use client";

import { startTransition, useActionState, useState } from "react";
import { AlertCircle, Loader2, Save, Search, Sparkles, UserPlus } from "lucide-react";
import type { Entity } from "@/lib/entities";
import type { LeadSource } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { FormState } from "@/components/action-form";
import { buttonClass, Card, Field, Input, LinkButton, SectionTitle, Select } from "@/components/ui";
import { ContactPicker, type PickerContact } from "@/components/contact-picker";
import { EntityIcon } from "@/components/entity-icon";
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
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error && (
        <p className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
        </p>
      )}
      <input type="hidden" name="mode" value={mode} />
      {defaultContact && <input type="hidden" name="back" value="contact" />}

      <Card className="p-5 sm:p-6">
        <SectionTitle icon={<UserPlus className="size-4" />}>Qui ?</SectionTitle>
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1">
          {(
            [
              ["existing", "Contact existant", Search],
              ["new", "Nouveau contact", UserPlus],
            ] as const
          ).map(([k, l, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className={cn("inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition", mode === k ? "bg-white text-brand-600 shadow-card" : "text-muted hover:text-ink")}
            >
              <Icon className="size-4 shrink-0" /> <span className="truncate">{l}</span>
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
              <Input name="full_name" placeholder="Ex. : Imane Tazi" autoComplete="off" />
            </Field>
            <Field label="Téléphone *" hint="Si le numéro existe déjà, la fiche existante est utilisée">
              <Input name="phone" type="tel" inputMode="tel" placeholder="06 12 34 56 78" />
            </Field>
          </div>
        )}

        <SectionTitle icon={<Sparkles className="size-4" />}>Opportunité</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Établissement *">
            <span className="relative block">
              <span className="pointer-events-none absolute left-3 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-lg text-white" style={{ background: current?.color ?? "#1a6d8e" }}>
                <EntityIcon id={entityId} className="size-3.5" />
              </span>
              <Select name="entity_id" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="pl-11">
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
                className={cn("rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition", interest === a ? "text-white" : "bg-white text-slate-600 ring-line hover:-translate-y-0.5")}
                style={interest === a ? { background: current.color, boxShadow: "none" } : undefined}
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
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pending ? "Enregistrement…" : "Créer le prospect"}
        </button>
      </div>
    </form>
  );
}
