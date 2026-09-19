-- MofiGames — Posts CMS upgrade: add Twitter/X social fields that were
-- added to `games` in migration 0010 but were omitted from `posts`.
-- Required by the Social tab in the upgraded PostsAdminClient editor.
-- Safe to run multiple times (all `if not exists`).

alter table public.posts
  add column if not exists twitter_title       text not null default '';

alter table public.posts
  add column if not exists twitter_description text not null default '';

alter table public.posts
  add column if not exists twitter_image_url   text;

alter table public.posts
  add column if not exists twitter_image_alt   text not null default '';

-- Rollback:
--   alter table public.posts drop column if exists twitter_image_alt;
--   alter table public.posts drop column if exists twitter_image_url;
--   alter table public.posts drop column if exists twitter_description;
--   alter table public.posts drop column if exists twitter_title;
