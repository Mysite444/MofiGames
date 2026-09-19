"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, LogIn, LogOut, Search } from "lucide-react";

const PAGE_SIZE = 50;

interface LoginAttemptRow {
  id: string;
  email: string;
  success: boolean;
  failure_reason: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

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

/** Admin → Security → Login Logs. Every login attempt, success or
 * failure, recorded by the login form (src/lib/auth-context.tsx) against
 * login_attempts. See supabase/migrations/0017_security_hardening.sql. */
export function SecurityLogsAdminClient() {
  const [attempts, setAttempts] = useState<LoginAttemptRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState("");
  const [outcome, setOutcome] = useState<"" | "success" | "failed">("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number, emailFilter: string, outcomeFilter: string) => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(nextPage) });
      if (emailFilter) params.set("email", emailFilter);
      if (outcomeFilter) params.set("outcome", outcomeFilter);
      const res = await fetch(`/api/admin/security/logs?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load login logs.");
      setAttempts(data.attempts);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load login logs.");
    }
  }, []);

  useEffect(() => {
    load(page, email, outcome);
  }, [load, page, email, outcome]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Login Logs</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          {attempts ? `${total} attempt${total === 1 ? "" : "s"}` : "Loading…"} — every login attempt, success or
          failure.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="glass flex items-center gap-2 rounded-full px-3.5 py-2">
          <Search size={14} className="text-text-faint" />
          <input
            value={email}
            onChange={(e) => {
              setPage(1);
              setEmail(e.target.value);
            }}
            placeholder="Filter by email"
            className="bg-transparent text-sm text-white placeholder:text-text-faint focus:outline-none"
          />
        </div>
        {(["", "success", "failed"] as const).map((opt) => (
          <button
            key={opt || "all"}
            type="button"
            onClick={() => {
              setPage(1);
              setOutcome(opt);
            }}
            className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
              outcome === opt ? "bg-[var(--color-menu-yellow)] text-black" : "glass text-white/80 hover:text-white"
            }`}
          >
            {opt === "" ? "All" : opt === "success" ? "Successful" : "Failed"}
          </button>
        ))}
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {attempts === null && (
        <div className="flex items-center justify-center py-20 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {attempts?.length === 0 && (
        <div className="glass rounded-xl px-4 py-10 text-center text-text-faint">No login attempts match.</div>
      )}

      <div className="flex flex-col gap-2">
        {attempts?.map((a) => (
          <div key={a.id} className="glass flex items-center gap-3 rounded-xl p-3">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                a.success ? "bg-emerald-500/15 text-emerald-400" : "bg-hot/15 text-hot"
              }`}
            >
              {a.success ? <LogIn size={13} /> : <LogOut size={13} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white/85">
                <span className="font-semibold text-white">{a.email}</span>{" "}
                {a.success ? "signed in" : `failed to sign in${a.failure_reason ? ` — ${a.failure_reason}` : ""}`}
              </p>
              <p className="truncate text-xs text-text-faint">
                {a.ip ?? "unknown IP"}
                {a.user_agent ? ` · ${a.user_agent}` : ""}
              </p>
            </div>
            <span className="ml-auto shrink-0 text-xs text-text-faint">{timeAgo(a.created_at)}</span>
          </div>
        ))}
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
