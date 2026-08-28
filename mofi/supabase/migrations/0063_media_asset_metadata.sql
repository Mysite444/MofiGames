-- MofiGames — Media Library: editable metadata for the "Edit Media" workflow.
--
-- media_assets (0009) only ever recorded what got captured automatically at
-- upload time (file_name, mime_type, file_size, storage_path/url). There
-- was no way to rename an asset's display name after the fact, or attach
-- alt text / a title / a description to it — Admin → Media Management could
-- only upload, copy the URL, and delete. This adds the missing columns so
-- the admin UI can support a proper rename/edit panel per asset.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

alter table public.media_assets
  add column if not exists alt_text text,
  add column if not exists title text,
  add column if not exists description text,
  -- Natural pixel dimensions, captured client-side at upload time for
  -- images/gifs/videos (an <img>/<video> load in the browser — this project
  -- has no server-side image-processing dependency). Nullable: unknown for
  -- assets uploaded before this column existed, or when the browser
  -- couldn't determine it (e.g. a sourceless SVG). The admin edit panel can
  -- backfill it on demand — see "Detect" in MediaAdminClient.
  add column if not exists width integer,
  add column if not exists height integer,
  add column if not exists updated_at timestamptz not null default now();

-- Reuses the shared public.set_updated_at() trigger function defined in
-- 0003_games_and_admin.sql — same pattern as analytics_settings (0011),
-- seo_settings (0010), game_reviews (0059), etc.
drop trigger if exists media_assets_set_updated_at on public.media_assets;
create trigger media_assets_set_updated_at
  before update on public.media_assets
  for each row execute function public.set_updated_at();

-- No RLS changes needed: "Admins can manage media assets" (0009) already
-- grants admins `for all` (select/insert/update/delete) on this table, so
-- it already covers the UPDATE the edit panel needs.
