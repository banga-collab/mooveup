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
