"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { ActionForm, type FormState } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Field, Input } from "@/components/ui";
import { CATALOG_KIND_LABEL, cn } from "@/lib/utils";
import type { CatalogItem, CatalogKind } from "@/lib/types";
import { KIND_META, KIND_ORDER } from "@/components/sales/meta";

const KIND_HINT: Record<CatalogKind, string> = {
  abonnement: "Accès pendant une durée",
  pack: "Un nombre de séances",
  prestation: "Soin ou service sur RDV",
  produit: "Article vendu en boutique",
};

const choice =
  "rounded-lg border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40";

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
      {entities.length > 1 && (
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">Établissement</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Établissement">
            {entities.map((e) => {
              const on = e.id === entityId;
              return (
                <button
                  key={e.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setEntityId(e.id)}
                  className={cn(choice, "inline-flex h-9 items-center gap-2 px-3 text-[13px] font-medium", on ? "border-brand-500 bg-brand-50 text-ink ring-1 ring-brand-500" : "border-line bg-white text-slate-600 hover:border-slate-300")}
                >
                  <span className="size-2 rounded-full" style={{ background: e.color }} />
                  {e.short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Type */}
      <div>
        <p className="mb-1.5 text-[13px] font-medium text-slate-700">Type d&apos;article</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0" role="radiogroup" aria-label="Type d'article">
          {KIND_ORDER.map((k) => {
            const I = KIND_META[k].icon;
            const on = k === kind;
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(k)}
                className={cn(choice, "p-3", on ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-line bg-white hover:border-slate-300")}
              >
                <I className={cn("size-4", on ? "text-brand-600" : "text-slate-400")} />
                <span className="mt-2 block text-[13px] font-semibold text-ink">{CATALOG_KIND_LABEL[k]}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted">{KIND_HINT[k]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        <Field label="Nom" className="sm:col-span-2">
          <Input
            name="name"
            required
            defaultValue={item?.name ?? ""}
            placeholder={kind === "abonnement" ? "Ex. Mensuel Musculation" : kind === "pack" ? "Ex. Pack 10 séances coaching" : kind === "prestation" ? "Ex. Massage relaxant 60 min" : "Ex. Huile d'argan 100 ml"}
          />
        </Field>
        <Field label="Prix (MAD)">
          <Input name="price_mad" inputMode="decimal" required defaultValue={item ? String(item.price_mad) : ""} placeholder="0" className="tabular-nums" />
        </Field>
        <Field label="Catégorie" hint="Sert aux filtres de la caisse">
          <Input name="category" list="catalog-categories" defaultValue={item?.category ?? ""} placeholder="Ex. Boutique, Massage…" />
          <datalist id="catalog-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
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
            <Field label="Validité (jours)" hint="Vide = 90 jours">
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
          <Field label="Stock" hint="Vide = non suivi. Décrémenté à chaque vente.">
            <Input name="stock" inputMode="numeric" defaultValue={item ? (item.stock ?? "") : 10} />
          </Field>
        )}
      </div>

      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line px-4 py-3">
        <input type="checkbox" name="active" defaultChecked={item?.active ?? true} className="size-4" />
        <span>
          <span className="block text-[13px] font-medium text-ink">Article actif</span>
          <span className="block text-xs text-muted">Visible et vendable à la caisse</span>
        </span>
      </label>

      <div className="flex justify-end border-t border-line pt-4">
        <SubmitButton variant="brand">
          <Save /> {item ? "Enregistrer" : "Ajouter l'article"}
        </SubmitButton>
      </div>
    </ActionForm>
  );
}
