-- ============================================================
-- Moov'Up CRM : entreprises partenaires (conventions salariés)
-- et facturation mensuelle groupée. À exécuter après schema.sql.
-- ============================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sector text,
  ice text check (ice is null or ice ~ '^[0-9]{15}$'),
  address text,
  hr_name text,
  hr_phone text,
  hr_email text,
  entity_ids text[] not null default '{}',
  entity_id text not null,
  convention text not null default 'remise' check (convention in ('remise','forfait')),
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  flat_mad numeric(10,2) not null default 0 check (flat_mad >= 0),
  share_mode text not null default 'pct' check (share_mode in ('pct','fixe')),
  share_value numeric(10,2) not null default 0 check (share_value >= 0),
  payment_days integer not null default 30 check (payment_days >= 0),
  start_date date not null default (now() at time zone 'Africa/Casablanca')::date,
  end_date date,
  status text not null default 'active' check (status in ('active','suspendue','terminee')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create unique index if not exists companies_name on public.companies (lower(name));

create table if not exists public.company_employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  matricule text,
  active boolean not null default true,
  joined_on date not null default (now() at time zone 'Africa/Casablanca')::date,
  left_on date,
  created_at timestamptz not null default now(),
  unique (company_id, contact_id)
);
create index if not exists company_employees_contact on public.company_employees(contact_id);

create table if not exists public.company_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  company_id uuid not null references public.companies(id) on delete restrict,
  entity_id text not null,
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  issued_on date not null,
  due_on date not null,
  total_mad numeric(12,2) not null default 0,
  net_mad numeric(12,2) not null default 0,
  employees_count integer not null default 0,
  status text not null default 'a_envoyer' check (status in ('a_envoyer','envoyee','payee','annulee')),
  sent_at timestamptz,
  paid_on date,
  paid_method text check (paid_method is null or paid_method in ('especes','carte','virement','cheque','en_ligne')),
  paid_ref text,
  reminders_count integer not null default 0,
  last_reminder_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Une seule facture active par entreprise et par mois
create unique index if not exists company_invoices_month on public.company_invoices(company_id, month) where status <> 'annulee';

create table if not exists public.company_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.company_invoices(id) on delete cascade,
  employee_id uuid references public.company_employees(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  label text not null,
  matricule text,
  detail text not null default '',
  gross_mad numeric(12,2) not null default 0,
  discount_mad numeric(12,2) not null default 0,
  net_mad numeric(12,2) not null default 0,
  company_mad numeric(12,2) not null default 0,
  employee_mad numeric(12,2) not null default 0
);
create index if not exists company_invoice_lines_invoice on public.company_invoice_lines(invoice_id);

create table if not exists public.company_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('creation','convention','salarie','facture','envoi','paiement','relance','note')),
  body text not null,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists company_events_company on public.company_events(company_id, created_at desc);

-- ---------- Sécurité ----------
-- Gestion réservée à la direction et aux managers des établissements couverts.
alter table public.companies enable row level security;
alter table public.company_employees enable row level security;
alter table public.company_invoices enable row level security;
alter table public.company_invoice_lines enable row level security;
alter table public.company_events enable row level security;

create or replace function public.can_see_company(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.companies c
    where c.id = cid
      and public.my_role() in ('direction','manager')
      and (public.is_direction() or exists (select 1 from unnest(c.entity_ids) e where public.can_see_entity(e)))
  );
$$;

drop policy if exists "companies read" on public.companies;
create policy "companies read" on public.companies for select using (public.can_see_company(id));
drop policy if exists "companies insert" on public.companies;
create policy "companies insert" on public.companies for insert with check (public.my_role() in ('direction','manager') and public.can_see_entity(entity_id));
drop policy if exists "companies update" on public.companies;
create policy "companies update" on public.companies for update using (public.can_see_company(id)) with check (public.my_role() in ('direction','manager'));
drop policy if exists "companies delete" on public.companies;
create policy "companies delete" on public.companies for delete using (public.is_direction());

drop policy if exists "company employees" on public.company_employees;
create policy "company employees" on public.company_employees for all using (public.can_see_company(company_id)) with check (public.can_see_company(company_id));

drop policy if exists "company invoices read" on public.company_invoices;
create policy "company invoices read" on public.company_invoices for select using (public.can_see_company(company_id));
drop policy if exists "company invoices insert" on public.company_invoices;
create policy "company invoices insert" on public.company_invoices for insert with check (public.can_see_company(company_id));
drop policy if exists "company invoices update" on public.company_invoices;
create policy "company invoices update" on public.company_invoices for update using (public.can_see_company(company_id)) with check (public.can_see_company(company_id));
-- Pas de suppression : une facture numérotée s'annule (statut « annulee »).

drop policy if exists "company invoice lines" on public.company_invoice_lines;
create policy "company invoice lines" on public.company_invoice_lines for all
  using (exists (select 1 from public.company_invoices i where i.id = invoice_id and public.can_see_company(i.company_id)))
  with check (exists (select 1 from public.company_invoices i where i.id = invoice_id and public.can_see_company(i.company_id) and i.status <> 'payee'));

drop policy if exists "company events read" on public.company_events;
create policy "company events read" on public.company_events for select using (public.can_see_company(company_id));
drop policy if exists "company events insert" on public.company_events;
create policy "company events insert" on public.company_events for insert with check (public.can_see_company(company_id));
