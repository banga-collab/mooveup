-- Moov'Up CRM — établissements, caisse (paiements mixtes, entrées/sorties), stock multi-établissements
-- À exécuter après schema.sql, finance.sql et ops.sql (utilise my_role(), is_direction(), can_see_entity()).

-- ---------- Établissements ----------
create table if not exists public.establishments (
  id text primary key check (id ~ '^[a-z0-9-]{2,32}$'),
  name text not null,
  short text not null,
  kind text not null default 'sport' check (kind in ('sport', 'beaute', 'clinique')),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon text not null default 'Building2',
  tagline text not null default '',
  activities text[] not null default '{}',
  audience text not null default 'Mixte' check (audience in ('Mixte', 'Femmes', 'Enfants', 'Hommes')),
  address text not null default '',
  phone text not null default '',
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now()
);

insert into public.establishments (id, name, short, kind, color, icon, tagline, activities, audience, address, phone, position) values
  ('sports', 'Complexe Moov''Up Sports', 'Moov''Up Sports', 'sport', '#1a6d8e', 'Dumbbell', 'Musculation, fitness, piscine et football', array['Musculation','Fitness','Piscine','Football','Coaching personnel','Cours collectifs'], 'Mixte', 'Bd Mohammed V, Agadir', '05 28 84 10 10', 1),
  ('lady', 'Lady Moov''Up', 'Lady Moov''Up', 'sport', '#d9467a', 'Flower2', 'Fitness 100 % féminin', array['Fitness','Zumba','Yoga','Pilates','Aquagym','Coaching personnel'], 'Femmes', 'Av. Hassan II, Agadir', '05 28 84 10 20', 2),
  ('kids', 'Moov''Up Kids', 'Moov''Up Kids', 'sport', '#e9a213', 'Smile', 'Sport et éveil pour les enfants', array['Natation enfants','Football école','Gym enfants','Arts martiaux','Stages vacances','Anniversaires'], 'Enfants', 'Bd Mohammed V, Agadir', '05 28 84 10 30', 3),
  ('power', 'Moov''Up Power Gym', 'Power Gym', 'sport', '#c2410c', 'Zap', 'Musculation et force', array['Musculation','Powerlifting','CrossTraining','Cardio','Coaching personnel'], 'Mixte', 'Hay Dakhla, Agadir', '05 28 84 10 40', 4),
  ('clinic', 'Anais Beauty Clinic', 'Anais Clinic', 'clinique', '#7c4dcc', 'Stethoscope', 'Médecine esthétique', array['Consultation','Injections','Laser','Peeling','Soins du visage médicaux','Amincissement'], 'Mixte', 'Av. du 29 Février, Agadir', '05 28 84 20 10', 5),
  ('institut', 'Anais Institut', 'Anais Institut', 'beaute', '#b4774a', 'Sparkles', 'Beauté, hammam et bien-être', array['Hammam','Massage','Épilation','Soins du visage','Manucure / pédicure','Coiffure'], 'Femmes', 'Av. du 29 Février, Agadir', '05 28 84 20 20', 6),
  ('evolve', 'Evolve Hommes', 'Evolve Hommes', 'beaute', '#334155', 'Scissors', 'Barbier et soins pour hommes', array['Coupe','Barbe','Soins du visage','Hammam','Massage'], 'Hommes', 'Founty, Agadir', '05 28 84 30 10', 7)
on conflict (id) do nothing;

alter table public.establishments enable row level security;
drop policy if exists "establishments read" on public.establishments;
create policy "establishments read" on public.establishments for select using (public.my_role() is not null);
drop policy if exists "establishments direction" on public.establishments;
create policy "establishments direction" on public.establishments for all using (public.is_direction()) with check (public.is_direction());

-- ---------- Catalogue : code-barres (scan en caisse) ----------
alter table public.catalog_items add column if not exists barcode text;
create index if not exists catalog_items_barcode on public.catalog_items (barcode) where barcode is not null;

-- ---------- Caisse : détail des paiements (paiement mixte) ----------
create table if not exists public.sale_payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  entity_id text not null,
  method text not null check (method in ('especes', 'carte', 'virement', 'cheque', 'en_ligne')),
  amount_mad numeric(12,2) not null check (amount_mad >= 0),
  -- Espèces : montant remis par le client (avant rendu de monnaie)
  tendered_mad numeric(12,2),
  created_at timestamptz not null default now()
);
create index if not exists sale_payments_sale on public.sale_payments (sale_id);

-- ---------- Caisse : entrées / sorties d'espèces (dépôt, retrait avec motif) ----------
create table if not exists public.cash_moves (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  session_id uuid references public.cash_sessions(id) on delete set null,
  day date not null,
  kind text not null check (kind in ('depot', 'retrait')),
  amount_mad numeric(12,2) not null check (amount_mad > 0),
  reason text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cash_moves_entity_day on public.cash_moves (entity_id, day desc);

-- ---------- Stock : transferts entre établissements ----------
create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  from_entity_id text not null,
  to_entity_id text not null,
  -- [{ label, qty, from_item_id, to_item_id, unit_cost_mad }]
  lines jsonb not null default '[]',
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (from_entity_id <> to_entity_id)
);
create index if not exists stock_transfers_created on public.stock_transfers (created_at desc);

-- ---------- Sécurité ----------
alter table public.sale_payments enable row level security;
alter table public.cash_moves enable row level security;
alter table public.stock_transfers enable row level security;

drop policy if exists "sale_payments access" on public.sale_payments;
create policy "sale_payments access" on public.sale_payments for all
  using (public.can_see_entity(entity_id)) with check (public.can_see_entity(entity_id));

drop policy if exists "cash_moves access" on public.cash_moves;
create policy "cash_moves access" on public.cash_moves for all
  using (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager', 'reception'))
  with check (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager', 'reception'));

-- Transferts : visibles si l'un des deux établissements est visible ; créés si les deux le sont
drop policy if exists "stock_transfers read" on public.stock_transfers;
create policy "stock_transfers read" on public.stock_transfers for select
  using (public.can_see_entity(from_entity_id) or public.can_see_entity(to_entity_id));
drop policy if exists "stock_transfers write" on public.stock_transfers;
create policy "stock_transfers write" on public.stock_transfers for insert
  with check (public.can_see_entity(from_entity_id) and public.can_see_entity(to_entity_id) and public.my_role() <> 'staff');
