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
