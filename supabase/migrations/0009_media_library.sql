-- MofiGames — Phase 9: Media Management (Images, Thumbnails, Icons, Videos, GIFs).
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- media_assets — one row per file uploaded through Admin → Media Management.
-- `category` is which sub-library it belongs to; the file itself lives in
-- the `media-library` storage bucket below, namespaced by category.
-- ---------------------------------------------------------------------------
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('image', 'thumbnail', 'icon', 'video', 'gif')),
  file_name text not null,
  storage_path text not null,
  url text not null,
  mime_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);

create index if not exists media_assets_category_idx
  on public.media_assets (category, created_at desc);

alter table public.media_assets enable row level security;

-- Public read: media referenced by slug/gif/thumbnail elsewhere on the site
-- (e.g. an icon picked here and used on a public page) should resolve for
-- anyone, same as game-thumbnails/game-media.
drop policy if exists "Media assets are publicly readable" on public.media_assets;
create policy "Media assets are publicly readable"
  on public.media_assets for select
  using (true);

drop policy if exists "Admins can manage media assets" on public.media_assets;
create policy "Admins can manage media assets"
  on public.media_assets for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: media-library bucket, shared across all five categories above
-- (objects are namespaced "{category}/{filename}"). Public-read, admin-write,
-- same pattern as game-thumbnails/game-files/content-images/game-media.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media-library', 'media-library', true)
on conflict (id) do nothing;

drop policy if exists "Public read media-library" on storage.objects;
create policy "Public read media-library"
  on storage.objects for select
  using (bucket_id = 'media-library');

drop policy if exists "Admins can write media-library" on storage.objects;
create policy "Admins can write media-library"
  on storage.objects for insert
  with check (bucket_id = 'media-library' and public.is_admin());

drop policy if exists "Admins can update media-library" on storage.objects;
create policy "Admins can update media-library"
  on storage.objects for update
  using (bucket_id = 'media-library' and public.is_admin());

drop policy if exists "Admins can delete media-library" on storage.objects;
create policy "Admins can delete media-library"
  on storage.objects for delete
  using (bucket_id = 'media-library' and public.is_admin());
