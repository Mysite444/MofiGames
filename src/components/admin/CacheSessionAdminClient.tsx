"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cookie,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  Radio,
  Save,
  ServerCog,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  mapSessionCacheRow,
  DEFAULT_SESSION_CACHE_SETTINGS,
  REDIS_TTL_LIMITS,
  DB_SESSION_TTL_LIMITS,
  MAX_CONCURRENT_SESSIONS_LIMITS,
  IDLE_TIMEOUT_LIMITS,
  ABSOLUTE_TIMEOUT_LIMITS,
  REPLICATION_POLL_INTERVAL_LIMITS,
  type SessionCacheSettings,
  type SameSiteMode,
  type EncryptionAlgorithm,
  type ReplicationMode,
} from "@/lib/session-cache-settings";

// ── Local sub-components ────────────────────────────────────────────────────
// Duplicated per-file rather than shared, matching the pattern in
// CacheObjectAdminClient / CacheDnsAdminClient / CacheApiAdminClient.

function Section({
  title,
  hint,
  children,
  defaultOpen = true,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">{title}</h2>
          {hint && open && <p className="mt-1 text-xs text-text-faint">{hint}</p>}
        </div>
        {open ? (
          <ChevronDown size={15} className="shrink-0 text-text-faint" />
        ) : (
          <ChevronRight size={15} className="shrink-0 text-text-faint" />
        )}
      </button>
      {open && children}
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={`flex items-center justify-between gap-4 py-1 ${disabled ? "opacity-50" : ""}`}>
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {hint && <span className="block text-xs text-text-faint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
        } ${disabled ? "cursor-not-allowed" : ""}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
          className="glass w-32 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed"
        />
        {suffix && <span className="text-xs text-text-faint">{suffix}</span>}
      </div>
    </div>
  );
}

