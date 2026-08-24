-- MofiGames — Phase 62: Site Content Backup & Complete Site Migration.
--
-- Two separate, purpose-built systems, both admin-only:
--
--   1. Site Content Backup — on-demand export/restore of the ~28 tables
--      that hold actual site content (games, categories, tags, pages,
--      posts, comments, reviews, ratings, homepage curation, site
--      identity/SEO, localization, media library records, announcements,
--      import config, and the two genuinely-content user-generated
--      tables: favorites/recently_played). Table membership is decided
--      in the application layer (src/lib/backup/content-tables.ts) by
--      actually auditing what each table is *for*, not by guessing from
--      its name — see that file for the full table-by-table rationale.
--      This migration only supplies the primitives the app needs to do
--      that safely: a live schema catalog (so the app is reading the
--      real current schema, not assuming migration files == production)
--      and a guarded, dynamic upsert function scoped to that same table
--      list.
--
--   2. Complete Site Migration — builds on the same restore primitive
--      for the "database data" portion of a full migration ZIP (app
--      source + schema + data + storage manifest). See
--      src/lib/backup/migration-export.ts / migration-import.ts.
--
-- Deliberately NOT touched here: the existing Scheduled Backups
-- automation job (0016_automation.sql) and its `automation-backups`
-- bucket keep working exactly as before — this is a new, richer system
-- alongside it, not a replacement. See the final report for why.
--
-- Run in Supabase SQL Editor. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- backup_restores gains two columns so the one restore-history table can
-- serve both Content Backup restores and Complete Migration data-restores
-- (`kind` tells them apart) instead of standing up a parallel table for
-- something that's structurally identical. `backup_version` and
-- `warnings` support the richer validation this system does that the
-- original restore route didn't (version compatibility, non-fatal
-- warnings like "column X in the backup no longer exists").
-- ---------------------------------------------------------------------------
alter table public.backup_restores
  add column if not exists kind text not null default 'content' check (kind in ('content', 'migration')),
  add column if not exists backup_version integer,
  add column if not exists warnings jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- content_backup_exports — one row per "Download Content Backup" click.
-- backup_restores already covers *restores*; this is the missing other
-- half so Admin → Backups can show "last backup date / size / version"
-- without downloading and parsing the file itself.
-- ---------------------------------------------------------------------------
create table if not exists public.content_backup_exports (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  size_bytes bigint not null default 0,
  backup_version integer not null,
  tables jsonb not null default '{}'::jsonb, -- { "games": 412, "categories": 18, ... }
  warnings jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists content_backup_exports_created_at_idx
  on public.content_backup_exports (created_at desc);

alter table public.content_backup_exports enable row level security;

drop policy if exists "Admins can manage content backup exports" on public.content_backup_exports;
create policy "Admins can manage content backup exports"
  on public.content_backup_exports for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- site_migration_runs — history for Complete Site Migration, both
-- directions (`kind`: 'export' when a migration ZIP was generated,
-- 'import' when one was validated/restored). Kept separate from
-- content_backup_exports / backup_restores because a migration run
-- carries a manifest (app version, schema version, storage bucket list)
-- that a content backup doesn't.
-- ---------------------------------------------------------------------------
create table if not exists public.site_migration_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('export', 'import', 'import_dry_run')),
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  filename text,
  size_bytes bigint,
  manifest jsonb not null default '{}'::jsonb,
  row_counts jsonb not null default '{}'::jsonb,
  storage_buckets jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error text,
  created_by uuid references auth.users (id) on delete set null,
  created_by_email text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists site_migration_runs_started_at_idx
  on public.site_migration_runs (started_at desc);

alter table public.site_migration_runs enable row level security;

drop policy if exists "Admins can manage site migration runs" on public.site_migration_runs;
create policy "Admins can manage site migration runs"
  on public.site_migration_runs for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: two new admin-only buckets, mirroring the automation-backups
-- bucket's policy shape from 0016_automation.sql exactly.
--
--   content-backups — Content Backup JSON files (both the final backup
--   and short-lived "uploads/…" staging objects created while an admin's
--   upload is being validated before restore).
--
--   site-migrations — Complete Migration ZIPs. Separate bucket (rather
--   than reusing content-backups) because these are a different artifact
--   entirely — app source + schema + data + storage manifest — with
--   different size expectations and a different retention story.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('content-backups', 'content-backups', false, 209715200, array['application/json', 'application/octet-stream'])
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-migrations', 'site-migrations', false, 1073741824, array['application/zip', 'application/octet-stream'])
on conflict (id) do nothing;

drop policy if exists "Admins can read content-backups" on storage.objects;
create policy "Admins can read content-backups"
  on storage.objects for select
  using (bucket_id = 'content-backups' and public.is_admin());

drop policy if exists "Admins can write content-backups" on storage.objects;
create policy "Admins can write content-backups"
  on storage.objects for insert
  with check (bucket_id = 'content-backups' and public.is_admin());

drop policy if exists "Admins can delete content-backups" on storage.objects;
create policy "Admins can delete content-backups"
  on storage.objects for delete
  using (bucket_id = 'content-backups' and public.is_admin());

