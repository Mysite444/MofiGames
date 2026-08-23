-- Mofigames — Migration 0038: PHP Opcode Cache Settings
-- Admin → Cache → PHP OPcache (Phase 6 of the Cache build-out).
--
-- Four feature groups live under this singleton table:
--   1. OPcache          — shared-memory opcode store, file-cache tier.
--   2. JIT Compilation  — PHP 8+ native-code JIT (mode, buffer, thresholds).
--   3. PHP Preloading   — script preloaded into opcache at FPM startup.
--   4. Interned Strings — shared immutable string pool size.
--
-- No credentials are stored in this table — all fields are configuration
-- values that are safe to send to the browser as-is.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

create table if not exists public.php_opcode_cache_settings (
  id boolean primary key default true,
  constraint php_opcode_cache_settings_single_row check (id),

  -- ── 1. OPcache ──────────────────────────────────────────────────────────

  -- Master switch. Mirrors opcache.enable in php.ini.
  opcache_enabled                  boolean  not null default true,

  -- opcache.memory_consumption — size of the shared-memory segment, MB.
  opcache_memory_consumption_mb    int      not null default 128
    check (opcache_memory_consumption_mb between 16 and 1024),

  -- opcache.max_accelerated_files — upper bound on cached scripts.
  opcache_max_accelerated_files    int      not null default 10000
    check (opcache_max_accelerated_files between 200 and 1000000),

  -- opcache.max_wasted_percentage — % of wasted memory triggering a restart.
  opcache_max_wasted_percentage    int      not null default 5
    check (opcache_max_wasted_percentage between 1 and 50),

  -- opcache.revalidate_freq — seconds between file mtime checks.
  -- 0 = never revalidate at runtime (use opcache_reset() for deploys).
  opcache_revalidate_freq_seconds  int      not null default 60
    check (opcache_revalidate_freq_seconds between 0 and 3600),

  -- opcache.save_comments — must be true for annotations/attributes.
  opcache_save_comments            boolean  not null default true,

  -- opcache.validate_permission — check file permissions on each access.
  opcache_validate_permission      boolean  not null default false,

  -- File-based secondary cache (survives PHP-FPM restarts).
  opcache_file_cache_enabled       boolean  not null default false,
  opcache_file_cache_path          text     not null default '/tmp/opcache',
  -- File-cache-only mode: serve from disk without shared memory.
  opcache_file_cache_only          boolean  not null default false,

  -- ── 2. JIT Compilation (PHP 8+) ─────────────────────────────────────────

  jit_enabled                      boolean  not null default false,

  -- opcache.jit — "off" | "tracing" | "function".
  jit_mode                         text     not null default 'tracing'
    check (jit_mode in ('off', 'tracing', 'function')),

  -- opcache.jit_buffer_size — native-code code cache, MB.
  jit_buffer_size_mb               int      not null default 64
    check (jit_buffer_size_mb between 8 and 512),

  -- opcache.jit_hot_func — calls before JIT compiles a function.
  -- 0 = compile everything eagerly (high startup cost, max peak throughput).
  jit_hot_function_threshold       int      not null default 127
    check (jit_hot_function_threshold between 0 and 4096),

  -- opcache.jit_max_root_traces — cap on root trace count.
  jit_max_root_traces              int      not null default 1024
    check (jit_max_root_traces between 64 and 32768),

  -- ── 3. PHP Preloading ────────────────────────────────────────────────────

  -- Preloading loads a bootstrap script into shared memory at FPM startup,
  -- making those classes/functions available in every worker without re-parsing.
  preload_enabled                  boolean  not null default false,

  -- Absolute server path to the preload script.
  preload_script_path              text     not null default '',

  -- System user that runs the preload phase. Must match the FPM worker user.
  preload_user                     text     not null default 'www-data',

  -- ── 4. Interned Strings ──────────────────────────────────────────────────

  -- opcache.interned_strings_buffer — shared immutable string pool, MB.
  interned_strings_buffer_mb       int      not null default 8
    check (interned_strings_buffer_mb between 4 and 512),

  -- ── Diagnostics ──────────────────────────────────────────────────────────

  last_status_checked_at           timestamptz,
  last_status_result               text check (last_status_result in ('success', 'failed', 'unavailable')),
  last_status_message              text,
  last_reset_at                    timestamptz,

  -- Metadata
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id) on delete set null
);

-- Seed singleton row.
insert into public.php_opcode_cache_settings (id)
  values (true)
  on conflict (id) do nothing;

alter table public.php_opcode_cache_settings enable row level security;

drop policy if exists "Admins can view php opcode cache settings" on public.php_opcode_cache_settings;
create policy "Admins can view php opcode cache settings"
  on public.php_opcode_cache_settings for select
  using (public.is_admin());

drop policy if exists "Admins can update php opcode cache settings" on public.php_opcode_cache_settings;
create policy "Admins can update php opcode cache settings"
  on public.php_opcode_cache_settings for update
  using (public.is_admin())
  with check (public.is_admin());
