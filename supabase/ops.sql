-- =====================================================================
-- Moov'Up CRM — Planning équipe, pointage, commissions et stock
-- À exécuter après schema.sql (utilise can_see_entity, can_see_any, my_role).
-- =====================================================================

-- ---------- Planning : créneaux, repos, congés ----------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  start_time time,
  end_time time,
  kind text not null default 'travail' check (kind in ('travail','repos','conge')),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists shifts_week on public.shifts (entity_id, date);
create index if not exists shifts_profile on public.shifts (profile_id, date);

-- ---------- Pointage ----------
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  clock_in timestamptz not null default now(),
  clock_out timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists time_entries_day on public.time_entries (entity_id, date);
create index if not exists time_entries_profile on public.time_entries (profile_id, date);

-- ---------- Règles de commission ----------
create table if not exists public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  profile_id uuid references public.profiles(id) on delete cascade,
  basis text not null check (basis in ('prestations','produits')),
  category text,
  rate_pct numeric not null check (rate_pct >= 0 and rate_pct <= 100),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Fournisseurs ----------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  phone text,
  email text,
  city text,
  entity_ids text[] not null default '{}',
  product_ids uuid[] not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

-- ---------- Réglages de stock par produit (seuil d'alerte, prix d'achat) ----------
create table if not exists public.stock_settings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null unique references public.catalog_items(id) on delete cascade,
  entity_id text not null,
  alert_qty int not null default 5 check (alert_qty >= 0),
  unit_cost_mad numeric,
  supplier_id uuid references public.suppliers(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Mouvements de stock ----------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  item_id uuid not null references public.catalog_items(id) on delete cascade,
  kind text not null check (kind in ('entree','sortie','ajustement')),
  reason text not null check (reason in ('vente','remboursement','reception','inventaire','manuel','perte')),
  qty int not null,
  stock_after int,
  ref_id uuid,
  note text,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_item on public.stock_movements (item_id, created_at desc);
create index if not exists stock_movements_entity on public.stock_movements (entity_id, created_at desc);

-- ---------- Bons de commande ----------
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  entity_id text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text not null default 'brouillon' check (status in ('brouillon','envoyee','recue')),
  lines jsonb not null default '[]',
  total_mad numeric not null default 0,
  notes text,
  sent_at timestamptz,
  received_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Sécurité (RLS)
-- =====================================================================
alter table public.shifts enable row level security;
alter table public.time_entries enable row level security;
alter table public.commission_rules enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_settings enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_orders enable row level security;

-- Planning : tout le monde voit le planning de ses établissements ; direction et managers le modifient
drop policy if exists "shifts read" on public.shifts;
create policy "shifts read" on public.shifts for select using (public.can_see_entity(entity_id) or profile_id = auth.uid());
drop policy if exists "shifts write" on public.shifts;
create policy "shifts write" on public.shifts for all
  using (public.my_role() in ('direction','manager') and public.can_see_entity(entity_id))
  with check (public.my_role() in ('direction','manager') and public.can_see_entity(entity_id));

-- Pointage : chacun pointe pour lui-même ; direction et managers voient et corrigent leur périmètre
drop policy if exists "time_entries read" on public.time_entries;
create policy "time_entries read" on public.time_entries for select using (public.can_see_entity(entity_id) or profile_id = auth.uid());
drop policy if exists "time_entries self" on public.time_entries;
create policy "time_entries self" on public.time_entries for insert with check (profile_id = auth.uid() and public.can_see_entity(entity_id));
drop policy if exists "time_entries self update" on public.time_entries;
create policy "time_entries self update" on public.time_entries for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists "time_entries managers" on public.time_entries;
create policy "time_entries managers" on public.time_entries for all
  using (public.my_role() in ('direction','manager') and public.can_see_entity(entity_id))
  with check (public.my_role() in ('direction','manager') and public.can_see_entity(entity_id));

-- Commissions : direction et managers uniquement
drop policy if exists "commission_rules access" on public.commission_rules;
create policy "commission_rules access" on public.commission_rules for all
  using (public.my_role() in ('direction','manager') and public.can_see_entity(entity_id))
  with check (public.my_role() in ('direction','manager') and public.can_see_entity(entity_id));

-- Fournisseurs : visibles si au moins un établissement en commun (ou sans établissement)
drop policy if exists "suppliers access" on public.suppliers;
create policy "suppliers access" on public.suppliers for all
  using (public.my_role() is not null and (cardinality(entity_ids) = 0 or public.can_see_any(entity_ids)))
  with check (public.my_role() in ('direction','manager','reception') and (cardinality(entity_ids) = 0 or public.can_see_any(entity_ids)));

-- Stock : lecture pour le périmètre, écriture pour l'accueil, les managers et la direction
do $$
declare t text;
begin
  foreach t in array array['stock_settings','stock_movements','purchase_orders'] loop
    execute format('drop policy if exists "%1$s read" on public.%1$I', t);
    execute format('create policy "%1$s read" on public.%1$I for select using (public.can_see_entity(entity_id))', t);
    execute format('drop policy if exists "%1$s write" on public.%1$I', t);
    execute format('create policy "%1$s write" on public.%1$I for all using (public.my_role() in (''direction'',''manager'',''reception'') and public.can_see_entity(entity_id)) with check (public.my_role() in (''direction'',''manager'',''reception'') and public.can_see_entity(entity_id))', t);
  end loop;
end $$;

-- Les sorties de stock des ventes sont écrites par n'importe quel vendeur
drop policy if exists "stock_movements sales" on public.stock_movements;
create policy "stock_movements sales" on public.stock_movements for insert
  with check (reason in ('vente','remboursement') and public.can_see_entity(entity_id));
