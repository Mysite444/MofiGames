"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Trash2, Plus, Ban, ShieldCheck, Wifi, Fingerprint, Sparkles } from "lucide-react";
import { fetchAdProtectionRules, createAdProtectionRule, deleteAdProtectionRule, type AdProtectionRule } from "@/lib/supabase/admin-content";

/** Admin → Monetization → Ad Protection → Whitelist / Blacklist. Manual
 * rules plus anything Auto IP Blocking added on its own (auto_created).
 * A whitelist entry always overrides every risk signal; a blacklist entry
 * always suppresses the ad slot. See check_ad_rule() in migration 0024. */
export function AdProtectionRulesAdminClient() {
  const [rules, setRules] = useState<AdProtectionRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<"ip" | "visitor">("ip");
  const [mode, setMode] = useState<"whitelist" | "blacklist">("blacklist");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setRules(await fetchAdProtectionRules());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rules.");
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
      await createAdProtectionRule({ targetType, mode, value: value.trim(), reason: reason.trim() || undefined });
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
      await deleteAdProtectionRule(id);
      setRules((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove rule.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Whitelist / Blacklist</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          Whitelisting an IP or visitor always shows ads regardless of risk score; blacklisting always hides them.
        </p>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      <form onSubmit={handleSubmit} className="glass mb-6 flex flex-col gap-3 rounded-2xl p-6 sm:p-7">
        {formError && <p className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{formError}</p>}
        <div className="flex flex-wrap gap-2">
          {(["ip", "visitor"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTargetType(t)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                targetType === t ? "bg-[var(--color-menu-yellow)] text-black" : "glass-strong text-white/80 hover:text-white"
              }`}
            >
              {t === "ip" ? "IP address" : "Visitor ID"}
            </button>
          ))}
          <span className="mx-1 w-px self-stretch bg-white/10" />
          {(["blacklist", "whitelist"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                mode === m ? "bg-[var(--color-menu-yellow)] text-black" : "glass-strong text-white/80 hover:text-white"
              }`}
            >
              {m === "blacklist" ? <Ban size={12} /> : <ShieldCheck size={12} />}
              {m === "blacklist" ? "Blacklist" : "Whitelist"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={targetType === "ip" ? "203.0.113.42" : "visitor cookie id"}
            maxLength={100}
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
      </form>

      {rules === null && (
        <div className="flex items-center justify-center py-16 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {rules?.length === 0 && (
        <div className="glass rounded-xl px-4 py-10 text-center text-text-faint">No rules yet.</div>
      )}

      <div className="flex flex-col gap-2">
        {rules?.map((r) => (
          <div key={r.id} className="glass flex items-center gap-3 rounded-xl p-3">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                r.mode === "blacklist" ? "bg-hot/15 text-hot" : "bg-emerald-500/15 text-emerald-400"
              }`}
            >
              {r.target_type === "ip" ? <Wifi size={14} /> : <Fingerprint size={14} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">
                {r.mode === "blacklist" ? "Blacklist" : "Whitelist"} {r.target_type === "ip" ? "IP" : "visitor"}{" "}
                <span className="font-mono">{r.value}</span>
                {r.auto_created && (
                  <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-text-faint">
                    <Sparkles size={10} /> auto
                  </span>
                )}
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
