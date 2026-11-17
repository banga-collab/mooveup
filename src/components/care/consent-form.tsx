"use client";

import { useState } from "react";
import { PenLine } from "lucide-react";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, Select } from "@/components/ui";
import { CONSENT_LABEL, CONSENT_TEMPLATES, type ConsentTemplate } from "@/lib/types-care";
import { SignaturePad } from "./signature-pad";

export function ConsentForm({
  action,
  signer,
  entities,
  defaultEntity,
  defaultTemplate,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  signer: string;
  entities: { id: string; short: string }[];
  defaultEntity: string;
  defaultTemplate: ConsentTemplate;
}) {
  const [tpl, setTpl] = useState<ConsentTemplate>(defaultTemplate);
  const t = CONSENT_TEMPLATES[tpl];

  return (
    <ActionForm action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Modèle">
          <Select name="template" value={tpl} onChange={(e) => setTpl(e.target.value as ConsentTemplate)}>
            {(Object.keys(CONSENT_LABEL) as ConsentTemplate[]).map((k) => (
              <option key={k} value={k}>
                {CONSENT_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        {entities.length > 1 ? (
          <Field label="Établissement">
            <Select name="entity_id" defaultValue={defaultEntity}>
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.short}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <input type="hidden" name="entity_id" value={defaultEntity} />
        )}
      </div>

      <div className="rounded-lg border border-line bg-canvas px-4 py-3">
        <p className="text-[13px] font-semibold text-ink">{t.title}</p>
        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1 text-[13px] leading-relaxed text-slate-600">
          {t.body.split("\n").map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <input type="hidden" name="body" value={t.body} />
      </div>

      <Field label="Nom du signataire" hint="Le client, ou son représentant légal">
        <Input name="signed_by" defaultValue={signer} required />
      </Field>

      <SignaturePad />

      <label className="flex items-start gap-2 text-[13px] text-slate-700">
        <input type="checkbox" name="read" className="mt-0.5 size-4" required />
        Le client a lu le document et pu poser ses questions.
      </label>

      <SubmitButton variant="brand" pendingText="Enregistrement…">
        <PenLine /> Enregistrer la signature
      </SubmitButton>
    </ActionForm>
  );
}
