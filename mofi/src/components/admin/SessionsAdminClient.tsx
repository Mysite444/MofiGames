"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LogOut, AlertTriangle, CheckCircle2 } from "lucide-react";
import { fetchUsersAdmin, forceLogoutUserAdmin, type AdminUserRow } from "@/lib/supabase/admin-content";

const PAGE_SIZE = 20;

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
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

/** Admin → User Management → Login & Session Management. Shows last
 * sign-in, email-confirmed status, and auth provider for each account,
 * and lets an admin force-revoke every active session for one user. All
 * of this needs Supabase's Admin API (SUPABASE_SERVICE_ROLE_KEY on the
 * server) — without it, this screen explains what's missing rather than
 * silently showing blank columns. */
export function SessionsAdminClient() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sessionAvailable, setSessionAvailable] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number) => {
    setLoadError(null);
    try {
      const result = await fetchUsersAdmin({ page: nextPage });
      setUsers(result.users);
      setTotal(result.total);
      setSessionAvailable(result.capabilities.sessionManagementAvailable);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load users.");
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  async function handleForceLogout(u: AdminUserRow) {
    if (!confirm(`Force-logout ${u.name} on every device? This ends all of their active sessions immediately.`))
      return;
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
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Login & Session Management</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          Last sign-in, provider, and email verification per account, with a force-logout switch.
        </p>
      </div>

      {!sessionAvailable && (
        <div className="mb-6 flex items-start gap-2 rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            Session details and force-logout need a Supabase Service Role Key. Add{" "}
            <code className="rounded bg-black/30 px-1 py-0.5">SUPABASE_SERVICE_ROLE_KEY</code> to your server
            environment (never expose this key to the browser) to unlock this screen fully.
          </p>
        </div>
      )}

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
              <th className="px-4 py-3 font-semibold">Last sign-in</th>
              <th className="px-4 py-3 font-semibold">Email confirmed</th>
              <th className="px-4 py-3 font-semibold">Provider</th>
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
            {users?.map((u) => (
              <tr key={u.id} className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-semibold text-white">{u.name}</td>
                <td className="px-4 py-3 text-text-faint">
                  {u.auth ? timeAgo(u.auth.lastSignInAt) : "—"}
                </td>
                <td className="px-4 py-3">
                  {u.auth?.emailConfirmedAt ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400">
                      <CheckCircle2 size={12} />
                      Yes
                    </span>
                  ) : (
                    <span className="text-xs text-text-faint">{u.auth ? "No" : "—"}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-text-faint">{u.auth?.provider ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleForceLogout(u)}
                    disabled={!sessionAvailable || busyId === u.id}
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-40"
                  >
                    {busyId === u.id ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                    Force logout
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
    </div>
  );
}
