"use client";

import { useState } from "react";
import { Brush, HelpCircle, ShieldAlert, Send, UserRound, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { COMPLAINT_TYPES, type ComplaintType } from "@/lib/types-business";
import { submitComplaint } from "@/actions/complaints";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ImageInput } from "@/components/image-input";

const ICONS: Record<ComplaintType, React.ReactNode> = {
  panne: <Wrench />,
  proprete: <Brush />,
  securite: <ShieldAlert />,
  service: <UserRound />,
  autre: <HelpCircle />,
};

/** Formulaire public de signalement (pensé pour le téléphone) */
export function ReportForm({ entityId, zoneId }: { entityId: string; zoneId: string | null }) {
  const [type, setType] = useState<ComplaintType | null>(null);
  return (
    <ActionForm action={submitComplaint} className="space-y-5">
      <input type="hidden" name="e" value={entityId} />
      {zoneId && <input type="hidden" name="z" value={zoneId} />}
      <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>
          Site web <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-ink">Quel est le problème ?</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {COMPLAINT_TYPES.map((t) => (
            <label
              key={t.id}
              className={cn(
                "flex min-h-[76px] cursor-pointer flex-col justify-center gap-1 rounded-xl border bg-white px-3 py-2.5 transition [&_svg]:size-5",
                type === t.id ? "border-brand-500 ring-2 ring-brand-500/20" : "border-line hover:border-slate-300",
              )}
            >
              <input type="radio" name="type" value={t.id} required className="sr-only" onChange={() => setType(t.id)} />
              <span className={cn(type === t.id ? "text-brand-600" : "text-slate-400")}>{ICONS[t.id]}</span>
              <span className="text-sm font-medium text-ink">{t.label}</span>
              <span className="text-[11.5px] leading-tight text-muted">{t.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1.5 block text-sm font-semibold text-ink">Décrivez en quelques mots</span>
        <textarea
          name="description"
          required
          minLength={5}
          maxLength={1500}
          rows={4}
          placeholder="Ex. : la douche n° 2 des vestiaires hommes n'a plus d'eau chaude"
          className="w-full rounded-xl border border-line bg-white px-3.5 py-3 text-base text-ink placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15"
        />
      </label>

      <ImageInput name="photo" label="Ajouter une photo (facultatif)" />

      <details className="rounded-xl border border-line bg-white px-3.5 py-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-slate-700">Être recontacté (facultatif)</summary>
        <div className="mt-3 grid gap-3">
          <input name="contact_name" autoComplete="name" placeholder="Votre prénom" className="h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink placeholder:text-slate-400 focus:border-brand-400 focus:outline-none" />
          <input name="contact_phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="Téléphone / WhatsApp" className="h-11 w-full rounded-lg border border-line bg-white px-3 text-base text-ink placeholder:text-slate-400 focus:border-brand-400 focus:outline-none" />
        </div>
      </details>

      <SubmitButton variant="brand" className="h-12 w-full text-[15px]" pendingText="Envoi…">
        <Send className="size-4" /> Envoyer le signalement
      </SubmitButton>
      <p className="text-center text-xs text-muted">Votre signalement est transmis directement au responsable de l&apos;établissement.</p>
    </ActionForm>
  );
}
