-- MofiGames — Phase 16: Automation.
-- Job registry + run history + notifications, game-provider import
-- pipeline, and the extra `games` columns automated checks need to track
-- state on (embed/link health, scheduling, import provenance).
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- games — new columns used by the automation jobs below. All nullable or
-- defaulted so this is a no-op for existing rows.
-- ---------------------------------------------------------------------------
alter table public.games add column if not exists scheduled_publish_at timestamptz;

alter table public.games add column if not exists embed_status text not null default 'unknown';
alter table public.games drop constraint if exists games_embed_status_check;
alter table public.games add constraint games_embed_status_check
  check (embed_status in ('unknown', 'online', 'offline'));
alter table public.games add column if not exists embed_checked_at timestamptz;
alter table public.games add column if not exists embed_fail_count integer not null default 0;

alter table public.games add column if not exists link_status text not null default 'unknown';
alter table public.games drop constraint if exists games_link_status_check;
alter table public.games add constraint games_link_status_check
  check (link_status in ('unknown', 'ok', 'broken'));
alter table public.games add column if not exists link_checked_at timestamptz;

alter table public.games add column if not exists import_source text;
alter table public.games add column if not exists import_external_id text;
alter table public.games add column if not exists imported_at timestamptz;

create index if not exists games_scheduled_publish_idx on public.games (scheduled_publish_at)
  where scheduled_publish_at is not null and is_published = false;
create index if not exists games_embed_status_idx on public.games (embed_status);
create index if not exists games_link_status_idx on public.games (link_status);
create unique index if not exists games_import_source_external_id_idx
  on public.games (import_source, import_external_id)
  where import_source is not null and import_external_id is not null;