drop policy if exists "Admins can read site-migrations" on storage.objects;
create policy "Admins can read site-migrations"
  on storage.objects for select
  using (bucket_id = 'site-migrations' and public.is_admin());

drop policy if exists "Admins can write site-migrations" on storage.objects;
create policy "Admins can write site-migrations"
  on storage.objects for insert
  with check (bucket_id = 'site-migrations' and public.is_admin());

drop policy if exists "Admins can delete site-migrations" on storage.objects;
create policy "Admins can delete site-migrations"
  on storage.objects for delete
  using (bucket_id = 'site-migrations' and public.is_admin());

-- ---------------------------------------------------------------------------
-- admin_table_catalog() — live introspection of every table actually
-- present in the `public` schema right now: row estimate, primary-key
-- columns, column list, and foreign keys. This is the "inspect the real
-- schema instead of assuming table names" requirement — the app classifies
-- what comes back (src/lib/backup/content-tables.ts), this function just
-- reports the ground truth.
--
-- Admin-gated inside the function (not just by grant) so it fails the
-- same way from any caller, consistent with every other admin RPC here.
-- ---------------------------------------------------------------------------
create or replace function public.admin_table_catalog()
returns table (
  table_name text,
  estimated_rows bigint,
  primary_key_columns text[],
  columns jsonb,
  foreign_keys jsonb
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  return query
  select
    c.relname::text,
    greatest(c.reltuples::bigint, 0),
    coalesce(pk.pk_columns, array[]::text[]),
    coalesce(cols.cols, '[]'::jsonb),
    coalesce(fks.fks, '[]'::jsonb)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join lateral (
    select array_agg(kcu.column_name::text order by kcu.ordinal_position) as pk_columns
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.table_schema = tc.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = c.relname
      and tc.constraint_type = 'PRIMARY KEY'
  ) pk on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'name', col.column_name,
             'type', col.data_type,
             'nullable', col.is_nullable = 'YES'
           ) order by col.ordinal_position) as cols
    from information_schema.columns col
    where col.table_schema = 'public' and col.table_name = c.relname
  ) cols on true
  left join lateral (
    select jsonb_agg(distinct jsonb_build_object(
             'column', kcu.column_name,
             'refTable', ccu.table_name,
             'refColumn', ccu.column_name
           )) as fks
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    where tc.table_schema = 'public'
      and tc.table_name = c.relname
      and tc.constraint_type = 'FOREIGN KEY'
  ) fks on true
  where n.nspname = 'public'
    and c.relkind = 'r' -- ordinary tables only
  order by c.relname;
end;
$$;

