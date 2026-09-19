-- Migration: per-game "Save Progress" button toggle
-- Adds a boolean flag that lets admins show or hide the Save Progress
-- button in the game player's action bar on a per-game basis.
-- Default TRUE keeps existing behaviour for all current games.

alter table public.games
  add column if not exists save_progress_enabled boolean not null default true;

comment on column public.games.save_progress_enabled is
  'When true, the Save Progress button is shown in the player action bar for this game. '
  'Set false for embed games that manage their own save system.';
