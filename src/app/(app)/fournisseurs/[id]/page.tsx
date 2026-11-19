import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, Mail, MessageCircle, Phone, Plus, SquarePen } from "lucide-react";
import { requireManager, getScope } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { entity } from "@/lib/entities";
import { cn, dayKey, fmtDate, mad, waLink } from "@/lib/utils";
import { norm } from "@/lib/search-match";
import { EXPENSE_CATEGORY_LABEL, EXPENSE_METHOD_LABEL, type ExpenseCategory } from "@/lib/types-finance";
import { ORDER_STATUS_LABEL, type PurchaseOrder } from "@/lib/types-ops";
import type { ExpenseRow, SupplierFull } from "@/lib/types-business";
import { removeSupplierDocument, toggleSupplierActive } from "@/actions/suppliers";
import { Badge, Card, CardHeader, DescList, Empty, LinkButton, PageHeader, Segmented, buttonClass, tableClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { EntityBadge, EntityDots } from "@/components/entity-icon";
import { DeleteIconButton } from "@/components/finance/controls";
import { PERIODS, periodStart, type PeriodId } from "@/components/finance/supplier-period";

export const metadata = { title: "Fiche fournisseur" };

const monthLabel = (m: string) => new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" }).format(new Date(`${m}-15T00:00:00Z`)).replace(".", "");

export default async function FournisseurPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ periode?: string; vue?: string }> }) {
  await requireManager();
  const [{ id }, sp, scope] = await Promise.all([params, searchParams, getScope()]);
  const supabase = await createClient();
  const { data } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  const s = data as SupplierFull | null;
  const allowed = scope.allowed.map((e) => e.id as string);
  if (!s || ((s.entity_ids ?? []).length && !s.entity_ids.some((e) => allowed.includes(e)))) notFound();

  const [{ data: linked }, { data: byName }, { data: poRows }] = await Promise.all([
    supabase.from("expenses").select("*").in("entity_id", scope.ids).eq("supplier_id", id).order("date", { ascending: false }),
    supabase.from("expenses").select("*").in("entity_id", scope.ids).ilike("supplier", s.name).is("supplier_id", null),
    supabase.from("purchase_orders").select("*").in("entity_id", scope.ids).eq("supplier_id", id).order("created_at", { ascending: false }),
  ]);
  const seen = new Set<string>();
  const expenses = [...((linked ?? []) as ExpenseRow[]), ...((byName ?? []) as ExpenseRow[]).filter((x) => x.supplier && norm(x.supplier) === norm(s.name))]
    .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const orders = (poRows ?? []) as PurchaseOrder[];

  const today = dayKey();
  const period: PeriodId = PERIODS.some((p) => p.id === sp.periode) ? (sp.periode as PeriodId) : "12m";
  const from = periodStart(period, today);
  const inPeriod = expenses.filter((x) => x.date >= from);
  const total = inPeriod.reduce((a, x) => a + Number(x.amount_mad), 0);
  const allTime = expenses.reduce((a, x) => a + Number(x.amount_mad), 0);
  const last = expenses[0];
  const openOrders = orders.filter((o) => o.status !== "recue");

  // 12 derniers mois
  const months = Array.from({ length: 12 }, (_, i) => {
    const [y, m] = today.split("-").map(Number) as [number, number];
    return new Date(Date.UTC(y, m - 1 - (11 - i), 1)).toISOString().slice(0, 7);
  });
  const perMonth = new Map<string, number>();
  for (const x of expenses) if (x.date >= `${months[0]}-01`) perMonth.set(x.date.slice(0, 7), (perMonth.get(x.date.slice(0, 7)) ?? 0) + Number(x.amount_mad));
  const maxMonth = Math.max(1, ...perMonth.values());
  const perEntity = new Map<string, number>();
  for (const x of inPeriod) perEntity.set(x.entity_id, (perEntity.get(x.entity_id) ?? 0) + Number(x.amount_mad));

  const vue = sp.vue === "commandes" ? "commandes" : "depenses";
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    if (sp.periode) u.set("periode", sp.periode);
    if (sp.vue) u.set("vue", sp.vue);
    for (const [k, v] of Object.entries(patch)) {
      if (v) u.set(k, v);
      else u.delete(k);
    }
    const str = u.toString();
    return `/fournisseurs/${id}${str ? `?${str}` : ""}`;
  };
  const wa = waLink(s.whatsapp ?? s.phone, `Bonjour ${s.contact_name ?? ""}, ici le groupe Moov'Up Agadir. `.replace("  ", " "));
  const docs = s.documents ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        back={<BackLink href="/fournisseurs" label="Fournisseurs" />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {s.name}
            {s.active === false && <Badge tone="gray">Archivé</Badge>}
          </span>
        }
        subtitle={[s.legal_name, s.city, (s.categories ?? []).map((c) => EXPENSE_CATEGORY_LABEL[c as ExpenseCategory] ?? c).join(", ")].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                <MessageCircle /> WhatsApp
              </a>
            )}
            <LinkButton href={`/fournisseurs/${id}/modifier`} variant="secondary">
              <SquarePen /> Modifier
            </LinkButton>
            <LinkButton href={`/depenses?fournisseur=${id}#nouvelle`} variant="brand">
              <Plus /> Nouvelle dépense
            </LinkButton>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented items={PERIODS.map((p) => ({ id: p.id, label: p.label, href: q({ periode: p.id === "12m" ? null : p.id }) }))} active={period} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Card className="p-4">
          <p className="text-[13px] text-muted">Payé · {PERIODS.find((p) => p.id === period)!.label.toLowerCase()}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{mad(total)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {inPeriod.length} dépense{inPeriod.length > 1 ? "s" : ""}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-muted">Dernier achat</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{last ? fmtDate(last.date, { day: "numeric", month: "short" }) : "—"}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{last ? `${mad(Number(last.amount_mad))} · ${entity(last.entity_id)?.short ?? ""}` : "Aucune dépense"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-muted">Moyenne mensuelle</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{mad(Math.round([...perMonth.values()].reduce((a, v) => a + v, 0) / 12))}</p>
          <p className="mt-0.5 text-xs text-muted">sur 12 mois</p>
        </Card>
        <Card className="p-4">
          <p className="text-[13px] text-muted">Commandes en cours</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-ink">{openOrders.length}</p>
          <p className="mt-0.5 text-xs text-muted">{mad(openOrders.reduce((a, o) => a + Number(o.total_mad), 0))}</p>
        </Card>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">12 derniers mois</h3>
              <span className="text-xs text-muted">Total historique : {mad(allTime)}</span>
            </div>
            <div className="flex h-28 items-end gap-1.5" role="img" aria-label="Montants payés par mois">
              {months.map((m) => {
                const v = perMonth.get(m) ?? 0;
                return (
                  <div key={m} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${monthLabel(m)} : ${mad(v)}`}>
                    <div className="flex h-20 w-full items-end">
                      <div className={cn("w-full rounded-sm", v ? "bg-brand-500/80" : "bg-slate-100")} style={{ height: `${v ? Math.max(4, (v / maxMonth) * 100) : 4}%` }} />
                    </div>
                    <span className="truncate text-[10px] capitalize text-muted">{monthLabel(m)}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
              <Segmented
                items={[
                  { id: "depenses", label: "Dépenses", count: expenses.length, href: q({ vue: null }) },
                  { id: "commandes", label: "Bons de commande", count: orders.length, href: q({ vue: "commandes" }) },
                ]}
                active={vue}
              />
            </div>
            {vue === "depenses" ? (
              expenses.length ? (
                <div className="mt-3 overflow-x-auto">
                  <table className={tableClass}>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Détail</th>
                        <th className="!text-right">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.slice(0, 200).map((x) => (
                        <tr key={x.id} className={cn(x.date < from && "text-slate-400")}>
                          <td className="whitespace-nowrap">
                            <span className="tabular-nums">{fmtDate(x.date)}</span>
                            <span className="mt-0.5 block">
                              <EntityBadge id={x.entity_id} />
                            </span>
                          </td>
                          <td className="min-w-[180px]">
                            <span className="block text-ink">{x.note ?? EXPENSE_CATEGORY_LABEL[x.category]}</span>
                            <span className="block text-xs text-muted">
                              {EXPENSE_CATEGORY_LABEL[x.category]} · {EXPENSE_METHOD_LABEL[x.method] ?? x.method}
                              {!x.supplier_id && " · rattachée par le nom"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap text-right font-semibold tabular-nums">{mad(Number(x.amount_mad))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  icon={<Plus />}
                  title="Aucune dépense rattachée"
                  text="Les dépenses saisies avec ce fournisseur apparaîtront ici."
                  action={
                    <LinkButton href={`/depenses?fournisseur=${id}#nouvelle`} variant="brand">
                      <Plus /> Nouvelle dépense
                    </LinkButton>
                  }
                />
              )
            ) : orders.length ? (
              <div className="mt-3 overflow-x-auto">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th>Bon</th>
                      <th>Statut</th>
                      <th>Articles</th>
                      <th className="!text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id}>
                        <td className="whitespace-nowrap">
                          <span className="font-medium tabular-nums text-ink">{o.number}</span>
                          <span className="block text-xs text-muted">
                            {fmtDate(o.created_at)} · {entity(o.entity_id)?.short}
                          </span>
                        </td>
                        <td>
                          <Badge tone={o.status === "recue" ? "green" : o.status === "envoyee" ? "amber" : "gray"}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                        </td>
                        <td className="min-w-[160px] text-[13px] text-slate-600">{(o.lines ?? []).map((l) => `${l.qty} × ${l.label}`).join(", ")}</td>
                        <td className="whitespace-nowrap text-right font-semibold tabular-nums">{mad(Number(o.total_mad))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty icon={<Plus />} title="Aucun bon de commande" text="Les commandes de stock passées à ce fournisseur apparaîtront ici." action={<LinkButton href="/stock" variant="secondary">Aller au stock</LinkButton>} />
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Fiche</h3>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
              {s.phone && (
                <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 text-slate-600 hover:text-ink">
                  <Phone className="size-3.5 text-slate-400" /> <span className="tabular-nums">{s.phone}</span>
                </a>
              )}
              {s.email && (
                <a href={`mailto:${s.email}`} className="inline-flex min-w-0 items-center gap-1.5 text-slate-600 hover:text-ink">
                  <Mail className="size-3.5 shrink-0 text-slate-400" /> <span className="truncate">{s.email}</span>
                </a>
              )}
            </div>
            <DescList
              items={[
                ["Interlocuteur", s.contact_name ?? "—"],
                ["ICE", s.ice ? <span className="tabular-nums">{s.ice}</span> : "—"],
                ["Adresse", [s.address, s.city].filter(Boolean).join(", ") || "—"],
                ["Paiement", s.payment_terms ?? "—"],
                ["RIB", s.rib ? <span className="break-all tabular-nums">{s.rib.replace(/(\d{3})(\d{3})(\d{16})(\d{2})/, "$1 $2 $3 $4")}</span> : "—"],
                ["Établissements", (s.entity_ids ?? []).length ? <EntityDots ids={s.entity_ids} /> : "Tout le groupe"],
              ]}
            />
            {s.notes && <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-[13px] text-slate-600">{s.notes}</p>}
          </Card>

          {perEntity.size > 1 && (
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold text-ink">Par établissement</h3>
              <ul className="space-y-2 text-[13px]">
                {[...perEntity.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([e, v]) => (
                    <li key={e} className="flex items-center justify-between gap-3">
                      <EntityBadge id={e} />
                      <span className="font-semibold tabular-nums">{mad(v)}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Documents et photos" subtitle={docs.length ? `${docs.length} fichier${docs.length > 1 ? "s" : ""}` : "Devis, factures, cartes de visite…"} action={<Link href={`/fournisseurs/${id}/modifier`} className="text-brand-600 hover:underline">Ajouter</Link>} />
            {docs.length > 0 && (
              <ul className="grid grid-cols-3 gap-2 px-5 pb-5">
                {docs.map((d, i) => (
                  <li key={`${d.added_at}-${i}`} className="group relative">
                    <a href={`/fournisseurs/${id}/document/${i}`} target="_blank" rel="noreferrer" title={d.label ?? "Document"}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/fournisseurs/${id}/document/${i}`} alt={d.label ?? "Document"} loading="lazy" className="aspect-square w-full rounded-lg border border-line object-cover" />
                    </a>
                    <form action={removeSupplierDocument.bind(null, id, i)} className="absolute right-1 top-1 hidden rounded-lg bg-white/90 group-hover:block group-focus-within:block">
                      <DeleteIconButton label="Retirer le document" message="Retirer ce document de la fiche ?" />
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <form action={toggleSupplierActive.bind(null, id)}>
            <button type="submit" className={buttonClass("ghost", "w-full")}>
              {s.active === false ? (
                <>
                  <ArchiveRestore /> Réactiver ce fournisseur
                </>
              ) : (
                <>
                  <Archive /> Archiver ce fournisseur
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
