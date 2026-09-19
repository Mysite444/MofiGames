-- MofiGames — Migration 0025b: Player Ads.
-- Originally numbered 0025 (conflicting with 0025_copyright_and_parents_page.sql).
-- Renamed to 0025b to resolve the duplicate; runs immediately after 0025.
-- Adds a ninth ad placement to Advertisement Management: the 728x90
-- banner shown directly under the game player on the game page. Distinct
-- from Header Ads (a separate sitewide banner under the site header on
-- every page) and In-Game Ads (the play-gated interstitial). Same
-- enabled/slot_id/code shape as the other simple banner placements
-- (Header, Sidebar, Footer). Run in Supabase SQL Editor. Safe to run
-- multiple times.

alter table public.ad_settings
  add column if not exists player_ads_enabled boolean not null default false,
  add column if not exists player_ads_slot_id text,
  add column if not exists player_ads_code text;
