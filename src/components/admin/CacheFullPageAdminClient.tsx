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
  RefreshCcw,
  Save,
  ShieldAlert,
  UserCheck,
  X,
  XCircle,
  Plus,
} from "lucide-react";
import {
  mapFullPageCacheSettingsRow,
  DEFAULT_FULL_PAGE_CACHE_SETTINGS,
  generateNginxConfig,
  generateVarnishConfig,
  generateLiteSpeedConfig,
  generateCloudflareApoConfig,
  type FullPageCacheSettings,
  type FullPageCacheProvider,
} from "@/lib/full-page-cache-settings";

// ── Local sub-components ────────────────────────────────────────────────────

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
          <span className="font-mono text-sm text-white/70">
            {preview ?? "••••"}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-[var(--color-menu-yellow)] hover:underline"
          >
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
              placeholder={keySet ? "Enter new key to replace…" : "Enter purge key…"}
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
  fixed,
  onAdd,
  onRemove,
}: {
  values: string[];
  placeholder: string;
  fixed?: string[];
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
        {fixed?.map((v) => (
          <span
            key={`fixed-${v}`}
            className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/40"
            title="Always excluded — cannot be removed"
          >
            <code>{v}</code>
            <ShieldAlert size={10} className="text-white/30" />
          </span>
        ))}
        {values
          .filter((v) => !fixed?.includes(v))
          .map((v) => (
            <span
              key={v}
              className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80"
            >
              <code>{v}</code>
              <button type="button" onClick={() => onRemove(v)} className="text-white/40 hover:text-white">
                <X size={11} />
              </button>
            </span>
          ))}
        {values.filter((v) => !fixed?.includes(v)).length === 0 && !fixed?.length && (
          <span className="text-xs text-text-faint">None configured.</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
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

function MultiCheckField({
  label,
  hint,
  options,
  values,
  onChange,
}: {
  label: string;
  hint?: string;
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const checked = values.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() =>
                onChange(checked ? values.filter((v) => v !== opt) : [...values, opt])
              }
              className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                checked
                  ? "bg-[var(--color-menu-yellow)] text-black"
                  : "bg-white/10 text-white/70 hover:bg-white/15"
              }`}
            >
              {opt}
            </button>
          );
        })}
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

// ── Provider catalogue ───────────────────────────────────────────────────────

interface ProviderMeta {
  id: FullPageCacheProvider;
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
    label: "No Full Page Cache",
    description: "Every request reaches the Next.js Node.js process. Use this when another layer (Cloudflare, CDN) is handling full-page caching, or when configuring a new server.",
    bestFor: "Development, Vercel deployments with CDN in front",
  },
  {
    id: "litespeed",
    label: "LiteSpeed Cache",
    badge: "LiteSpeed",
    badgeTone: "blue",
    description: "LiteSpeed Web Server's built-in, zero-copy cache module. Configurable via .htaccess or native LSI directives. Supports ESI and a tag-based purge API.",
    bestFor: "cPanel / DirectAdmin hosts running LiteSpeed",
  },
  {
    id: "nginx_fastcgi",
    label: "Nginx FastCGI Cache",
    badge: "Nginx",
    badgeTone: "emerald",
    description: "Nginx's fastcgi_cache (or proxy_cache) directive caches full responses to disk and serves them directly from the worker process — Node.js is never invoked on a HIT.",
    bestFor: "VPS / dedicated servers running Nginx as a reverse proxy",
  },
  {
    id: "varnish",
    label: "Varnish Cache",
    badge: "Varnish",
    badgeTone: "amber",
    description: "Varnish is a purpose-built HTTP accelerator running in front of the Node.js process. Configured via VCL — highly flexible, supports grace, saint mode, and tag-based purging.",
    bestFor: "High-traffic servers, complex cache invalidation requirements",
  },
  {
    id: "cloudflare_apo",
    label: "Cloudflare APO",
    badge: "WordPress",
    badgeTone: "amber",
    description: "Cloudflare Automatic Platform Optimisation — a Cloudflare product designed for WordPress that caches full HTML pages at the edge. For Next.js, the CDN / Edge Cache tab is a better fit; this is documented here for WordPress-origin deployments.",
    bestFor: "WordPress sites, or hybrid WP+Next.js deployments",
    warning: "APO is designed for WordPress. For this Next.js app, use Admin → Cache → CDN / Edge instead.",
  },
  {
    id: "static_html",
    label: "Static HTML Cache",
    badge: "Static",
    badgeTone: "neutral",
    description: "Pre-rendered pages written to disk as .html files and served directly by Nginx or LiteSpeed before the request ever reaches Node.js. Fastest possible TTFB; requires a separate generation/invalidation step.",
    bestFor: "Mostly-static sites with infrequent content updates",
  },
];

const BADGE_CLASSES: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-400",
  amber: "bg-amber-500/15 text-amber-400",
  blue: "bg-blue-500/15 text-blue-400",
  neutral: "bg-white/10 text-text-faint",
};

// ── Detect result UI ─────────────────────────────────────────────────────────

interface DetectResult {
  detectedAt: string;
  probes: { label: string; url: string; status: number | null; headers: Record<string, string | null>; durationMs: number }[];
  detected: { provider: FullPageCacheProvider; cacheStatus: "hit" | "miss" | "unknown"; signals: string[] };
}

function DetectPanel({ result }: { result: DetectResult }) {
  const [showProbes, setShowProbes] = useState(false);
  const { provider, cacheStatus, signals } = result.detected;
  const providerMeta = PROVIDERS.find((p) => p.id === provider);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
            provider !== "none"
              ? cacheStatus === "hit"
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-amber-500/15 text-amber-400"
              : "bg-white/10 text-text-faint"
          }`}
        >
          {provider !== "none" ? (
            cacheStatus === "hit" ? (
              <CheckCircle2 size={12} />
            ) : (
              <AlertTriangle size={12} />
            )
          ) : (
            <XCircle size={12} />
          )}
          {providerMeta?.label ?? "No cache detected"}{" "}
          {provider !== "none" && `— ${cacheStatus.toUpperCase()}`}
        </div>
        <span className="text-[11px] text-text-faint">
          {new Date(result.detectedAt).toLocaleTimeString()}
        </span>
      </div>

      {signals.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {signals.map((s) => (
            <code key={s} className="rounded-full bg-black/30 px-2.5 py-1 text-[10px] font-semibold text-white/60">
              {s}
            </code>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowProbes((v) => !v)}
        className="flex items-center gap-1 text-xs text-text-faint hover:text-white"
      >
        {showProbes ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {showProbes ? "Hide" : "Show"} raw probe headers
      </button>

      {showProbes &&
        result.probes.map((probe) => (
          <div key={probe.label} className="rounded-xl bg-black/30 p-3">
            <p className="mb-2 text-[11px] font-bold text-white/60">
              {probe.label} — HTTP {probe.status ?? "unreachable"} in {probe.durationMs}ms
            </p>
            <dl className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
              {Object.entries(probe.headers)
                .filter(([, v]) => v !== null)
                .map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-text-faint">{k}</dt>
                    <dd className="truncate font-mono text-[10px] text-white/70">{v}</dd>
                  </div>
                ))}
            </dl>
          </div>
        ))}
    </div>
  );
}

// ── Provider-specific settings panels ────────────────────────────────────────

function LiteSpeedSettings({
  s,
  patch,
}: {
  s: FullPageCacheSettings;
  patch: (p: Partial<FullPageCacheSettings>) => void;
}) {
  return (
    <Section title="LiteSpeed Settings" defaultOpen>
      <TextField
        label="Cache tag prefix"
        hint="Prepended to every cache tag so purge calls only evict this app's entries on a shared server."
        value={s.lsCacheTagPrefix}
        placeholder="pb_"
        mono
        onChange={(v) => patch({ lsCacheTagPrefix: v })}
      />
      <NumberField
        label="Browser cache TTL (non-Next assets)"
        hint="Applied to static files LiteSpeed serves directly (not /_next/static — Next.js controls those)."
        value={s.lsBrowserCacheTtlSeconds}
        min={60}
        max={2592000}
        suffix="seconds"
        onChange={(v) => patch({ lsBrowserCacheTtlSeconds: v })}
      />
      <ToggleField
        label="ESI (Edge Side Includes)"
        hint="Stitch a cached page with dynamic fragments. Requires LiteSpeed Enterprise or OpenLiteSpeed ESI module."
        checked={s.lsEsiEnabled}
        onChange={(v) => patch({ lsEsiEnabled: v })}
      />
      <ToggleField
        label="Object Cache"
        hint="In-memory key-value store separate from the full-page HTML cache. Configure in LiteSpeed admin → Cache → Object Cache."
        checked={s.lsObjectCacheEnabled}
        onChange={(v) => patch({ lsObjectCacheEnabled: v })}
      />
    </Section>
  );
}

function NginxSettings({
  s,
  patch,
}: {
  s: FullPageCacheSettings;
  patch: (p: Partial<FullPageCacheSettings>) => void;
}) {
  const USE_STALE_OPTIONS = [
    "error",
    "timeout",
    "invalid_header",
    "updating",
    "http_500",
    "http_502",
    "http_503",
    "http_504",
  ];
  return (
    <Section title="Nginx FastCGI Cache Settings" defaultOpen>
      <TextField
        label="Cache path"
        hint="Directory on disk where Nginx stores cache files. Must be writable by the nginx user."
        value={s.nginxCachePath}
        placeholder="/var/cache/nginx"
        mono
        onChange={(v) => patch({ nginxCachePath: v })}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <TextField
          label="Zone name"
          hint="keys_zone name"
          value={s.nginxCacheZoneName}
          placeholder="MOFIGAMES"
          mono
          onChange={(v) => patch({ nginxCacheZoneName: v })}
        />
        <TextField
          label="Zone size (memory)"
          hint="In-memory index size"
          value={s.nginxCacheZoneSize}
          placeholder="100m"
          mono
          onChange={(v) => patch({ nginxCacheZoneSize: v })}
        />
        <TextField
          label="Max size (disk)"
          hint="On-disk cap; LRU eviction when reached"
          value={s.nginxCacheMaxSize}
          placeholder="2g"
          mono
          onChange={(v) => patch({ nginxCacheMaxSize: v })}
        />
      </div>
      <TextField
        label="Cache key"
        hint="Uniquely identifies each cached response. Changing this invalidates all existing cache entries."
        value={s.nginxCacheKey}
        placeholder="$scheme$request_method$host$request_uri"
        mono
        onChange={(v) => patch({ nginxCacheKey: v })}
      />
      <ToggleField
        label="Cache lock (fastcgi_cache_lock)"
        hint="Prevents thundering herd on cache misses — only one upstream request is made per unique cache key at a time."
        checked={s.nginxCacheLock}
        onChange={(v) => patch({ nginxCacheLock: v })}
      />
      <MultiCheckField
        label="Use stale on"
        hint="Conditions under which Nginx may serve a stale cached response instead of waiting for the upstream."
        options={USE_STALE_OPTIONS}
        values={s.nginxCacheUseStale}
        onChange={(v) => patch({ nginxCacheUseStale: v })}
      />
    </Section>
  );
}

function VarnishSettings({
  s,
  patch,
  pendingPurgeKey,
  clearPurgeKey,
  setPendingPurgeKey,
  setClearPurgeKey,
}: {
  s: FullPageCacheSettings;
  patch: (p: Partial<FullPageCacheSettings>) => void;
  pendingPurgeKey: string;
  clearPurgeKey: boolean;
  setPendingPurgeKey: (v: string) => void;
  setClearPurgeKey: (v: boolean) => void;
}) {
  return (
    <Section title="Varnish Settings" defaultOpen>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Backend host"
          hint="Host of the Next.js app Varnish proxies to."
          value={s.varnishBackendHost}
          placeholder="127.0.0.1"
          mono
          onChange={(v) => patch({ varnishBackendHost: v })}
        />
        <NumberField
          label="Backend port"
          hint="Port Next.js listens on."
          value={s.varnishBackendPort}
          min={1}
          max={65535}
          onChange={(v) => patch({ varnishBackendPort: v })}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NumberField
          label="Default TTL"
          hint="Applied when the origin sends no Cache-Control header."
          value={s.varnishDefaultTtlSeconds}
          min={60}
          max={2592000}
          suffix="seconds"
          onChange={(v) => patch({ varnishDefaultTtlSeconds: v })}
        />
        <NumberField
          label="Grace period"
          hint="How long Varnish may serve a stale object while fetching a fresh one in the background."
          value={s.varnishGraceSeconds}
          min={0}
          max={86400}
          suffix="seconds"
          onChange={(v) => patch({ varnishGraceSeconds: v })}
        />
      </div>
      <SecretField
        label="Purge key (X-Purge-Key header)"
        hint="Secret expected in PURGE requests. Generated VCL rejects PURGE calls without this key. Leave blank to use IP-only ACL."
        keySet={clearPurgeKey ? false : (pendingPurgeKey ? true : s.varnishPurgeKeySet)}
        preview={clearPurgeKey ? null : (pendingPurgeKey ? `…${pendingPurgeKey.slice(-4)}` : s.varnishPurgeKeyPreview)}
        onSet={(v) => { setPendingPurgeKey(v); setClearPurgeKey(false); }}
        onClear={() => { setPendingPurgeKey(""); setClearPurgeKey(true); }}
      />
    </Section>
  );
}

function CloudflareApoSettings({
  s,
  patch,
}: {
  s: FullPageCacheSettings;
  patch: (p: Partial<FullPageCacheSettings>) => void;
}) {
  return (
    <Section title="Cloudflare APO Settings" defaultOpen>
      <div className="rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
        <AlertTriangle size={14} className="mb-1 inline-block" />{" "}
        APO is designed for WordPress. For this Next.js app, Admin → Cache → CDN / Edge Cache controls Cloudflare caching and is more appropriate. These settings are stored here as documentation for hybrid or WordPress-origin deployments.
      </div>
      <ToggleField
        label="APO enabled"
        hint="Marks this deployment as using Cloudflare APO. Does not call the Cloudflare API — enable APO in the Cloudflare dashboard under Speed → Optimization → APO."
        checked={s.cfApoEnabled}
        onChange={(v) => patch({ cfApoEnabled: v })}
      />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-white">Bypass cookies</span>
        <span className="text-xs text-text-faint">
          Cookies whose presence tells APO to skip the cache. Configure matching Cache Rules in the Cloudflare dashboard.
        </span>
        <ChipListField
          values={s.cfApoBypassCookies}
          placeholder="wordpress_logged_in_*"
          onAdd={(v) => patch({ cfApoBypassCookies: [...s.cfApoBypassCookies, v] })}
          onRemove={(v) => patch({ cfApoBypassCookies: s.cfApoBypassCookies.filter((c) => c !== v) })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-white">Bypass paths</span>
        <span className="text-xs text-text-faint">
          URL paths that APO should always bypass. Add matching Cache Rules in the Cloudflare dashboard.
        </span>
        <ChipListField
          values={s.cfApoBypassPaths}
          placeholder="/wp-admin/*"
          onAdd={(v) => patch({ cfApoBypassPaths: [...s.cfApoBypassPaths, v] })}
          onRemove={(v) => patch({ cfApoBypassPaths: s.cfApoBypassPaths.filter((p) => p !== v) })}
        />
      </div>
    </Section>
  );
}

// ── Config generator panel ────────────────────────────────────────────────────

function ConfigGeneratorPanel({ s }: { s: FullPageCacheSettings }) {
  if (s.provider === "none") return null;

  let code: string | null = null;
  let fileLabel: string | null = null;

  switch (s.provider) {
    case "nginx_fastcgi":
      code = generateNginxConfig(s);
      fileLabel = "nginx.conf / conf.d/mofigames.conf";
      break;
    case "varnish":
      code = generateVarnishConfig(s);
      fileLabel = "/etc/varnish/mofigames.vcl";
      break;
    case "litespeed":
      code = generateLiteSpeedConfig(s);
      fileLabel = ".htaccess";
      break;
    case "cloudflare_apo":
      code = generateCloudflareApoConfig(s);
      fileLabel = "Cloudflare dashboard instructions";
      break;
    case "static_html":
      code = `# Static HTML Cache — output directory: ${s.staticHtmlOutputDir}
# No server config is generated for Static HTML mode.
# Implement a build step that:
#   1. Crawls all public URLs and writes their rendered HTML to ${s.staticHtmlOutputDir}.
#   2. Configures Nginx / LiteSpeed to try_files $uri.html before proxying to Node.
#   3. Triggers a selective re-generation on content changes via a webhook or cron.
#
# Example Nginx try_files:
location / {
    try_files ${s.staticHtmlOutputDir}$uri.html
              ${s.staticHtmlOutputDir}$uri/index.html
              @nextjs;
}
location @nextjs {
    proxy_pass http://127.0.0.1:3000;
}`;
      fileLabel = "Implementation notes";
      break;
  }

  if (!code) return null;

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

/** Admin → Cache → Full Page Cache.
 *
 * Stores and displays the server-level full-page cache configuration across
 * six provider options. Unlike Browser Cache (0033) and CDN / Edge (0034),
 * this layer can't be controlled via an API call from this app — it requires
 * the hosting admin to apply the generated config to the server. The page
 * therefore focuses on:
 *   1. Provider selection + shared behaviour (guest, logged-in, static HTML).
 *   2. Safety-first exclusion management (paths, cookies, query params).
 *   3. Provider-specific tuning knobs.
 *   4. A config generator that turns the stored settings into a paste-ready
 *      server config snippet.
 *   5. A live detect that makes real requests and reads response headers to
 *      tell the admin whether any full-page cache is actually serving. */
export function CacheFullPageAdminClient() {
  const [settings, setSettings] = useState<FullPageCacheSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Varnish purge key is handled out-of-band (not in settings state, to avoid
  // roundtripping the secret through the component's diff)
  const [pendingPurgeKey, setPendingPurgeKey] = useState("");
  const [clearPurgeKey, setClearPurgeKey] = useState(false);

  // Live detect
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);

  const load = () =>
    fetch("/api/admin/cache/full-page/settings")
      .then((r) => r.json())
      .then((data) => setSettings(mapFullPageCacheSettingsRow(data.settings)))
      .catch(() => setSettings(DEFAULT_FULL_PAGE_CACHE_SETTINGS));

  useEffect(() => { load(); }, []);

  function patch(p: Partial<FullPageCacheSettings>) {
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
        guestCacheEnabled: settings.guestCacheEnabled,
        guestCacheTtlSeconds: settings.guestCacheTtlSeconds,
        loggedInCacheEnabled: settings.loggedInCacheEnabled,
        loggedInCachePaths: settings.loggedInCachePaths,
        loggedInCacheTtlSeconds: settings.loggedInCacheTtlSeconds,
        staticHtmlEnabled: settings.staticHtmlEnabled,
        staticHtmlOutputDir: settings.staticHtmlOutputDir,
        excludedPaths: settings.excludedPaths,
        bypassCookies: settings.bypassCookies,
        bypassQueryParams: settings.bypassQueryParams,
        lsCacheTagPrefix: settings.lsCacheTagPrefix,
        lsEsiEnabled: settings.lsEsiEnabled,
        lsObjectCacheEnabled: settings.lsObjectCacheEnabled,
        lsBrowserCacheTtlSeconds: settings.lsBrowserCacheTtlSeconds,
        nginxCachePath: settings.nginxCachePath,
        nginxCacheZoneName: settings.nginxCacheZoneName,
        nginxCacheZoneSize: settings.nginxCacheZoneSize,
        nginxCacheMaxSize: settings.nginxCacheMaxSize,
        nginxCacheKey: settings.nginxCacheKey,
        nginxCacheLock: settings.nginxCacheLock,
        nginxCacheUseStale: settings.nginxCacheUseStale,
        varnishBackendHost: settings.varnishBackendHost,
        varnishBackendPort: settings.varnishBackendPort,
        varnishDefaultTtlSeconds: settings.varnishDefaultTtlSeconds,
        varnishGraceSeconds: settings.varnishGraceSeconds,
        cfApoEnabled: settings.cfApoEnabled,
        cfApoBypassCookies: settings.cfApoBypassCookies,
        cfApoBypassPaths: settings.cfApoBypassPaths,
      };
      // Include purge key mutation only if the admin actually changed it
      if (clearPurgeKey) body.clearPurgeKey = true;
      else if (pendingPurgeKey) body.varnishPurgeKey = pendingPurgeKey;

      const res = await fetch("/api/admin/cache/full-page/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");

      setSettings(mapFullPageCacheSettingsRow(data.settings));
      // Reset transient purge key state after a successful save
      setPendingPurgeKey("");
      setClearPurgeKey(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function detect() {
    setDetecting(true);
    setDetectError(null);
    try {
      const res = await fetch("/api/admin/cache/full-page/detect");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Detection failed.");
      setDetectResult(data);
    } catch (err) {
      setDetectError(err instanceof Error ? err.message : "Detection failed.");
    } finally {
      setDetecting(false);
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

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Full Page Cache</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Server-level cache sitting in front of the Node.js process — LiteSpeed, Nginx FastCGI, Varnish,
            Cloudflare APO, or pre-built static HTML. Highest throughput layer; highest risk if misconfigured.
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
            Which server-level cache technology is in front of this app. Only one can be active at a time — the
            generated config and provider-specific settings below update accordingly.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => patch({ provider: p.id })}
              className={`flex flex-col gap-1.5 rounded-xl p-4 text-left transition-colors ${
                settings.provider === p.id
                  ? "bg-[var(--color-menu-yellow)]/10 ring-1 ring-[var(--color-menu-yellow)]/40"
                  : "bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-white">{p.label}</span>
                {p.badge && (
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      BADGE_CLASSES[p.badgeTone ?? "neutral"]
                    }`}
                  >
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
        {settings.provider !== "none" && (
          <p className="text-xs text-text-faint">{activeProvider.description}</p>
        )}
      </div>

      {/* ── Guest Page Cache ────────────────────────────────────────────────── */}
      <Section
        title="Guest Page Cache"
        hint="Cache full page responses for unauthenticated visitors. Safe because there is no per-user content when no session cookie is present. The most impactful cache setting for public traffic."
      >
        <ToggleField
          label="Enable guest page cache"
          hint="Any request without a session cookie may be served from the full-page cache."
          checked={settings.guestCacheEnabled}
          disabled={settings.provider === "none"}
          onChange={(v) => patch({ guestCacheEnabled: v })}
        />
        <NumberField
          label="Guest cache TTL"
          hint="How long the server keeps a cached page for guests before fetching a fresh copy. Shorter = more server hits, fresher content."
          value={settings.guestCacheTtlSeconds}
          min={60}
          max={2592000}
          suffix="seconds"
          onChange={(v) => patch({ guestCacheTtlSeconds: v })}
        />
      </Section>

      {/* ── Logged-in User Cache ────────────────────────────────────────────── */}
      <Section
        title="Logged-in User Cache"
        hint="Serve cached responses even for authenticated users. Requires a strict path allowlist below — caching a page that contains user-specific data (profile, favorites, session state) and serving it to the wrong user is a data exposure bug."
        defaultOpen
      >
        <div className="flex items-start gap-3 rounded-xl bg-hot/10 px-4 py-3 text-xs text-red-300">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>
            Only enable this for pages that are <strong>proven to be identical</strong> for every authenticated user.
            An empty path allowlist means nothing is cached even when this toggle is on.
          </span>
        </div>
        <ToggleField
          label="Enable logged-in user cache"
          checked={settings.loggedInCacheEnabled}
          disabled={settings.provider === "none"}
          onChange={(v) => patch({ loggedInCacheEnabled: v })}
        />
        {settings.loggedInCacheEnabled && (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <UserCheck size={14} className="text-[var(--color-menu-yellow)]" />
                <span className="text-sm font-semibold text-white">Cached paths for logged-in users</span>
              </div>
              <span className="text-xs text-text-faint">
                Only these URL path prefixes (e.g. <code>/games/*</code>) will be served from cache for
                authenticated users. All other paths bypass the cache.
              </span>
              <ChipListField
                values={settings.loggedInCachePaths}
                placeholder="/games/*"
                onAdd={(v) => patch({ loggedInCachePaths: [...settings.loggedInCachePaths, v] })}
                onRemove={(v) =>
                  patch({ loggedInCachePaths: settings.loggedInCachePaths.filter((p) => p !== v) })
                }
              />
              {settings.loggedInCachePaths.length === 0 && (
                <p className="text-xs text-amber-400">
                  <AlertTriangle size={11} className="inline-block" /> No paths configured — logged-in user cache
                  is effectively disabled until at least one path is added.
                </p>
              )}
            </div>
            <NumberField
              label="Logged-in cache TTL"
              hint="Shorter than guest TTL recommended — logged-in pages are more likely to have user-sensitive state."
              value={settings.loggedInCacheTtlSeconds}
              min={60}
              max={86400}
              suffix="seconds"
              onChange={(v) => patch({ loggedInCacheTtlSeconds: v })}
            />
          </>
        )}
      </Section>

      {/* ── Static HTML Cache ───────────────────────────────────────────────── */}
      <Section
        title="Static HTML Cache"
        hint="Write pre-rendered pages to disk as .html files. The web server serves them directly without invoking Node.js. Fastest possible TTFB; requires a separate build/invalidation step outside this UI."
        defaultOpen
      >
        <ToggleField
          label="Enable static HTML generation"
          hint="Mark this deployment as using static HTML output. Does not trigger generation — implement a build step that writes to the output directory below."
          checked={settings.staticHtmlEnabled}
          onChange={(v) => patch({ staticHtmlEnabled: v })}
        />
        {settings.staticHtmlEnabled && (
          <TextField
            label="Output directory"
            hint="Absolute path on disk where .html files are written. The web server's try_files directive should check here before proxying to Node."
            value={settings.staticHtmlOutputDir}
            placeholder="/var/cache/app/html"
            mono
            onChange={(v) => patch({ staticHtmlOutputDir: v })}
          />
        )}
      </Section>

      {/* ── Exclusions ──────────────────────────────────────────────────────── */}
      <Section
        title="Cache Exclusions"
        hint="Paths, cookies, and query params that always bypass the full-page cache, regardless of provider. Generated configs enforce these unconditionally."
        defaultOpen={false}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-[var(--color-menu-yellow)]" />
            <span className="text-sm font-semibold text-white">Always-excluded paths</span>
          </div>
          <span className="text-xs text-text-faint">
            These paths are never served from the full-page cache.{" "}
            <code>/admin/*</code>, <code>/api/*</code>, and <code>/auth/*</code> are always enforced and cannot be
            removed.
          </span>
          <ChipListField
            values={settings.excludedPaths}
            placeholder="/account/*"
            fixed={["/admin/*", "/api/*", "/auth/*"]}
            onAdd={(v) => patch({ excludedPaths: [...settings.excludedPaths, v] })}
            onRemove={(v) =>
              patch({
                excludedPaths: settings.excludedPaths.filter(
                  (p) => p !== v && !["/admin/*", "/api/*", "/auth/*"].includes(p)
                ),
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-white">Bypass cookies</span>
          <span className="text-xs text-text-faint">
            Requests carrying any of these cookies bypass the cache. Session cookies for Next-Auth and Supabase are
            always included.
          </span>
          <ChipListField
            values={settings.bypassCookies}
            placeholder="my-session-cookie"
            onAdd={(v) => patch({ bypassCookies: [...settings.bypassCookies, v] })}
            onRemove={(v) => patch({ bypassCookies: settings.bypassCookies.filter((c) => c !== v) })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-white">Bypass query params</span>
          <span className="text-xs text-text-faint">
            Requests with these query parameters bypass the cache (e.g. <code>?preview=1</code>,{" "}
            <code>?nocache</code>).
          </span>
          <ChipListField
            values={settings.bypassQueryParams}
            placeholder="preview"
            onAdd={(v) => patch({ bypassQueryParams: [...settings.bypassQueryParams, v] })}
            onRemove={(v) => patch({ bypassQueryParams: settings.bypassQueryParams.filter((p) => p !== v) })}
          />
        </div>
      </Section>

      {/* ── Provider-specific settings ──────────────────────────────────────── */}
      {settings.provider === "litespeed" && (
        <LiteSpeedSettings s={settings} patch={patch} />
      )}
      {settings.provider === "nginx_fastcgi" && (
        <NginxSettings s={settings} patch={patch} />
      )}
      {settings.provider === "varnish" && (
        <VarnishSettings
          s={settings}
          patch={patch}
          pendingPurgeKey={pendingPurgeKey}
          clearPurgeKey={clearPurgeKey}
          setPendingPurgeKey={setPendingPurgeKey}
          setClearPurgeKey={setClearPurgeKey}
        />
      )}
      {settings.provider === "cloudflare_apo" && (
        <CloudflareApoSettings s={settings} patch={patch} />
      )}

      {/* ── Config generator ────────────────────────────────────────────────── */}
      <ConfigGeneratorPanel s={settings} />

      {/* ── Live detect ─────────────────────────────────────────────────────── */}
      <div className="glass flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Live Detect</h2>
            <p className="mt-1 text-xs text-text-faint">
              Makes two real requests to this app&apos;s homepage and reads the response headers to infer which
              full-page cache provider, if any, is actually serving. Useful for confirming the server config was
              applied correctly.
            </p>
          </div>
          <button
            type="button"
            onClick={detect}
            disabled={detecting}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {detecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            {detecting ? "Detecting…" : "Run detect"}
          </button>
        </div>

        {detectError && (
          <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{detectError}</div>
        )}
        {detectResult && <DetectPanel result={detectResult} />}
        {!detectResult && !detecting && (
          <p className="text-sm text-text-faint">No detection has been run yet this session.</p>
        )}
      </div>
    </div>
  );
}
