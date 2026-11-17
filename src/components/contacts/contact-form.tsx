"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, AlertTriangle, ArrowRight, Check, ChevronRight, Loader2, Plus, Send, Users } from "lucide-react";
import type { ActivityKind, Contact } from "@/lib/types";
import type { Entity } from "@/lib/entities";
import { CONTACT_STATUS_LABEL, cn } from "@/lib/utils";
import { addActivity, type ContactFormState } from "@/actions/contacts";
import { attachExistingContact, findSimilar, type SimilarResult } from "@/actions/contacts-smart";
import { Avatar, buttonClass, Card, Field, Input, Kbd, LinkButton, SectionTitle, Select, Textarea } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";
import { formatPhone, parseTags, SOURCES, TAG_SUGGESTIONS } from "./helpers";

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
  // Les détails sont ouverts d'office si la fiche en contient déjà
  const hasDetails = !!(contact && (contact.sex || contact.birth_date || contact.source || contact.tags.length || contact.notes));

  const addTag = (t: string) => setTags((v) => (v.trim() ? `${v.replace(/[,\s]+$/, "")}, ${t}` : t));

  // Doublons en direct : nom (≥ 3 lettres) ou téléphone (≥ 6 chiffres)
  const [name, setName] = useState(contact?.full_name ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const similar = useSimilar(name, phone, contact);
  const blocked = !!similar && (similar.hits.some((h) => h.samePhone) || similar.phoneElsewhere);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        // Envoi manuel : les champs ne sont pas vidés si le serveur renvoie une erreur
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {state?.error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-medium">{state.error}</p>
            {state.duplicate && (
              <Link href={`/contacts/${state.duplicate.id}`} className="mt-1 inline-flex items-center gap-1 font-medium text-red-700 underline underline-offset-2">
                Ouvrir la fiche de {state.duplicate.name} <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
        </div>
      )}

      <Card className="p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Nom complet *" className="sm:col-span-2">
            <Input name="full_name" required autoFocus={!contact} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Salma Bennani" autoComplete="off" />
          </Field>
          <Field label="Téléphone" hint="Sert aussi à détecter les doublons">
            <Input name="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="06 12 34 56 78" />
          </Field>
          {similar && (similar.hits.length > 0 || similar.phoneElsewhere) && (
            <SimilarPanel result={similar} creating={!contact} entityIds={checked} className="sm:col-span-2" />
          )}
          <Field label="E-mail">
            <Input name="email" type="email" defaultValue={contact?.email ?? ""} placeholder="nom@gmail.com" />
          </Field>
          <Field label="Statut">
            <Select name="status" defaultValue={contact?.status ?? "prospect"}>
              {(["client", "prospect", "ancien"] as const).map((s) => (
                <option key={s} value={s}>
                  {CONTACT_STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ville">
            <Input name="city" defaultValue={contact?.city ?? "Agadir"} list="contact-cities" />
            <datalist id="contact-cities">
              {["Agadir", "Inezgane", "Aourir", "Dcheira", "Tikiouine", "Anza", "Ait Melloul", "Taghazout"].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>

        <fieldset className="mt-6">
          <legend className="mb-2 text-[13px] font-medium text-slate-700">Établissements fréquentés</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
            {entities.map((e) => {
              const on = checked.includes(e.id);
              return (
                <label
                  key={e.id}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40",
                    on ? "border-brand-500 bg-brand-50/50" : "border-line bg-white hover:border-slate-300",
                  )}
                >
                  <input
                    type="checkbox"
                    name="entity_ids"
                    value={e.id}
                    checked={on}
                    onChange={(ev) => setChecked((v) => (ev.target.checked ? [...v, e.id] : v.filter((x) => x !== e.id)))}
                    className="sr-only"
                  />
                  <span className="size-2 shrink-0 rounded-full" style={{ background: e.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{e.short}</span>
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded border", on ? "border-brand-500 bg-brand-500 text-white" : "border-slate-300 bg-white")}>
                    {on && <Check className="size-3" strokeWidth={3} />}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {showGuardian ? (
          <Field label="Nom du parent" hint="Pour les enfants inscrits à Moov'Up Kids" className="mt-4 sm:max-w-sm">
            <Input name="guardian_name" defaultValue={contact?.guardian_name ?? ""} placeholder="Ex. : Nadia Alaoui" />
          </Field>
        ) : (
          <input type="hidden" name="guardian_name" value="" />
        )}

        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="whatsapp_optin" defaultChecked={contact ? contact.whatsapp_optin : true} className="mt-0.5 size-4" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Accepte les messages WhatsApp</span>
            <span className="block text-xs text-muted">Rappels de rendez-vous, offres et campagnes.</span>
          </span>
        </label>

        <details className="group mt-6 border-t border-line pt-4" open={hasDetails}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded text-[13px] font-medium text-slate-700 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 text-slate-400 transition group-open:rotate-90" />
            Plus d&apos;informations
            <span className="font-normal text-muted">· sexe, naissance, origine, tags, notes</span>
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
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
            <Field label="Nous a connus via">
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
          <SectionTitle>Tags</SectionTitle>
          <Field label="Tags" hint="Séparés par des virgules">
            <Input name="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="VIP, Parrain…" />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TAG_SUGGESTIONS.filter((t) => !current.includes(t.toLowerCase())).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => addTag(t)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
              >
                <Plus className="size-3" /> {t}
              </button>
            ))}
          </div>
          <Field label="Notes internes" className="mt-4">
            <Textarea name="notes" defaultValue={contact?.notes ?? ""} placeholder="Préférences, disponibilités, informations utiles…" />
          </Field>
        </details>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <LinkButton href={cancelHref} variant="secondary">
          Annuler
        </LinkButton>
        {blocked && <p className="w-full text-right text-[13px] text-amber-700 sm:w-auto sm:self-center">Ce numéro est déjà enregistré : utilisez la fiche existante ou corrigez le numéro.</p>}
        <button type="submit" disabled={pending || blocked} className={buttonClass("brand")}>
          {pending && <Loader2 className="animate-spin" />}
          {pending ? "Enregistrement…" : contact ? "Enregistrer" : "Créer le contact"}
        </button>
      </div>
    </form>
  );
}

/* ---------- Doublons en direct ---------- */

/** Recherche (avec délai) des fiches proches du nom et du téléphone saisis */
function useSimilar(name: string, phone: string, contact?: Contact | null) {
  const [result, setResult] = useState<SimilarResult | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    // En modification, on ne cherche que si la valeur a changé
    const n = contact && name.trim() === contact.full_name ? "" : name;
    const p = contact && phone.replace(/\D/g, "") === (contact.phone ?? "").replace(/\D/g, "") ? "" : phone;
    const letters = n.replace(/[^\p{L}]/gu, "").length;
    const digits = p.replace(/\D/g, "").length;
    const id = ++seq.current;
    const search = letters >= 3 || digits >= 6;
    const timer = setTimeout(
      async () => {
        if (!search) {
          if (id === seq.current) setResult(null);
          return;
        }
        try {
          const r = await findSimilar({ name: letters >= 3 ? n : "", phone: digits >= 6 ? p : "", exceptId: contact?.id });
          if (id === seq.current) setResult(r);
        } catch {
          /* réseau indisponible : pas de suggestion */
        }
      },
      search ? 300 : 0,
    );
    return () => clearTimeout(timer);
  }, [name, phone, contact]);
  return result;
}

function SimilarPanel({ result, creating, entityIds, className }: { result: SimilarResult; creating: boolean; entityIds: string[]; className?: string }) {
  const [pending, start] = useTransition();
  const samePhone = result.hits.find((h) => h.samePhone);
  const warn = !!samePhone || result.phoneElsewhere;
  const n = result.hits.length;
  return (
    <div role="status" aria-live="polite" className={cn("rounded-lg border", warn ? "border-amber-200 bg-amber-50/60" : "border-line bg-slate-50/60", className)}>
      <p className="flex items-center gap-2 px-3.5 pt-3 text-[13px] font-medium text-ink">
        {warn ? <AlertTriangle className="size-4 shrink-0 text-amber-600" /> : <Users className="size-4 shrink-0 text-slate-400" />}
        {samePhone
          ? `Ce numéro est déjà celui de ${samePhone.full_name}`
          : result.phoneElsewhere
            ? "Ce numéro est déjà enregistré dans un autre établissement du groupe"
            : n > 1
              ? `${n} fiches proches existent déjà`
              : "Une fiche proche existe déjà"}
      </p>
      {result.phoneElsewhere && !samePhone && <p className="px-3.5 pt-1 text-xs text-muted">Demandez à la direction de vous donner accès à cette fiche plutôt que d&apos;en créer une seconde.</p>}
      {n > 0 ? (
        <ul className="mt-2 divide-y divide-line border-t border-line">
          {result.hits.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2">
              <Avatar name={h.full_name} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink">{h.full_name}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-muted">
                  {formatPhone(h.phone) ?? "Sans téléphone"}
                  <EntityDots ids={h.entity_ids} />
                  {h.samePhone && <span className="font-medium text-amber-700">même numéro</span>}
                </span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                <Link href={`/contacts/${h.id}`} target="_blank" className={buttonClass("ghost", "h-9 px-2.5")}>
                  Ouvrir
                </Link>
                {creating && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => start(() => attachExistingContact(h.id, entityIds))}
                    className={buttonClass(h.samePhone ? "brand" : "secondary", "h-9 px-2.5")}
                  >
                    {pending && <Loader2 className="animate-spin" />} Utiliser cette fiche
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="h-3" />
      )}
    </div>
  );
}

/* ---------- Notes rapides de l'historique (utilisé par timeline.tsx) ---------- */

const NOTE_KINDS: { id: ActivityKind; label: string }[] = [
  { id: "note", label: "Note" },
  { id: "appel", label: "Appel" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "E-mail" },
  { id: "visite", label: "Visite" },
];

/** Modèles en un clic : type d'échange + texte (le curseur se place à la fin) */
const TEMPLATES: { label: string; kind: ActivityKind; body: string }[] = [
  { label: "A appelé", kind: "appel", body: "A appelé." },
  { label: "Absent, à relancer", kind: "appel", body: "Absent, à relancer." },
  { label: "Intéressé par l'offre", kind: "note", body: "Intéressé(e) par l'offre." },
  { label: "Paiement promis le…", kind: "note", body: "Paiement promis le " },
  { label: "Satisfait", kind: "note", body: "Client satisfait." },
];

/** Saisie d'un échange : modèles en un clic, Entrée pour envoyer, Maj + Entrée pour aller à la ligne */
export function ActivityComposer({ contactId, entities, defaultEntity }: { contactId: string; entities: { id: string; short: string }[]; defaultEntity: string | null }) {
  const [kind, setKind] = useState<ActivityKind>("note");
  const [body, setBody] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(async (prev: { error?: string } | undefined, fd: FormData) => {
    const r = await addActivity(contactId, prev, fd);
    if (!r?.error) setBody("");
    return r;
  }, undefined);

  const applyTemplate = (t: (typeof TEMPLATES)[number]) => {
    setKind(t.kind);
    setBody((v) => (v.trim() ? `${v.replace(/\s+$/, "")} ${t.body}` : t.body));
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };

  const send = () => {
    if (pending || !body.trim() || !formRef.current) return;
    const fd = new FormData(formRef.current);
    startTransition(() => formAction(fd));
  };

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {state?.error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> {state.error}
        </p>
      )}
      <fieldset>
        <legend className="sr-only">Type d&apos;échange</legend>
        <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-slate-100 p-0.5">
          {NOTE_KINDS.map((k) => (
            <label key={k.id} className="cursor-pointer">
              <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} className="peer sr-only" />
              <span className="inline-flex h-8 items-center rounded-md px-2.5 text-[13px] font-medium text-slate-500 transition hover:text-ink peer-checked:bg-white peer-checked:text-ink peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40">
                {k.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Notes rapides">
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => applyTemplate(t)}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-slate-300 px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          >
            <Plus className="size-3" /> {t.label}
          </button>
        ))}
      </div>
      <Textarea
        ref={area}
        name="body"
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        aria-label="Contenu de l'échange"
        placeholder="Ex. : Appelée pour la relance, rappeler samedi matin."
        className="min-h-[76px]"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {entities.length > 1 ? (
          <span className="min-w-0 max-w-[220px] flex-1">
            <Select name="entity_id" aria-label="Établissement" defaultValue={defaultEntity ?? entities[0]!.id} className="h-9">
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.short}
                </option>
              ))}
            </Select>
          </span>
        ) : (
          <input type="hidden" name="entity_id" value={entities[0]?.id ?? ""} />
        )}
        <span className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-muted sm:inline">
            <Kbd>Entrée</Kbd> envoyer · <Kbd>Maj</Kbd> + <Kbd>Entrée</Kbd> à la ligne
          </span>
          <button type="submit" disabled={pending || !body.trim()} className={buttonClass("brand")}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Ajouter
          </button>
        </span>
      </div>
    </form>
  );
}
