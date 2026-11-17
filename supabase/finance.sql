-- Moov'Up CRM — module Finance & contrôle
-- Réglages du groupe, clôtures de caisse, dépenses, journal des actions.
-- À exécuter après schema.sql (utilise my_role(), is_direction(), can_see_entity()).

-- ---------- Réglages (une seule ligne, id = 1) ----------
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  company_name text not null default 'Groupe Moov''Up',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  ice text not null default '',
  rc text not null default '',
  if_number text not null default '',
  patente text not null default '',
  vat_rate numeric(5,2) not null default 20 check (vat_rate >= 0 and vat_rate <= 100),
  invoice_footer text not null default '',
  google_review_url text not null default '',
  loyalty_points_per_10mad numeric(8,2) not null default 1,
  loyalty_point_value_mad numeric(8,2) not null default 0.5,
  referral_bonus_points int not null default 200,
  whatsapp_phone_id text not null default '',
  whatsapp_enabled boolean not null default false,
  cmi_client_id text not null default '',
  cmi_enabled boolean not null default false,
  booking_deposit_mad numeric(10,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------- Sessions de caisse (une par établissement et par jour) ----------
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  day date not null,
  status text not null default 'ouverte' check (status in ('ouverte', 'cloturee')),
  opening_float_mad numeric(12,2) not null default 0,
  opened_at timestamptz not null default now(),
  opened_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz,
  closed_by uuid references public.profiles(id) on delete set null,
  expected_cash_mad numeric(12,2),
  counted_cash_mad numeric(12,2),
  difference_mad numeric(12,2),
  comment text,
  breakdown jsonb,
  totals jsonb,
  created_at timestamptz not null default now(),
  unique (entity_id, day)
);
create index if not exists cash_sessions_entity_day on public.cash_sessions (entity_id, day desc);

-- ---------- Dépenses ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  date date not null default current_date,
  category text not null check (category in ('loyer', 'salaires', 'produits', 'energie', 'marketing', 'entretien', 'fournitures', 'autre')),
  amount_mad numeric(12,2) not null check (amount_mad > 0),
  method text not null default 'especes' check (method in ('especes', 'carte', 'virement', 'cheque', 'prelevement')),
  supplier text,
  note text,
  receipt_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists expenses_entity_date on public.expenses (entity_id, date desc);

-- ---------- Journal des actions ----------
create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  entity_id text,
  target_type text not null,
  target_id text,
  summary text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null default '',
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created on public.audit_log (created_at desc);
create index if not exists audit_log_entity on public.audit_log (entity_id, created_at desc);
create index if not exists audit_log_target on public.audit_log (target_id);

-- ---------- Sécurité ----------
alter table public.settings enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_log enable row level security;

-- Réglages : lecture par toute l'équipe, modification par la direction
drop policy if exists "settings read" on public.settings;
create policy "settings read" on public.settings for select using (public.my_role() is not null);
drop policy if exists "settings direction" on public.settings;
create policy "settings direction" on public.settings for all using (public.is_direction()) with check (public.is_direction());

-- Caisse : direction, managers et réception de l'établissement
drop policy if exists "cash_sessions access" on public.cash_sessions;
create policy "cash_sessions access" on public.cash_sessions for all
  using (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager', 'reception'))
  with check (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager', 'reception'));

-- Dépenses : lecture par la caisse (sorties espèces), écriture par direction et managers
drop policy if exists "expenses read" on public.expenses;
create policy "expenses read" on public.expenses for select
  using (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager', 'reception'));
drop policy if exists "expenses write" on public.expenses;
create policy "expenses write" on public.expenses for all
  using (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager'))
  with check (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager'));

-- Journal : tout membre peut écrire ses propres actions ; lecture direction / managers ; jamais modifié
drop policy if exists "audit insert" on public.audit_log;
create policy "audit insert" on public.audit_log for insert
  with check (actor_id = auth.uid() and (entity_id is null or public.can_see_entity(entity_id)));
drop policy if exists "audit read" on public.audit_log;
create policy "audit read" on public.audit_log for select
  using (
    public.is_direction()
    or (public.my_role() = 'manager' and (entity_id is null or public.can_see_entity(entity_id)))
    -- la caisse lit les paiements et remboursements du jour pour la clôture
    or (public.my_role() = 'reception' and action in ('vente.paiement', 'vente.remboursement') and public.can_see_entity(entity_id))
  );

-- ---------- Stockage des justificatifs ----------
-- Créer un bucket public « justificatifs » (Storage) ; les fichiers sont nommés <établissement>/<date>-<uuid>.webp
insert into storage.buckets (id, name, public) values ('justificatifs', 'justificatifs', true) on conflict (id) do nothing;
drop policy if exists "justificatifs upload" on storage.objects;
create policy "justificatifs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'justificatifs' and public.my_role() in ('direction', 'manager'));
