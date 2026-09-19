"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Activity as ActivityIcon } from "lucide-react";
import { fetchGlobalActivityAdmin, type ActivityLogRow } from "@/lib/supabase/admin-content";

const PAGE_SIZE = 50;

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

const ACTIVITY_TYPES = [
  "login",
  "signup",
  "guest_login",
  "role_changed",
  "banned",
  "unbanned",
  "verified",
  "unverified",
  "force_logout",
];

/** Admin → User Management → User Activity Logs. The site-wide trail:
 * logins/signups and every staff action taken on an account (role
 * changes, bans, verifications). Deliberately doesn't include per-comment
 * or per-play events — see migration 0012 for why. */
export function UserActivityLogsAdminClient() {
  const [activity, setActivity] = useState<ActivityLogRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [activityType, setActivityType] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number, nextType: string) => {
    setLoadError(null);
    try {
      const result = await fetchGlobalActivityAdmin({ page: nextPage, activityType: nextType || undefined });
      setActivity(result.activity);
      setTotal(result.total);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load activity.");
    }
  }, []);

  useEffect(() => {
    load(page, activityType);
  }, [load, page, activityType]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">User Activity Logs</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {activity ? `${total} event${total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <select
          value={activityType}
          onChange={(e) => {
            setActivityType(e.target.value);
            setPage(1);
          }}
          className="admin-input w-44"
        >
          <option value="">All event types</option>
          {ACTIVITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">User</th>
              <th className="px-4 py-3 font-semibold">Event</th>
              <th className="px-4 py-3 font-semibold">Details</th>
              <th className="px-4 py-3 font-semibold">When</th>
            </tr>
          </thead>
          <tbody>
            {activity === null && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {activity?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-text-faint">
                  No activity logged yet.
                </td>
              </tr>
            )}
            {activity?.map((a) => (
              <tr key={a.id} className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-semibold text-white">{a.user_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold capitalize text-white/85">
                    <ActivityIcon size={12} className="text-[var(--color-menu-yellow)]" />
                    {a.activity_type.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="max-w-sm truncate px-4 py-3 text-white/70">{a.description || "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-text-faint">{timeAgo(a.created_at)}</td>
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
