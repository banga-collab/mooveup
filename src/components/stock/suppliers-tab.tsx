import Link from "next/link";
import { Mail, MessageCircle, Phone, Plus, SquarePen, Trash2, Truck, X } from "lucide-react";
import { waLink } from "@/lib/utils";
import type { Supplier } from "@/lib/types-ops";
import { deleteSupplier, saveSupplier } from "@/actions/stock";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Card, CardHeader, Empty, Field, Input, LinkButton, Textarea } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { NoResults, ResultCount, clearHref, entityFilter, readSort, sortRows } from "@/components/reports/list-kit";
import { ConfirmSubmit } from "./confirm-submit";
import type { ProductRow } from "./lib";

type SP = Record<string, string | string[] | undefined>;
const FILTERS = ["q", "etab", "tri"];

export function SuppliersTab({
  sp,
  suppliers: all,
  rows,
  entities,
  editing,
  creating,
  canWrite,
}: {
  sp: SP;
  suppliers: Supplier[];
  rows: ProductRow[];
  entities: { id: string; short: string; color: string }[];
  editing: Supplier | null;
  creating: boolean;
  canWrite: boolean;
}) {
  const productName = new Map(rows.map((r) => [r.item.id, r.item.name]));
  const showForm = canWrite && (creating || editing || !all.length);
  const q = one(sp.q);
  const fEtab = one(sp.etab);
  const sort = readSort(sp, ["nom", "produits", "recents"] as const, "nom");
  const filtered = !!(q || fEtab);
  const suppliers = sortRows(
    all.filter(
      (s) =>
        (!fEtab || (s.entity_ids ?? []).includes(fEtab as never)) &&
        matchesQuery(q, s.name, s.contact_name, s.city, s.phone, s.email, s.notes, ...(s.product_ids ?? []).map((id) => productName.get(id))),
    ),
    (s) => (sort.key === "produits" ? -(s.product_ids ?? []).length : sort.key === "recents" ? -Date.parse(s.created_at ?? "") || 0 : s.name),
    "asc",
  );

  return (
    <div className="space-y-6">
      {showForm && <SupplierForm supplier={editing} rows={rows} entities={entities} />}

      {all.length > 0 && (
        <ListToolbar
          className="mb-0"
          placeholder="Nom, contact, téléphone, produit…"
          filters={[
            ...entityFilter(entities, Object.fromEntries(entities.map((e) => [e.id, all.filter((s) => (s.entity_ids ?? []).includes(e.id as never)).length]))),
            { param: "tri", label: "A → Z", options: [{ value: "produits", label: "Plus de produits" }, { value: "recents", label: "Récents" }] },
          ]}
          right={<ResultCount shown={suppliers.length} total={all.length} filtered={filtered} unit="fournisseur" />}
        />
      )}

      {all.length > 0 && !suppliers.length ? (
        <Card>
          <NoResults q={q} href={clearHref("/stock", sp, FILTERS)} what="fournisseur" />
        </Card>
      ) : suppliers.length ? (
        <ul className="grid gap-4 md:grid-cols-2 [&>*]:min-w-0">
          {suppliers.map((s) => {
            const wa = waLink(s.phone, `Bonjour ${s.contact_name ?? ""}, `.replace("  ", " "));
            const products = (s.product_ids ?? []).map((id) => productName.get(id)).filter(Boolean) as string[];
            const mainEntity = s.entity_ids?.find((e) => entities.some((x) => x.id === e));
            return (
              <li key={s.id}>
                <Card className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                      <p className="mt-0.5 truncate text-[13px] text-muted">
                        {[s.contact_name, s.city].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <EntityDots ids={s.entity_ids ?? []} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
                    {s.phone && (
                      <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-ink">
                        <Phone className="size-3.5 text-slate-400" /> <span className="tabular-nums">{s.phone}</span>
                      </a>
                    )}
                    {wa && (
                      <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:underline">
                        <MessageCircle className="size-3.5" /> WhatsApp
                      </a>
                    )}
                    {s.email && (
                      <a href={`mailto:${s.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-slate-600 hover:text-ink">
                        <Mail className="size-3.5 shrink-0 text-slate-400" /> <span className="truncate">{s.email}</span>
                      </a>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {products.length ? (
                      products.map((p) => (
                        <span key={p} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          {p}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-muted">Aucun produit rattaché</span>
                    )}
                  </div>
                  {s.notes && <p className="mt-3 text-[13px] text-muted">{s.notes}</p>}

                  {canWrite && (
                    <div className="mt-4 flex flex-1 flex-wrap items-end gap-1">
                      <div className="flex w-full flex-wrap items-center gap-1 border-t border-line pt-3">
                      {mainEntity && (
                        <LinkButton href={`/stock?onglet=commandes&nouveau=${mainEntity}&fournisseur=${s.id}`} variant="secondary" className="h-8">
                          <Truck /> Commander
                        </LinkButton>
                      )}
                      <Link href={`/stock?onglet=fournisseurs&modifier=${s.id}`} className="ml-auto grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Modifier" title="Modifier">
                        <SquarePen className="size-4" />
                      </Link>
                      <form action={deleteSupplier.bind(null, s.id)}>
                        <ConfirmSubmit message={`Supprimer le fournisseur « ${s.name} » ?`} variant="ghost" className="size-8 px-0 text-slate-400 hover:text-red-600">
                          <Trash2 />
                          <span className="sr-only">Supprimer</span>
                        </ConfirmSubmit>
                      </form>
                      </div>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : (
        !showForm && (
          <Card>
            <Empty icon={<Truck />} title="Aucun fournisseur" text="Ajoutez vos fournisseurs pour préparer les commandes en un clic." />
          </Card>
        )
      )}
    </div>
  );
}

function SupplierForm({ supplier: s, rows, entities }: { supplier: Supplier | null; rows: ProductRow[]; entities: { id: string; short: string; color: string }[] }) {
  return (
    <Card>
      <CardHeader
        title={s ? `Modifier ${s.name}` : "Nouveau fournisseur"}
        action={
          <Link href="/stock?onglet=fournisseurs" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Fermer">
            <X className="size-4" />
          </Link>
        }
      />
      <ActionForm action={saveSupplier.bind(null, s?.id ?? null)} className="space-y-4 border-t border-line p-5">
        <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
          <Field label="Nom">
            <Input name="name" defaultValue={s?.name} required placeholder="Ex. Atlas Nutrition" />
          </Field>
          <Field label="Contact">
            <Input name="contact_name" defaultValue={s?.contact_name ?? ""} placeholder="Nom de l'interlocuteur" />
          </Field>
          <Field label="Téléphone / WhatsApp">
            <Input name="phone" type="tel" defaultValue={s?.phone ?? ""} placeholder="06 00 00 00 00" />
          </Field>
          <Field label="Ville">
            <Input name="city" defaultValue={s?.city ?? ""} placeholder="Agadir" />
          </Field>
        </div>
        <div>
          <p className="mb-1.5 text-[13px] font-medium text-slate-700">Établissements</p>
          <div className="flex flex-wrap gap-2">
            {entities.map((e) => (
              <label key={e.id} className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 text-[13px] has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
                <input type="checkbox" name="entity_ids" value={e.id} defaultChecked={s ? s.entity_ids?.includes(e.id as never) : entities.length === 1} className="accent-brand-500" />
                <span className="size-2 rounded-full" style={{ background: e.color }} />
                {e.short}
              </label>
            ))}
          </div>
        </div>
        {rows.length > 0 && (
          <div>
            <p className="mb-1.5 text-[13px] font-medium text-slate-700">Produits fournis</p>
            <div className="flex flex-wrap gap-2">
              {rows.map((r) => (
                <label key={r.item.id} className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-line px-2.5 text-[13px] has-[:checked]:border-brand-300 has-[:checked]:bg-brand-50">
                  <input type="checkbox" name="product_ids" value={r.item.id} defaultChecked={s?.product_ids?.includes(r.item.id)} className="accent-brand-500" />
                  {r.item.name}
                </label>
              ))}
            </div>
          </div>
        )}
        <details>
          <summary className="cursor-pointer text-[13px] font-medium text-brand-600">E-mail et notes</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="E-mail">
              <Input name="email" type="email" defaultValue={s?.email ?? ""} />
            </Field>
            <Field label="Notes">
              <Textarea name="notes" defaultValue={s?.notes ?? ""} placeholder="Délais, minimum de commande…" className="min-h-10" />
            </Field>
          </div>
        </details>
        <SubmitButton variant="brand">
          <Plus /> {s ? "Enregistrer" : "Ajouter le fournisseur"}
        </SubmitButton>
      </ActionForm>
    </Card>
  );
}
