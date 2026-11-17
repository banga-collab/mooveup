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