-- ---------------------------------------------------------------------------
-- automation_jobs — one row per automation feature. `key` is the stable
-- identifier code refers to (see src/lib/automation/registry.ts);
-- everything else is admin-editable configuration for that job.
-- schedule_cron is a standard 5-field cron expression, interpreted by
-- src/lib/automation/cron.ts. next_run_at is (re)computed after every run
-- (manual or scheduled) so /api/admin/automation/cron only has to ask
-- "what's due" instead of re-parsing cron on every tick.
-- ---------------------------------------------------------------------------
create table if not exists public.automation_jobs (
  key text primary key,
  name text not null,
  category text not null,
  description text not null default '',
  enabled boolean not null default true,
  schedule_cron text not null default '0 * * * *',
  config jsonb not null default '{}'::jsonb,
  last_run_at timestamptz,
  last_status text,
  last_summary jsonb,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.automation_jobs enable row level security;

drop policy if exists "Admins can manage automation jobs" on public.automation_jobs;
create policy "Admins can manage automation jobs"
  on public.automation_jobs for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists automation_jobs_set_updated_at on public.automation_jobs;
create trigger automation_jobs_set_updated_at
  before update on public.automation_jobs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- automation_job_runs — the Task Queue & Job Log. One row per execution of
-- a job, whether triggered by cron or an admin clicking "Run now".
-- ---------------------------------------------------------------------------
create table if not exists public.automation_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null references public.automation_jobs (key) on delete cascade,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  triggered_by text not null default 'manual' check (triggered_by in ('manual', 'cron')),
  triggered_by_user uuid references auth.users (id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  items_processed integer not null default 0,
  items_ok integer not null default 0,
  items_failed integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  error text
);

create index if not exists automation_job_runs_job_key_idx on public.automation_job_runs (job_key, started_at desc);
create index if not exists automation_job_runs_status_idx on public.automation_job_runs (status);

alter table public.automation_job_runs enable row level security;

drop policy if exists "Admins can manage automation job runs" on public.automation_job_runs;
create policy "Admins can manage automation job runs"
  on public.automation_job_runs for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- automation_notifications — surfaced in the admin bell / Automation
-- dashboard when a job fails. A webhook (Slack/Discord-compatible) or
-- notification email can additionally be configured on the
-- `email_notifications` job's config; see src/lib/automation/notify.ts.
-- ---------------------------------------------------------------------------
create table if not exists public.automation_notifications (
  id uuid primary key default gen_random_uuid(),
  job_key text not null references public.automation_jobs (key) on delete cascade,
  run_id uuid references public.automation_job_runs (id) on delete cascade,
  level text not null default 'error' check (level in ('info', 'error')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists automation_notifications_unread_idx on public.automation_notifications (is_read, created_at desc);

alter table public.automation_notifications enable row level security;

drop policy if exists "Admins can manage automation notifications" on public.automation_notifications;
create policy "Admins can manage automation notifications"
  on public.automation_notifications for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- import_providers — external game feeds the Auto Import Games job pulls
-- from. `feed_url` must resolve to a JSON array of game-shaped objects;
-- field_map lets an admin point at whatever key names that provider uses
-- (e.g. {"title": "name", "embed_url": "play_url"}) without code changes.
-- ---------------------------------------------------------------------------
create table if not exists public.import_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  feed_url text not null,
  field_map jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.import_providers enable row level security;

drop policy if exists "Admins can manage import providers" on public.import_providers;
create policy "Admins can manage import providers"
  on public.import_providers for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists import_providers_set_updated_at on public.import_providers;
create trigger import_providers_set_updated_at
  before update on public.import_providers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- import_rules — per-provider behavior: what to do with each incoming
-- game. One row per provider (enforced with a unique constraint, not a
-- 1:1 PK, so a rule can be created after its provider without a migration
-- change).
-- ---------------------------------------------------------------------------
create table if not exists public.import_rules (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.import_providers (id) on delete cascade,
  schedule_cron text,
  auto_publish boolean not null default false,
  skip_duplicate_games boolean not null default true,
  auto_update_existing_games boolean not null default true,
  default_category_slug text references public.categories (slug) on delete set null,
  default_tag_ids uuid[] not null default '{}',
  max_items_per_run integer not null default 100,
  max_retries integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id)
);

alter table public.import_rules enable row level security;

drop policy if exists "Admins can manage import rules" on public.import_rules;
create policy "Admins can manage import rules"
  on public.import_rules for all
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists import_rules_set_updated_at on public.import_rules;
create trigger import_rules_set_updated_at
  before update on public.import_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Storage: scheduled database backups (JSON exports of core tables).
-- Admin-only, not public — these can contain full content dumps.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('automation-backups', 'automation-backups', false)
on conflict (id) do nothing;

drop policy if exists "Admins can read automation-backups" on storage.objects;
create policy "Admins can read automation-backups"
  on storage.objects for select
  using (bucket_id = 'automation-backups' and public.is_admin());

drop policy if exists "Admins can write automation-backups" on storage.objects;
create policy "Admins can write automation-backups"
  on storage.objects for insert
  with check (bucket_id = 'automation-backups' and public.is_admin());

drop policy if exists "Admins can delete automation-backups" on storage.objects;
create policy "Admins can delete automation-backups"
  on storage.objects for delete
  using (bucket_id = 'automation-backups' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed the job registry. `on conflict do nothing` so re-running this
-- migration never clobbers an admin's saved schedule/config.
-- ---------------------------------------------------------------------------
insert into public.automation_jobs (key, name, category, description, schedule_cron, config) values
  ('scheduled_publishing', 'Scheduled Publishing', 'Publishing',
   'Publishes draft games automatically once their scheduled publish time arrives.',
   '*/5 * * * *', '{}'),
  ('auto_import_games', 'Auto Import Games', 'Import',
   'Pulls new games from every enabled provider feed and applies each provider''s import rules.',
   '0 * * * *', '{}'),
  ('auto_retry_failed_imports', 'Auto Retry Failed Imports', 'Import',
   'Re-runs the import for any provider whose last run failed or was partial, up to that provider''s max retries.',
   '15 * * * *', '{}'),
  ('auto_thumbnail_generation', 'Auto Thumbnail Generation', 'Media',
   'Flags published games with no thumbnail and generates a placeholder cover from the game title so the catalog never shows a blank tile.',
   '30 * * * *', '{}'),
  ('auto_image_optimization', 'Auto Image Optimization', 'Media',
   'Scans game media for oversized images and flags them for optimization.',
   '0 3 * * *', '{"maxKb": 500}'),
  ('auto_webp_conversion', 'Auto WebP Conversion', 'Media',
   'Flags non-WebP thumbnails/cover images so they can be converted for faster loads.',
   '0 3 * * *', '{}'),
  ('broken_embed_checker', 'Broken Embed Checker', 'Health',
   'Pings every published game''s play URL (embed or uploaded build) and records whether it currently loads.',
   '0 */6 * * *', '{}'),
  ('dead_link_scanner', 'Dead Link Scanner', 'Health',
   'Pings every published game''s media URLs (thumbnail, cover image, trailer, preview) for broken links.',
   '0 */6 * * *', '{}'),
  ('auto_link_validation', 'Auto Link Validation', 'Health',
   'Scans outbound links inside published Pages and Blog/News posts for dead links.',
   '0 4 * * *', '{}'),
  ('auto_game_status_check', 'Auto Game Status Check (Online/Offline)', 'Health',
   'Re-checks each game''s embed status and automatically unpublishes any game that has failed consecutively past the configured threshold.',
   '0 */2 * * *', '{"autoUnpublishAfterFailures": 5}'),
  ('duplicate_game_detection', 'Duplicate Game Detection', 'Health',
   'Finds games that look like duplicates (matching slug, title + category, or embed URL) for admin review.',
   '0 5 * * *', '{}'),
  ('auto_metadata_generation', 'Auto Metadata Generation', 'SEO',
   'Fills in missing game description text from title/category when a game has none.',
   '0 6 * * *', '{}'),
  ('auto_slug_generation', 'Auto Slug Generation', 'SEO',
   'Finds any duplicate/invalid game slugs (most often from imports) and repairs them automatically.',
   '45 * * * *', '{}'),
  ('auto_seo_metadata', 'Auto SEO Metadata', 'SEO',
   'Generates meta title/description for games missing them — via the AI SEO Assistant when configured, otherwise a heuristic fallback.',
   '0 7 * * *', '{}'),
  ('auto_sitemap_update', 'Auto Sitemap Update', 'Infra',
   'Revalidates the sitemap routes so search engines see new/changed/removed games right away.',
   '*/15 * * * *', '{}'),
  ('auto_cache_purge', 'Auto Cache Purge', 'Infra',
   'Revalidates cached site pages after content changes.',
   '*/30 * * * *', '{}'),
  ('auto_cdn_cache_purge', 'Auto CDN Cache Purge', 'Infra',
   'Purges the configured CDN cache (via webhook) after content changes.',
   '*/30 * * * *', '{"webhookUrl": ""}'),
  ('scheduled_db_cleanup', 'Scheduled Database Cleanup', 'Maintenance',
   'Deletes stale analytics events and old automation job logs past their retention window.',
   '0 2 * * *', '{"retentionDays": 180, "jobLogRetentionDays": 90}'),
  ('scheduled_backups', 'Scheduled Backups', 'Maintenance',
   'Exports core tables (games, categories, tags, pages, posts) to JSON and stores them in the automation-backups bucket.',
   '0 1 * * *', '{"keepLast": 14}'),
  ('email_notifications', 'Email Notifications for Failed Jobs', 'Notifications',
   'Sends a notification (email and/or webhook) whenever a job run fails.',
   '* * * * *', '{"email": "", "webhookUrl": ""}')
on conflict (key) do nothing;
