-- MofiGames — Phase 61: Full Favicon / App Icon Set.
-- Site Identity (Admin → Site Settings → Site Identity) previously had a
-- single `favicon_url` column, good enough for one browser-tab icon but
-- not for the full modern icon set browsers/OSes actually request:
-- a multi-res .ico, explicit 16/32 PNGs, an SVG (crisp at any size, and
-- what modern Chrome/Firefox prefer when present), an Apple touch icon
-- for iOS home-screen bookmarks, and 192/512 PNGs for the PWA manifest
-- (Android home screen / install prompts).
--
-- `favicon_url` is kept as-is (not renamed) so existing rows/readers
-- keep working untouched — it continues to back the classic favicon.ico
-- endpoint (src/app/favicon.ico/route.ts). The six columns below are
-- purely additive.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

alter table public.site_identity
  add column if not exists favicon_16_url text,
  add column if not exists favicon_32_url text,
  add column if not exists favicon_svg_url text,
  add column if not exists apple_touch_icon_url text,
  add column if not exists icon_192_url text,
  add column if not exists icon_512_url text;

comment on column public.site_identity.favicon_url is
  'favicon.ico — classic multi-res .ico, served via /favicon.ico.';
comment on column public.site_identity.favicon_16_url is
  'favicon-16x16.png — small browser-tab PNG.';
comment on column public.site_identity.favicon_32_url is
  'favicon-32x32.png — standard browser-tab PNG.';
comment on column public.site_identity.favicon_svg_url is
  'favicon.svg — scalable icon, preferred by modern browsers when present.';
comment on column public.site_identity.apple_touch_icon_url is
  'apple-touch-icon.png, 180x180 — iOS/iPadOS home-screen bookmark icon.';
comment on column public.site_identity.icon_192_url is
  'icon-192.png, 192x192 — PWA manifest icon (Android home screen).';
comment on column public.site_identity.icon_512_url is
  'icon-512.png, 512x512 — PWA manifest icon (install prompt / splash).';

-- No RLS changes needed: these are plain columns on the existing
-- `site_identity` singleton row, already public-read / admin-write
-- (see migration 0022_site_identity_and_menu_links.sql).

-- ---------------------------------------------------------------------------
-- media_assets — allow .ico uploads through the existing "icon" category so
-- favicon.ico can be uploaded/picked from the Media Library like the rest
-- of the set (SVG/PNG/WebP were already allowed). Purely documentation at
-- the DB layer — the actual MIME allow-list lives in
-- src/lib/file-validation.ts — but the category itself already covers it,
-- so no schema change is required here beyond this note.
-- ---------------------------------------------------------------------------
