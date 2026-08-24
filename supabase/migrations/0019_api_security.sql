-- MofiGames — Phase 19: API security (Phase 3 of the Admin → Security
-- build-out).
--
-- Scope note: this project doesn't have a public developer API today —
-- every existing /api/* route is internal, called only by this site's
-- own frontend, and stays cookie/session-authenticated exactly as
-- before (nothing here changes those). What this migration adds is a
-- *new*, separate, opt-in surface — /api/v1/* — plus the key
-- management behind it, so there's something real to secure rather than
-- bolting API-key auth onto routes that don't need it.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- api_keys — Admin → Security → API Keys. The plaintext key is shown to
-- the admin exactly once, at creation, then only key_hash (sha256, hex —
-- computed in Node, see src/lib/api-keys.ts) is ever stored. key_prefix
-- is the first several characters of the plaintext, kept separately so
-- the admin list can show "which key is this" without exposing anything
-- secret.
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  key_prefix text not null,
  key_hash text not null unique,
  scopes text[] not null default '{}',
  rate_limit_per_hour int not null default 1000 check (rate_limit_per_hour between 1 and 100000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

create index if not exists api_keys_key_hash_idx on public.api_keys (key_hash);

alter table public.api_keys enable row level security;

drop policy if exists "Admins can manage API keys" on public.api_keys;
create policy "Admins can manage API keys"
  on public.api_keys for all
  using (public.is_admin())
  with check (public.is_admin());

-- Callable by anon (the /api/v1/* route handlers run with no session —
-- that's the point of an API key). Takes an already-hashed key so the
-- raw secret never has to round-trip through a query string or get
-- logged; returns only what a route handler needs to make its decision,
-- never the row itself. Bumps last_used_at as a side effect on a valid
-- call — that's the whole reason this is a function and not a plain
-- select the route could run itself.
create or replace function public.verify_api_key(p_key_hash text, p_scope text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_key public.api_keys;
begin
  select * into v_key
  from public.api_keys
  where key_hash = p_key_hash
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;

  if not found then
    return jsonb_build_object('valid', false);
  end if;

  if not (p_scope = any(v_key.scopes)) then
    return jsonb_build_object('valid', false, 'reason', 'missing_scope');
  end if;

  update public.api_keys set last_used_at = now() where id = v_key.id;

  return jsonb_build_object(
    'valid', true,
    'keyId', v_key.id,
    'label', v_key.label,
    'rateLimitPerHour', v_key.rate_limit_per_hour
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- CORS for the /api/v1/* surface only — every other route has no CORS
-- headers at all, which browsers already treat as same-origin-only
-- (that's the safe default, and Phase 2's CSRF check backs it up for
-- state-changing requests). '*' is a valid entry, meaning "any origin".
-- Empty (the default) means the API is reachable server-to-server with
-- a key but not directly from a browser page on another site.
-- ---------------------------------------------------------------------------
alter table public.security_settings
  add column if not exists api_cors_origins text[] not null default '{}';
