-- MofiGames — Phase 67: fix "Download Content Backup" always failing with
-- "Could not read the database schema catalog: Admin access required."
-- Run in Supabase SQL Editor. Safe to run multiple times.
--
-- Bug: admin_table_catalog() and admin_restore_table_rows() (0062) both
-- gate on `if not public.is_admin() then raise exception 'Admin access
-- required.'`, which resolves admin status from auth.uid(). That's correct
-- for a normal logged-in admin session — but exportContentTables()
-- (src/lib/backup/content-backup.ts) deliberately calls
-- getTableCatalog() using the SERVICE ROLE client, not the admin's
-- session client: favorites/recently_played have per-user RLS with no
-- admin bypass, so reading through the normal session client would
-- silently return only the admin's own rows instead of everyone's. A
-- service-role connection has no logged-in user at all, so auth.uid() is
-- always null there — meaning is_admin() is always false and the RPC
-- rejects every single call, regardless of who clicked the button or
-- what their profiles.is_admin flag is. This is exactly the same class
-- of bug 0013 already fixed for profiles_before_update_guard(): a
-- SECURITY DEFINER function's own admin check assuming a session that a
-- legitimate service-role/backend caller doesn't have.
--
-- Fix: only enforce is_admin() when there IS a session to check
-- (auth.uid() is not null). A null auth.uid() here means either a
-- service-role call (already fully trusted — it's what bypasses RLS for
-- the very reads this system exists to back up) or direct database
-- access, never a regular signed-in non-admin user, since both functions
-- are GRANTed to `authenticated` only, not `anon` — an anonymous caller
-- is rejected by that grant before ever reaching this check. Applied to
-- both functions for consistency, since admin_restore_table_rows() has
-- the identical pattern even though its current caller happens to
-- already use the session client.

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
  if auth.uid() is not null and not public.is_admin() then
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
  if auth.uid() is not null and not public.is_admin() then
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
