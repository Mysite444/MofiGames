-- Mofigames — Migration 0047: Feed Cache (Admin → Cache → Feed Cache).
--
-- Four features, one settings row:
--   1. RSS Feeds       — real, generated live at request time by
--      GET /feed.xml (see src/lib/feed-helpers.ts + feed-content.ts).
--      RSS 2.0, same "no stored cache, just a configurable Cache-Control"
--      shape as XML Sitemaps below.
--   2. XML Sitemaps    — the sitemaps under /sitemaps/*.xml and the
--      /sitemap.xml index already exist (migration 0010_advanced_seo.sql
--      + Admin → SEO → Sitemaps controls *what's included*). What was
--      genuinely missing — and what belongs under Cache rather than SEO
--      — is *how long* a CDN/browser is allowed to hold onto that XML
--      before re-checking: sitemap-helpers.ts previously hardcoded
--      "public, max-age=3600, stale-while-revalidate=86400" for every
--      installation. sitemap_cache_ttl_seconds / _stale_while_revalidate
--      below make that a real, admin-editable value.
--   3. JSON Feeds      — GET /feed.json, JSON Feed 1.1
--      (https://www.jsonfeed.org/version/1.1/). Same content as RSS, a
--      different envelope for feed readers/tooling that prefer JSON.
--   4. Atom Feeds      — GET /atom.xml, Atom 1.0 (RFC 4287). Same
--      content again — RSS/JSON Feed/Atom are three representations of
--      one underlying item list, so the *content* knobs (which sources,
--      how many items) are shared, while enable/TTL/last-generated are
--      kept per-format since each is its own route, cacheable and
--      disable-able independently — same "shared content, independent
--      per-layer controls" shape as cdn_cache_settings vs
--      dns_cache_settings splitting what looks like one concern.
--
-- None of the four hold a credential or secret (unlike search/session/
-- object/dns cache settings), and the RSS/JSON Feed/Atom/Sitemap routes
-- all need to read this on every anonymous request — long before any
-- admin session exists, exactly like cache_settings (0033) and
-- dns_prefetch_settings (0042) — so, unlike most other *_cache_settings
-- tables, this one is publicly readable.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.feed_cache_settings (
  id boolean primary key default true,
  constraint feed_cache_settings_single_row check (id),

  -- ── Shared feed content (feeds RSS, JSON Feed, and Atom alike) ──────────
  -- What goes into the item list all three formats serve. Blog posts are
  -- the natural "feed" content; newly published games are opt-in since
  -- not every install wants every new game blasted to subscribers.
  feed_include_blog_posts boolean not null default true,
  feed_include_new_games  boolean not null default false,
  feed_max_items int not null default 20
    check (feed_max_items between 1 and 100),
  -- Blank = falls back to Global SEO Settings' site_name at request time.
  feed_title_override text,
  feed_description text not null default
    'The latest updates, articles, and new releases.',

  -- ── 1. RSS Feeds (RSS 2.0, GET /feed.xml) ───────────────────────────────
  rss_enabled boolean not null default true,
  rss_cache_ttl_seconds int not null default 900
    check (rss_cache_ttl_seconds between 60 and 86400),
  rss_last_generated_at timestamptz,
  rss_last_item_count int not null default 0,

  -- ── 2. XML Sitemaps (cache layer over the already-live /sitemaps/*.xml) ─
  sitemap_cache_ttl_seconds int not null default 3600
    check (sitemap_cache_ttl_seconds between 60 and 86400),
  sitemap_stale_while_revalidate_seconds int not null default 86400
    check (sitemap_stale_while_revalidate_seconds between 0 and 604800),
  sitemap_last_purged_at timestamptz,
  -- { "games": n, "categories": n, "tags": n, "blog": n, "pages": n, "images": n }
  sitemap_last_purge_summary jsonb,

  -- ── 3. JSON Feeds (JSON Feed 1.1, GET /feed.json) ───────────────────────
  json_feed_enabled boolean not null default true,
  json_feed_cache_ttl_seconds int not null default 900
    check (json_feed_cache_ttl_seconds between 60 and 86400),
  json_feed_last_generated_at timestamptz,
  json_feed_last_item_count int not null default 0,

  -- ── 4. Atom Feeds (Atom 1.0, GET /atom.xml) ─────────────────────────────
  atom_enabled boolean not null default true,
  atom_cache_ttl_seconds int not null default 900
    check (atom_cache_ttl_seconds between 60 and 86400),
  atom_last_generated_at timestamptz,
  atom_last_item_count int not null default 0,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.feed_cache_settings (id) values (true) on conflict (id) do nothing;

alter table public.feed_cache_settings enable row level security;

-- Publicly readable: /feed.xml, /feed.json, /atom.xml, and every
-- /sitemaps/*.xml route read this on every anonymous request to decide
-- whether a format is enabled and what Cache-Control to send — the same
-- trade-off cache_settings (0033) and dns_prefetch_settings (0042) made,
-- and safe here for the same reason: nothing in this row is sensitive.
drop policy if exists "Feed cache settings are publicly readable" on public.feed_cache_settings;
create policy "Feed cache settings are publicly readable"
  on public.feed_cache_settings for select
  using (true);

drop policy if exists "Admins can update feed cache settings" on public.feed_cache_settings;
create policy "Admins can update feed cache settings"
  on public.feed_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());
