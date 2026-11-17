import { Gift } from "lucide-react";
import { getScope } from "@/lib/auth";
import { getContacts } from "@/lib/data";
import { ENTITIES } from "@/lib/entities";
import { PAY_LABEL, addDaysKey, dayKey } from "@/lib/utils";
import type { PayMethod } from "@/lib/types";
import { Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ContactPicker } from "@/components/contact-picker";
import { createGiftCard } from "@/actions/loyalty";

export const metadata = { title: "Nouvelle carte cadeau" };

const AMOUNTS = [200, 300, 500, 1000];

export default async function NewGiftCardPage() {
  const scope = await getScope();
  const contacts = (await getContacts(scope)).map((c) => ({ id: c.id, full_name: c.full_name, phone: c.phone }));
  const defaultEntity = scope.current?.id ?? scope.allowed[0]?.id;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={<BackLink href="/fidelite?tab=cartes" label="Cartes cadeaux" />} title="Nouvelle carte cadeau" subtitle="Un code unique à présenter dans les établissements choisis" />
      <Card className="p-5 sm:p-6">
        <ActionForm action={createGiftCard} className="space-y-5">
          <Field label="Montant (MAD)">
            <Input name="amount" inputMode="decimal" required placeholder="500" list="gc-amounts" className="text-base font-semibold tabular-nums" />
            <datalist id="gc-amounts">
              {AMOUNTS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Acheteur">
              <ContactPicker contacts={contacts} name="buyer_id" placeholder="Client qui paie…" />
            </Field>
            <Field label="Bénéficiaire" hint="Laissez vide si inconnu.">
              <ContactPicker contacts={contacts} name="beneficiary_id" placeholder="Client qui reçoit…" />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-slate-700">Valable dans</legend>
            <div className="flex flex-wrap gap-2">
              {ENTITIES.map((e) => (
                <label key={e.id} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-[13px] has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50/60">
                  <input type="checkbox" name="valid" value={e.id} defaultChecked className="size-3.5" />
                  <span className="size-2 rounded-full" style={{ background: e.color }} />
                  {e.short}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-lg border border-line p-3.5">
            <label className="flex items-center gap-2.5 text-sm font-medium text-ink">
              <input type="checkbox" name="charge" defaultChecked className="size-4" />
              Encaisser la carte maintenant
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Vendue par">
                <Select name="entity_id" defaultValue={defaultEntity}>
                  {scope.allowed.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.short}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Paiement">
                <Select name="method" defaultValue="especes">
                  {(Object.keys(PAY_LABEL) as PayMethod[]).map((m) => (
                    <option key={m} value={m}>
                      {PAY_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="mt-2 text-xs text-muted">Crée la vente en caisse. Lors de l&apos;utilisation, déduisez le montant de la carte ici plutôt que d&apos;encaisser à nouveau.</p>
          </div>

          <details className="group rounded-lg border border-line p-3.5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer text-[13px] font-medium text-slate-700">Plus d&apos;options : expiration, message, nom libre</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="Expire le">
                <Input type="date" name="expires_on" defaultValue={addDaysKey(dayKey(), 365)} min={addDaysKey(dayKey(), 1)} />
              </Field>
              <Field label="Message sur la carte">
                <Input name="message" maxLength={120} placeholder="Joyeux anniversaire !" />
              </Field>
              <Field label="Acheteur (s'il n'est pas client)">
                <Input name="buyer_name" placeholder="Nom et prénom" />
              </Field>
              <Field label="Bénéficiaire (s'il n'est pas client)">
                <Input name="beneficiary_name" placeholder="Nom et prénom" />
              </Field>
            </div>
          </details>

          <div className="flex justify-end">
            <SubmitButton variant="brand">
              <Gift className="size-4" /> Créer la carte
            </SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