grant execute on function public.admin_table_catalog() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_restore_table_rows(table, rows) — the one function allowed to
-- write restore data back into a content table. Deliberately narrow:
--
--   * `p_table` is checked against a hardcoded allow-list below — the
--     same 28 tables src/lib/backup/content-tables.ts treats as content.
--     Keep the two lists in sync; there's a cross-reference comment in
--     both places. This is what "only allow controlled migration
--     operations generated by this application's own backup system"
--     means in practice: no arbitrary table name or SQL from a client
--     ever reaches EXECUTE, only ever one of these 28 identifiers.
--   * Primary-key columns are looked up *inside* the function from
--     information_schema, never taken from the caller — so there's no
--     way to pass a conflict target that isn't the table's real PK.
--   * Rows arrive as jsonb and are mapped onto the table's actual current
--     columns via jsonb_populate_recordset — unknown keys in the JSON
--     (a column since dropped) are ignored, and the table's real column
--     types/constraints do the validation, so "detect incompatible data"
--     falls out of Postgres's own type system rather than a hand-rolled
--     schema checker.
--   * Fast path: the whole batch as one statement — either all of it
--     lands or none of it does (a single transaction), which is the
--     "failed restore doesn't leave the database partially corrupted"
--     requirement for the common case. If that fails (one bad row in an
--     otherwise-good batch, a stale foreign key, etc.), it falls back to
--     row-by-row so 999 good rows aren't held hostage by 1 bad one — and
--     that bad row comes back with Postgres's real error message.
-- ---------------------------------------------------------------------------
create or replace function public.admin_restore_table_rows(
  p_table text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Keep in sync with CONTENT_TABLES in src/lib/backup/content-tables.ts.
  allowed_tables text[] := array[
    'games', 'categories', 'tags', 'game_tags', 'post_tags', 'pages', 'posts',
    'comments', 'comment_likes', 'game_reviews', 'game_ratings',
    'homepage_sections', 'homepage_section_games', 'menu_links', 'mobile_menu_games',
    'site_identity', 'seo_settings', 'seo_redirects',
    'languages', 'currencies', 'translations', 'localization_settings',
    'media_assets', 'notifications', 'import_providers', 'import_rules',
    'favorites', 'recently_played'
  ];
  conflict_columns text[];
  conflict_cols_sql text;
  update_cols_sql text;
  do_nothing boolean := false;
  total_rows int;
  inserted_count int := 0;
  updated_or_skipped_count int := 0;
  fail_count int := 0;
  failures jsonb := '[]'::jsonb;
  bulk_error text;
  row_rec jsonb;
  is_insert boolean;
begin
  if not public.is_admin() then
    raise exception 'Admin access required.' using errcode = '42501';
  end if;

  if p_table is null or not (p_table = any(allowed_tables)) then
    raise exception 'Table "%" is not a permitted content-backup restore target.', coalesce(p_table, '<null>')
      using errcode = '42501';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Rows payload for table "%" must be a JSON array.', p_table;
  end if;

  total_rows := jsonb_array_length(p_rows);
  if total_rows = 0 then
    return jsonb_build_object('table', p_table, 'inserted', 0, 'updated', 0, 'skipped', 0, 'failed', 0, 'errors', '[]'::jsonb);
  end if;

  select array_agg(kcu.column_name::text order by kcu.ordinal_position)
  into conflict_columns
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
  where tc.table_schema = 'public' and tc.table_name = p_table and tc.constraint_type = 'PRIMARY KEY';

  if conflict_columns is null or array_length(conflict_columns, 1) is null then
    raise exception 'Table "%" has no primary key — cannot restore into it safely.', p_table;
  end if;

  conflict_cols_sql := (select string_agg(quote_ident(c), ', ') from unnest(conflict_columns) as c);

  select string_agg(format('%1$I = excluded.%1$I', column_name), ', ')
  into update_cols_sql
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table
    and column_name <> all (conflict_columns);

  -- Pure junction tables (e.g. game_tags) have no columns beyond the
  -- composite primary key, so there's nothing to SET on conflict — a
  -- pre-existing row is legitimately just "already there", not "updated".
  do_nothing := update_cols_sql is null;

  -- Fast path: whole batch, one statement, one transaction. Both branches
  -- use a writable CTE (`with r as (insert ... returning ...)`) because
  -- Postgres only allows INSERT/UPDATE/DELETE to appear in a CTE, never
  -- as a plain subquery in a FROM clause.
  begin
    if do_nothing then
      execute format(
        'with r as (
           insert into %1$I select * from jsonb_populate_recordset(null::public.%1$I, $1)
           on conflict (%2$s) do nothing
           returning true
         )
         select count(*) from r',
        p_table, conflict_cols_sql
      ) using p_rows into inserted_count;
      updated_or_skipped_count := total_rows - inserted_count;
    else
      execute format(
        'with r as (
           insert into %1$I select * from jsonb_populate_recordset(null::public.%1$I, $1)
           on conflict (%2$s) do update set %3$s
           returning (xmax = 0) as is_insert
         )
         select count(*) filter (where is_insert), count(*) filter (where not is_insert) from r',
        p_table, conflict_cols_sql, update_cols_sql
      ) using p_rows into inserted_count, updated_or_skipped_count;
    end if;

    return jsonb_build_object(
      'table', p_table,
      'inserted', inserted_count,
      'updated', case when do_nothing then 0 else updated_or_skipped_count end,
      'skipped', case when do_nothing then updated_or_skipped_count else 0 end,
      'failed', 0,
      'errors', '[]'::jsonb,
      'mode', 'bulk'
    );
  exception when others then
    bulk_error := sqlerrm;
  end;

  -- Fallback: same batch, one row at a time, so a single bad row doesn't
  -- sink the other 999. Slower on purpose — this only runs when the fast
  -- path already failed.
  inserted_count := 0;
  updated_or_skipped_count := 0;
  for row_rec in select * from jsonb_array_elements(p_rows)
  loop
    begin
      if do_nothing then
        execute format(
          'insert into %1$I select * from jsonb_populate_recordset(null::public.%1$I, $1) on conflict (%2$s) do nothing returning true',
          p_table, conflict_cols_sql
        ) using jsonb_build_array(row_rec) into is_insert;
        if is_insert then
          inserted_count := inserted_count + 1;
        else
          updated_or_skipped_count := updated_or_skipped_count + 1;
        end if;
      else
        execute format(
          'insert into %1$I select * from jsonb_populate_recordset(null::public.%1$I, $1)
           on conflict (%2$s) do update set %3$s
           returning (xmax = 0)',
          p_table, conflict_cols_sql, update_cols_sql
        ) using jsonb_build_array(row_rec) into is_insert;
        if is_insert then
          inserted_count := inserted_count + 1;
        else
          updated_or_skipped_count := updated_or_skipped_count + 1;
        end if;
      end if;
    exception when others then
      fail_count := fail_count + 1;
      if jsonb_array_length(failures) < 50 then -- cap detail payload size
        failures := failures || jsonb_build_object('error', sqlerrm, 'row', row_rec);
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'table', p_table,
    'inserted', inserted_count,
    'updated', case when do_nothing then 0 else updated_or_skipped_count end,
    'skipped', case when do_nothing then updated_or_skipped_count else 0 end,
    'failed', fail_count,
    'errors', failures,
    'mode', 'row_by_row',
    'bulkError', bulk_error
  );
end;
$$;

grant execute on function public.admin_restore_table_rows(text, jsonb) to authenticated;
