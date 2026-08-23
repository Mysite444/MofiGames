"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Trash2, Plus, Ban, ShieldCheck, Globe, Wifi } from "lucide-react";

interface AccessRuleRow {
  id: string;
  rule_type: "ip" | "country";
  mode: "block" | "allow";
  value: string;
  reason: string | null;
  created_at: string;
}

/** Admin → Security → Access Control. IP and country allow/block rules
 * — enforced on every request in src/middleware.ts via the check_access()
 * RPC (migration 0018). Blocklist entries deny a match; if any allowlist
 * entries exist for a type, that type switches to allowlist-only mode. */
export function SecurityAccessRulesAdminClient() {
  const [rules, setRules] = useState<AccessRuleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [ruleType, setRuleType] = useState<"ip" | "country">("ip");
  const [mode, setMode] = useState<"block" | "allow">("block");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/security/access-rules");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load access rules.");
      setRules(data.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load access rules.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/security/access-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleType, mode, value: value.trim(), reason: reason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create rule.");
      setValue("");
      setReason("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create rule.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/security/access-rules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove rule.");
      }
      setRules((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove rule.");
    } finally {
      setDeletingId(null);
    }
  }

  const ipAllowlistActive = rules?.some((r) => r.rule_type === "ip" && r.mode === "allow") ?? false;
  const countryAllowlistActive = rules?.some((r) => r.rule_type === "country" && r.mode === "allow") ?? false;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Access Control</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          Block or allow specific IP addresses and countries, enforced on every request.
        </p>
      </div>

      {(ipAllowlistActive || countryAllowlistActive) && (
        <div className="mb-4 rounded-xl bg-amber-500/15 px-4 py-3 text-sm font-medium text-amber-400">
          {ipAllowlistActive && countryAllowlistActive
            ? "IP and country allowlists are both active — only listed IPs from listed countries can reach the site."
            : ipAllowlistActive
              ? "An IP allowlist is active — only listed IPs can reach the site."
              : "A country allowlist is active — only listed countries can reach the site."}
        </div>
      )}

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      <form onSubmit={handleSubmit} className="glass mb-6 flex flex-col gap-3 rounded-2xl p-6 sm:p-7">
        {formError && <p className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{formError}</p>}
        <div className="flex flex-wrap gap-2">
          {(["ip", "country"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setRuleType(t)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                ruleType === t ? "bg-[var(--color-menu-yellow)] text-black" : "glass-strong text-white/80 hover:text-white"
              }`}
            >
              {t === "ip" ? "IP address" : "Country"}
            </button>
          ))}
          <span className="mx-1 w-px self-stretch bg-white/10" />
          {(["block", "allow"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                mode === m ? "bg-[var(--color-menu-yellow)] text-black" : "glass-strong text-white/80 hover:text-white"
              }`}
            >
              {m === "block" ? <Ban size={12} /> : <ShieldCheck size={12} />}
              {m === "block" ? "Block" : "Allow"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={ruleType === "ip" ? "203.0.113.42" : "US"}
            maxLength={ruleType === "country" ? 2 : 45}
            className="glass-strong flex-1 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="glass-strong flex-1 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-white/40"
          />
          <button
            type="submit"
            disabled={submitting || !value.trim()}
            className="glow-yellow-button flex shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            Add rule
          </button>
        </div>
        <p className="text-[11px] text-text-faint">
          IP rules match an exact address only (no CIDR ranges yet). Country matching needs the site deployed
          somewhere that sends a country header (e.g. Vercel) — it&apos;s skipped elsewhere.
        </p>
      </form>

      {rules === null && (
        <div className="flex items-center justify-center py-16 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {rules?.length === 0 && (
        <div className="glass rounded-xl px-4 py-10 text-center text-text-faint">
          No rules yet — every IP and country can reach the site.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {rules?.map((r) => (
          <div key={r.id} className="glass flex items-center gap-3 rounded-xl p-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                r.mode === "block" ? "bg-hot/15 text-hot" : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {r.rule_type === "ip" ? <Wifi size={14} /> : <Globe size={14} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                {r.mode === "block" ? "Block" : "Allow"} {r.rule_type === "ip" ? "IP" : "country"}{" "}
                <span className="font-mono">{r.value}</span>
              </p>
              {r.reason && <p className="truncate text-xs text-text-faint">{r.reason}</p>}
            </div>
            <button
              type="button"
              onClick={() => handleDelete(r.id)}
              disabled={deletingId === r.id}
              className="glass shrink-0 rounded-full p-2 text-text-faint hover:text-hot disabled:opacity-50"
              aria-label="Remove rule"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
