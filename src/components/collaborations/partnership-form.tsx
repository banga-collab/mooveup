import { Save } from "lucide-react";
import type { Entity } from "@/lib/entities";
import { NATURE_LABEL, PARTNER_KIND_LABEL, PARTNERSHIP_STATUS_LABEL, type Partnership } from "@/lib/types-business";
import { savePartnership } from "@/actions/collaborations";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ImageInput } from "@/components/image-input";
import { Card, Field, Input, SectionTitle, Select, Textarea } from "@/components/ui";

const chip =
  "inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-2.5 h-9 text-[13px] text-slate-600 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700";

export const STATUS_TONE = { discussion: "amber", active: "green", terminee: "gray" } as const;

/** Formulaire d'une collaboration / d'un partenariat */
export function PartnershipForm({ p, entities, defaultEntity }: { p: Partnership | null; entities: Entity[]; defaultEntity?: string | null }) {
  const ents = p?.entity_ids ?? (defaultEntity ? [defaultEntity] : []);
  return (
    <ActionForm action={savePartnership.bind(null, p?.id ?? null)} className="space-y-5">
      <Card className="p-5">
        <SectionTitle>Partenaire</SectionTitle>
        <div className="grid gap-3.5 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Nom du partenaire">
            <Input name="partner_name" defaultValue={p?.partner_name ?? ""} required autoFocus={!p} placeholder="Ex. : Decathlon Agadir, @sara.fit…" />
          </Field>
          <Field label="Type">
            <Select name="partner_kind" defaultValue={p?.partner_kind ?? "marque"}>
              {Object.entries(PARTNER_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Nature">
            <Select name="nature" defaultValue={p?.nature ?? "sponsoring"}>
              {Object.entries(NATURE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Statut">
            <Select name="status" defaultValue={p?.status ?? "discussion"}>
              {Object.entries(PARTNERSHIP_STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Titre" hint="Facultatif : « Nature · Partenaire » par défaut" className="sm:col-span-2">
            <Input name="title" defaultValue={p?.title ?? ""} placeholder="Ex. : Tournoi de padel de printemps" />
          </Field>
        </div>

        <SectionTitle>Dates et établissements</SectionTitle>
        <div className="grid gap-3.5 sm:grid-cols-3 [&>*]:min-w-0">
          <Field label="Début">
            <Input type="date" name="start_date" defaultValue={p?.start_date ?? ""} />
          </Field>
          <Field label="Fin">
            <Input type="date" name="end_date" defaultValue={p?.end_date ?? ""} />
          </Field>
          <Field label="Rappel" hint="Par défaut : 15 j avant la fin">
            <Input type="date" name="reminder_date" defaultValue={p?.reminder_date ?? ""} />
          </Field>
        </div>
        <div className="mt-3.5 flex flex-wrap gap-2">
          {entities.map((e) => (
            <label key={e.id} className={chip}>
              <input type="checkbox" name="entity_ids" value={e.id} defaultChecked={ents.includes(e.id)} className="accent-brand-500" />
              <span className="size-2 rounded-full" style={{ background: e.color }} />
              {e.short}
            </label>
          ))}
        </div>

        <SectionTitle>Conditions</SectionTitle>
        <div className="grid gap-3.5 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Ce que nous apportons">
            <Textarea name="our_part" defaultValue={p?.our_part ?? ""} placeholder="Ex. : 3 abonnements annuels, logo sur nos réseaux…" />
          </Field>
          <Field label="Ce que le partenaire apporte">
            <Textarea name="their_part" defaultValue={p?.their_part ?? ""} placeholder="Ex. : 4 stories par mois, 10 % de remise pour nos membres…" />
          </Field>
          <Field label="Valeur estimée (MAD)">
            <Input name="value_mad" inputMode="decimal" defaultValue={p?.value_mad ?? ""} placeholder="0" className="tabular-nums" />
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Photos</SectionTitle>
        <ImageInput name="photos" multiple label="Ajouter des photos (événement, publication, contrat signé…)" />
        {p && p.photos.length > 0 && <p className="mt-2 text-xs text-muted">{p.photos.length} photo(s) déjà enregistrée(s) : les nouvelles s&apos;ajoutent à la galerie.</p>}

        <details className="mt-5" open={!!(p?.contact_name || p?.results || p?.notes)}>
          <summary className="cursor-pointer list-none text-[13px] font-medium text-brand-600 hover:underline">+ Contact, résultats et notes</summary>
          <div className="mt-4 grid gap-3.5 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Contact">
              <Input name="contact_name" defaultValue={p?.contact_name ?? ""} placeholder="Prénom Nom" />
            </Field>
            <Field label="Téléphone">
              <Input type="tel" name="contact_phone" defaultValue={p?.contact_phone ?? ""} className="tabular-nums" />
            </Field>
            <Field label="E-mail">
              <Input type="email" name="contact_email" defaultValue={p?.contact_email ?? ""} />
            </Field>
            <Field label="Instagram / site">
              <Input name="social" defaultValue={p?.social ?? ""} placeholder="@compte ou https://…" />
            </Field>
            <Field label="Résultats" className="sm:col-span-2">
              <Textarea name="results" defaultValue={p?.results ?? ""} placeholder="Ex. : 42 essais, 11 abonnements, 18 000 vues…" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <Textarea name="notes" defaultValue={p?.notes ?? ""} />
            </Field>
          </div>
        </details>
      </Card>

      <div className="flex justify-end">
        <SubmitButton variant="brand">
          <Save className="size-4" /> {p ? "Enregistrer" : "Créer la collaboration"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
