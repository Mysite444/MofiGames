-- MofiGames — Phase 33: Cache Management, Phase 1 of the Admin → Cache
-- build-out (Browser Cache / Client-Side).
--
-- Scope of this phase deliberately stops at what's actually
-- runtime-configurable without a redeploy:
--   - Next.js already forces `Cache-Control: public, max-age=31536000,
--     immutable` on hashed /_next/static assets and generates ETags for
--     HTML pages by default — nothing to store for either of those.
--   - Every media/game-file upload (src/lib/supabase/admin-content.ts)
--     sets its own `Cache-Control` at upload time via the Storage SDK's
--     `cacheControl` option. That duration was hardcoded to "3600"
--     everywhere; this table makes it configurable per bucket instead,
--     since content_images/game_thumbnails/game_media/media_library are
--     all uploaded to a path stamped with Date.now() (i.e. already
--     content-versioned — a long, effectively-immutable cache is safe)
--     while game_files is uploaded to a *stable* path per build file
--     (re-uploading a build overwrites the same path), so it gets its
--     own, much shorter, ceiling.
--   - A Service Worker is genuinely dynamic (Admin → Cache → Browser
--     Cache toggles it) — see src/app/sw.js/route.ts, which reads this
--     table on every request instead of shipping a static /public/sw.js.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.cache_settings (
  id boolean primary key default true,

  -- Storage upload cache duration, in seconds, per bucket. The three
  -- "*_max_age" columns below back Date.now()-stamped buckets (safe to
  -- cache for up to a year since the URL itself changes on every
  -- upload); game_files_max_age backs the one bucket that overwrites a
  -- stable path in place, so it's capped much lower (see check below).
  content_images_max_age int not null default 31536000
    check (content_images_max_age between 60 and 31536000),
  game_thumbnails_max_age int not null default 31536000
    check (game_thumbnails_max_age between 60 and 31536000),
  game_media_max_age int not null default 31536000
    check (game_media_max_age between 60 and 31536000),
  media_library_max_age int not null default 31536000
    check (media_library_max_age between 60 and 31536000),
  game_files_max_age int not null default 3600
    check (game_files_max_age between 60 and 604800),

  -- Admin → Cache → Browser Cache → Service Worker.
  service_worker_enabled boolean not null default false,
  -- Bumped whenever the admin wants to force every visitor's SW to drop
  -- its old cache and re-populate (e.g. after changing what gets
  -- precached) — see CACHE_VERSION in src/app/sw.js/route.ts.
  service_worker_cache_version int not null default 1
    check (service_worker_cache_version >= 1),

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint cache_settings_single_row check (id)
);

insert into public.cache_settings (id) values (true) on conflict (id) do nothing;

alter table public.cache_settings enable row level security;

-- Publicly readable: the upload helpers run in the browser under
-- whatever session the signed-in editor/admin has, and the service
-- worker route needs to read `service_worker_enabled` on every
-- (unauthenticated, first-visit) page load. Nothing in this row is
-- sensitive — it's cache durations and a version counter.
drop policy if exists "Cache settings are publicly readable" on public.cache_settings;
create policy "Cache settings are publicly readable"
  on public.cache_settings for select
  using (true);

drop policy if exists "Admins can update cache settings" on public.cache_settings;
create policy "Admins can update cache settings"
  on public.cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());
