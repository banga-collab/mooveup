"use client";

import { useState } from "react";
import { ClipboardPlus } from "lucide-react";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { addDaysKey } from "@/lib/utils";
import { guessKind, TREATMENT_LABEL, ZONES, type TreatmentKind, type TreatmentSettings } from "@/lib/types-care";

export type PendingAppt = { id: string; entity_id: string; service: string; staff_id: string | null; date: string; time: string; label: string };
export type PrevRecord = { kind: TreatmentKind; zone: string | null; product: string | null; lot: string | null; settings: TreatmentSettings };

const NEXT_DAYS: Partial<Record<TreatmentKind, number>> = { laser: 35, injection: 14, peeling: 21 };

export function TreatmentForm({
  action,
  entities,
  team,
  appts,
  previous,
  defaultEntity,
  today,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  entities: { id: string; short: string }[];
  team: { id: string; full_name: string }[];
  appts: PendingAppt[];
  previous: Record<string, PrevRecord>;
  defaultEntity: string;
  today: string;
}) {
  const [apptId, setApptId] = useState(appts[0]?.id ?? "");
  const appt = appts.find((a) => a.id === apptId);
  const prev = appt ? previous[appt.service] : undefined;
  const [kind, setKind] = useState<TreatmentKind>(appt ? (prev?.kind ?? guessKind(appt.service)) : "soin");
  const date = appt?.date ?? today;
  const nextDays = NEXT_DAYS[kind];

  const chooseAppt = (id: string) => {
    setApptId(id);
    const a = appts.find((x) => x.id === id);
    setKind(a ? (previous[a.service]?.kind ?? guessKind(a.service)) : "soin");
  };

  return (
    <ActionForm action={action} className="space-y-3.5">
      {appts.length > 0 && (
        <Field label="Rendez-vous" hint={appt ? "Champs pré-remplis avec ce rendez-vous et la séance précédente" : undefined}>
          <Select name="appointment_id" value={apptId} onChange={(e) => chooseAppt(e.target.value)}>
            {appts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
            <option value="">Séance sans rendez-vous</option>
          </Select>
        </Field>
      )}

      <div key={apptId} className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-[1fr_150px] [&>*]:min-w-0">
          <Field label="Prestation">
            <Input name="service" defaultValue={appt?.service ?? ""} required placeholder="Ex. Épilation laser" />
          </Field>
          <Field label="Type">
            <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value as TreatmentKind)}>
              {(Object.keys(TREATMENT_LABEL) as TreatmentKind[]).map((k) => (
                <option key={k} value={k}>
                  {TREATMENT_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Zone">
            <Input name="zone" list="care-zones" defaultValue={prev?.zone ?? ""} placeholder="Ex. Aisselles" />
          </Field>
          <Field label="Praticien">
            <Select name="practitioner_id" defaultValue={appt?.staff_id ?? ""}>
              <option value="">Non précisé</option>
              {team.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <datalist id="care-zones">
          {ZONES.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>

        <div className="grid gap-3 sm:grid-cols-[1fr_140px] [&>*]:min-w-0">
          <Field label={kind === "laser" ? "Appareil" : "Produit"}>
            <Input name="product" defaultValue={prev?.product ?? ""} placeholder={kind === "laser" ? "Ex. Laser diode" : "Ex. Juvéderm Volift"} />
          </Field>
          <Field label="N° de lot">
            <Input name="lot" defaultValue={kind === "injection" || kind === "peeling" ? "" : (prev?.lot ?? "")} placeholder="Traçabilité" />
          </Field>
        </div>

        {kind === "laser" && (
          <div className="grid grid-cols-3 gap-3 [&>*]:min-w-0">
            <Field label="Fluence">
              <Input name="fluence" defaultValue={prev?.settings.fluence ?? ""} placeholder="J/cm²" />
            </Field>
            <Field label="Longueur d'onde">
              <Input name="wavelength" defaultValue={prev?.settings.wavelength ?? ""} placeholder="nm" />
            </Field>
            <Field label="Spot">
              <Input name="spot" defaultValue={prev?.settings.spot ?? ""} placeholder="mm" />
            </Field>
          </div>
        )}
        {kind === "injection" && (
          <Field label="Quantité injectée">
            <Input name="quantity" defaultValue={prev?.settings.quantity ?? ""} placeholder="Ex. 1 ml ou 20 U" />
          </Field>
        )}

        <Field label="Observations">
          <Textarea name="observations" rows={3} placeholder="Déroulé, réaction de la peau, conseils donnés…" />
        </Field>

        <details className="group rounded-lg border border-line px-3.5 py-2.5 [&_summary::-webkit-details-marker]:hidden">
          <summary className="cursor-pointer list-none text-[13px] font-medium text-slate-600">Date, effets secondaires, prochaine séance</summary>
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <Field label="Date">
                <Input type="date" name="date" defaultValue={date} max={today} />
              </Field>
              <Field label="Heure">
                <Input type="time" name="time" defaultValue={appt?.time ?? "12:00"} />
              </Field>
            </div>
            {entities.length > 1 && !appt ? (
              <Field label="Établissement">
                <Select name="entity_id" defaultValue={defaultEntity}>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.short}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Effets secondaires">
              <Input name="side_effects" placeholder="Ex. légère rougeur" />
            </Field>
            <Field label="Prochaine séance conseillée" hint={nextDays ? `Proposée à J+${nextDays}` : undefined}>
              <Input key={kind} type="date" name="next_on" defaultValue={nextDays ? addDaysKey(date, nextDays) : ""} />
            </Field>
          </div>
        </details>
        {(entities.length <= 1 || appt) && <input type="hidden" name="entity_id" value={appt?.entity_id ?? defaultEntity} />}
      </div>

      <SubmitButton variant="brand">
        <ClipboardPlus /> Enregistrer la séance
      </SubmitButton>
    </ActionForm>
  );
}
