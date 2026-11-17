-- ============================================================
-- Moov'Up CRM : fidélité groupe, cartes cadeaux, parrainage,
-- rappels WhatsApp automatiques et avis clients.
-- À exécuter après schema.sql.
-- ============================================================

-- Points de fidélité (programme commun aux 7 établissements)
create table if not exists public.loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  entity_id text not null,
  points integer not null,
  kind text not null check (kind in ('gain','utilisation','parrainage','ajustement','annulation')),
  sale_id uuid references public.sales(id) on delete set null,
  voucher_code text unique,
  value_mad numeric(10,2),
  voucher_used boolean not null default false,
  note text,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists loyalty_ledger_contact on public.loyalty_ledger(contact_id);
create index if not exists loyalty_ledger_sale on public.loyalty_ledger(sale_id);

-- Cartes cadeaux
create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  amount_mad numeric(10,2) not null check (amount_mad > 0),
  balance_mad numeric(10,2) not null check (balance_mad >= 0),
  buyer_contact_id uuid references public.contacts(id) on delete set null,
  buyer_name text,
  beneficiary_contact_id uuid references public.contacts(id) on delete set null,
  beneficiary_name text,
  entity_ids text[] not null default '{}',
  entity_id text not null,
  expires_on date not null,
  status text not null default 'active' check (status in ('active','epuisee','expiree','annulee')),
  message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.gift_card_uses (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.gift_cards(id) on delete cascade,
  entity_id text not null,
  amount_mad numeric(10,2) not null check (amount_mad > 0),
  note text,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Parrainage
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.contacts(id) on delete cascade,
  referee_id uuid not null unique references public.contacts(id) on delete cascade,
  entity_id text,
  status text not null default 'en_attente' check (status in ('en_attente','valide')),
  bonus_points integer not null default 0,
  rewarded_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (referrer_id <> referee_id)
);

-- Règles des rappels automatiques (id = clé de la règle définie dans le code)
create table if not exists public.automation_rules (
  id text primary key,
  enabled boolean not null default true,
  message text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Journal des messages WhatsApp
create table if not exists public.message_log (
  id uuid primary key default gen_random_uuid(),
  rule_key text,
  contact_id uuid references public.contacts(id) on delete cascade,
  entity_id text,
  phone text,
  body text not null,
  status text not null check (status in ('envoye','simule','echec')),
  mode text not null check (mode in ('api','lien','demo')),
  error text,
  ref_id uuid,
  day_key date not null default (now() at time zone 'Africa/Casablanca')::date,
  wa_message_id text,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists message_log_dedupe on public.message_log(rule_key, contact_id, day_key);

-- Avis clients (lien public /r/<token>)
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  entity_id text not null,
  appointment_id uuid references public.appointments(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  service text,
  rating smallint check (rating between 1 and 5),
  comment text,
  answered_at timestamptz,
  handled boolean not null default false,
  handled_at timestamptz,
  handled_by uuid references public.profiles(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Sécurité ----------
alter table public.loyalty_ledger enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_uses enable row level security;
alter table public.referrals enable row level security;
alter table public.automation_rules enable row level security;
alter table public.message_log enable row level security;
alter table public.reviews enable row level security;

-- Programme commun : toute l'équipe voit les soldes du groupe,
-- mais n'écrit que pour ses établissements.
drop policy if exists "ledger read" on public.loyalty_ledger;
create policy "ledger read" on public.loyalty_ledger for select using (public.my_role() is not null);
drop policy if exists "ledger write" on public.loyalty_ledger;
create policy "ledger write" on public.loyalty_ledger for insert with check (public.can_see_entity(entity_id));
drop policy if exists "ledger update" on public.loyalty_ledger;
create policy "ledger update" on public.loyalty_ledger for update using (public.my_role() is not null) with check (public.my_role() is not null);

drop policy if exists "gift read" on public.gift_cards;
create policy "gift read" on public.gift_cards for select using (public.my_role() is not null);
drop policy if exists "gift insert" on public.gift_cards;
create policy "gift insert" on public.gift_cards for insert with check (public.can_see_entity(entity_id));
drop policy if exists "gift update" on public.gift_cards;
create policy "gift update" on public.gift_cards for update using (public.my_role() is not null) with check (public.my_role() is not null);

drop policy if exists "gift uses" on public.gift_card_uses;
create policy "gift uses" on public.gift_card_uses for all using (public.my_role() is not null) with check (public.can_see_entity(entity_id));

drop policy if exists "referrals access" on public.referrals;
create policy "referrals access" on public.referrals for all using (public.my_role() is not null) with check (public.my_role() is not null);

drop policy if exists "automation read" on public.automation_rules;
create policy "automation read" on public.automation_rules for select using (public.my_role() is not null);
drop policy if exists "automation write" on public.automation_rules;
create policy "automation write" on public.automation_rules for all
  using (public.my_role() in ('direction','manager','reception'))
  with check (public.my_role() in ('direction','manager','reception'));

drop policy if exists "message log access" on public.message_log;
create policy "message log access" on public.message_log for all
  using (public.my_role() is not null and (entity_id is null or public.can_see_entity(entity_id)))
  with check (public.my_role() is not null and (entity_id is null or public.can_see_entity(entity_id)));

drop policy if exists "reviews access" on public.reviews;
create policy "reviews access" on public.reviews for all using (public.can_see_entity(entity_id)) with check (public.can_see_entity(entity_id));

-- La page publique /r/<token> et la route /api/cron utilisent la clé
-- SUPABASE_SERVICE_ROLE_KEY côté serveur (jamais exposée au navigateur).
