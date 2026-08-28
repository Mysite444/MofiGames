-- MofiGames — Phase 2: favorites + recently played, synced to the account.
-- Run in Supabase Dashboard → SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- favorites — one row per (user, game). Existence of the row = favorited.
-- ---------------------------------------------------------------------------
create table if not exists public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

alter table public.favorites enable row level security;

drop policy if exists "Users can view their own favorites" on public.favorites;
create policy "Users can view their own favorites"
  on public.favorites for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own favorites" on public.favorites;
create policy "Users can add their own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can remove their own favorites" on public.favorites;
create policy "Users can remove their own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- recently_played — one row per (user, game), played_at bumped on replay
-- instead of duplicating rows. Reading orders by played_at desc + limit to
-- get "most recent first, capped".
-- ---------------------------------------------------------------------------
create table if not exists public.recently_played (
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  played_at timestamptz not null default now(),
  primary key (user_id, slug)
);

alter table public.recently_played enable row level security;

drop policy if exists "Users can view their own recently played" on public.recently_played;
create policy "Users can view their own recently played"
  on public.recently_played for select
  using (auth.uid() = user_id);

drop policy if exists "Users can add their own recently played" on public.recently_played;
create policy "Users can add their own recently played"
  on public.recently_played for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own recently played" on public.recently_played;
create policy "Users can update their own recently played"
  on public.recently_played for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can clear their own recently played" on public.recently_played;
create policy "Users can clear their own recently played"
  on public.recently_played for delete
  using (auth.uid() = user_id);

create index if not exists recently_played_user_played_at_idx
  on public.recently_played (user_id, played_at desc);
