-- MofiGames — Migration 0068: Three-variant game covers
-- Adds landscape_cover_url, square_cover_url, portrait_cover_url to the
-- games table so each card layout can pull the right crop without any
-- CSS stretching or object-fit cropping of important artwork.
--
-- All three columns are nullable TEXT (same as the existing
-- thumbnail_url / cover_image_url) so this migration is fully additive —
-- existing rows are unaffected and the fallback chain in game-cover.ts
-- makes every existing game continue to work without any manual edits.
--
-- Aspect-ratio targets (enforced in the admin UI, not at the DB level):
--   landscape_cover_url  → 16:9  (1280 × 720 recommended)
--   square_cover_url     →  1:1  ( 800 × 800 recommended)
--   portrait_cover_url   →  2:3  ( 800 × 1200 recommended)
--
-- Safe to run multiple times (idempotent ADD COLUMN IF NOT EXISTS).

alter table public.games
  add column if not exists landscape_cover_url text,
  add column if not exists square_cover_url    text,
  add column if not exists portrait_cover_url  text;

-- No new RLS policies needed — these three columns live on the same
-- `games` row, so they're already covered by:
--   "Published games are publicly readable" (migration 0003)
--   "Admins can manage games"               (migration 0003)