function TextField({
  label,
  hint,
  value,
  placeholder,
  mono,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`admin-input ${mono ? "font-mono text-xs" : ""}`}
      />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="admin-input w-56"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SecretField({
  label,
  hint,
  keySet,
  preview,
  minLength,
  onSet,
  onClear,
}: {
  label: string;
  hint?: string;
  keySet: boolean;
  preview: string | null;
  minLength?: number;
  onSet: (v: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(!keySet);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      {!editing && keySet ? (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-white/70">{preview ?? "••••"}</span>
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-[var(--color-menu-yellow)] hover:underline">
            Replace
          </button>
          <button
            type="button"
            onClick={() => {
              onClear();
              setDraft("");
            }}
            className="text-xs text-hot hover:underline"
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type={show ? "text" : "password"}
              value={draft}
              placeholder={keySet ? "Enter new value to replace…" : "Enter value…"}
              onChange={(e) => setDraft(e.target.value)}
              className="admin-input w-full pr-10 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white"
            >
              {show ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <button
            type="button"
            disabled={!draft.trim() || (minLength !== undefined && draft.trim().length < minLength)}
            onClick={() => {
              onSet(draft.trim());
              setDraft("");
              setEditing(false);
            }}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            <Check size={13} /> Set
          </button>
          {keySet && (
            <button type="button" onClick={() => setEditing(false)} className="text-xs text-text-faint hover:text-white">
              Cancel
            </button>
          )}
        </div>
      )}
      {editing && minLength !== undefined && (
        <span className="text-[11px] text-text-faint">Minimum {minLength} characters.</span>
      )}
    </div>
  );
}

function ChipListField({
  values,
  placeholder,
  onAdd,
  onRemove,
}: {
  values: string[];
  placeholder: string;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    if (v && !values.includes(v)) onAdd(v);
    setDraft("");
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
            <code>{v}</code>
            <button type="button" onClick={() => onRemove(v)} className="text-white/40 hover:text-white">
              <X size={11} />
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-text-faint">None configured.</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          className="admin-input flex-1"
        />
        <button
          type="button"
          onClick={commit}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

function ResultBanner({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-xs ${ok ? "bg-emerald-500/10 text-emerald-300" : "bg-hot/15 text-hot"}`}>
      {ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
      <span className="leading-relaxed">{message}</span>
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
  return `${day}d ago`;
}

const SAME_SITE_OPTIONS: { value: SameSiteMode; label: string }[] = [
  { value: "strict", label: "Strict" },
  { value: "lax", label: "Lax (recommended)" },
  { value: "none", label: "None (cross-site)" },
];

const ENCRYPTION_OPTIONS: { value: EncryptionAlgorithm; label: string }[] = [
  { value: "aes-256-gcm", label: "AES-256-GCM (recommended)" },
  { value: "aes-256-cbc", label: "AES-256-CBC" },
];

const REPLICATION_MODES: { id: ReplicationMode; label: string; description: string }[] = [
  {
    id: "none",
    label: "None",
    description: "Single instance — every session lives only wherever it was created. Fine until you scale past one process.",
  },
  {
    id: "redis_pub_sub",
    label: "Redis Pub/Sub",
    description: "Every instance publishes session events on a shared channel; others subscribe and stay in sync in near real time. Requires Redis Sessions to be configured above.",
  },
  {
    id: "database_polling",
    label: "Database Polling",
    description: "No separate channel — every instance reads session_store directly, so it's always the single source of truth rather than something that needs propagating.",
  },
];

/** Admin → Cache → Session Cache.
 *
 * Four independent pillars sharing one settings row (mirrors DNS Cache's
 * four-parallel-concerns layout rather than Object Cache's single-
 * provider-choice one, since these genuinely combine rather than
 * exclude each other):
 *   1. Redis Sessions          — optional Redis-backed session store,
 *      with a real connection test (SETEX/GET/DEL round-trip, not just
 *      PING) against the hand-rolled RESP2 client shared with Object
 *      Cache (src/lib/redis-protocol.ts).
 *   2. Database Sessions       — this app's actual always-on session
 *      engine is Supabase Auth (not swappable from here); what IS real
 *      and configurable here is session_store, a plain Postgres table
 *      this app's own session-issuing code can use, with a genuine
 *      "Purge Expired Sessions" action.
 *   3. Secure Session Storage  — cookie flags, at-rest encryption
 *      toggle + algorithm, a redacted signing/encryption secret, and a
 *      real "Preview Encryption" round-trip so an admin can confirm a
 *      secret actually works before relying on it.
 *   4. Session Replication     — Redis Pub/Sub (real PUBLISH probe,
 *      reports live subscriber count) or Database Polling (session_store
 *      already is the shared source of truth) or off. */
export function CacheSessionAdminClient() {
  const [settings, setSettings] = useState<SessionCacheSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Secrets handled out-of-band, same reasoning as Object Cache's Redis
  // password / DNS Cache's API token.
  const [pendingRedisPassword, setPendingRedisPassword] = useState("");
  const [clearRedisPassword, setClearRedisPassword] = useState(false);
  const [pendingSessionSecret, setPendingSessionSecret] = useState("");
  const [clearSessionSecret, setClearSessionSecret] = useState(false);

  // Redis Sessions — Test Connection
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Database Sessions — Purge Expired
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Secure Session Storage — Preview Encryption
  const [encryptSample, setEncryptSample] = useState("sample-session-payload");
  const [encrypting, setEncrypting] = useState(false);
  const [encryptResult, setEncryptResult] = useState<
    { ok: boolean; message: string; ciphertext?: string; iv?: string; authTag?: string | null } | null
  >(null);

  // Session Replication — Test Replication
  const [replicating, setReplicating] = useState(false);
  const [replicateResult, setReplicateResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/cache/session/settings")
      .then((r) => r.json())
      .then((data) => setSettings(mapSessionCacheRow(data.settings)))
      .catch(() => setSettings(DEFAULT_SESSION_CACHE_SETTINGS));
  }, []);

  function patch(p: Partial<SessionCacheSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        redisSessionsEnabled: settings.redisSessionsEnabled,
        redisHost: settings.redisHost,
        redisPort: settings.redisPort,
        redisDatabase: settings.redisDatabase,
        redisTlsEnabled: settings.redisTlsEnabled,
        redisUsername: settings.redisUsername,
        redisKeyPrefix: settings.redisKeyPrefix,
        redisTtlSeconds: settings.redisTtlSeconds,
        redisConnectTimeoutMs: settings.redisConnectTimeoutMs,

        databaseSessionsEnabled: settings.databaseSessionsEnabled,
        dbSessionTtlMinutes: settings.dbSessionTtlMinutes,
        maxConcurrentSessions: settings.maxConcurrentSessions,
        unlimitedConcurrentSessions: settings.unlimitedConcurrentSessions,

        secureCookieEnabled: settings.secureCookieEnabled,
        httpOnlyCookie: settings.httpOnlyCookie,
        sameSiteMode: settings.sameSiteMode,
        encryptPayloadAtRest: settings.encryptPayloadAtRest,
        encryptionAlgorithm: settings.encryptionAlgorithm,
        regenerateIdOnPrivilegeChange: settings.regenerateIdOnPrivilegeChange,
        idleTimeoutMinutes: settings.idleTimeoutMinutes,
        absoluteTimeoutMinutes: settings.absoluteTimeoutMinutes,

        replicationMode: settings.replicationMode,
        replicationChannel: settings.replicationChannel,
        replicationPollIntervalSeconds: settings.replicationPollIntervalSeconds,
        replicationNodes: settings.replicationNodes,
      };
      if (clearRedisPassword) body.clearRedisPassword = true;
      else if (pendingRedisPassword) body.redisPassword = pendingRedisPassword;
      if (clearSessionSecret) body.clearSessionSecret = true;
      else if (pendingSessionSecret) body.sessionSecret = pendingSessionSecret;

      const res = await fetch("/api/admin/cache/session/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");

      setSettings(mapSessionCacheRow(data.settings));
      setPendingRedisPassword("");
      setClearRedisPassword(false);
      setPendingSessionSecret("");
      setClearSessionSecret(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/cache/session/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed.");
      setTestResult(data.result);
      setSettings(mapSessionCacheRow(data.settings));
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Test failed." });
    } finally {
      setTesting(false);
    }
  }

  async function runPurge() {
    setPurging(true);
    setPurgeResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/cache/session/purge", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Purge failed.");
      setPurgeResult(data.result);
      setSettings(mapSessionCacheRow(data.settings));
    } catch (err) {
      setPurgeResult({ ok: false, message: err instanceof Error ? err.message : "Purge failed." });
    } finally {
      setPurging(false);
    }
  }

  async function runEncryptionPreview() {
    setEncrypting(true);
    setEncryptResult(null);
    try {
      const body: Record<string, unknown> = { sample: encryptSample };
      if (pendingSessionSecret) body.secret = pendingSessionSecret;
      const res = await fetch("/api/admin/cache/session/encryption-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Encryption preview failed.");
      setEncryptResult({
        ok: data.result.decryptedMatches,
        message: data.result.decryptedMatches
          ? "Encrypted and decrypted successfully — the secret and algorithm round-trip cleanly."
          : "Decryption did not match the original sample.",
        ciphertext: data.result.ciphertext,
        iv: data.result.iv,
        authTag: data.result.authTag,
      });
    } catch (err) {
      setEncryptResult({ ok: false, message: err instanceof Error ? err.message : "Encryption preview failed." });
    } finally {
      setEncrypting(false);
    }
  }

  async function runReplicationTest() {
    setReplicating(true);
    setReplicateResult(null);
    try {
      const res = await fetch("/api/admin/cache/session/replicate-test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Replication test failed.");
      setReplicateResult(data.result);
      setSettings(mapSessionCacheRow(data.settings));
    } catch (err) {
      setReplicateResult({ ok: false, message: err instanceof Error ? err.message : "Replication test failed." });
    } finally {
      setReplicating(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Session Cache</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Where session data lives and how it stays fast, durable, and safe across more than one running
            instance. Distinct from Admin → User Management → Login &amp; Session Management, which shows{" "}
            <em>whose</em> sessions exist rather than <em>where and how</em> they're stored.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="glow-yellow-button flex shrink-0 items-center gap-2 rounded-full bg-[var(--color-menu-bg)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
          {saving ? "Saving…" : saved ? "Saved" : "Save changes"}
        </button>
      </div>

      {error && <div className="mb-4 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {/* ── 1. Redis Sessions ─────────────────────────────────────────────── */}
      <Section
        title="Redis Sessions"
        hint="An optional Redis-backed session store — fast, in-memory, ideal when this app runs as more than one instance. Uses the same hand-rolled RESP2 client as Object Cache, on its own connection and database index so keys never collide."
      >
        <ToggleField
          label="Enable Redis Sessions"
          hint="Off means these settings are stored for reference only — sessions fall back to Database Sessions below."
          checked={settings.redisSessionsEnabled}
          onChange={(v) => patch({ redisSessionsEnabled: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Host"
            value={settings.redisHost}
            placeholder="127.0.0.1"
            mono
            disabled={!settings.redisSessionsEnabled}
            onChange={(v) => patch({ redisHost: v })}
          />
          <NumberField
            label="Port"
            value={settings.redisPort}
            min={1}
            max={65535}
            disabled={!settings.redisSessionsEnabled}
            onChange={(v) => patch({ redisPort: v })}
          />
          <NumberField
            label="Database index"
            hint="0–15. Kept separate from Object Cache and DB Optimisation's Redis databases by default."
            value={settings.redisDatabase}
            min={0}
            max={15}
            disabled={!settings.redisSessionsEnabled}
            onChange={(v) => patch({ redisDatabase: v })}
          />
          <NumberField
            label="Connect timeout"
            value={settings.redisConnectTimeoutMs}
            min={100}
            max={30000}
            suffix="ms"
            disabled={!settings.redisSessionsEnabled}
            onChange={(v) => patch({ redisConnectTimeoutMs: v })}
          />
          <TextField
            label="Username"
            hint="Optional — only needed with Redis ACLs (Redis 6+)."
            value={settings.redisUsername}
            placeholder="(none)"
            disabled={!settings.redisSessionsEnabled}
            onChange={(v) => patch({ redisUsername: v })}
          />
          <NumberField
            label="Session TTL"
            hint="How long a session key lives in Redis before expiring."
            value={settings.redisTtlSeconds}
            min={REDIS_TTL_LIMITS.min}
            max={REDIS_TTL_LIMITS.max}
            suffix="seconds"
            disabled={!settings.redisSessionsEnabled}
            onChange={(v) => patch({ redisTtlSeconds: v })}
          />
        </div>
        <TextField
          label="Key prefix"
          hint="Prepended to every session key so this doesn't collide with Object Cache or DB Optimisation entries on a shared Redis instance."
          value={settings.redisKeyPrefix}
          placeholder="sess:"
          mono
          disabled={!settings.redisSessionsEnabled}
          onChange={(v) => patch({ redisKeyPrefix: v })}
        />
        <SecretField
          label="Password"
          hint="Sent as AUTH on connect. Blank/omitted on save leaves the stored value untouched."
          keySet={clearRedisPassword ? false : pendingRedisPassword ? true : settings.redisPasswordSet}
          preview={clearRedisPassword ? null : pendingRedisPassword ? `…${pendingRedisPassword.slice(-4)}` : settings.redisPasswordPreview}
          onSet={(v) => {
            setPendingRedisPassword(v);
            setClearRedisPassword(false);
          }}
          onClear={() => {
            setPendingRedisPassword("");
            setClearRedisPassword(true);
          }}
        />

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={runTest}
            disabled={testing || !settings.redisSessionsEnabled}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {testing ? <Loader2 size={14} className="animate-spin" /> : <ServerCog size={14} />}
            {testing ? "Testing…" : "Test Connection"}
          </button>
          {settings.redisLastTestedAt && !testResult && (
            <span className="text-[11px] text-text-faint">
              Last tested {timeAgo(settings.redisLastTestedAt)}
              {settings.redisLastTestStatus && ` — ${settings.redisLastTestStatus}`}
            </span>
          )}
        </div>
        {testResult && <ResultBanner ok={testResult.ok} message={testResult.message} />}
        {!settings.redisSessionsEnabled && (
          <p className="text-xs text-amber-400">
            <AlertTriangle size={11} className="inline-block" /> Turn on Redis Sessions above to test the connection.
          </p>
        )}
      </Section>

      {/* ── 2. Database Sessions ─────────────────────────────────────────── */}
      <Section
        title="Database Sessions"
        hint="This app's actual, always-on session engine is Supabase Auth — every sign-in already persists as a row in Supabase's own auth.sessions / auth.refresh_tokens tables, and nothing here can rewire that. What's configured below is session_store: a plain Postgres table this app's own session-issuing code can read, write, and expire directly."
      >
        <ToggleField
          label="Enable Database Sessions"
          hint="Governs whether session_store is written to at all. Off means Redis Sessions (if enabled) is the only store."
          checked={settings.databaseSessionsEnabled}
          onChange={(v) => patch({ databaseSessionsEnabled: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Session TTL"
            hint="How long a session_store row lives before it's eligible for purge."
            value={settings.dbSessionTtlMinutes}
            min={DB_SESSION_TTL_LIMITS.min}
            max={DB_SESSION_TTL_LIMITS.max}
            suffix="minutes"
            disabled={!settings.databaseSessionsEnabled}
            onChange={(v) => patch({ dbSessionTtlMinutes: v })}
          />
          <NumberField
            label="Max concurrent sessions per user"
            value={settings.maxConcurrentSessions}
            min={MAX_CONCURRENT_SESSIONS_LIMITS.min}
            max={MAX_CONCURRENT_SESSIONS_LIMITS.max}
            disabled={!settings.databaseSessionsEnabled || settings.unlimitedConcurrentSessions}
            onChange={(v) => patch({ maxConcurrentSessions: v })}
          />
        </div>
        <ToggleField
          label="Unlimited concurrent sessions"
          hint="Overrides the cap above — no limit on how many active sessions one user can hold at once."
          checked={settings.unlimitedConcurrentSessions}
          disabled={!settings.databaseSessionsEnabled}
          onChange={(v) => patch({ unlimitedConcurrentSessions: v })}
        />

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={runPurge}
            disabled={purging}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-hot/20 px-4 py-2 text-xs font-bold text-hot hover:bg-hot/30 disabled:opacity-50"
          >
            {purging ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {purging ? "Purging…" : "Purge Expired Sessions"}
          </button>
          {settings.dbSessionsLastPurgedAt && !purgeResult && (
            <span className="text-[11px] text-text-faint">
              Last purged {timeAgo(settings.dbSessionsLastPurgedAt)} — {settings.dbSessionsLastPurgeCount} removed
            </span>
          )}
        </div>
        {purgeResult && <ResultBanner ok={purgeResult.ok} message={purgeResult.message} />}
      </Section>

      {/* ── 3. Secure Session Storage ────────────────────────────────────── */}
      <Section
        title="Secure Session Storage"
        hint="Cookie transport flags, at-rest encryption for session_store payloads, and the idle/absolute lifetimes that apply regardless of which store above is active."
      >
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <ToggleField
            label="Secure cookie flag"
            hint="Cookie only sent over HTTPS."
            checked={settings.secureCookieEnabled}
            onChange={(v) => patch({ secureCookieEnabled: v })}
          />
          <ToggleField
            label="HttpOnly cookie flag"
            hint="Blocks client-side JS from reading the cookie."
            checked={settings.httpOnlyCookie}
            onChange={(v) => patch({ httpOnlyCookie: v })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="SameSite mode"
            value={settings.sameSiteMode}
            options={SAME_SITE_OPTIONS}
            onChange={(v) => patch({ sameSiteMode: v })}
          />
          <NumberField
            label="Idle timeout"
            hint="Session expires after this long with no activity."
            value={settings.idleTimeoutMinutes}
            min={IDLE_TIMEOUT_LIMITS.min}
            max={IDLE_TIMEOUT_LIMITS.max}
            suffix="minutes"
            onChange={(v) => patch({ idleTimeoutMinutes: v })}
          />
          <NumberField
            label="Absolute timeout"
            hint="Hard ceiling regardless of activity."
            value={settings.absoluteTimeoutMinutes}
            min={ABSOLUTE_TIMEOUT_LIMITS.min}
            max={ABSOLUTE_TIMEOUT_LIMITS.max}
            suffix="minutes"
            onChange={(v) => patch({ absoluteTimeoutMinutes: v })}
          />
        </div>
        <ToggleField
          label="Regenerate session ID on privilege change"
          hint="Issues a fresh session ID on login and on any role/permission change — closes off session-fixation attacks."
          checked={settings.regenerateIdOnPrivilegeChange}
          onChange={(v) => patch({ regenerateIdOnPrivilegeChange: v })}
        />

        <div className="my-1 h-px bg-white/10" />

        <ToggleField
          label="Encrypt payload at rest"
          hint="When on, session_store.data holds ciphertext rather than a plain session object."
          checked={settings.encryptPayloadAtRest}
          onChange={(v) => patch({ encryptPayloadAtRest: v })}
        />
        <SelectField
          label="Encryption algorithm"
          value={settings.encryptionAlgorithm}
          options={ENCRYPTION_OPTIONS}
          disabled={!settings.encryptPayloadAtRest}
          onChange={(v) => patch({ encryptionAlgorithm: v })}
        />
        <SecretField
          label="Session secret"
          hint="Derived into an encryption key (and available for future signing use). Blank/omitted on save leaves the stored value untouched."
          keySet={clearSessionSecret ? false : pendingSessionSecret ? true : settings.sessionSecretSet}
          preview={clearSessionSecret ? null : pendingSessionSecret ? `…${pendingSessionSecret.slice(-4)}` : settings.sessionSecretPreview}
          minLength={8}
          onSet={(v) => {
            setPendingSessionSecret(v);
            setClearSessionSecret(false);
          }}
          onClear={() => {
            setPendingSessionSecret("");
            setClearSessionSecret(true);
          }}
        />

        <div className="flex flex-col gap-2 rounded-xl bg-white/5 p-4">
          <span className="text-xs font-bold uppercase tracking-wider text-text-faint">Preview Encryption</span>
          <p className="text-[11px] text-text-faint">
            Encrypts this sample with the secret above (or the currently saved one) and immediately decrypts it back
            — confirms the secret and algorithm actually work together before you rely on them. Doesn't touch{" "}
            <code>session_store</code>.
          </p>
          <div className="flex gap-2">
            <input
              value={encryptSample}
              onChange={(e) => setEncryptSample(e.target.value)}
              placeholder="sample-session-payload"
              className="admin-input flex-1 font-mono text-xs"
            />
            <button
              type="button"
              onClick={runEncryptionPreview}
              disabled={encrypting || (!settings.sessionSecretSet && !pendingSessionSecret)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
            >
              {encrypting ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
              {encrypting ? "Encrypting…" : "Preview"}
            </button>
          </div>
          {!settings.sessionSecretSet && !pendingSessionSecret && (
            <p className="text-[11px] text-amber-400">
              <AlertTriangle size={11} className="inline-block" /> Set a session secret above first.
            </p>
          )}
          {encryptResult && (
            <div className="flex flex-col gap-2">
              <ResultBanner ok={encryptResult.ok} message={encryptResult.message} />
              {encryptResult.ciphertext && (
                <div className="flex flex-col gap-1 rounded-lg bg-black/30 p-3 font-mono text-[10px] text-white/60">
                  <span>ciphertext: {encryptResult.ciphertext}</span>
                  <span>iv: {encryptResult.iv}</span>
                  {encryptResult.authTag && <span>authTag: {encryptResult.authTag}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ── 4. Session Replication ───────────────────────────────────────── */}
      <Section
        title="Session Replication"
        hint="How session state stays consistent across more than one running instance of this app."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {REPLICATION_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                patch({ replicationMode: m.id });
                setReplicateResult(null);
              }}
              className={`flex flex-col gap-1.5 rounded-xl p-4 text-left transition-colors ${
                settings.replicationMode === m.id
                  ? "bg-[var(--color-menu-yellow)]/10 ring-1 ring-[var(--color-menu-yellow)]/40"
                  : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                {m.id === "redis_pub_sub" ? <Radio size={14} /> : m.id === "database_polling" ? <Database size={14} /> : null}
                {m.label}
              </span>
              <p className="text-[11px] leading-relaxed text-text-faint">{m.description}</p>
            </button>
          ))}
        </div>

        {settings.replicationMode === "redis_pub_sub" && (
          <>
            <TextField
              label="Channel name"
              value={settings.replicationChannel}
              placeholder="session-events"
              mono
              onChange={(v) => patch({ replicationChannel: v })}
            />
            {!settings.redisSessionsEnabled && (
              <p className="text-xs text-amber-400">
                <AlertTriangle size={11} className="inline-block" /> Redis Sessions is off above — Pub/Sub tests will
                still use the Redis connection settings from that section, so turn it on (or at least fill in valid
                connection details) for this to work.
              </p>
            )}
          </>
        )}
        {settings.replicationMode === "database_polling" && (
          <NumberField
            label="Poll interval"
            hint="How often each instance re-reads session_store for changes."
            value={settings.replicationPollIntervalSeconds}
            min={REPLICATION_POLL_INTERVAL_LIMITS.min}
            max={REPLICATION_POLL_INTERVAL_LIMITS.max}
            suffix="seconds"
            onChange={(v) => patch({ replicationPollIntervalSeconds: v })}
          />
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-white">Known nodes</span>
          <span className="text-xs text-text-faint">
            Reference list of instance identifiers this deployment expects to stay in sync — informational only,
            used to label what a replication test's expected fan-out looks like.
          </span>
          <ChipListField
            values={settings.replicationNodes}
            placeholder="e.g. web-1, web-2"
            onAdd={(v) => patch({ replicationNodes: [...settings.replicationNodes, v] })}
            onRemove={(v) => patch({ replicationNodes: settings.replicationNodes.filter((n) => n !== v) })}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={runReplicationTest}
            disabled={replicating}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {replicating ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />}
            {replicating ? "Testing…" : "Test Replication"}
          </button>
          {settings.replicationLastCheckedAt && !replicateResult && (
            <span className="text-[11px] text-text-faint">
              Last checked {timeAgo(settings.replicationLastCheckedAt)}
              {settings.replicationLastStatus && ` — ${settings.replicationLastStatus}`}
            </span>
          )}
        </div>
        {replicateResult && <ResultBanner ok={replicateResult.ok} message={replicateResult.message} />}
      </Section>

      <div className="flex items-start gap-2 rounded-2xl bg-white/5 px-5 py-4 text-xs text-text-faint">
        <Cookie size={14} className="mt-0.5 shrink-0" />
        <span>
          Basic session timeout also lives under Admin → Security → Settings (
          <code className="text-white/60">session_timeout_minutes</code>) — that's the coarse, always-applied
          default; the timeouts here are the deeper, cache-focused controls for whichever store above is active.
        </span>
      </div>
    </div>
  );
}
