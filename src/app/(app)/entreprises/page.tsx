import { Briefcase, Building2, FileWarning, Plus, Users, Wallet } from "lucide-react";
import { getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { COMPANY_STATUS_LABEL, type CompanyStatus } from "@/lib/types-corporate";
import { mad } from "@/lib/utils";
import { SolidTile } from "@/components/stat-tile";
import { Empty, LinkButton, PageHeader } from "@/components/ui";
import { EntityDots } from "@/components/entity-icon";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery, one } from "@/components/data-table/match";
import { CompanyStatusBadge, isOverdue, isUnpaid } from "@/components/corporate/bits";
import { computeBill, conventionSummary, currentMonth, monthLabel } from "@/components/corporate/calc";
import { loadCalcData, loadCompanies, loadEmployees, loadInvoices } from "@/components/corporate/data";

export const metadata = { title: "Entreprises partenaires" };

const STATUSES: CompanyStatus[] = ["active", "suspendue", "terminee"];

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireManager();
  const sp = await searchParams;
  const q = one(sp.q)?.slice(0, 80) ?? "";
  const statut = STATUSES.find((s) => s === one(sp.statut));
  const scope = await getScope();
  const etab = scope.ids.find((e) => e === one(sp.etab));
  const supabase = await createClient();

  const companies = await loadCompanies(supabase, scope);
  const ids = companies.map((c) => c.id);
  const [employees, invoices] = await Promise.all([loadEmployees(supabase, ids), loadInvoices(supabase, ids)]);
  const data = await loadCalcData(supabase, employees.map((e) => e.contact_id));
  const month = currentMonth();

  const stats = new Map(
    companies.map((c) => {
      const staff = employees.filter((e) => e.company_id === c.id);
      const bill = c.status === "active" ? computeBill(c, staff, data, month) : null;
      const inv = invoices.filter((i) => i.company_id === c.id);
      const unpaid = inv.filter(isUnpaid);
      return [
        c.id,
        {
          active: staff.filter((e) => e.active).length,
          bill,
          unpaid: unpaid.reduce((a, i) => a + Number(i.total_mad), 0),
          unpaidCount: unpaid.length,
          overdue: unpaid.some(isOverdue),
        },
      ] as const;
    }),
  );

  const activeCompanies = companies.filter((c) => c.status === "active");
  const covered = activeCompanies.reduce((a, c) => a + (stats.get(c.id)?.active ?? 0), 0);
  const monthNet = activeCompanies.reduce((a, c) => a + (stats.get(c.id)?.bill?.net ?? 0), 0);
  const monthCompany = activeCompanies.reduce((a, c) => a + (stats.get(c.id)?.bill?.company ?? 0), 0);
  const unpaid = invoices.filter(isUnpaid);
  const overdue = unpaid.filter(isOverdue);

  const list = companies.filter(
    (c) => (!statut || c.status === statut) && (!etab || c.entity_ids.includes(etab)) && matchesQuery(q, c.name, c.sector, c.ice, c.hr_name, c.hr_phone, c.hr_email, c.address),
  );

  const columns: DataColumn[] = [
    { key: "entreprise", label: "Entreprise", card: "title", hideable: false },
    { key: "convention", label: "Convention", card: "subtitle", className: "text-[13px] text-slate-600" },
    { key: "salaries", label: "Salariés actifs", numeric: true },
    { key: "mois", label: `Part entreprise ${monthLabel(month).split(" ")[0]}`, numeric: true, card: "right" },
    { key: "impaye", label: "Impayé", numeric: true },
    { key: "rh", label: "Contact RH", hidden: true, className: "text-[13px] text-slate-600" },
    { key: "statut", label: "Statut" },
  ];
  const rows: DataRow[] = list.map((c) => {
    const s = stats.get(c.id)!;
    return {
      id: c.id,
      href: `/entreprises/${c.id}`,
      className: c.status === "terminee" ? "opacity-60" : undefined,
      cells: {
        entreprise: (
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-ink">{c.name}</span>
            <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
              <EntityDots ids={c.entity_ids} />
              {c.sector}
            </span>
          </span>
        ),
        convention: conventionSummary(c),
        salaries: s.active,
        mois: s.bill ? <span className="font-medium tabular-nums text-ink">{mad(s.bill.company)}</span> : <span className="text-muted">—</span>,
        impaye: s.unpaid ? <span className={s.overdue ? "font-medium text-red-600" : "text-ink"}>{mad(s.unpaid)}</span> : <span className="text-muted">—</span>,
        rh: [c.hr_name, c.hr_phone].filter(Boolean).join(" · ") || null,
        statut: <CompanyStatusBadge status={c.status} />,
      },
      values: {
        entreprise: c.name,
        convention: conventionSummary(c),
        salaries: s.active,
        mois: s.bill?.company ?? 0,
        impaye: s.unpaid,
        rh: [c.hr_name, c.hr_phone, c.hr_email].filter(Boolean).join(" · "),
        statut: COMPANY_STATUS_LABEL[c.status],
      },
    };
  });

  const multi = scope.ids.length > 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Entreprises partenaires"
        subtitle="Conventions salariés et facturation mensuelle groupée"
        actions={
          <LinkButton href="/entreprises/nouvelle" variant="brand">
            <Plus /> Nouvelle entreprise
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 [&>*]:min-w-0">
        <SolidTile label="Entreprises actives" value={activeCompanies.length} sub={`${companies.length} au total`} icon={<Building2 />} href="/entreprises?statut=active" />
        <SolidTile label="Salariés couverts" value={covered} sub="rattachés et actifs" icon={<Users />} />
        <SolidTile label="CA entreprises du mois" value={mad(monthNet)} sub={`dont ${mad(monthCompany)} à facturer`} icon={<Wallet />} />
        <SolidTile
          label="Factures impayées"
          value={unpaid.length}
          sub={unpaid.length ? `${mad(unpaid.reduce((a, i) => a + Number(i.total_mad), 0))}${overdue.length ? ` · ${overdue.length} en retard` : ""}` : "Tout est réglé"}
          icon={<FileWarning />}
        />
      </div>

      <section>
        <ListToolbar
          placeholder="Nom, ICE, contact RH, téléphone…"
          filters={[
            { param: "statut", label: "Tous statuts", options: STATUSES.map((s) => ({ value: s, label: COMPANY_STATUS_LABEL[s], count: companies.filter((c) => c.status === s).length })) },
            ...(multi ? [{ param: "etab", label: "Tous établ.", options: scope.allowed.filter((e) => scope.ids.includes(e.id)).map((e) => ({ value: e.id, label: e.short })) }] : []),
          ]}
        />
        <DataTable
          id="entreprises"
          columns={columns}
          rows={rows}
          query={q}
          filtered={!!(q || statut || etab)}
          clearHref="/entreprises"
          unit={["entreprise", "entreprises"]}
          minWidth={820}
          empty={
            <Empty
              icon={<Briefcase />}
              title="Aucune entreprise partenaire"
              text="Signez une convention avec une entreprise d'Agadir : ses salariés profitent d'une remise et vous facturez l'entreprise chaque mois."
              action={
                <LinkButton href="/entreprises/nouvelle" variant="brand">
                  <Plus /> Ajouter une entreprise
                </LinkButton>
              }
            />
          }
        />
      </section>
    </div>
  );
}
