import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarClock, FileText, History, Mail, MessageCircle, Phone, Receipt, UserPlus, Users } from "lucide-react";
import { getScope, requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { byId, getContacts } from "@/lib/data";
import type { Profile } from "@/lib/types";
import type { Company, CompanyEmployee, CompanyEvent, CompanyInvoice } from "@/lib/types-corporate";
import { COMPANY_STATUS_LABEL } from "@/lib/types-corporate";
import { cn, fmtDate, mad, relative, waLink } from "@/lib/utils";
import { Badge, Card, CardHeader, DescList, Empty, Field, Input, LinkButton, PageHeader, Segmented, Textarea, buttonClass } from "@/components/ui";
import { BackLink } from "@/components/back-link";
import { EntityDots } from "@/components/entity-icon";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/submit-button";
import { ContactPicker } from "@/components/contact-picker";
import { ContactLink } from "@/components/quick-view/contact-link";
import { ListToolbar } from "@/components/list-toolbar";
import { DataTable } from "@/components/data-table/data-table";
import type { DataColumn, DataRow } from "@/components/data-table/types";
import { matchesQuery, one } from "@/components/data-table/match";
import { formatPhone } from "@/components/contacts/helpers";
import { CompanyForm } from "@/components/corporate/company-form";
import { CompanyStatusBadge, InvoiceStatusBadge, isUnpaid } from "@/components/corporate/bits";
import { EmployeeToggle, MonthSelect, RemoveEmployeeButton } from "@/components/corporate/client-bits";
import { computeBill, conventionCovers, conventionSummary, currentMonth, isMonth, monthLabel, shiftMonth, type CalcData, type CompanyBill } from "@/components/corporate/calc";
import { loadCalcData, loadCompany, loadEmployees, loadInvoices } from "@/components/corporate/data";
import { addCompanyNote, addEmployee, generateInvoice, importEmployees, updateCompany } from "@/actions/corporate";

export const metadata = { title: "Entreprise partenaire" };

type Tab = "convention" | "salaries" | "factures" | "historique";
const TABS: Tab[] = ["convention", "salaries", "factures", "historique"];

export default async function CompanyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireManager();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const scope = await getScope();
  const supabase = await createClient();
  const company = await loadCompany(supabase, scope, id);
  if (!company) notFound();

  const tab: Tab = TABS.find((t) => t === one(sp.tab)) ?? "convention";
  const [employees, invoices, { data: evRows }, { data: teamRows }] = await Promise.all([
    loadEmployees(supabase, [id]),
    loadInvoices(supabase, [id]),
    supabase.from("company_events").select("*").eq("company_id", id).order("created_at", { ascending: false }),
    supabase.from("profiles").select("*"),
  ]);
  const data = await loadCalcData(supabase, employees.map((e) => e.contact_id));
  const events = (evRows ?? []) as CompanyEvent[];
  const team = byId((teamRows ?? []) as Profile[]);

  const now = currentMonth();
  const activeCount = employees.filter((e) => e.active).length;
  const unpaid = invoices.filter(isUnpaid);
  const lastMonth = shiftMonth(now, -1);
  const lastInvoiced = invoices.some((i) => i.month === lastMonth && i.status !== "annulee");

  return (
    <div className="space-y-6">
      <PageHeader
        back={<BackLink href="/entreprises" label="Entreprises partenaires" />}
        title={company.name}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <CompanyStatusBadge status={company.status} />
            <EntityDots ids={company.entity_ids} />
            <span>{conventionSummary(company)}</span>
          </span>
        }
        actions={
          lastInvoiced || company.status !== "active" ? (
            <LinkButton href={`/entreprises/${id}?tab=salaries`} variant="brand">
              <UserPlus /> Rattacher un salarié
            </LinkButton>
          ) : (
            <LinkButton href={`/entreprises/${id}?tab=factures&mois=${lastMonth}`} variant="brand">
              <Receipt /> Facturer {monthLabel(lastMonth).split(" ")[0]}
            </LinkButton>
          )
        }
      />

      <Segmented
        active={tab}
        items={[
          { id: "convention", href: `/entreprises/${id}`, label: "Convention" },
          { id: "salaries", href: `/entreprises/${id}?tab=salaries`, label: "Salariés", count: activeCount },
          { id: "factures", href: `/entreprises/${id}?tab=factures`, label: "Factures", count: unpaid.length || undefined },
          { id: "historique", href: `/entreprises/${id}?tab=historique`, label: "Historique" },
        ]}
      />

      {tab === "convention" && <ConventionTab company={company} scopeEntities={scope.allowed.map((e) => ({ id: e.id, short: e.short, color: e.color }))} activeCount={activeCount} invoices={invoices} />}
      {tab === "salaries" && <EmployeesTab company={company} employees={employees} data={data} bill={computeBill(company, employees, data, now)} pickable={(await getContacts(scope)).filter((c) => !employees.some((e) => e.active && e.contact_id === c.id))} q={one(sp.q) ?? ""} statut={one(sp.statut)} />}
      {tab === "factures" && <InvoicesTab company={company} employees={employees} data={data} invoices={invoices} month={isMonth(one(sp.mois)) ? one(sp.mois)! : lastMonth} />}
      {tab === "historique" && <HistoryTab company={company} events={events} team={team} />}
    </div>
  );
}

