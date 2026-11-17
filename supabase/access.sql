-- =====================================================================
-- Moov'Up CRM · Module Accueil : cartes membres (QR), entrées, réservations en ligne
-- À exécuter après schema.sql (utilise my_role(), can_see_entity(), can_see_any()).
-- =====================================================================

-- ---------- Cartes membres : un code unique par client ----------
create table if not exists public.member_cards (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.contacts on delete cascade,
  code text not null unique check (code ~ '^MU-[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  regenerated_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Entrées (passages à l'accueil) ----------
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts on delete cascade,
  entity_id text not null,
  subscription_id uuid references public.subscriptions on delete set null,
  appointment_id uuid references public.appointments on delete set null,
  method text not null default 'qr' check (method in ('qr','recherche','rdv','manuel')),
  session_used boolean not null default false,
  forced boolean not null default false,
  force_reason text,
  by_id uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  check (not forced or coalesce(length(trim(force_reason)), 0) > 0)
);
create index if not exists checkins_day on public.checkins (entity_id, created_at desc);
create index if not exists checkins_contact on public.checkins (contact_id, created_at desc);

-- ---------- Réservations en ligne ----------
create table if not exists public.online_bookings (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  entity_id text not null,
  contact_id uuid not null references public.contacts on delete cascade,
  appointment_id uuid references public.appointments on delete set null,
  item_id uuid references public.catalog_items on delete set null,
  service text not null,
  starts_at timestamptz not null,
  duration_min int not null default 60,
  price_mad numeric not null default 0,
  full_name text not null,
  phone text not null,
  email text,
  status text not null default 'nouvelle' check (status in ('nouvelle','confirmee','annulee')),
  source text not null default 'en_ligne',
  deposit_mad numeric not null default 0,
  deposit_status text not null default 'aucun' check (deposit_status in ('aucun','a_payer','paye','accueil')),
  created_at timestamptz not null default now()
);
create index if not exists online_bookings_entity on public.online_bookings (entity_id, starts_at);

-- ---------- Droits (RLS) ----------
alter table public.member_cards enable row level security;
alter table public.checkins enable row level security;
alter table public.online_bookings enable row level security;

-- Carte : visible si le client est visible (au moins un établissement autorisé)
drop policy if exists "member_cards access" on public.member_cards;
create policy "member_cards access" on public.member_cards for all
  using (public.my_role() is not null and exists (
    select 1 from public.contacts c where c.id = contact_id and (cardinality(c.entity_ids) = 0 or public.can_see_any(c.entity_ids))))
  with check (public.my_role() is not null and exists (
    select 1 from public.contacts c where c.id = contact_id and (cardinality(c.entity_ids) = 0 or public.can_see_any(c.entity_ids))));

-- Entrées : par établissement. Les entrées forcées ne peuvent être créées que par un manager / la direction.
drop policy if exists "checkins read" on public.checkins;
create policy "checkins read" on public.checkins for select using (public.can_see_entity(entity_id));
drop policy if exists "checkins insert" on public.checkins;
create policy "checkins insert" on public.checkins for insert
  with check (public.can_see_entity(entity_id) and (not forced or public.my_role() in ('direction','manager')));
drop policy if exists "checkins manage" on public.checkins;
create policy "checkins manage" on public.checkins for delete using (public.can_see_entity(entity_id) and public.my_role() in ('direction','manager'));

-- Réservations en ligne : lecture / suivi par l'équipe de l'établissement.
-- La création publique (page /reserver, sans connexion) passe par le serveur avec la clé service
-- (SUPABASE_SERVICE_ROLE_KEY), qui contourne la RLS ; aucune écriture anonyme n'est ouverte.
drop policy if exists "online_bookings access" on public.online_bookings;
create policy "online_bookings access" on public.online_bookings for all
  using (public.can_see_entity(entity_id)) with check (public.can_see_entity(entity_id));
