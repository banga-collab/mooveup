"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { EntityIcon } from "@/components/entity-icon";
import { Field, Input } from "@/components/ui";
import { CATALOG_KIND_LABEL, cn } from "@/lib/utils";
import type { CatalogItem, CatalogKind } from "@/lib/types";
import { KIND_META, KIND_ORDER } from "@/components/sales/meta";

const KIND_HINT: Record<CatalogKind, string> = {
  abonnement: "Accès pendant une durée (mois, trimestre, année)",
  pack: "Un nombre de séances à consommer",
  prestation: "Un soin ou un service sur rendez-vous",
  produit: "Un article vendu en boutique",
};

export function CatalogForm({
  action,
  entities,
  item,
  defaultEntity,
  defaultKind,
  categories,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  entities: { id: string; short: string; color: string; soft: string }[];
  item?: CatalogItem | null;
  defaultEntity: string;
  defaultKind: CatalogKind;
  categories: string[];
}) {
  const [entityId, setEntityId] = useState<string>(item?.entity_id ?? defaultEntity);
  const [kind, setKind] = useState<CatalogKind>(item?.kind ?? defaultKind);

  return (
    <ActionForm action={action} className="space-y-6">
      <input type="hidden" name="entity_id" value={entityId} />
      <input type="hidden" name="kind" value={kind} />

      {/* Établissement */}
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-600">Établissement</p>
        <div className="flex flex-wrap gap-2">
          {entities.map((e) => {
            const on = e.id === entityId;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => setEntityId(e.id)}
                className={cn("inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition", on ? "text-white shadow-md" : "")}
                style={on ? { background: e.color } : { background: e.soft, color: e.color }}
              >
                <EntityIcon id={e.id} className="size-4" strokeWidth={2.3} />
                {e.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Type */}
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-600">Type d&apos;article</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
          {KIND_ORDER.map((k) => {
            const m = KIND_META[k];
            const I = m.icon;
            const on = k === kind;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn("rounded-2xl border p-3 text-left transition", on ? "shadow-md" : "border-line bg-white hover:border-slate-300")}
                style={on ? { borderColor: m.color, background: m.soft } : undefined}
              >
                <span className="grid size-9 place-items-center rounded-xl" style={{ background: on ? m.color : m.soft, color: on ? "#fff" : m.color }}>
                  <I className="size-[18px]" />
                </span>
                <span className="mt-2 block text-sm font-bold">{CATALOG_KIND_LABEL[k]}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{KIND_HINT[k]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Nom" className="sm:col-span-2">
          <Input name="name" required defaultValue={item?.name ?? ""} placeholder={kind === "abonnement" ? "Ex. Mensuel Musculation" : kind === "pack" ? "Ex. Pack 10 séances coaching" : kind === "prestation" ? "Ex. Massage relaxant 60 min" : "Ex. Huile d'argan 100 ml"} />
        </Field>
        <Field label="Catégorie" hint="Sert aux filtres de la caisse">
          <Input name="category" list="catalog-categories" defaultValue={item?.category ?? ""} placeholder="Ex. Boutique, Massage, Abonnements…" />
          <datalist id="catalog-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Prix (MAD)">
          <Input name="price_mad" inputMode="decimal" required defaultValue={item ? String(item.price_mad) : ""} placeholder="0" />
        </Field>

        {kind === "abonnement" && (
          <Field label="Durée de validité (jours)" hint="30 = mensuel, 90 = trimestriel, 365 = annuel">
            <Input name="duration_days" inputMode="numeric" required defaultValue={item?.duration_days ?? 30} />
          </Field>
        )}
        {kind === "pack" && (
          <>
            <Field label="Nombre de séances">
              <Input name="sessions_count" inputMode="numeric" required defaultValue={item?.sessions_count ?? 10} />
            </Field>
            <Field label="Validité (jours)" hint="Vide = 90 jours par défaut">
              <Input name="duration_days" inputMode="numeric" defaultValue={item?.duration_days ?? ""} placeholder="90" />
            </Field>
          </>
        )}
        {kind === "prestation" && (
          <Field label="Durée du rendez-vous (minutes)">
            <Input name="duration_min" inputMode="numeric" defaultValue={item?.duration_min ?? 60} />
          </Field>
        )}
        {kind === "produit" && (
          <Field label="Stock" hint="Vide = stock non suivi. Décrémenté à chaque vente.">
            <Input name="stock" inputMode="numeric" defaultValue={item ? (item.stock ?? "") : 10} />
          </Field>
        )}
      </div>

      <label className="flex items-center gap-3 rounded-2xl border border-line bg-canvas/50 px-4 py-3">
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="size-5 accent-brand-500" />
        <span>
          <span className="block text-sm font-semibold">Article actif</span>
          <span className="block text-xs text-muted">Visible et vendable à la caisse</span>
        </span>
      </label>

      <div className="flex justify-end">
        <SubmitButton className="h-11 rounded-2xl px-6">
          <Save className="size-4" /> {item ? "Enregistrer" : "Ajouter l'article"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
