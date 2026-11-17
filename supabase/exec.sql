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
