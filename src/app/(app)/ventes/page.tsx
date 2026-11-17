import Link from "next/link";
import { CalendarRange, ChevronRight, CircleDollarSign, FileSpreadsheet, HandCoins, Receipt, ReceiptText, ShoppingCart, Wallet } from "lucide-react";
import { getScope } from "@/lib/auth";
import { entity } from "@/lib/entities";
import { cn, fmtDate, fmtTime, mad, madShort, PAY_LABEL, pct, SALE_STATUS_LABEL } from "@/lib/utils";
import { SolidTile } from "@/components/stat-tile";
import { Card, Empty, Input, LinkButton, PageHeader, buttonClass } from "@/components/ui";
import { EntityBadge } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { SaveViewButton } from "@/components/data-table/save-view";
import { ContactLink } from "@/components/quick-view/contact-link";
import { formatPhone } from "@/components/contacts/helpers";
import { MethodChip, METHOD_META, METHOD_ORDER, SaleStatusBadge } from "@/components/sales/meta";
import { filtersQuery, linesLabel, loadSales, readFilters } from "@/components/sales/query";

export const metadata = { title: "Ventes & factures" };

const MAX_ROWS = 2000;

export default async function VentesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const f = readFilters(sp);
  const { sales, contacts, sellers, lines } = await loadSales(scope, f);

  const live = sales.filter((s) => s.status !== "remboursee");
  const ca = live.reduce((a, s) => a + Number(s.total_mad), 0);
  const cashed = live.reduce((a, s) => a + Number(s.paid_mad), 0);
  const rest = live.reduce((a, s) => a + Math.max(0, Number(s.total_mad) - Number(s.paid_mad)), 0);
  const refunded = sales.length - live.length;
  const byMethod = METHOD_ORDER.map((m) => {
    const rows = live.filter((s) => s.method === m);
    return { m, n: rows.length, paid: rows.reduce((a, s) => a + Number(s.paid_mad), 0) };
  });

  const periodLabel = f.du === f.au ? fmtDate(f.du + "T12:00:00Z", { day: "numeric", month: "long", year: "numeric" }) : `du ${fmtDate(f.du + "T12:00:00Z")} au ${fmtDate(f.au + "T12:00:00Z")}`;
  const multi = scope.ids.length > 1;
  const filtered = !!(f.q || f.statut || f.mode || f.etab);

  /* Tableau */
  const columns: DataColumn[] = [
    { key: "numero", label: "N°", card: "subtitle", hideable: false },
    { key: "date", label: "Date", className: "whitespace-nowrap tabular-nums text-slate-600", card: "subtitle" },
    { key: "client", label: "Client", card: "title", className: "max-w-[220px] truncate" },
    { key: "telephone", label: "Téléphone", hidden: true, className: "whitespace-nowrap tabular-nums text-slate-600" },
    ...(multi ? [{ key: "etab", label: "Établissement" }] : []),
    { key: "articles", label: "Articles", hidden: true, className: "max-w-[260px] truncate text-[13px] text-slate-600" },
    { key: "total", label: "Total", numeric: true, card: "right", className: "font-semibold text-ink" },
    { key: "paye", label: "Payé", numeric: true },
    { key: "reste", label: "Reste", numeric: true, hidden: true },
    { key: "statut", label: "Statut" },
    { key: "mode", label: "Mode" },
    { key: "vendeur", label: "Vendeur", hidden: true, className: "whitespace-nowrap text-[13px] text-slate-600" },
  ];

  const rows: DataRow[] = sales.slice(0, MAX_ROWS).map((s) => {
    const c = s.contact_id ? contacts.get(s.contact_id) : undefined;
    const total = Number(s.total_mad);
    const paid = Number(s.paid_mad);
    const due = s.status === "remboursee" ? 0 : Math.max(0, total - paid);
    const seller = s.sold_by ? sellers.get(s.sold_by)?.full_name : null;
    return {
      id: s.id,
      href: `/ventes/${s.id}`,
      className: s.status === "remboursee" ? "text-slate-400 opacity-70" : undefined,
      cells: {
        numero: (
          <Link href={`/ventes/${s.id}`} className="text-[13px] font-medium tabular-nums text-brand-600 hover:underline">
            {s.number}
          </Link>
        ),
        date: (
          <>
            {fmtDate(s.sold_at, { day: "2-digit", month: "short" })} <span className="text-muted">· {fmtTime(s.sold_at)}</span>
          </>
        ),
        client: c ? <ContactLink id={c.id} name={c.full_name} /> : <span className="text-muted">Client de passage</span>,
        telephone: formatPhone(c?.phone),
        etab: <EntityBadge id={s.entity_id} />,
        articles: linesLabel(lines.get(s.id)) || null,
        total: mad(total),
        paye: <span className={cn(due > 0 ? "font-medium text-red-600" : "text-slate-600")}>{mad(paid)}</span>,
        reste: due > 0 ? <span className="font-medium text-red-600">{mad(due)}</span> : mad(0),
        statut: <SaleStatusBadge status={s.status} />,
        mode: <MethodChip method={s.method} />,
        vendeur: seller ?? null,
      },
      values: {
        numero: s.number,
        date: s.sold_at,
        client: c?.full_name ?? "Client de passage",
        telephone: c?.phone,
        etab: entity(s.entity_id)?.short ?? s.entity_id,
        articles: linesLabel(lines.get(s.id)),
        total,
        paye: paid,
        reste: due,
        statut: SALE_STATUS_LABEL[s.status],
        mode: PAY_LABEL[s.method],
        vendeur: seller,
      },
    };
  });

  const periodNames: Record<string, string> = { today: "Aujourd'hui", "7j": "7 jours", "30j": "30 jours", mois: "Ce mois", prev: "Mois dernier", annee: "Cette année", perso: periodLabel };
  const viewName = ["Ventes", periodNames[f.periode], f.statut && (f.statut === "impayee" ? "À encaisser" : SALE_STATUS_LABEL[f.statut]), f.mode && METHOD_META[f.mode].short, f.etab && entity(f.etab)?.short, f.q && `« ${f.q} »`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Ventes & factures"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            {scope.current ? <EntityBadge id={scope.current.id} short={false} /> : <span>{scope.allowed.length} établissements</span>}
            <span className="text-slate-300">·</span>
            <span>{periodLabel}</span>
          </span>
        }
        actions={
          <LinkButton href="/caisse">
            <ShoppingCart /> Encaisser
          </LinkButton>
        }
      />

      {/* Indicateurs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Chiffre d'affaires" value={madShort(ca)} sub={refunded ? `${refunded} remboursée${refunded > 1 ? "s" : ""}` : mad(ca)} icon={<CircleDollarSign />} />
        <SolidTile label="Encaissé" value={madShort(cashed)} sub={`${pct(cashed, ca)} % du CA`} icon={<Wallet />} />
        <SolidTile
          label="Reste à encaisser"
          value={madShort(rest)}
          sub={`${live.filter((s) => s.status === "partielle" || s.status === "impayee").length} vente(s) non soldée(s)`}
          icon={<HandCoins />}
          href={`/ventes?${filtersQuery({ ...f, statut: "impayee" })}`}
        />
        <SolidTile label="Ventes" value={sales.length} sub={live.length ? `Panier moyen ${mad(ca / live.length)}` : "Aucune vente"} icon={<ReceiptText />} />
      </div>

      {/* Recherche et filtres */}
      <div>
        <ListToolbar
          className="mb-2"
          placeholder="N°, client, téléphone, article, montant…"
          filters={[
            {
              param: "periode",
              label: "Ce mois",
              options: [
                { value: "today", label: "Aujourd'hui" },
                { value: "7j", label: "7 jours" },
                { value: "30j", label: "30 jours" },
                { value: "prev", label: "Mois dernier" },
                { value: "annee", label: "Cette année" },
              ],
            },
            {
              param: "statut",
              label: "Tous statuts",
              options: [
                { value: "payee", label: "Payées" },
                { value: "impayee", label: "À encaisser" },
                { value: "partielle", label: "Partielles" },
                { value: "remboursee", label: "Remboursées" },
              ],
            },
            { param: "mode", label: "Tous modes", options: METHOD_ORDER.map((m) => ({ value: m, label: METHOD_META[m].short })) },
            ...(multi ? [{ param: "etab", label: "Tous établ.", options: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ value: e.id, label: e.short })) }] : []),
          ]}
          right={<SaveViewButton defaultLabel={viewName} icon="/ventes" />}
        />

        {/* Période personnalisée */}
        <details className="group" open={f.periode === "perso"}>
          <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md px-1 text-[13px] font-medium text-slate-500 hover:text-ink [&::-webkit-details-marker]:hidden">
            <CalendarRange className="size-4 text-slate-400" /> Période personnalisée
            {f.periode === "perso" && <span className="font-normal text-muted">· {periodLabel}</span>}
            <ChevronRight className="size-3.5 text-slate-400 transition group-open:rotate-90" />
          </summary>
          <form action="/ventes" className="mt-2 flex flex-wrap items-end gap-2">
            <label className="block w-[150px]">
              <span className="mb-1 block text-xs text-muted">Du</span>
              <Input type="date" name="du" defaultValue={f.du} className="h-9" />
            </label>
            <label className="block w-[150px]">
              <span className="mb-1 block text-xs text-muted">Au</span>
              <Input type="date" name="au" defaultValue={f.au} className="h-9" />
            </label>
            {f.statut && <input type="hidden" name="statut" value={f.statut} />}
            {f.mode && <input type="hidden" name="mode" value={f.mode} />}
            {f.etab && <input type="hidden" name="etab" value={f.etab} />}
            {f.q && <input type="hidden" name="q" value={f.q} />}
            <button className={buttonClass("brand")}>Appliquer</button>
          </form>
        </details>
      </div>

      {/* Répartition par mode de paiement (cliquer = filtrer) */}
      <Card className="grid grid-cols-2 sm:grid-cols-5 sm:divide-x sm:divide-line [&>*]:min-w-0">
        {byMethod.map(({ m, n, paid }) => {
          const meta = METHOD_META[m];
          const I = meta.icon;
          const on = f.mode === m;
          return (
            <Link
              key={m}
              href={`/ventes?${filtersQuery({ ...f, mode: on ? "" : m })}`}
              scroll={false}
              aria-pressed={on}
              className={cn("block px-4 py-3 transition first:rounded-l-xl last:rounded-r-xl hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40", on && "bg-brand-50/60")}
            >
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <I className={cn("size-3.5", on ? "text-brand-600" : "text-slate-400")} />
                {meta.short}
                <span className="ml-auto tabular-nums">{n}</span>
              </span>
              <span className="mt-1 block truncate text-sm font-semibold tabular-nums text-ink">{mad(paid)}</span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-100">
                <span className="block h-full rounded-full bg-brand-500/70" style={{ width: `${pct(paid, cashed)}%` }} />
              </span>
            </Link>
          );
        })}
      </Card>

      {/* Liste */}
      <DataTable
        id="ventes"
        columns={columns}
        rows={rows}
        total={sales.length}
        selectable
        query={f.q}
        filtered={filtered}
        clearHref={`/ventes?${filtersQuery({ ...f, q: "", statut: "", mode: "", etab: "" })}`}
        unit={["vente", "ventes"]}
        minWidth={780}
        exportName={`ventes_${f.du}_${f.au}`}
        toolbar={
          <a href={`/api/export/ventes?${filtersQuery(f)}`} className={buttonClass("ghost", "h-8 px-2.5")} title="Export comptable détaillé (articles, remises, vendeur, notes)">
            <FileSpreadsheet /> <span className="hidden sm:inline">Export comptable</span>
            <span className="sr-only sm:hidden">Export comptable</span>
          </a>
        }
        empty={
          <Empty
            icon={<Receipt />}
            title="Aucune vente sur cette période"
            text="Changez de période ou encaissez une première vente."
            action={
              <LinkButton href="/caisse">
                <ShoppingCart /> Ouvrir la caisse
              </LinkButton>
            }
          />
        }
      />
    </div>
  );
}