/* ---------- Convention ---------- */

function ConventionTab({ company, scopeEntities, activeCount, invoices }: { company: Company; scopeEntities: { id: string; short: string; color: string }[]; activeCount: number; invoices: CompanyInvoice[] }) {
  const paid = invoices.filter((i) => i.status === "payee").reduce((a, i) => a + Number(i.total_mad), 0);
  const wa = waLink(company.hr_phone, `Bonjour ${company.hr_name ?? ""}, `.trim());
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] [&>*]:min-w-0">
      <Card className="p-5 sm:p-6">
        <CompanyForm action={updateCompany.bind(null, company.id)} company={company} entities={scopeEntities} submitLabel="Enregistrer la convention" />
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="En bref" icon={<Building2 />} />
          <div className="px-5 pb-3">
            <DescList
              items={[
                ["Statut", COMPANY_STATUS_LABEL[company.status]],
                ["Salariés actifs", <span key="n" className="tabular-nums">{activeCount}</span>],
                ["Période", company.end_date ? `${fmtDate(company.start_date)} → ${fmtDate(company.end_date)}` : `depuis le ${fmtDate(company.start_date)}`],
                ["ICE", company.ice ? <span key="ice" className="tabular-nums">{company.ice}</span> : <span key="ice" className="text-amber-700">À renseigner</span>],
                ["Encaissé", <span key="p" className="tabular-nums">{mad(paid)}</span>],
                ["Délai de paiement", `${company.payment_days} jours`],
              ]}
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Contact RH" subtitle={company.hr_name ?? "Non renseigné"} icon={<Users />} />
          <div className="flex flex-wrap gap-2 px-5 pb-4">
            {company.hr_phone && (
              <a href={`tel:${company.hr_phone.replace(/\s/g, "")}`} className={buttonClass("secondary")}>
                <Phone /> {company.hr_phone}
              </a>
            )}
            {wa && (
              <a href={wa} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                <MessageCircle /> WhatsApp
              </a>
            )}
            {company.hr_email && (
              <a href={`mailto:${company.hr_email}`} className={buttonClass("secondary", "max-w-full")}>
                <Mail /> <span className="truncate">{company.hr_email}</span>
              </a>
            )}
            {!company.hr_phone && !company.hr_email && <p className="text-[13px] text-muted">Ajoutez un téléphone ou un e-mail pour les relances.</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Salariés ---------- */

function EmployeesTab({
  company,
  employees,
  data,
  bill,
  pickable,
  q,
  statut,
}: {
  company: Company;
  employees: CompanyEmployee[];
  data: CalcData;
  bill: CompanyBill;
  pickable: { id: string; full_name: string; phone: string | null }[];
  q: string;
  statut?: string;
}) {
  const byEmp = new Map(bill.lines.map((l) => [l.employee.id, l]));
  const wanted = statut === "inactifs" ? false : statut === "tous" ? null : true;
  const list = employees
    .filter((e) => wanted === null || e.active === wanted)
    .filter((e) => {
      const c = data.contacts.get(e.contact_id);
      return matchesQuery(q, c?.full_name, c?.phone, e.matricule);
    })
    .sort((a, b) => (data.contacts.get(a.contact_id)?.full_name ?? "").localeCompare(data.contacts.get(b.contact_id)?.full_name ?? "", "fr"));
  const columns: DataColumn[] = [
    { key: "salarie", label: "Salarié", card: "title", hideable: false },
    { key: "telephone", label: "Téléphone", className: "whitespace-nowrap tabular-nums text-slate-600" },
    { key: "matricule", label: "Matricule", className: "font-mono text-xs" },
    { key: "depuis", label: "Depuis", className: "whitespace-nowrap text-[13px] text-muted" },
    { key: "mois", label: "Part entreprise (mois)", numeric: true, card: "right" },
    { key: "actif", label: "Statut", noExport: true, sortable: false, card: "footer" },
    { key: "retirer", label: "Retirer", srOnly: true, noExport: true, sortable: false, card: "footer", className: "w-12" },
  ];
  const rows: DataRow[] = list.map((e) => {
    const c = data.contacts.get(e.contact_id);
    const name = c?.full_name ?? "Client supprimé";
    const line = byEmp.get(e.id);
    return {
      id: e.id,
      className: e.active ? undefined : "opacity-60",
      cells: {
        salarie: c ? <ContactLink id={c.id} name={name} /> : <span className="text-muted">{name}</span>,
        telephone: formatPhone(c?.phone ?? null),
        matricule: e.matricule,
        depuis: fmtDate(e.joined_on),
        mois: line && line.company > 0 ? <span className="font-medium tabular-nums text-ink">{mad(line.company)}</span> : <span className="text-muted">—</span>,
        actif: <EmployeeToggle id={e.id} active={e.active} name={name} />,
        retirer: <RemoveEmployeeButton id={e.id} name={name} />,
      },
      values: { salarie: name, telephone: c?.phone ?? null, matricule: e.matricule, depuis: e.joined_on, mois: line?.company ?? 0 },
    };
  });

  return (
    <div className="space-y-5">
      <Card className="p-4 sm:p-5">
        <ActionForm action={addEmployee.bind(null, company.id)} className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end [&>*]:min-w-0">
          <Field label="Rattacher un client existant">
            <ContactPicker contacts={pickable} required placeholder="Nom ou téléphone du salarié…" />
          </Field>
          <Field label="Matricule">
            <Input name="matricule" placeholder="Facultatif" />
          </Field>
          <SubmitButton variant="brand">
            <UserPlus /> Rattacher
          </SubmitButton>
        </ActionForm>
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-[13px] font-medium text-brand-600">Import rapide : coller une liste du service RH</summary>
          <ActionForm action={importEmployees.bind(null, company.id)} className="mt-3 space-y-3">
            <Field label="Une ligne par salarié" hint="Nom ; téléphone ; matricule (facultatif). Les clients déjà connus sont retrouvés par leur numéro, les autres sont créés.">
              <Textarea name="list" required rows={6} placeholder={"Samira Alaoui ; 06 61 23 45 67 ; H-0142\nYoussef Amrani ; 0662345678\nNadia Bennani 0670112233"} className="font-mono text-[13px]" />
            </Field>
            <div className="flex justify-end">
              <SubmitButton variant="brand" pendingText="Import…">
                Importer
              </SubmitButton>
            </div>
          </ActionForm>
        </details>
      </Card>

      <section>
        <ListToolbar
          placeholder="Nom, téléphone ou matricule…"
          filters={[
            {
              param: "statut",
              label: "Actifs",
              options: [
                { value: "inactifs", label: "Inactifs", count: employees.filter((e) => !e.active).length },
                { value: "tous", label: "Tous", count: employees.length },
              ],
            },
          ]}
        />
        <DataTable
          id="entreprise-salaries"
          exportName={`salaries_${slug(company.name)}`}
          columns={columns}
          rows={rows}
          query={q}
          filtered={!!(q || statut)}
          clearHref={`/entreprises/${company.id}?tab=salaries`}
          unit={["salarié", "salariés"]}
          minWidth={760}
          empty={<Empty icon={<Users />} title="Aucun salarié rattaché" text="Recherchez un client ci-dessus ou collez la liste envoyée par le service RH." />}
        />
      </section>
    </div>
  );
}

/* ---------- Factures ---------- */

function InvoicesTab({ company, employees, data, invoices, month }: { company: Company; employees: CompanyEmployee[]; data: CalcData; invoices: CompanyInvoice[]; month: string }) {
  const now = currentMonth();
  const safeMonth = month > now ? now : month;
  const months = Array.from({ length: 13 }, (_, i) => shiftMonth(now, -i))
    .filter((m) => m >= company.start_date.slice(0, 7) || m === safeMonth)
    .map((m) => ({ key: m, label: `${monthLabel(m)}${m === now ? " (en cours)" : ""}` }));
  const bill = computeBill(company, employees, data, safeMonth);
  const existing = invoices.find((i) => i.month === safeMonth && i.status !== "annulee");
  const covered = conventionCovers(company, safeMonth);

  const columns: DataColumn[] = [
    { key: "salarie", label: "Salarié", card: "title", hideable: false },
    { key: "matricule", label: "Matricule", hidden: true, className: "font-mono text-xs" },
    { key: "detail", label: "Détail", card: "subtitle", className: "max-w-[320px] text-[13px] text-slate-600" },
    { key: "brut", label: "Brut", numeric: true, hidden: company.convention === "forfait" },
    { key: "remise", label: "Remise", numeric: true, hidden: company.convention === "forfait" },
    { key: "net", label: "Net", numeric: true },
    { key: "entreprise", label: "Part entreprise", numeric: true, card: "right", className: "font-semibold text-ink" },
    { key: "salarie_part", label: "Part salarié", numeric: true },
  ];
  const rows: DataRow[] = bill.lines.map((l) => ({
    id: l.employee.id,
    className: l.company > 0 ? undefined : "opacity-60",
    cells: {
      salarie: <ContactLink id={l.contact_id} name={l.name} />,
      matricule: l.employee.matricule,
      detail: l.detail,
      brut: mad(l.gross),
      remise: l.discount ? `− ${mad(l.discount)}` : "—",
      net: mad(l.net),
      entreprise: mad(l.company),
      salarie_part: mad(l.employee_part),
    },
    values: { salarie: l.name, matricule: l.employee.matricule, detail: l.detail, brut: l.gross, remise: l.discount, net: l.net, entreprise: l.company, salarie_part: l.employee_part },
  }));

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-ink">Facture du mois</h3>
            <p className="mt-0.5 text-xs text-muted">Aperçu calculé à partir des abonnements actifs et des prestations des salariés</p>
          </div>
          <MonthSelect months={months} value={safeMonth} />
        </div>

        <div className="grid grid-cols-2 gap-px border-y border-line bg-line sm:grid-cols-4 [&>*]:min-w-0">
          {(
            [
              ["Salariés facturés", String(bill.billable.length)],
              ["Consommé (net)", mad(bill.net)],
              ["Part entreprise", mad(bill.company)],
              ["Part salariés", mad(bill.employee)],
            ] as const
          ).map(([k, v], i) => (
            <div key={k} className="bg-white px-5 py-3">
              <p className="text-xs text-muted">{k}</p>
              <p className={cn("mt-0.5 text-lg font-semibold tabular-nums", i === 2 ? "text-brand-700" : "text-ink")}>{v}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          {existing ? (
            <>
              <p className="min-w-0 flex-1 text-[13px] text-slate-600">
                Déjà facturé : <span className="font-medium text-ink">{existing.number}</span> · {mad(existing.total_mad)} · <InvoiceStatusBadge invoice={existing} />
              </p>
              <LinkButton href={`/entreprises/${company.id}/factures/${existing.id}`} variant="secondary">
                <FileText /> Ouvrir la facture
              </LinkButton>
            </>
          ) : !covered ? (
            <p className="text-[13px] text-amber-700">La convention ne couvre pas {monthLabel(safeMonth)} : vérifiez les dates dans l&apos;onglet Convention.</p>
          ) : (
            <ActionForm action={generateInvoice.bind(null, company.id)} className="flex w-full flex-wrap items-center justify-between gap-3">
              <input type="hidden" name="month" value={safeMonth} />
              <p className="min-w-0 text-[13px] text-slate-600">
                {safeMonth === now ? "Mois en cours : le montant peut encore évoluer. " : ""}
                {bill.billable.length ? (
                  <>
                    Numéro attribué à la génération (MU-ENT-{new Date().getFullYear()}-…), échéance à {company.payment_days} jours.
                  </>
                ) : (
                  "Aucune consommation prise en charge ce mois-ci."
                )}
              </p>
              <SubmitButton variant="brand" pendingText="Génération…">
                <Receipt /> Générer la facture {mad(bill.company)}
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      </Card>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink">Détail par salarié · {monthLabel(safeMonth)}</h3>
        <DataTable
          id="entreprise-apercu"
          exportName={`${slug(company.name)}_${safeMonth}`}
          columns={columns}
          rows={rows}
          unit={["salarié", "salariés"]}
          minWidth={820}
          clearHref={`/entreprises/${company.id}?tab=factures`}
          empty={<Empty icon={<Users />} title="Aucun salarié sur ce mois" text="Rattachez des salariés dans l'onglet Salariés." action={<LinkButton href={`/entreprises/${company.id}?tab=salaries`} variant="secondary">Rattacher des salariés</LinkButton>} />}
        />
      </section>

      <Card>
        <CardHeader title="Factures émises" subtitle={`${invoices.length} facture${invoices.length > 1 ? "s" : ""}`} icon={<Receipt />} />
        {invoices.length ? (
          <ul className="divide-y divide-line border-t border-line">
            {invoices.map((i) => (
              <li key={i.id}>
                <Link href={`/entreprises/${company.id}/factures/${i.id}`} className={cn("flex min-h-12 flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-slate-50", i.status === "annulee" && "opacity-60")}>
                  <span className="w-36 font-medium tabular-nums text-ink">{i.number}</span>
                  <span className="min-w-28 flex-1 text-[13px] capitalize text-slate-600">{monthLabel(i.month)}</span>
                  <span className="text-[13px] text-muted">
                    {i.status === "payee" && i.paid_on ? `payée le ${fmtDate(i.paid_on)}` : `échéance ${fmtDate(i.due_on)}`}
                    {i.reminders_count > 0 && i.status !== "payee" ? ` · ${i.reminders_count} relance${i.reminders_count > 1 ? "s" : ""}` : ""}
                  </span>
                  <span className="w-28 text-right font-semibold tabular-nums text-ink">{mad(i.total_mad)}</span>
                  <InvoiceStatusBadge invoice={i} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon={<Receipt />} title="Pas encore de facture" text="Choisissez un mois ci-dessus puis générez la facture." />
        )}
      </Card>
    </div>
  );
}

/* ---------- Historique ---------- */

const EVENT_LABEL: Record<CompanyEvent["kind"], string> = {
  creation: "Création",
  convention: "Convention",
  salarie: "Salariés",
  facture: "Facture",
  envoi: "Envoi",
  paiement: "Paiement",
  relance: "Relance",
  note: "Note",
};
const EVENT_TONE: Record<CompanyEvent["kind"], "brand" | "green" | "amber" | "gray"> = {
  creation: "brand",
  convention: "gray",
  salarie: "gray",
  facture: "brand",
  envoi: "brand",
  paiement: "green",
  relance: "amber",
  note: "gray",
};

function HistoryTab({ company, events, team }: { company: Company; events: CompanyEvent[]; team: Map<string, Profile> }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px] [&>*]:min-w-0">
      <Card>
        <CardHeader title="Historique" subtitle={`${events.length} événement${events.length > 1 ? "s" : ""}`} icon={<History />} />
        {events.length ? (
          <ol className="divide-y divide-line border-t border-line">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 px-5 py-3">
                <span className="mt-0.5 w-24 shrink-0">
                  <Badge tone={EVENT_TONE[e.kind]}>{EVENT_LABEL[e.kind]}</Badge>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{e.body}</p>
                  <p className="mt-0.5 text-xs text-muted" title={fmtDate(e.created_at, { dateStyle: "full", timeStyle: "short", timeZone: "Africa/Casablanca" })}>
                    {relative(e.created_at)}
                    {e.author_id && team.get(e.author_id) ? ` · ${team.get(e.author_id)!.full_name}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Empty icon={<CalendarClock />} title="Aucun événement" text="Les modifications, factures, paiements et relances apparaîtront ici." />
        )}
      </Card>
      <Card className="h-fit p-5">
        <h3 className="mb-3 text-sm font-semibold text-ink">Ajouter une note</h3>
        <ActionForm action={addCompanyNote.bind(null, company.id)} className="space-y-3">
          <Textarea name="body" required placeholder="Rendez-vous avec la DRH, renouvellement prévu…" />
          <div className="flex justify-end">
            <SubmitButton variant="brand">Enregistrer</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}

function slug(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

