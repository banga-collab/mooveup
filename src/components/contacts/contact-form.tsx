"use client";

import Link from "next/link";
import { startTransition, useActionState, useState } from "react";
import { AlertCircle, ArrowRight, Baby, Check, Loader2, MessageCircle, Plus, Save, Tag, UserRound } from "lucide-react";
import type { Contact } from "@/lib/types";
import type { Entity } from "@/lib/entities";
import { CONTACT_STATUS_LABEL, cn } from "@/lib/utils";
import type { ContactFormState } from "@/actions/contacts";
import { buttonClass, Card, Field, Input, LinkButton, SectionTitle, Select, Textarea } from "@/components/ui";
import { EntityIcon } from "@/components/entity-icon";
import { parseTags, SOURCES, TAG_SUGGESTIONS } from "./helpers";

export function ContactForm({
  action,
  contact,
  entities,
  defaultEntities,
  cancelHref,
}: {
  action: (state: ContactFormState, fd: FormData) => Promise<ContactFormState>;
  contact?: Contact | null;
  /** Établissements que l'utilisateur peut cocher */
  entities: Entity[];
  defaultEntities: string[];
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [tags, setTags] = useState((contact?.tags ?? []).join(", "));
  const [checked, setChecked] = useState<string[]>(contact ? contact.entity_ids : defaultEntities);
  const current = parseTags(tags).map((t) => t.toLowerCase());
  const showGuardian = checked.includes("kids") || !!contact?.guardian_name;

  const addTag = (t: string) => setTags((v) => (v.trim() ? `${v.replace(/[,\s]+$/, "")}, ${t}` : t));

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        // Envoi manuel : les champs ne sont pas vidés si le serveur renvoie une erreur
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{state.error}</p>
            {state.duplicate && (
              <Link href={`/contacts/${state.duplicate.id}`} className="mt-1 inline-flex items-center gap-1 font-bold text-red-700 underline-offset-2 hover:underline">
                Ouvrir la fiche de {state.duplicate.name} <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
        </div>
      )}

      <Card className="p-5 sm:p-6">
        <SectionTitle icon={<UserRound className="size-4" />}>Identité</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Nom complet *" className="sm:col-span-2">
            <Input name="full_name" required defaultValue={contact?.full_name ?? ""} placeholder="Ex. : Salma Bennani" autoComplete="off" />
          </Field>
          <Field label="Téléphone" hint="Sert aussi à détecter les doublons">
            <Input name="phone" type="tel" inputMode="tel" defaultValue={contact?.phone ?? ""} placeholder="06 12 34 56 78" />
          </Field>
          <Field label="E-mail">
            <Input name="email" type="email" defaultValue={contact?.email ?? ""} placeholder="nom@gmail.com" />
          </Field>
          <Field label="Sexe">
            <Select name="sex" defaultValue={contact?.sex ?? ""}>
              <option value="">Non précisé</option>
              <option value="F">Femme</option>
              <option value="H">Homme</option>
            </Select>
          </Field>
          <Field label="Date de naissance">
            <Input name="birth_date" type="date" defaultValue={contact?.birth_date?.slice(0, 10) ?? ""} />
          </Field>
          <Field label="Ville">
            <Input name="city" defaultValue={contact?.city ?? "Agadir"} list="contact-cities" />
            <datalist id="contact-cities">
              {["Agadir", "Inezgane", "Aourir", "Dcheira", "Tikiouine", "Anza", "Ait Melloul", "Taghazout"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Comment nous a-t-il connus ?">
            <Select name="source" defaultValue={contact?.source ?? ""}>
              <option value="">Non précisé</option>
              {SOURCES.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <SectionTitle icon={<Check className="size-4" />}>Établissements fréquentés</SectionTitle>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
          {entities.map((e) => {
            const on = checked.includes(e.id);
            return (
              <label
                key={e.id}
                className={cn("flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 transition hover:-translate-y-0.5", on ? "shadow-card" : "border-line bg-white")}
                style={on ? { borderColor: e.color, background: e.soft } : undefined}
              >
                <input
                  type="checkbox"
                  name="entity_ids"
                  value={e.id}
                  checked={on}
                  onChange={(ev) => setChecked((v) => (ev.target.checked ? [...v, e.id] : v.filter((x) => x !== e.id)))}
                  className="sr-only"
                />
                <span className="grid size-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: on ? e.color : "#cbd5e1" }}>
                  <EntityIcon id={e.id} className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold" style={{ color: on ? e.color : undefined }}>
                    {e.short}
                  </span>
                  <span className="block truncate text-xs text-muted">{e.tagline}</span>
                </span>
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border-2 text-white", !on && "border-slate-300")} style={on ? { background: e.color, borderColor: e.color } : undefined}>
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </label>
            );
          })}
        </div>

        <SectionTitle icon={<Tag className="size-4" />}>Suivi</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Statut">
            <Select name="status" defaultValue={contact?.status ?? "prospect"}>
              {(["client", "prospect", "ancien"] as const).map((s) => (
                <option key={s} value={s}>
                  {CONTACT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          {showGuardian ? (
            <Field label="Nom du parent" hint="Pour les enfants inscrits à Moov'Up Kids">
              <span className="relative block">
                <Baby className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input name="guardian_name" defaultValue={contact?.guardian_name ?? ""} placeholder="Ex. : Nadia Alaoui" className="pl-10" />
              </span>
            </Field>
          ) : (
            <input type="hidden" name="guardian_name" value="" />
          )}
          <Field label="Tags" hint="Séparés par des virgules" className="sm:col-span-2">
            <Input name="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="VIP, Parrain…" />
          </Field>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {TAG_SUGGESTIONS.filter((t) => !current.includes(t.toLowerCase())).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => addTag(t)}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-accent-400 hover:bg-accent-50 hover:text-accent-700"
            >
              <Plus className="size-3" /> {t}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-4">
          <Field label="Notes internes">
            <Textarea name="notes" defaultValue={contact?.notes ?? ""} placeholder="Préférences, disponibilités, informations utiles…" />
          </Field>
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-canvas/60 p-3.5">
            <input type="checkbox" name="whatsapp_optin" defaultChecked={contact ? contact.whatsapp_optin : true} className="mt-0.5 size-4 accent-emerald-600" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <MessageCircle className="size-4 text-emerald-600" /> Accepte les messages WhatsApp
              </span>
              <span className="block text-xs text-muted">Rappels de rendez-vous, offres et campagnes.</span>
            </span>
          </label>
        </div>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <LinkButton href={cancelHref} variant="secondary">
          Annuler
        </LinkButton>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {pending ? "Enregistrement…" : contact ? "Enregistrer" : "Créer le contact"}
        </button>
      </div>
    </form>
  );
}
