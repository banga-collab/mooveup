-- =====================================================================
--  Moov'Up CRM : CRM du groupe Moov'Up (Agadir)
--  À coller tel quel dans Supabase → SQL Editor → Run.
--  Établissements : sports, lady, kids, power, clinic, institut, evolve
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Profils (équipe) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role text not null default 'staff' check (role in ('direction','manager','reception','staff')),
  entity_ids text[] not null default '{}',
  job_title text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Le premier compte créé devient « direction »
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    case when not exists (select 1 from public.profiles) then 'direction' else 'staff' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Fonctions de droits ----------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_direction() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'direction', false)
$$;

-- Un établissement est visible si : direction, ou profil sans restriction, ou établissement attribué
create or replace function public.can_see_entity(e text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (p.role = 'direction' or cardinality(p.entity_ids) = 0 or e = any(p.entity_ids))
  )
$$;

create or replace function public.can_see_any(es text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(es) e where public.can_see_entity(e))
$$;

-- ---------- Contacts (clients, prospects, anciens) ----------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  email text,
  sex text check (sex in ('H','F')),
  birth_date date,
  city text,
  source text,
  tags text[] not null default '{}',
  entity_ids text[] not null default '{}',
  status text not null default 'prospect' check (status in ('prospect','client','ancien')),
  guardian_name text,
  notes text,
  owner_id uuid references public.profiles on delete set null,
  whatsapp_optin boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists contacts_entities on public.contacts using gin (entity_ids);
create index if not exists contacts_phone on public.contacts (phone);

-- ---------- Prospects / opportunités ----------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts on delete cascade,
  entity_id text not null,
  interest text not null default '',
  stage text not null default 'nouveau' check (stage in ('nouveau','contacte','essai','offre','gagne','perdu')),
  source text not null default 'passage',
  value_mad numeric not null default 0,
  owner_id uuid references public.profiles on delete set null,
  next_action_on date,
  lost_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Catalogue (abonnements, prestations, produits, packs) ----------
create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  kind text not null check (kind in ('abonnement','prestation','produit','pack')),
  name text not null,
  category text not null default '',
  price_mad numeric not null default 0,
  duration_min int,
  duration_days int,
  sessions_count int,
  stock int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Abonnements ----------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts on delete cascade,
  entity_id text not null,
  item_id uuid references public.catalog_items on delete set null,
  name text not null,
  price_mad numeric not null default 0,
  start_date date not null,
  end_date date not null,
  status text not null default 'actif' check (status in ('actif','suspendu','expire','resilie')),
  auto_renew boolean not null default false,
  sessions_left int,
  created_at timestamptz not null default now()
);

-- ---------- Rendez-vous ----------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  contact_id uuid not null references public.contacts on delete cascade,
  item_id uuid references public.catalog_items on delete set null,
  service text not null,
  staff_id uuid references public.profiles on delete set null,
  starts_at timestamptz not null,
  duration_min int not null default 60,
  status text not null default 'prevu' check (status in ('prevu','confirme','arrive','termine','absent','annule')),
  room text,
  price_mad numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists appointments_day on public.appointments (entity_id, starts_at);

-- ---------- Ventes (caisse) ----------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  entity_id text not null,
  contact_id uuid references public.contacts on delete set null,
  total_mad numeric not null default 0,
  discount_mad numeric not null default 0,
  paid_mad numeric not null default 0,
  method text not null default 'especes' check (method in ('especes','carte','virement','cheque','en_ligne')),
  status text not null default 'payee' check (status in ('payee','partielle','impayee','remboursee')),
  sold_by uuid references public.profiles on delete set null,
  sold_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists sales_day on public.sales (entity_id, sold_at);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales on delete cascade,
  item_id uuid references public.catalog_items on delete set null,
  label text not null,
  qty numeric not null default 1,
  unit_price_mad numeric not null default 0
);

-- ---------- Historique des échanges ----------
create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts on delete cascade,
  entity_id text,
  kind text not null default 'note' check (kind in ('note','appel','whatsapp','email','visite','rdv','vente','statut')),
  body text not null,
  author_id uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Tâches ----------
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  contact_id uuid references public.contacts on delete cascade,
  lead_id uuid references public.leads on delete cascade,
  entity_id text,
  assigned_to uuid references public.profiles on delete set null,
  due_date date,
  priority text not null default 'normale' check (priority in ('basse','normale','haute')),
  done boolean not null default false,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Campagnes (WhatsApp / SMS / e-mail) ----------
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','sms','email')),
  segment jsonb not null default '{}',
  message text not null default '',
  status text not null default 'brouillon' check (status in ('brouillon','programmee','envoyee')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipients_count int not null default 0,
  created_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now()
);

-- =====================================================================
--  Sécurité (Row Level Security)
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.leads enable row level security;
alter table public.catalog_items enable row level security;
alter table public.subscriptions enable row level security;
alter table public.appointments enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.activities enable row level security;
alter table public.tasks enable row level security;
alter table public.campaigns enable row level security;

-- Profils : chaque membre actif voit l'équipe ; seule la direction modifie les rôles
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (public.my_role() is not null or id = auth.uid());
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()) and entity_ids = (select entity_ids from public.profiles where id = auth.uid()));
drop policy if exists "profiles direction" on public.profiles;
create policy "profiles direction" on public.profiles for all using (public.is_direction()) with check (public.is_direction());

-- Contacts : visibles si l'un de leurs établissements est autorisé (ou contact encore sans établissement)
drop policy if exists "contacts access" on public.contacts;
create policy "contacts access" on public.contacts for all
  using (public.my_role() is not null and (cardinality(entity_ids) = 0 or public.can_see_any(entity_ids)))
  with check (public.my_role() is not null and (cardinality(entity_ids) = 0 or public.can_see_any(entity_ids)));

-- Tables rattachées à un établissement
do $$
declare t text;
begin
  foreach t in array array['leads','catalog_items','subscriptions','appointments','sales'] loop
    execute format('drop policy if exists "%1$s access" on public.%1$I', t);
    execute format('create policy "%1$s access" on public.%1$I for all using (public.can_see_entity(entity_id)) with check (public.can_see_entity(entity_id))', t);
  end loop;
end $$;

drop policy if exists "sale_items access" on public.sale_items;
create policy "sale_items access" on public.sale_items for all
  using (exists (select 1 from public.sales s where s.id = sale_id and public.can_see_entity(s.entity_id)))
  with check (exists (select 1 from public.sales s where s.id = sale_id and public.can_see_entity(s.entity_id)));

drop policy if exists "activities access" on public.activities;
create policy "activities access" on public.activities for all
  using (public.my_role() is not null and (entity_id is null or public.can_see_entity(entity_id)))
  with check (public.my_role() is not null and (entity_id is null or public.can_see_entity(entity_id)));

drop policy if exists "tasks access" on public.tasks;
create policy "tasks access" on public.tasks for all
  using (public.my_role() is not null and (entity_id is null or public.can_see_entity(entity_id) or assigned_to = auth.uid()))
  with check (public.my_role() is not null and (entity_id is null or public.can_see_entity(entity_id)));

-- Campagnes : direction, managers et réception
drop policy if exists "campaigns access" on public.campaigns;
create policy "campaigns access" on public.campaigns for all
  using (public.my_role() in ('direction','manager','reception'))
  with check (public.my_role() in ('direction','manager','reception'));
