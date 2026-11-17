import Link from "next/link";
import { ChevronLeft, ChevronRight, CircleDollarSign, Download, HandCoins, Receipt, ReceiptText, Search, ShoppingCart, Wallet } from "lucide-react";
import { getScope } from "@/lib/auth";
import { addDaysKey, cn, dayKey, fmtDate, fmtTime, mad, madShort, PAY_LABEL, pct } from "@/lib/utils";
import { SolidTile } from "@/components/stat-tile";
import { Card, CardHeader, Empty, LinkButton, buttonClass } from "@/components/ui";
import { EntityBadge, EntityMark } from "@/components/entity-icon";
import { MethodChip, METHOD_META, METHOD_ORDER, SaleStatusBadge } from "@/components/sales/meta";
import { filtersQuery, loadSales, readFilters } from "@/components/sales/query";

export const metadata = { title: "Ventes & factures" };

const PAGE = 50;

export default async function VentesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const scope = await getScope();
  const f = readFilters(sp);
  const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
  const { sales, contacts } = await loadSales(scope, f);

  const live = sales.filter((s) => s.status !== "remboursee");
  const ca = live.reduce((a, s) => a + Number(s.total_mad), 0);
  const cashed = live.reduce((a, s) => a + Number(s.paid_mad), 0);
  const rest = live.reduce((a, s) => a + Math.max(0, Number(s.total_mad) - Number(s.paid_mad)), 0);
  const refunded = sales.length - live.length;
  const byMethod = METHOD_ORDER.map((m) => {
    const rows = live.filter((s) => s.method === m);
    return { m, n: rows.length, paid: rows.reduce((a, s) => a + Number(s.paid_mad), 0) };
  });

  // Raccourcis de période
  const today = dayKey();
  const monthStart = `${today.slice(0, 8)}01`;
  const prevEnd = addDaysKey(monthStart, -1);
  const prevStart = `${prevEnd.slice(0, 8)}01`;
  const presets = [
    { label: "Aujourd'hui", du: today, au: today },
    { label: "7 jours", du: addDaysKey(today, -6), au: today },
    { label: "Ce mois", du: monthStart, au: today },
    { label: "Mois dernier", du: prevStart, au: prevEnd },
  ];
  const periodLabel = f.du === f.au ? fmtDate(f.du + "T12:00:00Z", { day: "numeric", month: "long", year: "numeric" }) : `du ${fmtDate(f.du + "T12:00:00Z")} au ${fmtDate(f.au + "T12:00:00Z")}`;

  const pages = Math.max(1, Math.ceil(sales.length / PAGE));
  const cur = Math.min(page, pages);
  const rows = sales.slice((cur - 1) * PAGE, cur * PAGE);
  const multi = scope.ids.length > 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 animate-fade-up">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-[28px]">Ventes & factures</h1>
          <p className="mt-1 text-sm text-muted">
            {scope.current ? <b style={{ color: scope.current.color }}>{scope.current.name}</b> : `${scope.allowed.length} établissements`} · {periodLabel}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/export/ventes?${filtersQuery(f)}`} className={buttonClass("secondary", "h-11 rounded-2xl")}>
            <Download className="size-4" /> Exporter CSV
          </a>
          <LinkButton href="/caisse" className="h-11 rounded-2xl">
            <ShoppingCart className="size-4" /> Nouvelle vente
          </LinkButton>
        </div>
      </div>

      {/* Tuiles */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <SolidTile tone="brand" label="Chiffre d'affaires" value={madShort(ca)} sub={`${mad(ca)}${refunded ? ` · ${refunded} remboursée${refunded > 1 ? "s" : ""}` : ""}`} icon={<CircleDollarSign />} watermark={<CircleDollarSign />} />
        <SolidTile tone="green" label="Encaissé" value={madShort(cashed)} sub={`${pct(cashed, ca)} % du chiffre d'affaires`} icon={<Wallet />} watermark={<Wallet />} />
        <SolidTile
          tone="accent"
          label="Reste à encaisser"
          value={madShort(rest)}
          sub={`${live.filter((s) => s.status === "partielle" || s.status === "impayee").length} vente(s) non soldée(s)`}
          icon={<HandCoins />}
          watermark={<HandCoins />}
          href={`/ventes?${filtersQuery({ ...f, statut: "impayee" })}`}
        />
        <SolidTile tone="violet" label="Ventes" value={sales.length} sub={live.length ? `Panier moyen ${mad(ca / live.length)}` : "Aucune vente"} icon={<ReceiptText />} watermark={<ReceiptText />} />
      </div>

      {/* Filtres */}
      <Card className="p-4 sm:p-5">
        <div className="-mx-1 mb-4 flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const on = p.du === f.du && p.au === f.au;
            return (
              <Link
                key={p.label}
                href={`/ventes?${filtersQuery({ ...f, du: p.du, au: p.au })}`}
                className={cn("h-9 rounded-full px-3.5 text-[13px] font-semibold leading-9 transition", on ? "bg-brand-500 text-white shadow-sm shadow-brand-500/30" : "border border-line bg-white text-slate-600 hover:border-slate-300")}
              >
                {p.label}
              </Link>
            );
          })}
        </div>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[150px_150px_1fr_1fr_1.4fr_auto] [&>*]:min-w-0">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Du</span>
            <input type="date" name="du" defaultValue={f.du} className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm focus:border-brand-400 focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Au</span>
            <input type="date" name="au" defaultValue={f.au} className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm focus:border-brand-400 focus:outline-none" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Statut</span>
            <select name="statut" defaultValue={f.statut} className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm focus:border-brand-400 focus:outline-none">
              <option value="">Tous</option>
              <option value="payee">Payée</option>
              <option value="partielle">Partielle</option>
              <option value="impayee">À encaisser (impayée ou partielle)</option>
              <option value="remboursee">Remboursée</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Mode</span>
            <select name="mode" defaultValue={f.mode} className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm focus:border-brand-400 focus:outline-none">
              <option value="">Tous</option>
              {METHOD_ORDER.map((m) => (
                <option key={m} value={m}>
                  {PAY_LABEL[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Recherche</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input name="q" defaultValue={f.q} placeholder="N° de vente ou client" className="h-11 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none" />
            </span>
          </label>
          <div className="flex items-end gap-2">
            <button className={buttonClass("brand", "h-11 flex-1 lg:flex-none")}>Filtrer</button>
            <Link href="/ventes" className={buttonClass("ghost", "h-11")}>
              Effacer
            </Link>
          </div>
        </form>
      </Card>

      {/* Totaux par mode de paiement */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 [&>*]:min-w-0">
        {byMethod.map(({ m, n, paid }) => {
          const meta = METHOD_META[m];
          const I = meta.icon;
          const on = f.mode === m;
          return (
            <Link
              key={m}
              href={`/ventes?${filtersQuery({ ...f, mode: on ? "" : m })}`}
              className={cn("group rounded-2xl border bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop", on ? "ring-2" : "border-line")}
              style={on ? { borderColor: meta.color, ["--tw-ring-color" as string]: `${meta.color}33` } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="grid size-10 place-items-center rounded-xl text-white shadow-sm" style={{ background: meta.color }}>
                  <I className="size-5" />
                </span>
                <span className="text-xs font-semibold text-muted">{n} vente{n > 1 ? "s" : ""}</span>
              </div>
              <p className="mt-3 truncate font-display text-lg font-extrabold">{mad(paid)}</p>
              <p className="truncate text-xs font-semibold text-slate-600">{meta.short}</p>
              <span className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-canvas">
                <span className="block h-full rounded-full" style={{ width: `${pct(paid, cashed)}%`, background: meta.color }} />
              </span>
            </Link>
          );
        })}
      </div>

      {/* Liste */}
      <Card className="overflow-hidden">
        <CardHeader title="Ventes" subtitle={`${sales.length} résultat${sales.length > 1 ? "s" : ""}${pages > 1 ? ` · page ${cur}/${pages}` : ""}`} icon={<Receipt className="size-4" />} />
        {rows.length ? (
          <>
            {/* Bureau */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-y border-line bg-canvas/60 text-left text-[11px] font-bold uppercase tracking-wider text-muted">
                    <th className="px-5 py-2.5">N°</th>
                    <th className="px-3 py-2.5">Date</th>
                    <th className="px-3 py-2.5">Client</th>
                    {multi && <th className="px-3 py-2.5">Établissement</th>}
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5 text-right">Payé</th>
                    <th className="px-3 py-2.5">Statut</th>
                    <th className="px-5 py-2.5">Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((s) => {
                    const c = s.contact_id ? contacts.get(s.contact_id) : undefined;
                    return (
                      <tr key={s.id} className={cn("group transition hover:bg-canvas/70", s.status === "remboursee" && "opacity-60")}>
                        <td className="px-5 py-3">
                          <Link href={`/ventes/${s.id}`} className="font-display text-[13px] font-bold text-brand-600 hover:underline">
                            {s.number}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {fmtDate(s.sold_at, { day: "2-digit", month: "short" })} <span className="text-muted">· {fmtTime(s.sold_at)}</span>
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-3 font-medium">{c ? <Link href={`/contacts/${c.id}`} className="hover:text-brand-600 hover:underline">{c.full_name}</Link> : <span className="text-muted">Client de passage</span>}</td>
                        {multi && (
                          <td className="px-3 py-3">
                            <EntityBadge id={s.entity_id} />
                          </td>
                        )}
                        <td className="whitespace-nowrap px-3 py-3 text-right font-display font-extrabold">{mad(Number(s.total_mad))}</td>
                        <td className={cn("whitespace-nowrap px-3 py-3 text-right font-semibold", Number(s.paid_mad) < Number(s.total_mad) && s.status !== "remboursee" ? "text-accent-700" : "text-slate-600")}>
                          {mad(Number(s.paid_mad))}
                        </td>
                        <td className="px-3 py-3">
                          <SaleStatusBadge status={s.status} />
                        </td>
                        <td className="px-5 py-3">
                          <MethodChip method={s.method} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <ul className="divide-y divide-line md:hidden">
              {rows.map((s) => {
                const c = s.contact_id ? contacts.get(s.contact_id) : undefined;
                const M = METHOD_META[s.method].icon;
                return (
                  <li key={s.id}>
                    <Link href={`/ventes/${s.id}`} className={cn("flex items-center gap-3 px-4 py-3 active:bg-canvas", s.status === "remboursee" && "opacity-60")}>
                      <EntityMark id={s.entity_id} size={38} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{c?.full_name ?? "Client de passage"}</span>
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                          <M className="size-3.5 shrink-0" style={{ color: METHOD_META[s.method].color }} />
                          <span className="truncate">
                            {s.number} · {fmtDate(s.sold_at, { day: "2-digit", month: "short" })} {fmtTime(s.sold_at)}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-display text-sm font-extrabold">{mad(Number(s.total_mad))}</span>
                        <SaleStatusBadge status={s.status} className="px-2 text-[10.5px]" />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {pages > 1 && (
              <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
                {cur > 1 ? (
                  <Link href={`/ventes?${filtersQuery(f, { page: String(cur - 1) })}`} className={buttonClass("secondary", "h-9")}>
                    <ChevronLeft className="size-4" /> Précédent
                  </Link>
                ) : (
                  <span />
                )}
                <span className="text-xs font-semibold text-muted">
                  Page {cur} / {pages}
                </span>
                {cur < pages ? (
                  <Link href={`/ventes?${filtersQuery(f, { page: String(cur + 1) })}`} className={buttonClass("secondary", "h-9")}>
                    Suivant <ChevronRight className="size-4" />
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            )}
          </>
        ) : (
          <Empty icon={<Receipt className="size-6" />} title="Aucune vente" text="Aucune vente ne correspond à ces filtres sur la période choisie." action={<LinkButton href="/caisse"><ShoppingCart className="size-4" /> Ouvrir la caisse</LinkButton>} />
        )}
      </Card>
    </div>
  );
}
