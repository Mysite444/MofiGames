-- MofiGames — Migration 0042b: DNS Cache, Admin → Cache.
-- Originally numbered 0042 (conflicting with 0042_static_asset_cache.sql,
-- which is Phase 10 of the cache build-out and the true 0042). Renamed to
-- 0042b to resolve the duplicate; runs immediately after 0042.
--
-- "DNS Cache" as a category actually spans four layers that behave
-- completely differently, so — same reasoning as CDN (0034) vs Browser
-- Cache (0033) — they get split across two tables instead of one:
--
--   1. Cloudflare DNS   — genuinely controllable from here: this app
--      calls Cloudflare's API on save ("Sync to Cloudflare") to toggle
--      DNSSEC and CNAME Flattening for the zone. Lives in
--      dns_cache_settings below, alongside a live API token, so —
--      exactly like cdn_cache_settings — it is admin-only, never
--      publicly readable.
--   2. Browser DNS Cache — the only layer here a browser actually lets
--      a *site* influence at all: <link rel="dns-prefetch"/preconnect">
--      hints and the X-DNS-Prefetch-Control header. Unlike (1), the
--      root layout has to read this on every anonymous page load (it
--      renders the hint tags server-side), so it can't live in the
--      admin-only table — it gets its own small, publicly-readable
--      dns_prefetch_settings table, the same trade-off cache_settings
--      (0033) already made for the same reason.
--   3. Operating System DNS Cache — nothing running on this server can
--      flush or configure a visitor's OS resolver cache (ipconfig
--      /flushdns, systemd-resolve, mDNSResponder, …). That section of
--      the admin UI is reference material (per-OS flush commands) plus
--      one real, persisted field: os_dns_runbook_notes, so ops can keep
--      a living note on when to tell support/users to flush.
--   4. Resolver Cache — the recursive resolver this app's own server
--      uses for its outbound calls (Supabase, Cloudflare, embedded game
--      health checks, …). This one genuinely runs in-process — see
--      src/lib/resolver-cache.ts — and these columns are just its
--      configuration + last-cleared bookkeeping, not a live cache dump
--      (the cache itself is in memory, per server instance, and doesn't
--      belong in Postgres).
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ── 1 & 3 & 4: admin-only settings ──────────────────────────────────────────

create table if not exists public.dns_cache_settings (
  id boolean primary key default true,

  -- Cloudflare DNS. Deliberately its own Zone ID / API Token rather than
  -- reusing cdn_cache_settings' — every other phase here stores its own
  -- credentials independently too (see cdn_cache_settings vs a shared
  -- table), and DNS changes (DNSSEC, CNAME flattening) are a distinct
  -- enough blast radius from cache-purge/zone-setting changes to want a
  -- separate token an admin could scope more narrowly if they choose.
  -- If it's the same zone, paste the same values in both places.
  dns_zone_id text,
  dns_api_token text,
  dns_connected_zone_name text,
  dnssec_enabled boolean not null default false,
  cname_flattening_mode text not null default 'flatten_at_root'
    check (cname_flattening_mode in ('flatten_at_root', 'flatten_all')),
  dns_last_synced_at timestamptz,
  dns_last_sync_status text check (dns_last_sync_status in ('success', 'partial', 'failed')),
  dns_last_sync_summary jsonb,

  -- Resolver Cache (src/lib/resolver-cache.ts) — an in-memory, per-server-
  -- instance TTL cache wrapping Node's own dns.resolve() for this app's
  -- outbound lookups. These columns configure it; the entries themselves
  -- never touch Postgres.
  resolver_cache_enabled boolean not null default true,
  resolver_cache_min_ttl_seconds int not null default 30
    check (resolver_cache_min_ttl_seconds between 5 and 3600),
  resolver_cache_max_ttl_seconds int not null default 3600
    check (resolver_cache_max_ttl_seconds between 60 and 86400),
  resolver_cache_max_entries int not null default 500
    check (resolver_cache_max_entries between 10 and 5000),
  resolver_cache_last_cleared_at timestamptz,

  -- Operating System DNS Cache — nothing here is enforced by this app;
  -- it's a living note for whoever's on call. See the admin UI for the
  -- (static, not-stored) per-OS flush commands.
  os_dns_runbook_notes text not null default
    'Advise a visitor to flush their OS DNS cache only after a real DNS change (nameserver migration, record cutover). Windows: ipconfig /flushdns · macOS: sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder · Linux (systemd): sudo resolvectl flush-caches.',

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint dns_cache_settings_single_row check (id)
);

insert into public.dns_cache_settings (id) values (true) on conflict (id) do nothing;

alter table public.dns_cache_settings enable row level security;

-- Admin-only for both read and write — this row can hold a live
-- Cloudflare API token, same reasoning as cdn_cache_settings (0034).
drop policy if exists "Admins can view DNS cache settings" on public.dns_cache_settings;
create policy "Admins can view DNS cache settings"
  on public.dns_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update DNS cache settings" on public.dns_cache_settings;
create policy "Admins can update DNS cache settings"
  on public.dns_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── 2: publicly-readable Browser DNS Cache hints ────────────────────────────

create table if not exists public.dns_prefetch_settings (
  id boolean primary key default true,

  -- Master switch for the X-DNS-Prefetch-Control response header. "on"
  -- is the browser default already, so disabling this only matters if
  -- you're deliberately opting out (e.g. privacy-sensitive pages).
  dns_prefetch_control_enabled boolean not null default true,

  -- Bare hostnames (no scheme, no path) — rendered as
  -- <link rel="dns-prefetch" href="//host"> in the root layout for
  -- every visitor. Resolves the DNS for a third-party host before the
  -- browser actually needs to connect to it (analytics, ads, embeds).
  dns_prefetch_domains text[] not null default array[
    'www.googletagmanager.com',
    'www.clarity.ms',
    'pagead2.googlesyndication.com'
  ],

  -- Subset of the above (or standalone) that also gets
  -- <link rel="preconnect">, which does DNS + TCP + TLS up front. More
  -- expensive per-origin than dns-prefetch, so kept deliberately smaller
  -- — only for hosts on the critical path of an early paint/interaction.
  preconnect_domains text[] not null default array[
    'www.googletagmanager.com'
  ],

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint dns_prefetch_settings_single_row check (id)
);

insert into public.dns_prefetch_settings (id) values (true) on conflict (id) do nothing;

alter table public.dns_prefetch_settings enable row level security;

-- Publicly readable: the root layout (Server Component, rendered for
-- every visitor including signed-out first loads) reads this to emit
-- the <link rel="dns-prefetch"/preconnect"> tags. Nothing in this row
-- is sensitive — just a list of third-party hostnames already visible
-- in the page's own HTML/network tab.
drop policy if exists "DNS prefetch settings are publicly readable" on public.dns_prefetch_settings;
create policy "DNS prefetch settings are publicly readable"
  on public.dns_prefetch_settings for select
  using (true);

drop policy if exists "Admins can update DNS prefetch settings" on public.dns_prefetch_settings;
create policy "Admins can update DNS prefetch settings"
  on public.dns_prefetch_settings for update
  using (public.is_admin())
  with check (public.is_admin());
