-- Mofigames — Phase 52: Security-Aware Caching (Admin → Cache → Security).
--
-- Unlike Full Page Cache (0035) — which mostly *describes* an external
-- reverse proxy / CDN config for the admin to paste elsewhere — this phase
-- is enforced live, on every request this app's own middleware.ts handles,
-- via get_security_cache_policy() below. It answers one question:
-- "regardless of what LiteSpeed/Nginx/Varnish/Cloudflare are told to do,
-- what does *this app* refuse to let get cached?"
--
-- Six features, one row:
--   1. Do Not Cache Authenticated Pages — auth_cookie_names presence forces
--      Cache-Control: private, no-store.
--   2. Separate Guest and Logged-in User Caches — Vary: Cookie so any
--      downstream cache (browser, CDN, reverse proxy) keeps guest and
--      authenticated responses apart instead of mixing them.
--   3. CSRF-Safe Caching — state-changing methods (POST/PUT/PATCH/DELETE)
--      are never cacheable, full stop; middleware already rejects
--      cross-site state-changing /api requests (see checkSameOrigin in
--      middleware.ts) — this is the caching-side complement to that.
--   4. Cookie-Aware Cache Rules — a broader bypass_cookie_names list (not
--      just auth cookies — impersonation/preview/debug cookies too) that
--      forces a response to bypass caching regardless of path.
--   5. Cache Bypass for Admin, Login, and User Account Pages — bypass_paths,
--      always enforced no matter what any other cache layer decides.
--   6. Signed URLs / Signed Cookies (optional) — signed_protected_paths may
--      only be treated as cacheable when the request carries a valid
--      HMAC-SHA256 signature. The signing secret never leaves Postgres:
--      generation happens in an admin-only route (which is allowed to read
--      the real secret via RLS), verification happens via
--      verify_cache_signature() below (SECURITY DEFINER, returns only a
--      boolean) so the edge middleware — running for anonymous visitors —
--      never needs the plaintext secret at all.
--
-- This mirrors the access_rules / check_access() split from migration
-- 0018 exactly: the table itself is admin-only; two narrow, purpose-built
-- functions expose just enough for an anonymous middleware request to act
-- on, never the raw row.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create extension if not exists pgcrypto;

