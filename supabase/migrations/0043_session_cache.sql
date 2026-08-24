-- Mofigames — Migration 0043: Session Cache (Admin → Cache → Session Cache).
--
-- Four features, one settings row, plus one real backing table:
--   1. Redis Sessions          — Redis as the session store. Same
--      hand-rolled RESP2 client as object_cache_settings, own connection
--      (own host/port/db/credentials) — sharing a Redis *server* with
--      Object Cache or the DB Optimisation query cache is fine, but each
--      phase here owns its own settings row and its own key prefix so
--      they never collide or invalidate each other's keys.
--   2. Database Sessions       — this app's actual, always-on session
--      backing store: Supabase Auth already persists every session as a
--      row in its own internal auth.sessions / auth.refresh_tokens
--      tables — nothing here can change that, it isn't app schema. What
--      IS app schema, and genuinely used when Redis Sessions is off (or
--      as a durable companion when it's on), is session_store below: a
--      plain Postgres table this app's own session-issuing code can read
--      / write / expire. See supabase/migrations/0017_security_hardening.sql
--      for security_settings.session_timeout_minutes, the pre-existing
--      basic timeout — the fields here (db_session_ttl_minutes,
--      concurrent-session cap) are the deeper, cache-focused settings
--      that page doesn't cover.
--   3. Secure Session Storage  — cookie flags, an at-rest encryption
--      toggle for session_store.data, and the secret used to sign/
--      encrypt it. Same redaction treatment as every other credential in
--      this app (cdn_cache_settings.dns_api_token, object_cache_settings
--      .redis_password, …): stored raw here, never sent to the browser
--      as anything but a boolean + short preview.
--   4. Session Replication     — how session state propagates across
--      more than one running instance of this app: Redis pub/sub
--      (publishes an event on save/destroy, other instances subscribe)
--      or plain database polling (every instance reads session_store
--      directly, so "replication" is really just "shared source of
--      truth" — included as a mode because it's a legitimate, common
--      choice for small deployments that don't want a pub/sub layer).
--
-- Distinct in scope from src/components/admin/SessionsAdminClient.tsx
-- (Admin → User Management → Login & Session Management), which shows
-- per-user active sessions and force-logout via Supabase's Admin API —
-- that page is about *whose* sessions exist; this one is about *where
-- and how* session data is stored and kept fast.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ── Settings row ─────────────────────────────────────────────────────────

create table if not exists public.session_cache_settings (
  id boolean primary key default true,
  constraint session_cache_settings_single_row check (id),

  -- ── 1. Redis Sessions ────────────────────────────────────────────────────

  redis_sessions_enabled      boolean not null default false,
  redis_host                  text    not null default '127.0.0.1',
  redis_port                  int     not null default 6379
    check (redis_port between 1 and 65535),
  -- Deliberately not 0 (object_cache_settings' default) or 1 (db_optimization's
  -- redis_query_database) — a third index keeps all three phases' keys apart
  -- by default even on one shared Redis server.
  redis_database               int    not null default 2
    check (redis_database between 0 and 15),
  redis_tls_enabled            boolean not null default false,
  redis_username                text,
  -- Plaintext, used only for this app's own test-connection action, never
  -- forwarded externally. Same reasoning as object_cache_settings.redis_password.
  redis_password                text,
  redis_key_prefix              text   not null default 'sess:',
  redis_ttl_seconds             int    not null default 86400
    check (redis_ttl_seconds between 60 and 2592000),
  redis_connect_timeout_ms      int    not null default 2000
    check (redis_connect_timeout_ms between 100 and 30000),
  redis_last_tested_at          timestamptz,
  redis_last_test_status        text check (redis_last_test_status in ('success', 'failed')),
  redis_last_test_message       text,

  -- ── 2. Database Sessions ─────────────────────────────────────────────────

  database_sessions_enabled     boolean not null default true,
  db_session_ttl_minutes        int     not null default 1440
    check (db_session_ttl_minutes between 5 and 43200),
  max_concurrent_sessions       int     not null default 5
    check (max_concurrent_sessions between 1 and 50),
  unlimited_concurrent_sessions boolean not null default false,
  db_sessions_last_purged_at    timestamptz,
  db_sessions_last_purge_count  int     not null default 0,

  -- ── 3. Secure Session Storage ────────────────────────────────────────────

  secure_cookie_enabled              boolean not null default true,
  http_only_cookie                   boolean not null default true,
  same_site_mode                     text    not null default 'lax'
    check (same_site_mode in ('strict', 'lax', 'none')),
  encrypt_payload_at_rest            boolean not null default false,
  encryption_algorithm               text    not null default 'aes-256-gcm'
    check (encryption_algorithm in ('aes-256-gcm', 'aes-256-cbc')),
  -- Signs/encrypts session_store.data when encrypt_payload_at_rest is on.
  -- Same never-leaves-the-server treatment as redis_password above.
  session_secret                      text,
  regenerate_id_on_privilege_change   boolean not null default true,
  idle_timeout_minutes                int     not null default 30
    check (idle_timeout_minutes between 5 and 1440),
  absolute_timeout_minutes            int     not null default 720
    check (absolute_timeout_minutes between 30 and 43200),

  -- ── 4. Session Replication ───────────────────────────────────────────────

  replication_mode                text not null default 'none'
    check (replication_mode in ('none', 'redis_pub_sub', 'database_polling')),
  replication_channel             text not null default 'session-events',
  replication_poll_interval_seconds int not null default 30
    check (replication_poll_interval_seconds between 5 and 600),
  -- Reference list of app instance identifiers this deployment expects to
  -- stay in sync — informational (nothing here can see real infra), used
  -- by the admin UI to label a replication test's expected fan-out.
  replication_nodes               text[] not null default '{}',
  replication_last_checked_at     timestamptz,
  replication_last_status         text check (replication_last_status in ('success', 'failed')),
  replication_last_message        text,

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.session_cache_settings (id) values (true) on conflict (id) do nothing;

alter table public.session_cache_settings enable row level security;

-- Admin-only for both read and write — this row can hold a live Redis
-- password and the session-signing secret, same reasoning as
-- object_cache_settings / dns_cache_settings.
drop policy if exists "Admins can view session cache settings" on public.session_cache_settings;
create policy "Admins can view session cache settings"
  on public.session_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update session cache settings" on public.session_cache_settings;
create policy "Admins can update session cache settings"
  on public.session_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- ── session_store: the real Database Sessions backing table ────────────────
--
-- A plain key/value/expiry table this app's own session-issuing code can
-- use directly (service role, bypasses RLS) when Redis Sessions is off,
-- or as a durable companion when it's on. Not wired into Supabase Auth
-- itself — that engine is Supabase's, not this schema's — this is the
-- store for anything this app issues its own session tokens for (e.g.
-- guest/anonymous play state). Admin-only read via RLS since a row's
-- `data` payload can carry the same kind of session state a stolen
-- cookie would; nothing here should be readable by the session's own
-- owner through the anon/authenticated client, only by this app's server
-- (service role) or an admin doing support/debugging.

create table if not exists public.session_store (
  session_key text primary key,
  user_id     uuid references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  -- Set when Secure Session Storage's "Encrypt payload at rest" is on —
  -- data then holds ciphertext + iv/tag rather than a plain session
  -- object. Left off (false) by default so the table is human-readable
  -- until an admin opts in.
  encrypted   boolean not null default false,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.session_store enable row level security;

drop policy if exists "Admins can view session store" on public.session_store;
create policy "Admins can view session store"
  on public.session_store for select
  using (public.is_admin());

drop policy if exists "Admins can delete session store rows" on public.session_store;
create policy "Admins can delete session store rows"
  on public.session_store for delete
  using (public.is_admin());

-- Supports the expired-session purge query (WHERE expires_at < now()) and
-- per-user concurrent-session lookups.
create index if not exists session_store_expires_at_idx on public.session_store (expires_at);
create index if not exists session_store_user_id_idx on public.session_store (user_id);
