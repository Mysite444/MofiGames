"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardCheck,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Save,
  Tag,
  Trash2,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import {
  mapObjectCacheSettingsRow,
  DEFAULT_OBJECT_CACHE_SETTINGS,
  generateRedisConfig,
  generateMemcachedConfig,
  generateWordPressObjectCacheConfig,
  type ObjectCacheSettings,
  type ObjectCacheProvider,
  type CacheGroup,
} from "@/lib/object-cache-settings";

// ── Local sub-components ────────────────────────────────────────────────────
// Duplicated per-file rather than shared, matching the pattern in
// CacheFullPageAdminClient / CacheCdnAdminClient.

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
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
          className="glass w-32 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
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
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`admin-input ${mono ? "font-mono text-xs" : ""}`}
      />
    </div>
  );
}

function SecretField({
  label,
  hint,
  keySet,
  preview,
  onSet,
  onClear,
}: {
  label: string;
  hint?: string;
  keySet: boolean;
  preview: string | null;
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
            onClick={() => { onClear(); setDraft(""); }}
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
            disabled={!draft.trim()}
            onClick={() => { onSet(draft.trim()); setDraft(""); setEditing(false); }}
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
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          placeholder={placeholder}
          className="admin-input flex-1"
        />
        <button type="button" onClick={commit} className="flex shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15">
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

function ConfigBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-[11px] leading-relaxed text-white/80">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white/70 hover:bg-white/20"
      >
        {copied ? <ClipboardCheck size={12} /> : <ClipboardCopy size={12} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ResultBanner({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl px-4 py-3 text-xs ${
        ok ? "bg-emerald-500/10 text-emerald-300" : "bg-hot/15 text-hot"
      }`}
    >
      {ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
      <span className="leading-relaxed">{message}</span>
    </div>
  );
}

// ── Cache Groups editor ──────────────────────────────────────────────────────

function CacheGroupsEditor({ groups, onChange }: { groups: CacheGroup[]; onChange: (groups: CacheGroup[]) => void }) {
  const [draftName, setDraftName] = useState("");
  const [draftTtl, setDraftTtl] = useState(3600);
  const [draftPersistent, setDraftPersistent] = useState(true);
  const [draftGlobal, setDraftGlobal] = useState(false);

  function addGroup() {
    const name = draftName.trim();
    if (!name || groups.some((g) => g.name === name)) return;
    onChange([...groups, { name, ttlSeconds: draftTtl, persistent: draftPersistent, global: draftGlobal }]);
    setDraftName("");
    setDraftTtl(3600);
    setDraftPersistent(true);
    setDraftGlobal(false);
  }
  function updateGroup(name: string, patch: Partial<CacheGroup>) {
    onChange(groups.map((g) => (g.name === name ? { ...g, ...patch } : g)));
  }
  function removeGroup(name: string) {
    onChange(groups.filter((g) => g.name !== name));
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 && <p className="text-xs text-text-faint">No cache groups configured.</p>}
      {groups.map((g) => (
        <div key={g.name} className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <Tag size={12} className="shrink-0 text-white/40" />
            <code className="truncate text-sm font-bold text-white">{g.name}</code>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={2592000}
              value={g.ttlSeconds}
              onChange={(e) => updateGroup(g.name, { ttlSeconds: Math.max(0, Number(e.target.value) || 0) })}
              className="glass w-24 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/40"
            />
            <span className="w-16 shrink-0 text-[11px] text-text-faint">{g.ttlSeconds === 0 ? "no expiry" : "seconds"}</span>
          </div>
          <button
            type="button"
            onClick={() => updateGroup(g.name, { persistent: !g.persistent })}
            title="Whether this group is written to the external store"
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
              g.persistent ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-white/50"
            }`}
          >
            {g.persistent ? "Persistent" : "Non-persistent"}
          </button>
          <button
            type="button"
            onClick={() => updateGroup(g.name, { global: !g.global })}
            title="Whether this group is shared across the whole deployment"
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
              g.global ? "bg-blue-500/15 text-blue-400" : "bg-white/10 text-white/50"
            }`}
          >
            {g.global ? "Global" : "Scoped"}
          </button>
          <button type="button" onClick={() => removeGroup(g.name)} className="shrink-0 text-white/30 hover:text-hot">
            <Trash2 size={14} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-3">
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
          placeholder="group name, e.g. posts"
          className="admin-input min-w-[140px] flex-1"
        />
        <input
          type="number"
          min={0}
          max={2592000}
          value={draftTtl}
          onChange={(e) => setDraftTtl(Math.max(0, Number(e.target.value) || 0))}
          className="glass w-24 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        <button
          type="button"
          onClick={() => setDraftPersistent((v) => !v)}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            draftPersistent ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-white/50"
          }`}
        >
          {draftPersistent ? "Persistent" : "Non-persistent"}
        </button>
        <button
          type="button"
          onClick={() => setDraftGlobal((v) => !v)}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            draftGlobal ? "bg-blue-500/15 text-blue-400" : "bg-white/10 text-white/50"
          }`}
        >
          {draftGlobal ? "Global" : "Scoped"}
        </button>
        <button
          type="button"
          onClick={addGroup}
          disabled={!draftName.trim()}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
        >
          <Plus size={13} /> Add group
        </button>
      </div>
    </div>
  );
}

// ── Provider catalogue ───────────────────────────────────────────────────────

interface ProviderMeta {
  id: ObjectCacheProvider;
  label: string;
  badge?: string;
  badgeTone?: "emerald" | "amber" | "blue" | "neutral";
  description: string;
  bestFor: string;
  warning?: string;
}

const PROVIDERS: ProviderMeta[] = [
  {
    id: "none",
    label: "No Object Cache",
    description: "No external key-value store is configured. Expensive computations are recomputed on every request.",
    bestFor: "Development, or before an App-Level Cache backend is decided",
  },
  {
    id: "redis",
    label: "Redis",
    badge: "Redis",
    badgeTone: "blue",
    description: "An in-memory key-value store (or Redis-compatible server like Valkey/KeyDB) reachable over TCP. Supports real-time connection testing and pattern-based selective invalidation via SCAN + DEL.",
    bestFor: "Most self-hosted deployments; the most feature-complete option here",
  },
  {
    id: "memcached",
    label: "Memcached",
    badge: "Memcached",
    badgeTone: "emerald",
    description: "A simple, fast in-memory cache daemon, optionally sharded across multiple servers. Its protocol has no key-enumeration command, so selective invalidation falls back to a full flush.",
    bestFor: "Simple key/value caching without Redis's extra data structures",
  },
  {
    id: "wordpress_object_cache",
    label: "WordPress Object Cache",
    badge: "WordPress",
    badgeTone: "amber",
    description: "WordPress's persistent object cache API (wp_cache_get/set, cache groups), backed by a drop-in such as the Redis or Memcached Object Cache plugins. For this Next.js app, choose Redis or Memcached above instead — this option only generates reference config for a hybrid or WP-origin deployment.",
    bestFor: "WordPress sites, or hybrid WP+Next.js deployments",
    warning: "This app is not WordPress — there is no live backend here to connect to or invalidate. Use Redis or Memcached above for this app's own object cache.",
  },
];

const BADGE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  blue: "bg-blue-500/15 text-blue-400",
  neutral: "bg-white/10 text-text-faint",
};

// ── Provider-specific settings panels ────────────────────────────────────────

function RedisSettings({
  s,
  patch,
  pendingPassword,
  clearPassword,
  setPendingPassword,
  setClearPassword,
  testing,
  testResult,
  onTest,
}: {
  s: ObjectCacheSettings;
  patch: (p: Partial<ObjectCacheSettings>) => void;
  pendingPassword: string;
  clearPassword: boolean;
  setPendingPassword: (v: string) => void;
  setClearPassword: (v: boolean) => void;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onTest: () => void;
}) {
  return (
    <Section title="Redis Settings" defaultOpen>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Host" value={s.redisHost} placeholder="127.0.0.1" mono onChange={(v) => patch({ redisHost: v })} />
        <NumberField label="Port" value={s.redisPort} min={1} max={65535} onChange={(v) => patch({ redisPort: v })} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Database"
          hint="Logical database index (SELECT n). Ignored by Redis Cluster."
          value={s.redisDatabase}
          min={0}
          max={15}
          onChange={(v) => patch({ redisDatabase: v })}
        />
        <NumberField
          label="Connect timeout"
          value={s.redisConnectTimeoutMs}
          min={100}
          max={30000}
          suffix="ms"
          onChange={(v) => patch({ redisConnectTimeoutMs: v })}
        />
      </div>
      <ToggleField label="TLS" hint="Enable if your Redis provider requires a TLS connection (e.g. most managed Redis)." checked={s.redisTlsEnabled} onChange={(v) => patch({ redisTlsEnabled: v })} />
      <TextField label="Username" hint="Redis 6+ ACL username. Leave blank to authenticate with password only (legacy AUTH)." value={s.redisUsername} placeholder="default" mono onChange={(v) => patch({ redisUsername: v })} />
      <SecretField
        label="Password"
        hint="Sent via AUTH on connect. Used only by this app's own test-connection / invalidate actions."
        keySet={clearPassword ? false : pendingPassword ? true : s.redisPasswordSet}
        preview={clearPassword ? null : pendingPassword ? `…${pendingPassword.slice(-4)}` : s.redisPasswordPreview}
        onSet={(v) => { setPendingPassword(v); setClearPassword(false); }}
        onClear={() => { setPendingPassword(""); setClearPassword(true); }}
      />
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {testing ? "Testing…" : "Test Connection"}
        </button>
        {s.lastTestedAt && !testResult && (
          <span className="text-[11px] text-text-faint">
            Last tested {new Date(s.lastTestedAt).toLocaleString()} — {s.lastTestStatus ?? "unknown"}
          </span>
        )}
      </div>
      {testResult && <ResultBanner ok={testResult.ok} message={testResult.message} />}
    </Section>
  );
}

function MemcachedSettings({
  s,
  patch,
  pendingPassword,
  clearPassword,
  setPendingPassword,
  setClearPassword,
  testing,
  testResult,
  onTest,
}: {
  s: ObjectCacheSettings;
  patch: (p: Partial<ObjectCacheSettings>) => void;
  pendingPassword: string;
  clearPassword: boolean;
  setPendingPassword: (v: string) => void;
  setClearPassword: (v: boolean) => void;
  testing: boolean;
  testResult: { ok: boolean; message: string } | null;
  onTest: () => void;
}) {
  return (
    <Section title="Memcached Settings" defaultOpen>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-white">Servers</span>
        <span className="text-xs text-text-faint">One or more <code>host:port</code> entries. Multiple servers = client-side distribution.</span>
        <ChipListField
          values={s.memcachedServers}
          placeholder="127.0.0.1:11211"
          onAdd={(v) => patch({ memcachedServers: [...s.memcachedServers, v] })}
          onRemove={(v) => patch({ memcachedServers: s.memcachedServers.filter((m) => m !== v) })}
        />
      </div>
      <ToggleField label="Binary protocol" hint="Required for SASL auth in real Memcached deployments (not used by this app's own test/flush actions — see hint below)." checked={s.memcachedBinaryProtocol} onChange={(v) => patch({ memcachedBinaryProtocol: v })} />
      <ToggleField label="Compression" checked={s.memcachedCompressionEnabled} onChange={(v) => patch({ memcachedCompressionEnabled: v })} />
      {s.memcachedCompressionEnabled && (
        <NumberField
          label="Compression threshold"
          hint="Values larger than this are compressed before storing."
          value={s.memcachedCompressionThresholdBytes}
          min={0}
          max={10485760}
          suffix="bytes"
          onChange={(v) => patch({ memcachedCompressionThresholdBytes: v })}
        />
      )}
      <TextField label="SASL username" value={s.memcachedUsername} placeholder="(optional)" mono onChange={(v) => patch({ memcachedUsername: v })} />
      <SecretField
        label="SASL password"
        hint="Stored for config generation. Note: this app's Test Connection / flush actions use the unauthenticated classic protocol and don't perform the SASL handshake."
        keySet={clearPassword ? false : pendingPassword ? true : s.memcachedPasswordSet}
        preview={clearPassword ? null : pendingPassword ? `…${pendingPassword.slice(-4)}` : s.memcachedPasswordPreview}
        onSet={(v) => { setPendingPassword(v); setClearPassword(false); }}
        onClear={() => { setPendingPassword(""); setClearPassword(true); }}
      />
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {testing ? "Testing…" : "Test Connection"}
        </button>
        {s.lastTestedAt && !testResult && (
          <span className="text-[11px] text-text-faint">
            Last tested {new Date(s.lastTestedAt).toLocaleString()} — {s.lastTestStatus ?? "unknown"}
          </span>
        )}
      </div>
      {testResult && <ResultBanner ok={testResult.ok} message={testResult.message} />}
    </Section>
  );
}

function WordPressObjectCacheSettings({ s, patch }: { s: ObjectCacheSettings; patch: (p: Partial<ObjectCacheSettings>) => void }) {
  return (
    <Section title="WordPress Object Cache Settings" defaultOpen>
      <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        <AlertTriangle size={14} className="mb-1 inline-block" />{" "}
        This app is not WordPress. These settings are stored here as documentation for a hybrid or WP-origin
        deployment — Test Connection and Selective Object Invalidation below are informational only for this
        provider. Choose Redis or Memcached instead for this app&apos;s own object cache.
      </div>
      <ToggleField
        label="Drop-in installed"
        hint="Documentation only — records whether wp-content/object-cache.php is (or would be) installed on the WordPress side. Does not install anything."
        checked={s.wpDropInInstalled}
        onChange={(v) => patch({ wpDropInInstalled: v })}
      />
      <TextField
        label="Cache key salt"
        hint="Maps to WP_CACHE_KEY_SALT — namespaces keys when multiple WordPress installs share one Redis/Memcached instance."
        value={s.wpCacheKeySalt}
        placeholder={s.keyPrefix}
        mono
        onChange={(v) => patch({ wpCacheKeySalt: v })}
      />
    </Section>
  );
}

// ── Config generator panel ────────────────────────────────────────────────────

function ConfigGeneratorPanel({ s }: { s: ObjectCacheSettings }) {
  if (s.provider === "none") return null;

  let code: string;
  let fileLabel: string;
  switch (s.provider) {
    case "redis":
      code = generateRedisConfig(s);
      fileLabel = "docker-compose.yml / wp-config.php";
      break;
    case "memcached":
      code = generateMemcachedConfig(s);
      fileLabel = "memcached startup / wp-config.php";
      break;
    case "wordpress_object_cache":
      code = generateWordPressObjectCacheConfig(s);
      fileLabel = "wp-config.php / must-use plugin";
      break;
  }

  return (
    <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Generated Config</h2>
        <p className="mt-1 text-xs text-text-faint">
          Ready-to-paste snippet for <span className="font-semibold text-white/70">{fileLabel}</span>. Generated
          from your current settings — save first if you made changes.
        </p>
      </div>
      <ConfigBlock code={code} />
      <p className="text-[11px] text-amber-400">
        <AlertTriangle size={11} className="inline-block" /> Always test generated config in a staging environment before applying to production.
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/** Admin → Cache → Object Cache.
 *
 * Fourth phase of the Admin → Cache build-out (Browser, Full Page, CDN /
 * Edge came before it). Stores and displays the persistent key-value
 * object cache configuration across three provider options — Redis,
 * Memcached, and a documentation-only WordPress Object Cache — plus
 * shared behaviour that applies whichever real backend is chosen:
 *   1. Persistent Object Cache — on/off, default TTL, key prefix.
 *   2. Cache Groups — named buckets with independent TTL / persistent /
 *      global flags, mirroring WordPress's cache-group concept.
 *   3. Selective Object Invalidation — evict by group, by key pattern, or
 *      flush everything. Genuinely implemented against Redis (SCAN + DEL)
 *      when reachable; Memcached has no key-enumeration protocol command,
 *      so scoped requests there fall back to a full flush with a note.
 *   4. Provider-specific tuning knobs, a live Test Connection action, and
 *      a config generator that turns the stored settings into paste-ready
 *      docker-compose / wp-config.php snippets. */
export function CacheObjectAdminClient() {
  const [settings, setSettings] = useState<ObjectCacheSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Secrets handled out-of-band, same reasoning as the Varnish purge key
  // in CacheFullPageAdminClient.
  const [pendingRedisPassword, setPendingRedisPassword] = useState("");
  const [clearRedisPassword, setClearRedisPassword] = useState(false);
  const [pendingMemcachedPassword, setPendingMemcachedPassword] = useState("");
  const [clearMemcachedPassword, setClearMemcachedPassword] = useState(false);

  // Test connection (session-only result; persisted status lives in
  // settings.lastTestedAt/lastTestStatus/lastTestMessage).
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Selective Object Invalidation
  const [invalidateScope, setInvalidateScope] = useState<"all" | "group" | "pattern">("all");
  const [invalidateGroup, setInvalidateGroup] = useState("");
  const [invalidatePattern, setInvalidatePattern] = useState("");
  const [invalidating, setInvalidating] = useState(false);
  const [invalidateResult, setInvalidateResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = () =>
    fetch("/api/admin/cache/object/settings")
      .then((r) => r.json())
      .then((data) => setSettings(mapObjectCacheSettingsRow(data.settings)))
      .catch(() => setSettings(DEFAULT_OBJECT_CACHE_SETTINGS));

  useEffect(() => { load(); }, []);

  function patch(p: Partial<ObjectCacheSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        provider: settings.provider,
        persistentEnabled: settings.persistentEnabled,
        defaultTtlSeconds: settings.defaultTtlSeconds,
        keyPrefix: settings.keyPrefix,
        cacheGroups: settings.cacheGroups,
        redisHost: settings.redisHost,
        redisPort: settings.redisPort,
        redisDatabase: settings.redisDatabase,
        redisTlsEnabled: settings.redisTlsEnabled,
        redisUsername: settings.redisUsername,
        redisConnectTimeoutMs: settings.redisConnectTimeoutMs,
        memcachedServers: settings.memcachedServers,
        memcachedBinaryProtocol: settings.memcachedBinaryProtocol,
        memcachedCompressionEnabled: settings.memcachedCompressionEnabled,
        memcachedCompressionThresholdBytes: settings.memcachedCompressionThresholdBytes,
        memcachedUsername: settings.memcachedUsername,
        wpDropInInstalled: settings.wpDropInInstalled,
        wpCacheKeySalt: settings.wpCacheKeySalt,
      };
      if (clearRedisPassword) body.clearRedisPassword = true;
      else if (pendingRedisPassword) body.redisPassword = pendingRedisPassword;
      if (clearMemcachedPassword) body.clearMemcachedPassword = true;
      else if (pendingMemcachedPassword) body.memcachedPassword = pendingMemcachedPassword;

      const res = await fetch("/api/admin/cache/object/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");

      setSettings(mapObjectCacheSettingsRow(data.settings));
      setPendingRedisPassword("");
      setClearRedisPassword(false);
      setPendingMemcachedPassword("");
      setClearMemcachedPassword(false);
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
      const res = await fetch("/api/admin/cache/object/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed.");
      setTestResult(data.result);
      setSettings(mapObjectCacheSettingsRow(data.settings));
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : "Test failed." });
    } finally {
      setTesting(false);
    }
  }

  async function runInvalidation() {
    setInvalidating(true);
    setInvalidateResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/cache/object/invalidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: invalidateScope,
          group: invalidateScope === "group" ? invalidateGroup : undefined,
          pattern: invalidateScope === "pattern" ? invalidatePattern : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Invalidation failed.");
      setInvalidateResult(data.result);
      setSettings(mapObjectCacheSettingsRow(data.settings));
    } catch (err) {
      setInvalidateResult({ ok: false, message: err instanceof Error ? err.message : "Invalidation failed." });
    } finally {
      setInvalidating(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  const activeProvider = PROVIDERS.find((p) => p.id === settings.provider)!;
  const canInvalidate = invalidateScope === "all" || (invalidateScope === "group" ? !!invalidateGroup : !!invalidatePattern.trim());

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Object Cache</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            A persistent key-value store in front of expensive computations — Redis, Memcached, or documentation for
            a WordPress-origin object cache. Independent from the Full Page Cache, which caches whole HTTP responses.
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

      {/* ── Provider selection ──────────────────────────────────────────────── */}
      <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Active Provider</h2>
          <p className="mt-1 text-xs text-text-faint">
            Which object cache backend is active. Only one can be active at a time — the generated config and
            provider-specific settings below update accordingly.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { patch({ provider: p.id }); setTestResult(null); setInvalidateResult(null); }}
              className={`flex flex-col gap-1.5 rounded-xl p-4 text-left transition-colors ${
                settings.provider === p.id ? "bg-[var(--color-menu-yellow)]/10 ring-1 ring-[var(--color-menu-yellow)]/40" : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">{p.label}</span>
                {p.badge && (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${BADGE_CLASSES[p.badgeTone ?? "neutral"]}`}>
                    {p.badge}
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-text-faint">{p.bestFor}</p>
            </button>
          ))}
        </div>
        {activeProvider.warning && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>{activeProvider.warning}</span>
          </div>
        )}
        {settings.provider !== "none" && <p className="text-xs text-text-faint">{activeProvider.description}</p>}
      </div>

      {/* ── Persistent Object Cache ─────────────────────────────────────────── */}
      <Section
        title="Persistent Object Cache"
        hint="Whether cached values are written to the external store and survive across requests and deploys, versus a cache that would only ever live for the duration of one request."
      >
        <ToggleField
          label="Enable persistent object cache"
          hint="Turns on writes to the configured backend. Off means these settings are stored for reference only."
          checked={settings.persistentEnabled}
          disabled={settings.provider === "none"}
          onChange={(v) => patch({ persistentEnabled: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Default TTL"
            hint="Applied to any cached object whose group doesn't specify its own."
            value={settings.defaultTtlSeconds}
            min={10}
            max={2592000}
            suffix="seconds"
            onChange={(v) => patch({ defaultTtlSeconds: v })}
          />
          <TextField
            label="Key prefix"
            hint="Prepended to every cache key so invalidation calls never touch another app's entries on a shared backend."
            value={settings.keyPrefix}
            placeholder="pb_"
            mono
            onChange={(v) => patch({ keyPrefix: v })}
          />
        </div>
      </Section>

      {/* ── Cache Groups ─────────────────────────────────────────────────────── */}
      <Section
        title="Cache Groups"
        hint="Named buckets of related cache entries, each with its own TTL. A group can opt out of the external store even when the cache as a whole is persistent (non-persistent), and can be marked global to share it across the whole deployment rather than namespacing it."
      >
        <CacheGroupsEditor groups={settings.cacheGroups} onChange={(cacheGroups) => patch({ cacheGroups })} />
      </Section>

      {/* ── Selective Object Invalidation ────────────────────────────────────── */}
      <Section
        title="Selective Object Invalidation"
        hint="Evict specific entries instead of flushing everything. Runs immediately against the live backend — it does not require Save changes first, since it doesn't modify settings."
      >
        <div className="flex flex-wrap gap-2">
          {(["all", "group", "pattern"] as const).map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => { setInvalidateScope(scope); setInvalidateResult(null); }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                invalidateScope === scope ? "bg-[var(--color-menu-yellow)] text-black" : "bg-white/10 text-white/70 hover:bg-white/15"
              }`}
            >
              {scope === "all" ? "Everything" : scope === "group" ? "By group" : "By key pattern"}
            </button>
          ))}
        </div>

        {invalidateScope === "group" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-white">Group</span>
            {settings.cacheGroups.length === 0 ? (
              <p className="text-xs text-amber-400">
                <AlertTriangle size={11} className="inline-block" /> No cache groups configured — add one above first.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {settings.cacheGroups.map((g) => (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => setInvalidateGroup(g.name)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      invalidateGroup === g.name ? "bg-[var(--color-menu-yellow)] text-black" : "bg-white/10 text-white/70 hover:bg-white/15"
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {invalidateScope === "pattern" && (
          <TextField
            label="Key pattern"
            hint={`Appended after the key prefix (${settings.keyPrefix}). Redis glob syntax, e.g. "post_*".`}
            value={invalidatePattern}
            placeholder="post_*"
            mono
            onChange={setInvalidatePattern}
          />
        )}

        {settings.provider === "memcached" && invalidateScope !== "all" && (
          <p className="text-xs text-amber-400">
            <AlertTriangle size={11} className="inline-block" /> Memcached has no key-enumeration command — running
            this will perform a full flush of every configured server instead of a scoped eviction.
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={runInvalidation}
            disabled={invalidating || settings.provider === "none" || !canInvalidate}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-hot/20 px-4 py-2 text-xs font-bold text-hot hover:bg-hot/30 disabled:opacity-50"
          >
            {invalidating ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {invalidating ? "Running…" : "Run Invalidation"}
          </button>
          {settings.lastInvalidatedAt && !invalidateResult && (
            <span className="text-[11px] text-text-faint">
              Last run {new Date(settings.lastInvalidatedAt).toLocaleString()}
            </span>
          )}
        </div>
        {invalidateResult && <ResultBanner ok={invalidateResult.ok} message={invalidateResult.message} />}
      </Section>

      {/* ── Provider-specific settings ──────────────────────────────────────── */}
      {settings.provider === "redis" && (
        <RedisSettings
          s={settings}
          patch={patch}
          pendingPassword={pendingRedisPassword}
          clearPassword={clearRedisPassword}
          setPendingPassword={setPendingRedisPassword}
          setClearPassword={setClearRedisPassword}
          testing={testing}
          testResult={testResult}
          onTest={runTest}
        />
      )}
      {settings.provider === "memcached" && (
        <MemcachedSettings
          s={settings}
          patch={patch}
          pendingPassword={pendingMemcachedPassword}
          clearPassword={clearMemcachedPassword}
          setPendingPassword={setPendingMemcachedPassword}
          setClearPassword={setClearMemcachedPassword}
          testing={testing}
          testResult={testResult}
          onTest={runTest}
        />
      )}
      {settings.provider === "wordpress_object_cache" && <WordPressObjectCacheSettings s={settings} patch={patch} />}

      {/* ── Config generator ────────────────────────────────────────────────── */}
      <ConfigGeneratorPanel s={settings} />
    </div>
  );
}
