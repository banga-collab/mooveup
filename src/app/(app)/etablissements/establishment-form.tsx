"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input, LinkButton, Select, Textarea } from "@/components/ui";
import { ENTITY_ICON_MAP } from "@/components/entity-icon";
import { AUDIENCES, ENTITY_ICONS, KIND_LABEL, softOf, type Entity, type EntityIconName, type EntityKind } from "@/lib/entities";
import { cn } from "@/lib/utils";

const COLORS = ["#1a6d8e", "#d9467a", "#e9a213", "#c2410c", "#7c4dcc", "#b4774a", "#334155", "#0f766e", "#2563eb", "#16a34a", "#db2777", "#9333ea"];

const ICON_LABEL: Record<EntityIconName, string> = {
  Dumbbell: "Haltère",
  Flower2: "Fleur",
  Smile: "Sourire",
  Zap: "Éclair",
  Stethoscope: "Stéthoscope",
  Sparkles: "Étincelles",
  Scissors: "Ciseaux",
  Building2: "Bâtiment",
  Waves: "Vagues",
  Bike: "Vélo",
  HeartPulse: "Cœur",
  Baby: "Bébé",
  Trophy: "Trophée",
  Leaf: "Feuille",
  Gem: "Pierre",
  Coffee: "Café",
  Store: "Boutique",
  Activity: "Activité",
};

/** Formulaire d'établissement (ajout ou modification) avec aperçu */
export function EstablishmentForm({ action, initial, cancelHref }: { action: (s: FormState, fd: FormData) => Promise<FormState>; initial: Entity | null; cancelHref: string }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [short, setShort] = useState(initial?.short ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[7]!);
  const [icon, setIcon] = useState<EntityIconName>(initial?.icon ?? "Building2");
  const [tagline, setTagline] = useState(initial?.tagline ?? "");
  const I = ENTITY_ICON_MAP[icon];
  const label = short || name || "Nouvel établissement";

  return (
    <ActionForm action={action} className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px] [&>*]:min-w-0">
      <div className="space-y-5 rounded-xl border border-line bg-white p-5">
        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Nom complet">
            <Input name="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="ex. Moov'Up Founty" autoFocus={!initial} />
          </Field>
          <Field label="Nom court" hint="Affiché dans les menus et les badges">
            <Input name="short" value={short} onChange={(e) => setShort(e.target.value)} maxLength={32} placeholder={name || "ex. Founty"} />
          </Field>
          <Field label="Type d'activité">
            <Select name="kind" defaultValue={initial?.kind ?? "sport"}>
              {(Object.keys(KIND_LABEL) as EntityKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Public">
            <Select name="audience" defaultValue={initial?.audience ?? "Mixte"}>
              {AUDIENCES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Slogan">
          <Input name="tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={120} placeholder="ex. Fitness et piscine face à la mer" />
        </Field>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">Couleur</p>
          <input type="hidden" name="color" value={color} />
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Couleur">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn("grid size-9 place-items-center rounded-lg ring-offset-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40", c === color && "ring-2 ring-slate-400")}
                style={{ background: c }}
              >
                {c === color && <Check className="size-4 text-white" />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">Icône</p>
          <input type="hidden" name="icon" value={icon} />
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9" role="radiogroup" aria-label="Icône">
            {ENTITY_ICONS.map((n) => {
              const Ic = ENTITY_ICON_MAP[n];
              const on = n === icon;
              return (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={ICON_LABEL[n]}
                  aria-label={ICON_LABEL[n]}
                  onClick={() => setIcon(n)}
                  className={cn("grid h-10 place-items-center rounded-lg border transition", on ? "border-brand-500 bg-brand-50 text-brand-600" : "border-line text-slate-400 hover:border-slate-300 hover:text-ink")}
                >
                  <Ic className="size-4" />
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Activités" hint="Séparées par des virgules">
          <Textarea name="activities" rows={2} defaultValue={initial?.activities.join(", ") ?? ""} placeholder="ex. Musculation, Fitness, Piscine" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Adresse">
            <Input name="address" defaultValue={initial?.address ?? ""} maxLength={200} placeholder="ex. Bd du 20 Août, Agadir" />
          </Field>
          <Field label="Téléphone">
            <Input name="phone" type="tel" defaultValue={initial?.phone ?? ""} maxLength={30} placeholder="05 28 .. .. .." />
          </Field>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          <LinkButton href={cancelHref} variant="secondary">
            Annuler
          </LinkButton>
          <SubmitButton variant="brand" pendingText="Enregistrement…">
            {initial ? "Enregistrer" : "Ajouter l'établissement"}
          </SubmitButton>
        </div>
      </div>

      {/* Aperçu */}
      <aside className="space-y-3 lg:sticky lg:top-6">
        <p className="text-[13px] font-medium text-slate-700">Aperçu</p>
        <div className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: softOf(color), color }}>
              <I className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{name || "Nouvel établissement"}</p>
              <p className="truncate text-xs text-muted">{tagline || "Slogan"}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <span className="size-2 rounded-full" style={{ background: color }} />
              {label}
            </span>
          </div>
        </div>
        <p className="text-xs text-muted">Le nouvel établissement apparaît aussitôt dans le sélecteur du haut, la caisse, le stock et les rapports. Rattachez ensuite l&apos;équipe depuis la page Équipe.</p>
      </aside>
    </ActionForm>
  );
}
