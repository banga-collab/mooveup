"use client";

import { useState } from "react";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, SectionTitle, Select, Textarea } from "@/components/ui";
import type { Company, ConventionKind, ShareMode } from "@/lib/types-corporate";
import { COMPANY_STATUS_LABEL } from "@/lib/types-corporate";
import { cn, dayKey } from "@/lib/utils";

type Ent = { id: string; short: string; color: string };

const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const num = (v: string) => {
  const n = Number(v.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Formulaire entreprise + convention (création et onglet Convention) */
export function CompanyForm({
  action,
  company,
  entities,
  submitLabel,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  company?: Company | null;
  entities: Ent[];
  submitLabel: string;
}) {
  const [convention, setConvention] = useState<ConventionKind>(company?.convention ?? "remise");
  const [discount, setDiscount] = useState(String(company?.discount_pct ?? 15));
  const [flat, setFlat] = useState(String(company?.flat_mad ?? 250));
  const [mode, setMode] = useState<ShareMode>(company?.share_mode ?? "pct");
  const [share, setShare] = useState(String(company?.share_value ?? 50));

  // Exemple chiffré : un salarié qui consomme 400 MAD dans le mois
  const gross = convention === "forfait" ? num(flat) : 400;
  const net = convention === "forfait" ? gross : gross * (1 - Math.min(100, num(discount)) / 100);
  const comp = Math.max(0, Math.min(net, mode === "pct" ? (net * Math.min(100, num(share))) / 100 : num(share)));
  const checked = new Set<string>(company?.entity_ids ?? entities.map((e) => e.id));

  return (
    <ActionForm action={action} className="space-y-5">
      <SectionTitle>Entreprise</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Nom de l'entreprise">
          <Input name="name" required defaultValue={company?.name ?? ""} placeholder="Hôtel, banque, clinique…" autoFocus={!company} />
        </Field>
        <Field label="Secteur" hint="Facultatif">
          <Input name="sector" defaultValue={company?.sector ?? ""} placeholder="Hôtellerie" list="corp-sectors" />
          <datalist id="corp-sectors">
            {["Hôtellerie", "Banque", "Santé", "Logistique", "Industrie", "Administration", "Enseignement", "Commerce"].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="ICE" hint="15 chiffres, figure sur la facture">
          <Input name="ice" inputMode="numeric" defaultValue={company?.ice ?? ""} placeholder="001234567000089" className="tabular-nums" />
        </Field>
        <Field label="Adresse">
          <Input name="address" defaultValue={company?.address ?? ""} placeholder="Boulevard…, Agadir" />
        </Field>
      </div>

      <SectionTitle>Contact RH</SectionTitle>
      <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        <Field label="Nom">
          <Input name="hr_name" defaultValue={company?.hr_name ?? ""} placeholder="Mme Benali" />
        </Field>
        <Field label="Téléphone">
          <Input name="hr_phone" type="tel" inputMode="tel" defaultValue={company?.hr_phone ?? ""} placeholder="06 12 34 56 78" className="tabular-nums" />
        </Field>
        <Field label="E-mail">
          <Input name="hr_email" type="email" defaultValue={company?.hr_email ?? ""} placeholder="rh@entreprise.ma" />
        </Field>
      </div>

      <SectionTitle>Convention</SectionTitle>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-slate-700">Établissements couverts</legend>
        <div className="flex flex-wrap gap-2">
          {entities.map((e) => (
            <label key={e.id} className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[13px] has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/60">
              <input type="checkbox" name="entity_ids" value={e.id} defaultChecked={checked.has(e.id)} className="size-3.5" />
              <span className="size-2 rounded-full" style={{ background: e.color }} />
              {e.short}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-1.5 text-[13px] font-medium text-slate-700">Type de convention</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["remise", "Remise en %", "Sur les abonnements et prestations consommés"],
              ["forfait", "Forfait mensuel", "Montant fixe par salarié et par mois"],
            ] as const
          ).map(([v, label, hint]) => (
            <label key={v} className={cn("flex min-h-9 cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition", convention === v ? "border-brand-300 bg-brand-50/60" : "border-line hover:bg-slate-50")}>
              <input type="radio" name="convention" value={v} checked={convention === v} onChange={() => setConvention(v)} className="mt-0.5 size-4" />
              <span>
                <span className="block text-sm font-medium text-ink">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        {convention === "remise" ? (
          <Field label="Remise (%)">
            <Input name="discount_pct" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="tabular-nums" />
          </Field>
        ) : (
          <Field label="Forfait / salarié / mois (MAD)">
            <Input name="flat_mad" inputMode="decimal" value={flat} onChange={(e) => setFlat(e.target.value)} className="tabular-nums" />
          </Field>
        )}
        {convention === "remise" ? <input type="hidden" name="flat_mad" value={company?.flat_mad ?? 0} /> : <input type="hidden" name="discount_pct" value={company?.discount_pct ?? 0} />}
        <Field label="L'entreprise paie">
          <Select name="share_mode" value={mode} onChange={(e) => setMode(e.target.value as ShareMode)}>
            <option value="pct">Un pourcentage</option>
            <option value="fixe">Un montant fixe</option>
          </Select>
        </Field>
        <Field label={mode === "pct" ? "Part entreprise (%)" : "Plafond / salarié / mois (MAD)"}>
          <Input name="share_value" inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} className="tabular-nums" />
        </Field>
      </div>

      <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600" aria-live="polite">
        Exemple : {convention === "forfait" ? <>forfait de {nf.format(gross)} MAD</> : <>un salarié consomme 400 MAD, il doit {nf.format(net)} MAD après remise</>} →{" "}
        <span className="font-medium text-ink">entreprise {nf.format(comp)} MAD</span>, salarié {nf.format(net - comp)} MAD.
      </p>

      <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
        <Field label="Début">
          <Input type="date" name="start_date" required defaultValue={company?.start_date ?? dayKey()} />
        </Field>
        <Field label="Fin" hint="Vide = sans limite">
          <Input type="date" name="end_date" defaultValue={company?.end_date ?? ""} />
        </Field>
        <Field label="Statut">
          <Select name="status" defaultValue={company?.status ?? "active"}>
            {Object.entries(COMPANY_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <details className="group rounded-lg border border-line px-3.5 py-2.5">
        <summary className="cursor-pointer text-[13px] font-medium text-slate-600">Options : délai de paiement, notes</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
          <Field label="Délai de paiement (jours)">
            <Input name="payment_days" inputMode="numeric" defaultValue={company?.payment_days ?? 30} className="tabular-nums" />
          </Field>
          <Field label="Notes internes" className="sm:col-span-2">
            <Textarea name="notes" defaultValue={company?.notes ?? ""} placeholder="Conditions particulières, interlocuteurs…" className="min-h-10" />
          </Field>
        </div>
      </details>

      <div className="flex justify-end">
        <SubmitButton variant="brand">{submitLabel}</SubmitButton>
      </div>
    </ActionForm>
  );
}
