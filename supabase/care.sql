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
