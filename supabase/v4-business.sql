-- Moov'Up CRM · V4 : fournisseurs, dépenses assignées, collaborations, réclamations par QR code.
-- À exécuter après schema.sql, finance.sql et ops.sql (utilise my_role(), can_see_entity(), can_see_any()).

-- ---------- Fournisseurs : on étend la table du module stock ----------
alter table public.suppliers add column if not exists legal_name text;
alter table public.suppliers add column if not exists ice text;
alter table public.suppliers add column if not exists whatsapp text;
alter table public.suppliers add column if not exists address text;
alter table public.suppliers add column if not exists categories text[] not null default '{}';
alter table public.suppliers add column if not exists payment_terms text;
alter table public.suppliers add column if not exists rib text;
alter table public.suppliers add column if not exists documents jsonb not null default '[]';
alter table public.suppliers add column if not exists active boolean not null default true;
create index if not exists suppliers_name_idx on public.suppliers (lower(name));

-- ---------- Dépenses : rattachement à une fiche fournisseur ----------
alter table public.expenses add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;
create index if not exists expenses_supplier_idx on public.expenses (supplier_id, date desc);

-- ---------- Collaborations / partenariats ----------
create table if not exists public.partnerships (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  partner_name text not null,
  partner_kind text not null default 'marque' check (partner_kind in ('marque','influenceur','entreprise','association','media','sportif','autre')),
  nature text not null default 'sponsoring' check (nature in ('sponsoring','echange','influence','evenement','cobranding','mecenat','autre')),
  status text not null default 'discussion' check (status in ('discussion','active','terminee')),
  start_date date,
  end_date date,
  entity_ids text[] not null default '{}',
  our_part text,
  their_part text,
  value_mad numeric,
  contact_name text,
  contact_phone text,
  contact_email text,
  social text,
  photos jsonb not null default '[]',
  results text,
  notes text,
  reminder_date date,
  reminder_task_id uuid references public.tasks(id) on delete set null,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists partnerships_status_idx on public.partnerships (status, end_date);

alter table public.partnerships enable row level security;
drop policy if exists "partnerships read" on public.partnerships;
create policy "partnerships read" on public.partnerships for select
  using (public.my_role() is not null and (cardinality(entity_ids) = 0 or public.can_see_any(entity_ids)));
drop policy if exists "partnerships write" on public.partnerships;
create policy "partnerships write" on public.partnerships for all
  using (public.my_role() in ('direction','manager') and (cardinality(entity_ids) = 0 or public.can_see_any(entity_ids)))
  with check (public.my_role() in ('direction','manager') and (cardinality(entity_ids) = 0 or public.can_see_any(entity_ids)));

-- ---------- Réclamations par QR code ----------
create table if not exists public.complaint_zones (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.complaints (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  entity_id text not null,
  zone_id uuid references public.complaint_zones(id) on delete set null,
  zone_label text,
  type text not null check (type in ('panne','proprete','securite','service','autre')),
  description text not null,
  photo_url text,
  contact_name text,
  contact_phone text,
  status text not null default 'nouvelle' check (status in ('nouvelle','en_cours','resolue')),
  priority text not null default 'normale' check (priority in ('basse','normale','haute')),
  assigned_to uuid references public.profiles on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  source text not null default 'qr' check (source in ('qr','interne')),
  resolution text,
  taken_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists complaints_entity_idx on public.complaints (entity_id, status, created_at desc);

alter table public.complaint_zones enable row level security;
alter table public.complaints enable row level security;

drop policy if exists "complaint_zones read" on public.complaint_zones;
create policy "complaint_zones read" on public.complaint_zones for select using (public.can_see_entity(entity_id));
drop policy if exists "complaint_zones write" on public.complaint_zones;
create policy "complaint_zones write" on public.complaint_zones for all
  using (public.my_role() in ('direction','manager') and public.can_see_entity(entity_id))
  with check (public.my_role() in ('direction','manager') and public.can_see_entity(entity_id));

-- Les dépôts publics (page /signaler) passent par la clé service côté serveur.
drop policy if exists "complaints read" on public.complaints;
create policy "complaints read" on public.complaints for select using (public.can_see_entity(entity_id));
drop policy if exists "complaints write" on public.complaints;
create policy "complaints write" on public.complaints for all
  using (public.my_role() is not null and public.can_see_entity(entity_id))
  with check (public.my_role() is not null and public.can_see_entity(entity_id));

-- Photos : bucket « business » (fournisseurs, collaborations, réclamations)
insert into storage.buckets (id, name, public) values ('business', 'business', true) on conflict (id) do nothing;
