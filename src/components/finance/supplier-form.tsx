import { Save } from "lucide-react";
import type { Entity } from "@/lib/entities";
import { EXPENSE_CATEGORIES } from "@/lib/types-finance";
import { PAYMENT_TERMS, type SupplierFull } from "@/lib/types-business";
import { saveSupplierFull } from "@/actions/suppliers";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ImageInput } from "@/components/image-input";
import { Card, Field, Input, SectionTitle, Textarea } from "@/components/ui";

const chip =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 h-9 text-[13px] text-slate-600 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700";

/** Fiche fournisseur (création / modification) */
export function SupplierForm({ supplier, entities }: { supplier: SupplierFull | null; entities: Entity[] }) {
  const s = supplier;
  const terms = [...new Set([...PAYMENT_TERMS, ...(s?.payment_terms ? [s.payment_terms] : [])])];
  return (
    <ActionForm action={saveSupplierFull.bind(null, s?.id ?? null)} className="space-y-5">
      <Card className="p-5">
        <SectionTitle>Identité</SectionTitle>
        <div className="grid gap-3.5 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Nom usuel">
            <Input name="name" defaultValue={s?.name ?? ""} required autoFocus={!s} placeholder="Ex. : Clim Service Agadir" />
          </Field>
          <Field label="Raison sociale" hint="Telle qu'elle figure sur les factures">
            <Input name="legal_name" defaultValue={s?.legal_name ?? ""} placeholder="Ex. : CLIM SERVICE SARL" />
          </Field>
          <Field label="ICE" hint="15 chiffres">
            <Input name="ice" defaultValue={s?.ice ?? ""} inputMode="numeric" placeholder="001234567000089" className="tabular-nums" />
          </Field>
          <Field label="Conditions de paiement">
            <Input name="payment_terms" defaultValue={s?.payment_terms ?? ""} list="payment-terms" placeholder="Ex. : 30 jours" />
            <datalist id="payment-terms">
              {terms.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
        </div>

        <SectionTitle>Contact</SectionTitle>
        <div className="grid gap-3.5 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Interlocuteur">
            <Input name="contact_name" defaultValue={s?.contact_name ?? ""} placeholder="Prénom Nom" />
          </Field>
          <Field label="E-mail">
            <Input type="email" name="email" defaultValue={s?.email ?? ""} placeholder="commandes@exemple.ma" />
          </Field>
          <Field label="Téléphone">
            <Input type="tel" name="phone" defaultValue={s?.phone ?? ""} placeholder="05 28 …" className="tabular-nums" />
          </Field>
          <Field label="WhatsApp" hint="Si différent du téléphone">
            <Input type="tel" name="whatsapp" defaultValue={s?.whatsapp ?? ""} placeholder="06 …" className="tabular-nums" />
          </Field>
          <Field label="Adresse">
            <Input name="address" defaultValue={s?.address ?? ""} placeholder="Rue, quartier" />
          </Field>
          <Field label="Ville">
            <Input name="city" defaultValue={s?.city ?? "Agadir"} />
          </Field>
        </div>

        <SectionTitle>Ce qu&apos;il nous fournit</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {EXPENSE_CATEGORIES.map((c) => (
            <label key={c.id} className={chip}>
              <input type="checkbox" name="categories" value={c.id} defaultChecked={(s?.categories ?? []).includes(c.id)} className="accent-brand-500" />
              {c.label}
            </label>
          ))}
        </div>
        <p className="mb-2 mt-4 text-[13px] font-medium text-slate-700">Établissements servis</p>
        <div className="flex flex-wrap gap-2">
          {entities.map((e) => (
            <label key={e.id} className={chip}>
              <input type="checkbox" name="entity_ids" value={e.id} defaultChecked={(s?.entity_ids ?? []).includes(e.id)} className="accent-brand-500" />
              <span className="size-2 rounded-full" style={{ background: e.color }} />
              {e.short}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">Aucun coché = fournisseur commun à tout le groupe.</p>
      </Card>

      <Card className="p-5">
        <details open={!!(s?.rib || s?.notes)}>
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink">Banque, notes et documents</summary>
          <div className="mt-4 space-y-3.5">
            <Field label="RIB (facultatif)" hint="24 chiffres, pour les virements">
              <Input name="rib" defaultValue={s?.rib ?? ""} inputMode="numeric" className="tabular-nums" placeholder="011 010 0000012345678901 23" />
            </Field>
            <Field label="Notes">
              <Textarea name="notes" defaultValue={s?.notes ?? ""} placeholder="Délais de livraison, minimum de commande, remises négociées…" />
            </Field>
            <ImageInput name="documents" multiple label="Ajouter des documents ou photos (devis, facture, carte de visite…)" />
          </div>
        </details>
      </Card>

      <div className="flex justify-end">
        <SubmitButton variant="brand">
          <Save className="size-4" /> {s ? "Enregistrer" : "Créer la fiche"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
