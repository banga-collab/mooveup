-- =====================================================================
--  Moov'Up CRM : SCRIPT COMPLET DE LA BASE (à exécuter en une seule fois)
--  Supabase → SQL Editor → New query → coller tout ce fichier → Run.
--
--  Fichier GÉNÉRÉ par « node scripts/build-sql.mjs » : ne pas le modifier à la main.
--  Si un module ajoute ou modifie un fichier supabase/*.sql, régénère-le
--  avec cette commande puis ré-exécute-le (il est idempotent : on peut le
--  relancer sans perdre de données).
--
--  Ordre : schema.sql, finance.sql, loyalty.sql, access.sql, care.sql, ops.sql, agenda.sql, corporate.sql, establishments.sql, exec.sql, member.sql, shell.sql, undo.sql, v4-business.sql
--  Généré le 2026-11-19
-- =====================================================================

-- #####################################################################
-- ##  schema.sql
-- #####################################################################

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


-- #####################################################################
-- ##  finance.sql
-- #####################################################################

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


-- #####################################################################
-- ##  loyalty.sql
-- #####################################################################

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


-- #####################################################################
-- ##  access.sql
-- #####################################################################

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


-- #####################################################################
-- ##  care.sql
-- #####################################################################

-- =====================================================================
-- Moov'Up CRM : dossiers clinique / institut / barbier et Moov'Up Kids
-- À exécuter après schema.sql (utilise my_role(), is_direction(), can_see_entity()).
-- =====================================================================

-- Accès aux données médicales : direction, ou membre actif (manager, équipe,
-- réception) rattaché à Anais Clinic ou Anais Institut.
create or replace function public.can_see_medical() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active
      and (p.role = 'direction' or cardinality(p.entity_ids) = 0 or p.entity_ids && array['clinic','institut'])
  )
$$;

-- ---------- Fiche santé-beauté (une par client) ----------
create table if not exists public.care_profiles (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.contacts(id) on delete cascade,
  skin_type text check (skin_type in ('normale','seche','grasse','mixte','sensible')),
  phototype smallint check (phototype between 1 and 6),
  pregnancy text not null default 'non' check (pregnancy in ('non','enceinte','allaitement')),
  contraindications text,
  allergies text,
  treatments text,
  history text,
  notes text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------- Fiches techniques par séance ----------
create table if not exists public.treatment_records (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null check (entity_id in ('clinic','institut','evolve')),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  performed_at timestamptz not null default now(),
  kind text not null default 'autre' check (kind in ('laser','injection','peeling','soin','epilation','autre')),
  service text not null,
  practitioner_id uuid references public.profiles(id) on delete set null,
  zone text,
  product text,
  lot text,
  settings jsonb not null default '{}'::jsonb, -- { fluence, wavelength, spot, quantity }
  observations text,
  side_effects text,
  next_on date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists treatment_records_contact on public.treatment_records (contact_id, performed_at desc);
create index if not exists treatment_records_next on public.treatment_records (next_on) where next_on is not null;

-- ---------- Consentements signés ----------
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null check (entity_id in ('clinic','institut','evolve')),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  template text not null check (template in ('laser','injection','peeling','epilation','soin')),
  title text not null,
  body text not null,            -- texte signé (copie figée)
  signature text not null,       -- image PNG en data URL
  signed_by text not null,
  signed_at timestamptz not null default now(),
  collected_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists consents_contact on public.consents (contact_id);

-- ---------- Photos avant / après ----------
-- url : chemin dans le bucket privé « care-photos » (Storage) ou data URL en démo.
create table if not exists public.care_photos (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null check (entity_id in ('clinic','institut','evolve')),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  kind text not null check (kind in ('avant','apres')),
  zone text not null,
  taken_on date not null default current_date,
  url text not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists care_photos_contact on public.care_photos (contact_id, taken_on);

-- ---------- Moov'Up Kids ----------
create table if not exists public.kids_groups (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null default 'kids',
  name text not null,
  activity text not null,
  age_min smallint not null default 4,
  age_max smallint not null default 14,
  days smallint[] not null default '{}',   -- 1 = lundi … 7 = dimanche
  start_time text not null,
  end_time text not null,
  coach_id uuid references public.profiles(id) on delete set null,
  capacity smallint not null default 12,
  location text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.kids_members (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null default 'kids',
  group_id uuid not null references public.kids_groups(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  status text not null default 'inscrit' check (status in ('inscrit','attente')),
  joined_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (group_id, contact_id)
);

-- Fiche enfant : parents et autorisations (une par enfant)
create table if not exists public.kids_children (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null default 'kids',
  contact_id uuid not null unique references public.contacts(id) on delete cascade,
  parent1_name text,
  parent1_phone text,
  parent1_relation text,
  parent2_name text,
  parent2_phone text,
  parent2_relation text,
  allow_leave_alone boolean not null default false,
  allow_photos boolean not null default false,
  allow_medical boolean not null default true,
  pickup_names text,
  health_notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.kids_attendance (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null default 'kids',
  group_id uuid not null references public.kids_groups(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present','absent','excuse')),
  marked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, contact_id, date)
);
create index if not exists kids_attendance_date on public.kids_attendance (date);

-- ---------- Sécurité (RLS) ----------
alter table public.care_profiles enable row level security;
alter table public.treatment_records enable row level security;
alter table public.consents enable row level security;
alter table public.care_photos enable row level security;
alter table public.kids_groups enable row level security;
alter table public.kids_members enable row level security;
alter table public.kids_children enable row level security;
alter table public.kids_attendance enable row level security;

-- Fiche santé : données médicales
drop policy if exists "care_profiles access" on public.care_profiles;
create policy "care_profiles access" on public.care_profiles for all
  using (public.can_see_medical()) with check (public.can_see_medical());

-- Séances, consentements, photos : établissement visible ET accès médical
-- pour la clinique / l'institut ; l'équipe Evolve voit seulement les fiches d'Evolve.
do $$
declare t text;
begin
  foreach t in array array['treatment_records','consents','care_photos'] loop
    execute format('drop policy if exists "%1$s access" on public.%1$I', t);
    execute format(
      'create policy "%1$s access" on public.%1$I for all
         using (public.can_see_entity(entity_id) and (entity_id = ''evolve'' or public.can_see_medical()))
         with check (public.can_see_entity(entity_id) and (entity_id = ''evolve'' or public.can_see_medical()))', t);
  end loop;
end $$;

-- Kids : toute l'équipe qui a accès à Moov'Up Kids
do $$
declare t text;
begin
  foreach t in array array['kids_members','kids_children','kids_attendance'] loop
    execute format('drop policy if exists "%1$s access" on public.%1$I', t);
    execute format('create policy "%1$s access" on public.%1$I for all using (public.can_see_entity(entity_id)) with check (public.can_see_entity(entity_id))', t);
  end loop;
end $$;

-- Groupes : lecture pour l'équipe Kids, création / modification par la direction et les managers
drop policy if exists "kids_groups read" on public.kids_groups;
create policy "kids_groups read" on public.kids_groups for select using (public.can_see_entity(entity_id));
drop policy if exists "kids_groups manage" on public.kids_groups;
create policy "kids_groups manage" on public.kids_groups for all
  using (public.can_see_entity(entity_id) and public.my_role() in ('direction','manager'))
  with check (public.can_see_entity(entity_id) and public.my_role() in ('direction','manager'));

-- ---------- Stockage des photos (bucket privé) ----------
insert into storage.buckets (id, name, public) values ('care-photos', 'care-photos', false)
  on conflict (id) do nothing;
drop policy if exists "care photos read" on storage.objects;
create policy "care photos read" on storage.objects for select
  using (bucket_id = 'care-photos' and public.can_see_medical());
drop policy if exists "care photos write" on storage.objects;
create policy "care photos write" on storage.objects for insert
  with check (bucket_id = 'care-photos' and public.can_see_medical());
drop policy if exists "care photos delete" on storage.objects;
create policy "care photos delete" on storage.objects for delete
  using (bucket_id = 'care-photos' and public.can_see_medical());


-- #####################################################################
-- ##  ops.sql
-- #####################################################################

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


-- #####################################################################
-- ##  agenda.sql
-- #####################################################################

-- =====================================================================
-- Moov'Up CRM — Agenda : rendez-vous récurrents (séries)
-- À exécuter après schema.sql (utilise can_see_entity, my_role).
-- =====================================================================

create table if not exists public.appointment_series (
  id uuid primary key default gen_random_uuid(),
  entity_id text not null,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  item_id uuid references public.catalog_items(id) on delete set null,
  service text not null,
  staff_id uuid references public.profiles(id) on delete set null,
  freq text not null check (freq in ('weekly','biweekly','monthly')),
  start_date date not null,
  time text not null,
  duration_min int not null check (duration_min between 5 and 600),
  price_mad numeric(12,2) not null default 0,
  room text,
  notes text,
  until_date date,
  occurrences int check (occurrences is null or occurrences between 1 and 52),
  cancelled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists appointment_series_contact on public.appointment_series (contact_id);
create index if not exists appointment_series_entity on public.appointment_series (entity_id);

-- Lien rendez-vous → série
alter table public.appointments add column if not exists series_id uuid references public.appointment_series(id) on delete set null;
create index if not exists appointments_series on public.appointments (series_id);

alter table public.appointment_series enable row level security;

drop policy if exists "appointment_series read" on public.appointment_series;
create policy "appointment_series read" on public.appointment_series for select using (public.can_see_entity(entity_id));
drop policy if exists "appointment_series write" on public.appointment_series;
create policy "appointment_series write" on public.appointment_series for all
  using (public.can_see_entity(entity_id) and public.my_role() in ('direction','manager','reception','staff'))
  with check (public.can_see_entity(entity_id) and public.my_role() in ('direction','manager','reception','staff'));


-- #####################################################################
-- ##  corporate.sql
-- #####################################################################

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


-- #####################################################################
-- ##  establishments.sql
-- #####################################################################

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


-- #####################################################################
-- ##  exec.sql
-- #####################################################################

-- Tableau de bord du dirigeant (/pilotage)
-- Objectif de chiffre d'affaires mensuel par établissement (une ligne par établissement, id = entity_id)

create table if not exists public.monthly_targets (
  id text primary key,
  entity_id text not null unique,
  amount_mad numeric(12,2) not null check (amount_mad >= 0),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.monthly_targets enable row level security;

drop policy if exists "targets read" on public.monthly_targets;
create policy "targets read" on public.monthly_targets for select
  using (public.can_see_entity(entity_id));

drop policy if exists "targets write" on public.monthly_targets;
create policy "targets write" on public.monthly_targets for insert
  with check (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager'));

drop policy if exists "targets update" on public.monthly_targets;
create policy "targets update" on public.monthly_targets for update
  using (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager'))
  with check (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager'));

drop policy if exists "targets delete" on public.monthly_targets;
create policy "targets delete" on public.monthly_targets for delete
  using (public.can_see_entity(entity_id) and public.my_role() in ('direction', 'manager'));


-- #####################################################################
-- ##  member.sql
-- #####################################################################

-- =====================================================================
-- Moov'Up CRM · Espace adhérent (portail client /espace)
-- À exécuter après schema.sql, access.sql et loyalty.sql.
--
-- Un adhérent est un compte Supabase Auth créé depuis /espace/inscription avec
-- raw_user_meta_data.kind = 'member'. Il n'a JAMAIS de ligne dans public.profiles
-- (donc my_role() est NULL pour lui et toutes les politiques de l'équipe le refusent).
-- Il est rattaché à sa fiche client (contacts) via public.member_accounts, uniquement
-- par un e-mail ou un téléphone VÉRIFIÉ par Supabase Auth.
-- Les écritures (rendez-vous, tâches, activités, demandes) passent par le serveur
-- avec la clé de service, après vérification de l'adhérent : aucune politique d'écriture ici.
-- =====================================================================

-- ---------- Comptes adhérents ----------
create table if not exists public.member_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users on delete cascade,
  contact_id uuid unique references public.contacts on delete set null,
  email text,
  phone text,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists member_accounts_phone on public.member_accounts (phone);

-- ---------- Demandes faites depuis l'espace (renouvellement) ----------
create table if not exists public.member_requests (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  kind text not null default 'renouvellement' check (kind in ('renouvellement')),
  contact_id uuid not null references public.contacts on delete cascade,
  entity_id text not null,
  subscription_id uuid references public.subscriptions on delete set null,
  item_id uuid references public.catalog_items on delete set null,
  label text not null,
  amount_mad numeric not null default 0,
  status text not null default 'accueil' check (status in ('a_payer','accueil','paye','traite','annule')),
  task_id uuid references public.tasks on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists member_requests_contact on public.member_requests (contact_id, created_at desc);

-- ---------- Fiche client de l'adhérent connecté ----------
create or replace function public.my_contact_id() returns uuid
language sql stable security definer set search_path = public as $$
  select contact_id from public.member_accounts where user_id = auth.uid()
$$;

-- ---------- Rattachement à la fiche client (e-mail / téléphone vérifiés uniquement) ----------
create or replace function public.member_match_contact(u auth.users) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  v_contact uuid;
  v_digits text;
begin
  if u.email is not null and u.email_confirmed_at is not null then
    select c.id into v_contact from public.contacts c
    where lower(c.email) = lower(u.email)
      and not exists (select 1 from public.member_accounts m where m.contact_id = c.id and m.user_id <> u.id)
    order by c.created_at limit 1;
  end if;
  if v_contact is null and u.phone is not null and u.phone_confirmed_at is not null then
    -- Comparaison sur les 9 derniers chiffres (06…, +212 6…, 00212 6…)
    v_digits := right(regexp_replace(u.phone, '\D', '', 'g'), 9);
    if length(v_digits) = 9 then
      select c.id into v_contact from public.contacts c
      where right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 9) = v_digits
        and not exists (select 1 from public.member_accounts m where m.contact_id = c.id and m.user_id <> u.id)
      order by c.created_at limit 1;
    end if;
  end if;
  return v_contact;
end $$;

-- ---------- Nouveau compte : adhérent OU membre de l'équipe ----------
-- Remplace la fonction de schema.sql : même comportement pour l'équipe,
-- mais un compte « member » crée une ligne member_accounts et JAMAIS de profil d'équipe.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data->>'kind', '') = 'member' then
    insert into public.member_accounts (user_id, contact_id, email, phone)
    values (
      new.id,
      public.member_match_contact(new),
      lower(new.email),
      coalesce(nullif(new.raw_user_meta_data->>'phone', ''), new.phone)
    )
    on conflict (user_id) do nothing;
    return new;
  end if;

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

-- E-mail ou téléphone confirmé plus tard : on rattache le compte adhérent encore orphelin
create or replace function public.handle_member_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_contact uuid;
begin
  if coalesce(new.raw_user_meta_data->>'kind', '') <> 'member' then return new; end if;
  if (new.email_confirmed_at is not distinct from old.email_confirmed_at)
     and (new.phone_confirmed_at is not distinct from old.phone_confirmed_at) then
    return new;
  end if;
  v_contact := public.member_match_contact(new);
  if v_contact is not null then
    update public.member_accounts set contact_id = v_contact
    where user_id = new.id and contact_id is null;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_confirmed_member on auth.users;
create trigger on_auth_user_confirmed_member after update on auth.users
  for each row execute function public.handle_member_confirmed();

-- ---------- Droits (RLS) : un adhérent ne lit que SES données ----------
alter table public.member_accounts enable row level security;
alter table public.member_requests enable row level security;

drop policy if exists "member account self" on public.member_accounts;
create policy "member account self" on public.member_accounts for select using (user_id = auth.uid());
drop policy if exists "member account team" on public.member_accounts;
create policy "member account team" on public.member_accounts for all
  using (public.my_role() in ('direction', 'manager', 'reception'))
  with check (public.my_role() in ('direction', 'manager', 'reception'));

drop policy if exists "member requests self" on public.member_requests;
create policy "member requests self" on public.member_requests for select using (contact_id = public.my_contact_id());
drop policy if exists "member requests team" on public.member_requests;
create policy "member requests team" on public.member_requests for all
  using (public.can_see_entity(entity_id)) with check (public.can_see_entity(entity_id));

-- Lecture seule de ses propres lignes (ces politiques s'ajoutent à celles de l'équipe)
drop policy if exists "member self" on public.contacts;
create policy "member self" on public.contacts for select using (id = public.my_contact_id());

do $$
declare t text;
begin
  foreach t in array array['subscriptions','appointments','sales','loyalty_ledger','member_cards','online_bookings','reviews'] loop
    execute format('drop policy if exists "member self" on public.%I', t);
    execute format('create policy "member self" on public.%I for select using (contact_id = public.my_contact_id())', t);
  end loop;
end $$;

drop policy if exists "member self" on public.sale_items;
create policy "member self" on public.sale_items for select
  using (exists (select 1 from public.sales s where s.id = sale_id and s.contact_id = public.my_contact_id()));

drop policy if exists "member self" on public.gift_cards;
create policy "member self" on public.gift_cards for select
  using (beneficiary_contact_id = public.my_contact_id() or buyer_contact_id = public.my_contact_id());

drop policy if exists "member self" on public.gift_card_uses;
create policy "member self" on public.gift_card_uses for select
  using (exists (
    select 1 from public.gift_cards g where g.id = card_id
      and (g.beneficiary_contact_id = public.my_contact_id() or g.buyer_contact_id = public.my_contact_id())
  ));

drop policy if exists "member self" on public.referrals;
create policy "member self" on public.referrals for select using (referrer_id = public.my_contact_id());

-- Catalogue actif : visible des adhérents rattachés (formules à renouveler, prestations réservables)
drop policy if exists "member catalog" on public.catalog_items;
create policy "member catalog" on public.catalog_items for select using (active and public.my_contact_id() is not null);


-- #####################################################################
-- ##  shell.sql
-- #####################################################################

-- =====================================================================
-- Moov'Up CRM : coquille de l'application (vues enregistrées, notifications lues)
-- À exécuter après schema.sql
-- =====================================================================

-- Vues enregistrées (filtres d'une liste), propres à chaque membre
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 60),
  href text not null check (href like '/%'),
  icon text,
  created_at timestamptz not null default now()
);
create index if not exists saved_views_user_idx on public.saved_views (user_id, created_at);

alter table public.saved_views enable row level security;
drop policy if exists "saved_views: mes vues" on public.saved_views;
create policy "saved_views: mes vues" on public.saved_views
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Notifications marquées comme lues (les notifications sont calculées à la volée)
create table if not exists public.notification_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  read_at timestamptz not null default now(),
  unique (user_id, key)
);
create index if not exists notification_reads_user_idx on public.notification_reads (user_id, read_at desc);

alter table public.notification_reads enable row level security;
drop policy if exists "notification_reads: mes lectures" on public.notification_reads;
create policy "notification_reads: mes lectures" on public.notification_reads
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- #####################################################################
-- ##  undo.sql
-- #####################################################################

-- Annulation (5 s) des actions réversibles : état précédent mémorisé par jeton.
-- Écrit par src/lib/undo.ts (recordUndo), lu par src/actions/undo.ts (undoAction).

create table if not exists public.undo_log (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  -- { ops: [{ op: "update" | "restore" | "remove", table, ... }], message?, href? }
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists undo_log_user on public.undo_log (user_id, expires_at);

alter table public.undo_log enable row level security;

-- Chacun ne voit et n'utilise que ses propres jetons
drop policy if exists "undo_log own" on public.undo_log;
create policy "undo_log own" on public.undo_log for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- #####################################################################
-- ##  v4-business.sql
-- #####################################################################

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


-- ---------- Compléments de mise en ligne ----------
-- Bucket privé des sauvegardes automatiques (écrit par /api/backup avec la clé service).
-- Aucune règle d'accès : seule la clé service (serveur) peut y lire et écrire.
insert into storage.buckets (id, name, public) values ('sauvegardes', 'sauvegardes', false)
  on conflict (id) do nothing;
