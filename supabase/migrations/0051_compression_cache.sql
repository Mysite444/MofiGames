-- Mofigames — Migration 0051: Compression (Admin → Cache → Compression).
--
-- Five features, one settings row — response-body compression and
-- payload minification, distinct from Static Asset Cache (0042, which
-- owns *how long* CSS/JS/fonts/media are cached) and from CDN / Edge
-- Cache's own Brotli toggle (0034, which flips Cloudflare's edge-level
-- brotli zone setting). This section owns the *encoding and shrinking*
-- of a response body itself:
--
--   1. Brotli Compression      — brotli(1) content-encoding, quality
--      0–11, per-MIME allowlist, minimum size floor (compressing tiny
--      payloads costs more CPU than it saves in bytes).
--   2. Gzip Compression        — the universal fallback for clients/
--      proxies that don't negotiate brotli, same shape as Brotli above
--      (level 1–9 instead of quality 0–11, per gzip's own scale).
--   3. CSS Minification        — strip comments/whitespace from
--      stylesheets; optional file combining; exclude patterns for
--      already-minified or third-party CSS.
--   4. JavaScript Minification — same shape as CSS Minification, for
--      scripts.
--   5. HTML Minification       — strip comments, collapse whitespace
--      in markup, optionally cascade into inline <style>/<script>
--      minification using the CSS/JS minifiers above.
--
-- Each of the five carries its own enable flag so they can be toggled
-- independently, plus a top-level `enabled` master switch — same
-- "master switch + per-feature flags" shape as static_asset_cache_settings.
-- CSS/JS/HTML minification each keep last-run stats (bytes before/after,
-- timestamp) so the admin UI can show real savings instead of just
-- configuration; Brotli/Gzip keep a shared last-test result instead,
-- since they're negotiated per-request rather than "run" on demand.
--
-- Admin-only read + write: nothing in the public app reads this table
-- at request time (compression/minification here is config + live
-- diagnostics for whatever reverse proxy, CDN, or hosting platform sits
-- in front of this app — same "declarative config, not self-enforced"
-- shape as php_opcode_settings (0038) and db_optimization_settings
-- (0037), which document PHP/Postgres tuning this Node app doesn't
-- itself run either).
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.compression_cache_settings (
  id boolean primary key default true,
  constraint compression_cache_settings_single_row check (id),

  -- Master switch — disables all five features below without discarding
  -- their individual configuration.
  enabled boolean not null default true,

  -- ── 1. Brotli Compression ────────────────────────────────────────────────
  brotli_enabled        boolean not null default true,
  -- 0 = fastest/largest, 11 = smallest/slowest. 11 is safe as a default
  -- for static/cacheable responses since the cost is paid once, not per
  -- request, wherever the compressor itself caches its output.
  brotli_quality        int     not null default 11
    check (brotli_quality between 0 and 11),
  -- Below this, brotli's own framing overhead can exceed the savings.
  brotli_min_size_bytes int     not null default 1024
    check (brotli_min_size_bytes between 0 and 10485760),
  brotli_mime_types     text[]  not null default array[
    'text/html', 'text/css', 'text/plain', 'text/xml',
    'application/javascript', 'application/json', 'application/xml',
    'application/rss+xml', 'application/atom+xml',
    'image/svg+xml', 'font/ttf', 'font/otf'
  ],

  -- ── 2. Gzip Compression ──────────────────────────────────────────────────
  -- Fallback for clients/proxies whose Accept-Encoding doesn't include
  -- br. Negotiated the same way — whichever the client's Accept-Encoding
  -- and this allowlist agree on wins, with brotli preferred when both
  -- are on offer.
  gzip_enabled        boolean not null default true,
  -- 1 = fastest/largest, 9 = smallest/slowest.
  gzip_level           int     not null default 6
    check (gzip_level between 1 and 9),
  gzip_min_size_bytes  int     not null default 1024
    check (gzip_min_size_bytes between 0 and 10485760),
  gzip_mime_types      text[]  not null default array[
    'text/html', 'text/css', 'text/plain', 'text/xml',
    'application/javascript', 'application/json', 'application/xml',
    'application/rss+xml', 'application/atom+xml',
    'image/svg+xml', 'font/ttf', 'font/otf'
  ],

  -- ── 3. CSS Minification ──────────────────────────────────────────────────
  css_minify_enabled          boolean not null default true,
  css_minify_remove_comments  boolean not null default true,
  -- Bundle multiple stylesheet requests into one before minifying.
  css_minify_combine_files    boolean not null default false,
  -- Path/glob patterns to skip — e.g. vendor CSS that's already minified.
  css_minify_exclude_patterns text[]  not null default '{}',
  css_minify_last_run_at             timestamptz,
  css_minify_last_original_bytes     bigint not null default 0,
  css_minify_last_minified_bytes     bigint not null default 0,

  -- ── 4. JavaScript Minification ───────────────────────────────────────────
  js_minify_enabled          boolean not null default true,
  js_minify_remove_comments  boolean not null default true,
  js_minify_combine_files    boolean not null default false,
  js_minify_exclude_patterns text[]  not null default '{}',
  js_minify_last_run_at             timestamptz,
  js_minify_last_original_bytes     bigint not null default 0,
  js_minify_last_minified_bytes     bigint not null default 0,

  -- ── 5. HTML Minification ─────────────────────────────────────────────────
  html_minify_enabled             boolean not null default true,
  html_minify_remove_comments     boolean not null default true,
  html_minify_collapse_whitespace boolean not null default true,
  -- Cascade into the CSS/JS minifiers above for inline <style>/<script>.
  html_minify_inline_css_js       boolean not null default true,
  html_minify_last_run_at             timestamptz,
  html_minify_last_original_bytes     bigint not null default 0,
  html_minify_last_minified_bytes     bigint not null default 0,

  -- ── Diagnostics (Brotli/Gzip "Test Compression") ─────────────────────────
  last_tested_at  timestamptz,
  last_test_status text check (last_test_status in ('success', 'failed')),
  last_test_message text,
  -- Array of { encoding, contentEncodingReceived, transferredBytes,
  --            decodedBytes, ratio, ok, message } — one entry per
  -- Accept-Encoding probed (br, gzip, identity).
  last_test_result jsonb,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Seed the singleton row so the admin UI always has something to read.
insert into public.compression_cache_settings (id)
values (true)
on conflict (id) do nothing;

-- ── Row-Level Security ───────────────────────────────────────────────────────

alter table public.compression_cache_settings enable row level security;

drop policy if exists "Admins can read compression cache settings" on public.compression_cache_settings;
create policy "Admins can read compression cache settings"
  on public.compression_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update compression cache settings" on public.compression_cache_settings;
create policy "Admins can update compression cache settings"
  on public.compression_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());
