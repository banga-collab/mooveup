import Link from "next/link";
import { ClipboardList, MessageCircle, PackageCheck, Send, Trash2, X } from "lucide-react";
import { entity } from "@/lib/entities";
import { cn, fmtDate, mad, waLink } from "@/lib/utils";
import { ORDER_STATUS_LABEL, type OrderStatus, type PurchaseOrder, type Supplier } from "@/lib/types-ops";
import { createOrder, deleteOrder, markOrderSent, receiveOrder } from "@/actions/stock";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, CardHeader, Empty, Field, Input, LinkButton, Segmented, Select, Textarea, buttonClass } from "@/components/ui";
import { ListToolbar } from "@/components/list-toolbar";
import { matchesQuery } from "@/lib/search-match";
import { one } from "@/components/data-table/match";
import { NoResults, ResultCount, clearHref, entityFilter, readSort, sortRows } from "@/components/reports/list-kit";
import { EntityBadge } from "@/components/entity-icon";
import { ConfirmSubmit } from "./confirm-submit";
import { suggestedQty, type ProductRow } from "./lib";

const TONE: Record<OrderStatus, "gray" | "brand" | "green"> = { brouillon: "gray", envoyee: "brand", recue: "green" };

type SP = Record<string, string | string[] | undefined>;
const FILTERS = ["q", "statut", "etab", "fournisseur_f", "tri"];

