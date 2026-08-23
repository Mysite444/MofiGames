-- MofiGames — Phase 34: CDN / Edge Cache, Phase 2 of the Admin → Cache
-- build-out (Phase 1 was 0033_cache_management.sql, Browser Cache).
--
-- Unlike Browser Cache, this layer isn't enforced by this app's own
-- code — it's Cloudflare sitting in front of it. So this table holds
-- two different kinds of thing:
--   - Cloudflare credentials (zone_id/api_token) this app uses, server
--     side only, to actually call Cloudflare's API.
--   - The feature toggles the admin wants applied — Admin → Cache → CDN
--     / Edge Cache → "Sync to Cloudflare" reads this row and pushes it
--     to the zone (zone settings for brotli/http3/early_hints/image
--     resizing, a generated Cache Rules ruleset for the rest). See
--     src/app/api/admin/cache/cdn/sync/route.ts for exactly what each
--     toggle turns into on Cloudflare's side.
--
-- Deliberately NOT publicly readable like cache_settings (0033) — this
-- row holds a live API token, so both select and update are admin-only.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.cdn_cache_settings (
  id boolean primary key default true,

  -- Only Cloudflare is wired up today; the column exists so a future
  -- provider doesn't need a schema change, just a new value here and a
  -- new branch in the sync route.
  provider text not null default 'cloudflare' check (provider in ('cloudflare')),

  -- Credentials this app uses server-side to call the Cloudflare API on
  -- the admin's behalf. api_token is a plaintext secret (needed in full
  -- to send as a Bearer token — unlike api_keys.key_hash in migration
  -- 0019, there's nothing to verify here, only something to send), so
  -- it must never be exposed through the public settings row the way
  -- cache_settings is — see the RLS policy below and the route handler,
  -- which redacts it to a boolean + last 4 characters before it ever
  -- reaches the browser.
  zone_id text,
  api_token text,
  -- Filled in by a successful verify/sync call so the admin UI can show
  -- "Connected: <domain>" without needing another round trip just to
  -- render the page. Not sensitive — just a cached label.
  connected_zone_name text,

  -- Admin → Cache → CDN / Edge Cache feature toggles. Booleans map to a
  -- single Cloudflare zone setting each (brotli/http3/early_hints/
  -- image_resizing); the rest (smart_cache_rules/cache_everything/
  -- cache_by_device/cache_by_query_string) are combined into one
  -- generated Cache Rules ruleset on sync, since Cloudflare has no
  -- single flat setting for them.
  edge_caching_enabled boolean not null default false,
  smart_cache_rules_enabled boolean not null default false,
  cache_everything_enabled boolean not null default false,
  -- Path patterns (Cloudflare wildcard() syntax, e.g. "/games/*") that
  -- "Cache Everything" applies to. Deliberately opt-in per path rather
  -- than zone-wide — caching full HTML responses everywhere is rarely
  -- "where appropriate" for a site with per-user state (auth, comments,
  -- favorites).
  cache_everything_paths text[] not null default '{}',
  -- Off by default: fragmenting the cache by device type multiplies
  -- how many cached copies of each page exist, which lowers the hit
  -- ratio unless the page genuinely renders differently per device.
  cache_by_device_enabled boolean not null default false,
  cache_by_query_string_mode text not null default 'ignore_all'
    check (cache_by_query_string_mode in ('ignore_all', 'include_all', 'include_list')),
  -- Only used when cache_by_query_string_mode = 'include_list'.
  cache_by_query_string_params text[] not null default '{}',
  -- Cloudflare's Image Resizing zone setting. Polish (the older
  -- lossy/lossless optimizer) is being retired for new zones, so this
  -- targets Image Resizing instead — see the sync route's comments for
  -- what that does and doesn't cover.
  image_cdn_enabled boolean not null default false,
  -- Brotli and HTTP/3 default on: Cloudflare itself defaults new zones
  -- to "on" for both, and there's essentially no downside to either.
  brotli_enabled boolean not null default true,
  http3_enabled boolean not null default true,
  -- Early Hints defaults off: it only pays off if the origin actually
  -- sends preload-able Link headers, which this app doesn't do yet.
  early_hints_enabled boolean not null default false,
  -- Edge TTL used for "Cache Everything" paths' set_cache_settings
  -- action (override_origin mode) — how long the edge keeps a matched
  -- response before checking back with this app.
  edge_ttl_seconds int not null default 7200 check (edge_ttl_seconds between 60 and 2592000),

  -- Status of the most recent "Sync to Cloudflare" call — shown in the
  -- admin UI instead of asking the admin to trust that saving the row
  -- actually changed anything on Cloudflare's side.
  last_synced_at timestamptz,
  last_sync_status text check (last_sync_status in ('success', 'partial', 'failed')),
  last_sync_summary jsonb,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint cdn_cache_settings_single_row check (id)
);

insert into public.cdn_cache_settings (id) values (true) on conflict (id) do nothing;

alter table public.cdn_cache_settings enable row level security;

-- Admin-only for both read and write — this row can hold a live
-- Cloudflare API token, so it doesn't get the public "settings are
-- readable" treatment cache_settings (0033) has.
drop policy if exists "Admins can view CDN cache settings" on public.cdn_cache_settings;
create policy "Admins can view CDN cache settings"
  on public.cdn_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update CDN cache settings" on public.cdn_cache_settings;
create policy "Admins can update CDN cache settings"
  on public.cdn_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());
