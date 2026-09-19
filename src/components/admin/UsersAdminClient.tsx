"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Search,
  X,
  ShieldCheck,
  ShieldOff,
  BadgeCheck,
  Ban,
  UserCog,
  Clock,
} from "lucide-react";
import {
  fetchUsersAdmin,
  fetchUserActivityAdmin,
  fetchUserPermissionsAdmin,
  updateUserPermissionOverridesAdmin,
  updateUserRoleAdmin,
  banUserAdmin,
  unbanUserAdmin,
  verifyUserAdmin,
  unverifyUserAdmin,
  forceLogoutUserAdmin,
  type AdminUserRow,
  type ViewerCapabilitiesDto,
  type ActivityLogRow,
  type UserPermissionRow,
} from "@/lib/supabase/admin-content";
import { ASSIGNABLE_ROLES, PERMISSION_LABELS, type Permission } from "@/lib/permissions";

const PAGE_SIZE = 20;

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    admin: "bg-[var(--color-menu-yellow)]/20 text-[var(--color-menu-yellow)]",
    editor: "bg-sky-400/15 text-sky-400",
    moderator: "bg-violet-400/15 text-violet-400",
    user: "bg-white/10 text-white/60",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${colors[role] ?? colors.user}`}>
      {role}
    </span>
  );
}

/** Admin → User Management → Users. The main roster: search, filter by
 * role/status, and a detail drawer (role change, ban/verify, per-user
 * permission overrides, activity trail). Every mutating action is
 * conditionally rendered based on the `capabilities` the list API embeds
 * for the current viewer — a moderator without ban_users simply doesn't
 * see the ban button, rather than seeing it fail. */
export function UsersAdminClient({
  initialStatus = "all",
}: {
  initialStatus?: "all" | "banned" | "verified" | "unverified";
}) {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [capabilities, setCapabilities] = useState<ViewerCapabilitiesDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, nextQ: string, nextRole: string, nextStatus: typeof status) => {
      setLoadError(null);
      try {
        const result = await fetchUsersAdmin({
          page: nextPage,
          q: nextQ.trim() || undefined,
          role: nextRole || undefined,
          status: nextStatus,
        });
        setUsers(result.users);
        setTotal(result.total);
        setCapabilities(result.capabilities);
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load users.");
      }
    },
    []
  );

  useEffect(() => {
    load(page, q, role, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, role, status]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    load(1, q, role, status);
  }

  async function refresh() {
    await load(page, q, role, status);
  }

  async function handleRoleChange(u: AdminUserRow, newRole: string) {
    setActionError(null);
    setBusyId(u.id);
    try {
      const updated = await updateUserRoleAdmin(u.id, newRole);
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, ...updated } : x)) ?? null);
      setSelected((prev) => (prev?.id === u.id ? { ...prev, ...updated } : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to change role.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBan(u: AdminUserRow) {
    const reason = prompt(`Reason for banning ${u.name}?`);
    if (!reason) return;
    const daysRaw = prompt("Ban for how many days? Leave blank for permanent.");
    const expiresInDays = daysRaw ? Number(daysRaw) : undefined;
    setActionError(null);
    setBusyId(u.id);
    try {
      const updated = await banUserAdmin(u.id, { reason, expiresInDays });
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, ...updated } : x)) ?? null);
      setSelected((prev) => (prev?.id === u.id ? { ...prev, ...updated } : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to ban user.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnban(u: AdminUserRow) {
    setActionError(null);
    setBusyId(u.id);
    try {
      const updated = await unbanUserAdmin(u.id);
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, ...updated } : x)) ?? null);
      setSelected((prev) => (prev?.id === u.id ? { ...prev, ...updated } : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to unban user.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleVerifyToggle(u: AdminUserRow) {
    setActionError(null);
    setBusyId(u.id);
    try {
      const updated = u.is_verified ? await unverifyUserAdmin(u.id) : await verifyUserAdmin(u.id);
      setUsers((prev) => prev?.map((x) => (x.id === u.id ? { ...x, ...updated } : x)) ?? null);
      setSelected((prev) => (prev?.id === u.id ? { ...prev, ...updated } : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update verification.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleForceLogout(u: AdminUserRow) {
    if (!confirm(`Force-logout ${u.name} on every device?`)) return;
    setActionError(null);
    setBusyId(u.id);
    try {
      await forceLogoutUserAdmin(u.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to force logout.");
    } finally {
      setBusyId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            {status === "banned" ? "Banned Users" : status === "verified" || status === "unverified" ? "User Verification" : "Users"}
          </h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {users ? `${total} account${total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as typeof status);
              setPage(1);
            }}
            className="admin-input w-36"
          >
            <option value="all">All statuses</option>
            <option value="banned">Banned</option>
            <option value="verified">Verified</option>
            <option value="unverified">Unverified</option>
          </select>
          <select
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            className="admin-input w-32"
          >
            <option value="">All roles</option>
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name…"
              className="admin-input w-56 pl-8"
            />
          </div>
          <button type="submit" className="glass rounded-full px-4 py-2 text-xs font-semibold text-white/80 hover:text-white">
            Search
          </button>
        </form>
      </div>

      {(loadError || actionError) && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">
          {loadError || actionError}
        </div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Joined</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {users === null && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {users?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  No users found.
                </td>
              </tr>
            )}
            {users?.map((u) => (
              <tr
                key={u.id}
                className="cursor-pointer border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
                onClick={() => setSelected(u)}
              >
                <td className="px-4 py-3 font-semibold text-white">
                  <span className="flex items-center gap-1.5">
                    {u.name}
                    {u.is_verified && <BadgeCheck size={14} className="text-sky-400" />}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3">
                  {u.is_banned ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-hot">
                      <Ban size={12} />
                      Banned
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-400">Active</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-text-faint">{timeAgo(u.created_at)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(u);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                    aria-label={`Manage ${u.name}`}
                  >
                    <UserCog size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-text-faint">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="glass rounded-full px-4 py-2 font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="glass rounded-full px-4 py-2 font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {selected && capabilities && (
        <UserDetailDrawer
          user={selected}
          capabilities={capabilities}
          busy={busyId === selected.id}
          onClose={() => setSelected(null)}
          onRoleChange={(newRole) => handleRoleChange(selected, newRole)}
          onBan={() => handleBan(selected)}
          onUnban={() => handleUnban(selected)}
          onVerifyToggle={() => handleVerifyToggle(selected)}
          onForceLogout={() => handleForceLogout(selected)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

function UserDetailDrawer({
  user,
  capabilities,
  busy,
  onClose,
  onRoleChange,
  onBan,
  onUnban,
  onVerifyToggle,
  onForceLogout,
  onChanged,
}: {
  user: AdminUserRow;
  capabilities: ViewerCapabilitiesDto;
  busy: boolean;
  onClose: () => void;
  onRoleChange: (role: string) => void;
  onBan: () => void;
  onUnban: () => void;
  onVerifyToggle: () => void;
  onForceLogout: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"overview" | "permissions" | "activity">("overview");

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-opaque flex h-full w-full max-w-lg flex-col border-l border-[var(--color-surface-border)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-surface-border)] px-5 pb-4 pt-5">
          <h2 className="font-display text-lg font-bold text-white">{user.name}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
          >
            <X size={18} className="text-white/70" />
          </button>
        </div>

        <div className="flex shrink-0 gap-1 rounded-full bg-white/5 p-1 mx-5 mt-4">
          {(["overview", "permissions", "activity"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                tab === t ? "bg-[var(--color-menu-yellow)] text-black" : "text-white/70 hover:text-white"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
        {tab === "overview" && (
          <OverviewTab
            user={user}
            capabilities={capabilities}
            busy={busy}
            onRoleChange={onRoleChange}
            onBan={onBan}
            onUnban={onUnban}
            onVerifyToggle={onVerifyToggle}
            onForceLogout={onForceLogout}
          />
        )}
        {tab === "permissions" && (
          <PermissionsTab userId={user.id} canManageRoles={capabilities.canManageRoles} onChanged={onChanged} />
        )}
        {tab === "activity" && <ActivityTab userId={user.id} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  user,
  capabilities,
  busy,
  onRoleChange,
  onBan,
  onUnban,
  onVerifyToggle,
  onForceLogout,
}: {
  user: AdminUserRow;
  capabilities: ViewerCapabilitiesDto;
  busy: boolean;
  onRoleChange: (role: string) => void;
  onBan: () => void;
  onUnban: () => void;
  onVerifyToggle: () => void;
  onForceLogout: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <span className="mb-1.5 block text-xs font-semibold text-white/70">Role</span>
        <select
          value={user.role}
          disabled={!capabilities.canManageRoles || busy}
          onChange={(e) => onRoleChange(e.target.value)}
          className="admin-input w-full disabled:opacity-50"
        >
          {ASSIGNABLE_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {!capabilities.canManageRoles && (
          <p className="mt-1 text-xs text-text-faint">Only admins can change roles.</p>
        )}
      </div>

      <div className="glass rounded-xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-faint">Ban status</span>
          {user.is_banned ? (
            <span className="flex items-center gap-1 text-xs font-bold text-hot">
              <Ban size={12} />
              Banned
            </span>
          ) : (
            <span className="text-xs font-bold text-emerald-400">Active</span>
          )}
        </div>
        {user.is_banned && (
          <div className="mb-3 text-xs text-white/70">
            <p>{user.ban_reason}</p>
            <p className="mt-1 text-text-faint">
              {user.ban_expires_at
                ? `Until ${new Date(user.ban_expires_at).toLocaleString()}`
                : "Permanent"}
            </p>
          </div>
        )}
        {capabilities.canBanUsers ? (
          user.is_banned ? (
            <button
              type="button"
              onClick={onUnban}
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-2 text-xs font-bold text-emerald-400 disabled:opacity-50"
            >
              <ShieldCheck size={13} />
              Unban
            </button>
          ) : (
            <button
              type="button"
              onClick={onBan}
              disabled={busy}
              className="flex w-full items-center justify-center gap-1.5 rounded-full bg-hot/15 px-3 py-2 text-xs font-bold text-hot disabled:opacity-50"
            >
              <ShieldOff size={13} />
              Ban user
            </button>
          )
        ) : (
          <p className="text-xs text-text-faint">You don&apos;t have permission to ban users.</p>
        )}
      </div>

      <div className="glass rounded-xl p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-faint">Verification</span>
          {user.is_verified && (
            <span className="flex items-center gap-1 text-xs font-bold text-sky-400">
              <BadgeCheck size={12} />
              Verified
            </span>
          )}
        </div>
        {capabilities.canVerifyUsers ? (
          <button
            type="button"
            onClick={onVerifyToggle}
            disabled={busy}
            className="flex w-full items-center justify-center gap-1.5 rounded-full bg-sky-400/15 px-3 py-2 text-xs font-bold text-sky-400 disabled:opacity-50"
          >
            <BadgeCheck size={13} />
            {user.is_verified ? "Revoke verification" : "Verify user"}
          </button>
        ) : (
          <p className="text-xs text-text-faint">You don&apos;t have permission to verify users.</p>
        )}
      </div>

      <div className="glass rounded-xl p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
          <Clock size={13} />
          Session
        </div>
        {user.auth ? (
          <div className="flex flex-col gap-1 text-xs text-white/70">
            <p>Last sign-in: {user.auth.lastSignInAt ? timeAgo(user.auth.lastSignInAt) : "never"}</p>
            <p>Email confirmed: {user.auth.emailConfirmedAt ? "Yes" : "No"}</p>
            <p>Provider: {user.auth.provider ?? "—"}</p>
            {user.auth.isAnonymous && <p>Guest session</p>}
          </div>
        ) : (
          <p className="text-xs text-text-faint">
            Connect a Supabase Service Role Key on the server to see session details here.
          </p>
        )}
        {capabilities.sessionManagementAvailable ? (
          <button
            type="button"
            onClick={onForceLogout}
            disabled={busy}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Force logout everywhere
          </button>
        ) : (
          <p className="mt-3 text-xs text-text-faint">
            Force-logout needs a Service Role Key configured — see Login & Session Management.
          </p>
        )}
      </div>
    </div>
  );
}

function PermissionsTab({
  userId,
  canManageRoles,
  onChanged,
}: {
  userId: string;
  canManageRoles: boolean;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<UserPermissionRow[] | null>(null);
  const [role, setRole] = useState("user");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await fetchUserPermissionsAdmin(userId);
      setRows(result.permissions);
      setRole(result.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load permissions.");
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleToggle(permission: string, next: boolean | null) {
    if (!rows) return;
    setSaving(true);
    setError(null);
    try {
      await updateUserPermissionOverridesAdmin(userId, [{ permission, granted: next }]);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update permission.");
    } finally {
      setSaving(false);
    }
  }

  if (role === "admin") {
    return <p className="text-sm text-text-faint">Admins have every permission — nothing to configure.</p>;
  }

  if (!canManageRoles) {
    return <p className="text-sm text-text-faint">Only admins can grant or revoke individual permissions.</p>;
  }

  if (error) return <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>;
  if (!rows) return <Loader2 size={18} className="mx-auto animate-spin text-text-faint" />;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-faint">
        Override this user&apos;s permissions individually, beyond what their <strong className="capitalize">{role}</strong> role
        grants by default.
      </p>
      {rows.map((r) => (
        <div key={r.permission} className="glass flex items-center justify-between rounded-xl p-3">
          <div>
            <p className="text-sm font-semibold text-white">{PERMISSION_LABELS[r.permission as Permission]?.label ?? r.permission}</p>
            <p className="text-xs text-text-faint">
              Role default: {r.roleDefault ? "granted" : "not granted"}
              {r.override !== null && (
                <> · Override: {r.override ? "granted" : "revoked"}</>
              )}
            </p>
          </div>
          <select
            value={r.override === null ? "default" : r.override ? "grant" : "revoke"}
            disabled={saving}
            onChange={(e) => {
              const v = e.target.value;
              handleToggle(r.permission, v === "default" ? null : v === "grant");
            }}
            className="admin-input w-32 text-xs"
          >
            <option value="default">Role default</option>
            <option value="grant">Grant</option>
            <option value="revoke">Revoke</option>
          </select>
        </div>
      ))}
    </div>
  );
}

function ActivityTab({ userId }: { userId: string }) {
  const [activity, setActivity] = useState<ActivityLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUserActivityAdmin(userId)
      .then((r) => setActivity(r.activity))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load activity."));
  }, [userId]);

  if (error) return <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>;
  if (!activity) return <Loader2 size={18} className="mx-auto animate-spin text-text-faint" />;
  if (activity.length === 0) return <p className="text-sm text-text-faint">No activity logged yet.</p>;

  return (
    <ul className="flex flex-col gap-2.5">
      {activity.map((a) => (
        <li key={a.id} className="glass rounded-xl p-3 text-sm">
          <p className="font-semibold capitalize text-white">{a.activity_type.replace(/_/g, " ")}</p>
          {a.description && <p className="text-white/70">{a.description}</p>}
          <p className="mt-1 text-xs text-text-faint">{timeAgo(a.created_at)}</p>
        </li>
      ))}
    </ul>
  );
}