export function OrdersTab({
  sp,
  orders,
  suppliers,
  rows,
  entities,
  newEntity,
  newSupplier,
  status,
  canWrite,
}: {
  sp: SP;
  orders: PurchaseOrder[];
  suppliers: Supplier[];
  rows: ProductRow[];
  entities: { id: string; short: string }[];
  newEntity: string | null;
  newSupplier: string | null;
  status: string;
  canWrite: boolean;
}) {
  const sup = new Map(suppliers.map((s) => [s.id, s]));
  const q = one(sp.q);
  const fEtab = one(sp.etab);
  const fSup = one(sp.fournisseur_f);
  const sort = readSort(sp, ["recentes", "anciennes", "montant"] as const, "recentes");
  const byStatus = orders.filter((o) => status === "tout" || (status === "encours" ? o.status !== "recue" : o.status === status));
  const list = sortRows(
    byStatus.filter(
      (o) =>
        (!fEtab || o.entity_id === fEtab) &&
        (!fSup || o.supplier_id === fSup) &&
        matchesQuery(q, o.number, o.notes, o.total_mad, o.supplier_id ? sup.get(o.supplier_id)?.name : "Sans fournisseur", ...(o.lines ?? []).map((l) => l.label), ORDER_STATUS_LABEL[o.status]),
    ),
    (o) => (sort.key === "montant" ? Number(o.total_mad) : o.created_at),
    sort.key === "anciennes" ? "asc" : "desc",
  );
  const filtered = !!(q || fEtab || fSup);
  const usedSuppliers = suppliers.filter((s) => orders.some((o) => o.supplier_id === s.id));
  const counts = { encours: orders.filter((o) => o.status !== "recue").length, recue: orders.filter((o) => o.status === "recue").length, tout: orders.length };

  return (
    <div className="space-y-6">
      {canWrite && newEntity && <OrderForm entityId={newEntity} supplierId={newSupplier} suppliers={suppliers} rows={rows} entities={entities} />}

      {orders.length > 0 && (
        <ListToolbar
          className="mb-0"
          placeholder="N° de bon, fournisseur, produit…"
          filters={[
            { param: "statut", label: `En cours ${counts.encours}`, options: [{ value: "recue", label: "Reçues", count: counts.recue }, { value: "tout", label: "Toutes", count: counts.tout }] },
            ...entityFilter(entities),
            ...(usedSuppliers.length > 1 && usedSuppliers.length <= 8 ? [{ param: "fournisseur_f", label: "Tous fournisseurs", options: usedSuppliers.map((s) => ({ value: s.id, label: s.name })) }] : []),
            { param: "tri", label: "Récentes", options: [{ value: "anciennes", label: "Anciennes" }, { value: "montant", label: "Montant" }] },
          ]}
          right={<ResultCount shown={list.length} total={byStatus.length} filtered={filtered} unit="commande" />}
        />
      )}

      {!list.length && filtered ? (
        <Card>
          <NoResults q={q} href={clearHref("/stock", sp, FILTERS.filter((f) => f !== "statut"))} what="commande" />
        </Card>
      ) : list.length ? (
        <Card>
          <ul className="divide-y divide-line">
            {list.map((o) => {
              const s = o.supplier_id ? sup.get(o.supplier_id) : undefined;
              const e = entity(o.entity_id);
              const text = [`Bonjour${s?.contact_name ? ` ${s.contact_name}` : ""},`, `Voici la commande ${o.number} pour ${e?.name ?? "Moov'Up"} (Agadir) :`, ...(o.lines ?? []).map((l) => `- ${l.qty} × ${l.label}`), "", "Merci de nous confirmer le délai de livraison."].join("\n");
              const wa = s ? waLink(s.phone, text) : null;
              return (
                <li key={o.id}>
                  <details className="group" open={o.status === "brouillon" && list.length <= 3}>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-slate-50/70 [&::-webkit-details-marker]:hidden">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          <span className="tabular-nums">{o.number}</span> · {s?.name ?? "Sans fournisseur"}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                          <EntityBadge id={o.entity_id} />
                          <span>
                            {o.status === "recue" && o.received_at ? `Reçue le ${fmtDate(o.received_at)}` : o.status === "envoyee" && o.sent_at ? `Envoyée le ${fmtDate(o.sent_at)}` : `Créée le ${fmtDate(o.created_at)}`}
                          </span>
                          <span>
                            · {(o.lines ?? []).length} ligne{(o.lines ?? []).length > 1 ? "s" : ""}
                          </span>
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-ink">{mad(Number(o.total_mad))}</span>
                      <Badge tone={TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                    </summary>
                    <div className="border-t border-line bg-slate-50/50 px-5 py-3">
                      <ul className="space-y-1.5 text-[13px]">
                        {(o.lines ?? []).map((l) => (
                          <li key={l.item_id} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-ink">
                              <span className="tabular-nums text-muted">{l.qty} ×</span> {l.label}
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-600">{mad(l.qty * l.unit_cost_mad)}</span>
                          </li>
                        ))}
                      </ul>
                      {o.notes && <p className="mt-2 text-[13px] text-muted">{o.notes}</p>}
                      {canWrite && o.status !== "recue" && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {o.status === "brouillon" && wa && (
                            <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("secondary", "h-8")}>
                              <MessageCircle /> Envoyer par WhatsApp
                            </a>
                          )}
                          {o.status === "brouillon" && (
                            <form action={markOrderSent.bind(null, o.id)}>
                              <button type="submit" className={buttonClass(wa ? "ghost" : "secondary", "h-8")}>
                                <Send /> Marquer envoyée
                              </button>
                            </form>
                          )}
                          <form action={receiveOrder.bind(null, o.id)}>
                            <ConfirmSubmit message={`Réceptionner ${o.number} ? Les ${(o.lines ?? []).reduce((a, l) => a + l.qty, 0)} articles seront ajoutés au stock.`} variant="brand" className="h-8">
                              <PackageCheck /> Réceptionner
                            </ConfirmSubmit>
                          </form>
                          <form action={deleteOrder.bind(null, o.id)} className="ml-auto">
                            <ConfirmSubmit message={`Supprimer le bon ${o.number} ?`} variant="ghost" className="h-8 text-slate-500 hover:text-red-600">
                              <Trash2 /> Supprimer
                            </ConfirmSubmit>
                          </form>
                        </div>
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : (
        <Card>
          <Empty
            icon={<ClipboardList />}
            title={status === "encours" ? "Aucune commande en cours" : "Aucune commande"}
            text="Préparez un bon de commande : les produits sous le seuil sont pré-remplis."
            action={canWrite && entities[0] ? <LinkButton href={`/stock?onglet=commandes&nouveau=${entities[0].id}`} variant="brand">Nouvelle commande</LinkButton> : undefined}
          />
        </Card>
      )}
    </div>
  );
}

function OrderForm({ entityId, supplierId, suppliers, rows, entities }: { entityId: string; supplierId: string | null; suppliers: Supplier[]; rows: ProductRow[]; entities: { id: string; short: string }[] }) {
  const products = rows.filter((r) => r.item.entity_id === entityId);
  const options = suppliers.filter((s) => !s.entity_ids?.length || s.entity_ids.includes(entityId as never));
  // Fournisseur par défaut : celui demandé, sinon celui du plus grand nombre de produits en alerte
  const votes = new Map<string, number>();
  for (const r of products) if (r.low && r.supplier) votes.set(r.supplier.id, (votes.get(r.supplier.id) ?? 0) + 1);
  const chosen = (supplierId && options.some((s) => s.id === supplierId) ? supplierId : [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]) ?? "";
  const prefill = (r: ProductRow) => r.low && (!chosen || !r.supplier || r.supplier.id === chosen);
  const withEntities = entities.filter((e) => rows.some((r) => r.item.entity_id === e.id));

  return (
    <Card>
      <CardHeader
        title={`Nouveau bon de commande · ${entity(entityId)?.short ?? ""}`}
        subtitle="Quantités pré-remplies pour les produits sous le seuil d'alerte"
        action={
          <Link href="/stock?onglet=commandes" className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Fermer">
            <X className="size-4" />
          </Link>
        }
      />
      {withEntities.length > 1 && (
        <div className="px-5 pb-3">
          <Segmented items={withEntities.map((e) => ({ id: e.id, label: e.short, href: `/stock?onglet=commandes&nouveau=${e.id}` }))} active={entityId} />
        </div>
      )}
      {products.length ? (
        <ActionForm action={createOrder} className="border-t border-line">
          <input type="hidden" name="entity_id" value={entityId} />
          <div className="grid gap-3 p-5 pb-3 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Fournisseur">
              <Select name="supplier_id" defaultValue={chosen}>
                <option value="">Sans fournisseur</option>
                {options.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Note pour le fournisseur">
              <Textarea name="notes" placeholder="Livraison souhaitée, conditions…" className="h-10 min-h-10" />
            </Field>
          </div>
          <ul className="divide-y divide-line border-t border-line">
            {products.map((r) => (
              <li key={r.item.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.item.name}</p>
                  <p className={cn("text-xs", r.low ? "text-accent-600" : "text-muted")}>
                    Stock <span className="tabular-nums">{r.stock}</span> · seuil <span className="tabular-nums">{r.alert}</span>
                    {r.supplier && <span className="text-muted"> · {r.supplier.name}</span>}
                  </p>
                </div>
                <label className="flex flex-col items-end">
                  <span className="mb-0.5 text-[11px] text-muted">Qté</span>
                  <Input name={`qty_${r.item.id}`} inputMode="numeric" defaultValue={prefill(r) ? suggestedQty(r) : ""} placeholder="0" className="h-9 w-16 px-2 text-right tabular-nums" />
                </label>
                <label className="flex flex-col items-end">
                  <span className="mb-0.5 text-[11px] text-muted">Prix achat</span>
                  <Input name={`cost_${r.item.id}`} inputMode="decimal" defaultValue={r.hasCost ? r.cost : ""} placeholder="MAD" className="h-9 w-20 px-2 text-right tabular-nums" />
                </label>
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-line px-5 py-3">
            <SubmitButton variant="brand">Créer le bon de commande</SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <p className="border-t border-line px-5 py-4 text-[13px] text-muted">Aucun produit dans cet établissement.</p>
      )}
    </Card>
  );
}
