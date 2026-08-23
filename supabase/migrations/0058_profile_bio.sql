-- MofiGames — Profile bio (new field) + length backstops on profiles.name
-- and profiles.bio. Part of the XSS-hardening pass covering usernames and
-- profile descriptions. Run after 0057. Idempotent — safe to re-run.
--
-- The actual defense against XSS is (1) both fields are always rendered
-- as React text nodes, never raw HTML, and (2) src/lib/sanitize-text.ts
-- strips markup/control characters server-side before anything is written
-- here (see updateProfileSchema in src/lib/validation.ts). The CHECK
-- constraints below are a database-level backstop on top of that, so an
-- overlong or malformed value can't land in the table even from a direct
-- write that bypasses the app entirely.

alter table public.profiles add column if not exists bio text not null default '';

-- Clamp any pre-existing data before adding the constraint below, so this
-- migration can't fail against a database that already has rows outside
-- the new bounds.
update public.profiles set name = left(btrim(name), 40) where char_length(name) > 40;
update public.profiles set name = 'Player' where char_length(btrim(name)) = 0;
update public.profiles set bio = left(bio, 300) where char_length(bio) > 300;

alter table public.profiles drop constraint if exists profiles_name_length_check;
alter table public.profiles add constraint profiles_name_length_check
  check (char_length(name) between 1 and 40);

alter table public.profiles drop constraint if exists profiles_bio_length_check;
alter table public.profiles add constraint profiles_bio_length_check
  check (char_length(bio) <= 300);
