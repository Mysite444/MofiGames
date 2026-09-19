-- MofiGames — general-purpose admin action log.
--
-- The project already has two audit trails: user_activity_logs (0012,
-- scoped to actions taken *on* one target user — ban/verify/role change)
-- and report_audit_log (0015, scoped to one report). Neither fits actions
-- that don't target a single user or report: changing security settings,
-- adding an IP block rule, minting/revoking an API key, restoring a
-- backup, editing the role/permission matrix, deleting a game/category/
-- page/post, or changing site identity/branding.
--
-- admin_action_log fills that gap. Written at the app layer (route
-- handlers), same pattern as the two tables above, so entries can carry a
-- human-readable summary instead of just raw column diffs.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  -- Captured at write time so the log stays readable even if the actor's
  -- account is later deleted (actor_id would go null via the FK above).
  actor_email text,
  action text not null,
  target_type text,
  target_id text,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_action_log_created_at_idx on public.admin_action_log (created_at desc);
create index if not exists admin_action_log_action_idx on public.admin_action_log (action);
create index if not exists admin_action_log_actor_id_idx on public.admin_action_log (actor_id);

alter table public.admin_action_log enable row level security;

-- Insert is restricted to staff logging their own action (actor_id must
-- match the caller) — this is a second, explicit backstop the same way
-- requireAdmin()/requirePermission() are for the routes themselves; the
-- routes are the primary gate, this just stops a compromised non-staff
-- session from writing fake audit rows directly.
drop policy if exists "Staff can write their own admin action log entries" on public.admin_action_log;
create policy "Staff can write their own admin action log entries"
  on public.admin_action_log for insert
  with check (
    actor_id = auth.uid()
    and (public.is_admin() or public.profiles_role() in ('editor', 'moderator'))
  );

-- Same read gate as user_activity_logs (0012): admins, or anyone holding
-- the view_activity_logs permission — one "who can see the audit trail"
-- answer shared across both tables instead of a new permission.
drop policy if exists "Admins can view the admin action log" on public.admin_action_log;
create policy "Admins can view the admin action log"
  on public.admin_action_log for select
  using (public.is_admin() or public.has_permission('view_activity_logs'));
