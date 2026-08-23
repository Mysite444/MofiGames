"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, Copy, Check, RotateCw, Ban, Trash2, KeyRound } from "lucide-react";
import { API_KEY_SCOPES, type ApiKeyScope } from "@/lib/api-key-scopes";

interface ApiKeyRow {
  id: string;
  label: string;
  key_prefix: string;
  scopes: string[];
  rate_limit_per_hour: number;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

function RevealedKeyBanner({ rawKey, onDismiss }: { rawKey: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="glass-strong mb-6 flex flex-col gap-2 rounded-xl p-4">
      <p className="text-sm font-semibold text-white">Copy this key now — it won&apos;t be shown again.</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 overflow-x-auto rounded-lg bg-black/40 px-3 py-2 text-xs text-emerald-400">{rawKey}</code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(rawKey);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <button type="button" onClick={onDismiss} className="self-start text-xs font-semibold text-text-faint hover:text-white">
        Done
      </button>
    </div>
  );
}

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

/** Admin → Security → API Keys. Manages keys for the /api/v1/* public
 * API surface — see supabase/migrations/0019_api_security.sql and
 * src/lib/api-auth.ts. */
export function SecurityApiKeysAdminClient() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>([]);
  const [rateLimit, setRateLimit] = useState(1000);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/api-keys");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load API keys.");
      setKeys(data.keys);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load API keys.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleScope(scope: ApiKeyScope) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (scopes.length === 0) {
      setFormError("Choose at least one scope.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), scopes, rateLimitPerHour: rateLimit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create API key.");
      setRevealedKey(data.rawKey);
      setLabel("");
      setScopes([]);
      setRateLimit(1000);
      setShowForm(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create API key.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRotate(id: string) {
    if (!window.confirm("Rotate this key? The current key stops working immediately.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/api-keys/${id}/rotate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to rotate key.");
      setRevealedKey(data.rawKey);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate key.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRevoke(id: string) {
    if (!window.confirm("Revoke this key? Anything using it will stop working immediately.")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to revoke key.");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Permanently delete this key record?")) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete key.");
      }
      setKeys((prev) => (prev ? prev.filter((k) => k.id !== id) : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete key.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">API Keys</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            For the public <code>/api/v1/*</code> read API. Internal admin/site routes stay session-based and
            don&apos;t use these.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="glow-yellow-button flex shrink-0 items-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-5 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={16} /> New key
        </button>
      </div>

      {revealedKey && <RevealedKeyBanner rawKey={revealedKey} onDismiss={() => setRevealedKey(null)} />}
      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {showForm && (
        <form onSubmit={handleCreate} className="glass mb-6 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
          {formError && <p className="rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{formError}</p>}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-white">Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Partner site integration"
              required
              className="glass-strong rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-white/40"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-white">Scopes</span>
            <div className="flex flex-wrap gap-2">
              {API_KEY_SCOPES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleScope(s.value)}
                  className={`rounded-full px-3.5 py-2 text-xs font-semibold transition-colors ${
                    scopes.includes(s.value) ? "bg-[var(--color-menu-yellow)] text-black" : "glass-strong text-white/80"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-white">Rate limit (requests/hour)</span>
            <input
              type="number"
              min={1}
              max={100000}
              value={rateLimit}
              onChange={(e) => setRateLimit(Number(e.target.value) || 1000)}
              className="glass-strong w-40 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="glow-yellow-button self-start rounded-full bg-[var(--color-menu-bg)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create key"}
          </button>
        </form>
      )}

      {keys === null && (
        <div className="flex items-center justify-center py-16 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {keys?.length === 0 && (
        <div className="glass flex flex-col items-center gap-2 rounded-xl px-4 py-10 text-center text-text-faint">
          <KeyRound size={20} />
          No API keys yet.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {keys?.map((k) => {
          const isRevoked = Boolean(k.revoked_at);
          const isExpired = Boolean(k.expires_at && new Date(k.expires_at) < new Date());
          return (
            <div key={k.id} className="glass flex flex-wrap items-center gap-3 rounded-xl p-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  isRevoked || isExpired ? "bg-white/10 text-text-faint" : "bg-emerald-500/15 text-emerald-400"
                }`}
              >
                <KeyRound size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {k.label}
                  {isRevoked && <span className="ml-2 text-xs font-normal text-hot">revoked</span>}
                  {!isRevoked && isExpired && <span className="ml-2 text-xs font-normal text-amber-400">expired</span>}
                </p>
                <p className="truncate text-xs text-text-faint">
                  <code>{k.key_prefix}…</code> · {k.scopes.join(", ")} · {k.rate_limit_per_hour}/hr · last used{" "}
                  {timeAgo(k.last_used_at)}
                </p>
              </div>
              {!isRevoked && (
                <>
                  <button
                    type="button"
                    onClick={() => handleRotate(k.id)}
                    disabled={busyId === k.id}
                    className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white disabled:opacity-50"
                  >
                    <RotateCw size={12} /> Rotate
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRevoke(k.id)}
                    disabled={busyId === k.id}
                    className="glass flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-hot disabled:opacity-50"
                  >
                    <Ban size={12} /> Revoke
                  </button>
                </>
              )}
              {isRevoked && (
                <button
                  type="button"
                  onClick={() => handleDelete(k.id)}
                  disabled={busyId === k.id}
                  className="glass shrink-0 rounded-full p-2 text-text-faint hover:text-hot disabled:opacity-50"
                  aria-label="Delete key record"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