create table if not exists public.security_cache_settings (
  id boolean primary key default true,
  constraint security_cache_settings_single_row check (id),

  -- ── 1. Do Not Cache Authenticated Pages ────────────────────────────────
  do_not_cache_authenticated boolean not null default true,
  -- Cookie names whose presence marks a request as "authenticated" for the
  -- purposes of (1) and (2) below. Supabase's SSR client sets sb-* cookies;
  -- the legacy next-auth names are kept for parity with Full Page Cache's
  -- own bypass_cookies default (0035) in case that auth method is ever
  -- reintroduced.
  auth_cookie_names text[] not null default
    '{"sb-access-token", "sb-refresh-token", "__Secure-next-auth.session-token", "next-auth.session-token"}',

  -- ── 2. Separate Guest and Logged-in User Caches ────────────────────────
  separate_guest_logged_in_cache boolean not null default true,
  -- Whether to actually send `Vary: Cookie` on cacheable responses. Kept
  -- as its own toggle (rather than implied by the line above) because a
  -- shared cache in front of this app may already vary on something
  -- broader (e.g. the full Cookie header via its own config) — an admin
  -- running that setup can turn this app's own Vary emission off to avoid
  -- sending it twice.
  send_vary_cookie_header boolean not null default true,

  -- ── 3. CSRF-Safe Caching ────────────────────────────────────────────────
  csrf_safe_caching_enabled boolean not null default true,
  -- Always true in practice — GET/HEAD are the only cacheable methods per
  -- RFC 9111 §9.1, so state-changing requests are refused a positive
  -- Cache-Control no matter what. Stored (rather than hardcoded) so the
  -- admin UI can show it as an always-on, non-negotiable row instead of
  -- silently doing something the screen never mentions.
  block_state_changing_methods boolean not null default true,

  -- ── 4. Cookie-Aware Cache Rules ─────────────────────────────────────────
  cookie_aware_rules_enabled boolean not null default true,
  -- Broader than auth_cookie_names — any of these present forces a bypass
  -- regardless of path or auth state (impersonation/preview/debug cookies
  -- an admin sets while testing, e.g. impersonate_user, preview_session).
  bypass_cookie_names text[] not null default
    '{"sb-access-token", "sb-refresh-token", "__Secure-next-auth.session-token", "next-auth.session-token", "impersonate_user", "preview_session"}',
  bypass_query_params text[] not null default '{"preview", "nocache", "impersonate"}',

  -- ── 5. Cache Bypass for Admin, Login, and User Account Pages ───────────
  -- Trailing /* = prefix match (see matchesPathPattern() in
  -- security-cache-settings.ts). The admin UI renders the first five as
  -- always-present and non-removable, same convention as Full Page Cache's
  -- excluded_paths (0035).
  bypass_paths text[] not null default
    '{"/admin/*", "/api/admin/*", "/login", "/signup", "/auth/*", "/account/*", "/api/auth/*", "/reset-password"}',

  -- ── 6. Signed URLs / Signed Cookies (optional, off by default) ─────────
  signed_urls_enabled boolean not null default false,
  signed_cookies_enabled boolean not null default false,
  -- HMAC-SHA256 signing key. Never returned by the settings API (redacted
  -- to signing_secret_set/signing_secret_preview, exactly like
  -- varnish_purge_key in 0035) and never read by middleware — only
  -- verify_cache_signature() below touches it, from inside Postgres.
  signing_secret text,
  signed_url_ttl_seconds int not null default 3600
    check (signed_url_ttl_seconds between 60 and 604800),
  signed_url_param_name text not null default 'sig',
  signed_url_expires_param_name text not null default 'exp',
  signed_cookie_name text not null default '__cache_sig',
  -- Paths that require a valid signature to be considered cacheable at
  -- all. Empty by default — this is an opt-in allowlist, not a blocklist.
  signed_protected_paths text[] not null default '{}',

  -- Metadata
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.security_cache_settings (id)
  values (true)
  on conflict (id) do nothing;

alter table public.security_cache_settings enable row level security;

-- Admin-only for both read and write — this row contains the HMAC signing
-- secret plus the exact cookie names this app treats as session cookies,
-- neither of which should be visible to a non-admin request.
drop policy if exists "Admins can view security cache settings" on public.security_cache_settings;
create policy "Admins can view security cache settings"
  on public.security_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update security cache settings" on public.security_cache_settings;
create policy "Admins can update security cache settings"
  on public.security_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- get_security_cache_policy() — the only thing middleware.ts calls with the
-- anon key. Returns every field EXCEPT signing_secret as one jsonb object,
-- so an anonymous visitor's request can be evaluated against the live
-- policy without ever exposing the row (or the secret) itself. Fails to
-- null if the settings row doesn't exist yet (migration not run) — caller
-- fails open, same convention as check_access()/applyRedirect().
-- ---------------------------------------------------------------------------
create or replace function public.get_security_cache_policy()
returns jsonb
language sql
security definer set search_path = public
stable
as $$
  select jsonb_build_object(
    'doNotCacheAuthenticated', do_not_cache_authenticated,
    'authCookieNames', auth_cookie_names,
    'separateGuestLoggedInCache', separate_guest_logged_in_cache,
    'sendVaryCookieHeader', send_vary_cookie_header,
    'csrfSafeCachingEnabled', csrf_safe_caching_enabled,
    'blockStateChangingMethods', block_state_changing_methods,
    'cookieAwareRulesEnabled', cookie_aware_rules_enabled,
    'bypassCookieNames', bypass_cookie_names,
    'bypassQueryParams', bypass_query_params,
    'bypassPaths', bypass_paths,
    'signedUrlsEnabled', signed_urls_enabled,
    'signedCookiesEnabled', signed_cookies_enabled,
    'signedUrlParamName', signed_url_param_name,
    'signedUrlExpiresParamName', signed_url_expires_param_name,
    'signedCookieName', signed_cookie_name,
    'signedProtectedPaths', signed_protected_paths
  )
  from public.security_cache_settings
  where id = true;
$$;

-- ---------------------------------------------------------------------------
-- verify_cache_signature(path, sig, exp) — the only place signing_secret is
-- ever read outside an admin-authenticated request. Recomputes
-- hex(hmac_sha256(secret, "<path>.<exp>")) and compares it to p_sig, after
-- checking p_exp hasn't passed. Returns a bare boolean — the secret and
-- the recomputed digest never leave this function. Callable by anon (edge
-- middleware has no admin session for a random visitor's request), which
-- is exactly why this exists instead of letting middleware read the
-- column directly.
-- ---------------------------------------------------------------------------
create or replace function public.verify_cache_signature(p_path text, p_sig text, p_exp bigint)
returns boolean
language plpgsql
security definer set search_path = public, extensions
stable
as $$
declare
  v_secret text;
  v_expected text;
begin
  if p_path is null or p_sig is null or p_exp is null then
    return false;
  end if;

  if p_exp < extract(epoch from now())::bigint then
    return false; -- expired
  end if;

  select signing_secret into v_secret from public.security_cache_settings where id = true;
  if v_secret is null or v_secret = '' then
    return false; -- no key configured — nothing can validly be signed
  end if;

  v_expected := encode(hmac(p_path || '.' || p_exp::text, v_secret, 'sha256'), 'hex');
  return lower(v_expected) = lower(p_sig);
end;
$$;
