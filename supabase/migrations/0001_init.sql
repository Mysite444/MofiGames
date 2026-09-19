-- MofiGames — Phase 1: foundation (auth + profiles)
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query).

-- ---------------------------------------------------------------------------
-- profiles
-- One row per user, keyed to auth.users. auth.users already stores email /
-- password (managed by Supabase Auth) — this table is for the extra fields
-- the app needs (display name, join date) that aren't auth data.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default 'Player',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Row Level Security: with RLS on and no policies, a table is fully locked
-- — nobody can read or write anything, even authenticated users. Every
-- policy below is a deliberate, narrow exception to that default-deny.

-- Anyone (including logged-out visitors) can read basic profile info —
-- needed for things like showing a display name next to a comment.
create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

-- A user can only update their own row, never anyone else's.
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- No insert/delete policies on purpose — rows are created automatically by
-- the trigger below (on signup) and removed automatically via the
-- `on delete cascade` above (when the auth.users row is deleted). The app
-- itself never needs to insert or delete a profile directly.

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever someone signs up.
-- SECURITY DEFINER: this function runs with elevated privileges so it can
-- insert into public.profiles on the new user's behalf even though the new
-- user has no session yet at the moment their auth.users row is created.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', 'Player')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
