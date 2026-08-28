-- MofiGames — Phase 3: real games + categories in the database, managed
-- through an admin panel instead of code. Run in Supabase SQL Editor.
-- Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- Admin role — a simple boolean flag on profiles. No separate roles table;
-- one flag is all this needs right now.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Helper used throughout the policies below. SECURITY DEFINER so it can
-- read profiles regardless of the caller's own row-level permissions.
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table if not exists public.categories (
  slug text primary key,
  name text not null,
  icon text not null default 'Gamepad2',
  color_from text not null default '#8b5cf6',
  color_to text not null default '#ec4899',
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists "Categories are publicly readable" on public.categories;
create policy "Categories are publicly readable"
  on public.categories for select
  using (true);

drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories"
  on public.categories for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- games
-- play_type 'embed'  → embed_url is an iframe src hosted elsewhere.
-- play_type 'upload' → storage_path points at the entry HTML file of a
--   build uploaded to the game-files storage bucket (e.g.
--   "game-files/some-slug/index.html").
-- ---------------------------------------------------------------------------
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  category_slug text not null references public.categories (slug) on delete restrict,
  description text not null default '',
  thumbnail_url text,
  play_type text not null default 'embed' check (play_type in ('embed', 'upload')),
  embed_url text,
  storage_path text,
  tag text check (tag in ('TOP', 'HOT', 'NEW', 'UPDATED')),
  rating numeric(2,1) not null default 4.5,
  plays bigint not null default 0,
  multiplayer boolean not null default false,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists games_category_slug_idx on public.games (category_slug);
create index if not exists games_published_idx on public.games (is_published);

alter table public.games enable row level security;

-- Visitors only ever see published games; admins see everything (so the
-- admin panel can list drafts too).
drop policy if exists "Published games are publicly readable" on public.games;
create policy "Published games are publicly readable"
  on public.games for select
  using (is_published = true or public.is_admin());

drop policy if exists "Admins can manage games" on public.games;
create policy "Admins can manage games"
  on public.games for all
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: thumbnails + uploaded game builds. Both buckets are public-read
-- (so game pages/thumbnails load without auth), admin-write only.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('game-thumbnails', 'game-thumbnails', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('game-files', 'game-files', true)
on conflict (id) do nothing;

drop policy if exists "Public read game-thumbnails" on storage.objects;
create policy "Public read game-thumbnails"
  on storage.objects for select
  using (bucket_id = 'game-thumbnails');

drop policy if exists "Public read game-files" on storage.objects;
create policy "Public read game-files"
  on storage.objects for select
  using (bucket_id = 'game-files');

drop policy if exists "Admins can write game-thumbnails" on storage.objects;
create policy "Admins can write game-thumbnails"
  on storage.objects for insert
  with check (bucket_id = 'game-thumbnails' and public.is_admin());

drop policy if exists "Admins can update game-thumbnails" on storage.objects;
create policy "Admins can update game-thumbnails"
  on storage.objects for update
  using (bucket_id = 'game-thumbnails' and public.is_admin());

drop policy if exists "Admins can delete game-thumbnails" on storage.objects;
create policy "Admins can delete game-thumbnails"
  on storage.objects for delete
  using (bucket_id = 'game-thumbnails' and public.is_admin());

drop policy if exists "Admins can write game-files" on storage.objects;
create policy "Admins can write game-files"
  on storage.objects for insert
  with check (bucket_id = 'game-files' and public.is_admin());

drop policy if exists "Admins can update game-files" on storage.objects;
create policy "Admins can update game-files"
  on storage.objects for update
  using (bucket_id = 'game-files' and public.is_admin());

drop policy if exists "Admins can delete game-files" on storage.objects;
create policy "Admins can delete game-files"
  on storage.objects for delete
  using (bucket_id = 'game-files' and public.is_admin());
