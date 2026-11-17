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
