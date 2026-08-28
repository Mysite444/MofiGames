"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  Check,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  SkipForward,
  ExternalLink,
  Cloud,
  Plus,
  X,
  Unlink,
  Zap,
  Globe2,
  Layers,
  RotateCcw,
  Server,
  ShieldCheck,
} from "lucide-react";
import {
  mapEdgeSettingsRow,
  DEFAULT_EDGE_CACHE_SETTINGS,
  ORIGIN_SHIELD_REGIONS,
  type EdgeCacheSettings,
  type RegionalCachingTopology,
  type TieredCacheTopology,
} from "@/lib/edge-cache-settings";

// ── Shared building blocks ───────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
  icon,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
      <div>
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-faint">
          {icon && <span className="text-[var(--color-menu-yellow)]">{icon}</span>}
          {title}
        </h2>
        {hint && <p className="mt-1 text-xs text-text-faint">{hint}</p>}
      </div>
      {children}
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
  unit,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${disabled ? "opacity-50" : ""}`}>
      <span className="text-xs font-semibold text-white/70">{label}</span>
      {hint && <span className="text-[11px] text-text-faint">{hint}</span>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
          className="admin-input w-32"
        />
        {unit && <span className="text-xs text-text-faint">{unit}</span>}
      </div>
    </label>
  );
}

function ChipListField({
  values,
  placeholder,
  onAdd,
  onRemove,
  hint,
}: {
  values: string[];
  placeholder: string;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  hint?: string;
}) {
  const [draft, setDraft] = useState("");
  function commit() {
    const v = draft.trim();
    if (v && !values.includes(v)) onAdd(v);
    setDraft("");
  }
  return (
    <div className="flex flex-col gap-2">
      {hint && <p className="text-xs text-text-faint">{hint}</p>}
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
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
          className="admin-input flex-1 font-mono"
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

interface SyncStepResult {
  ok: boolean;
  message: string;
  skipped?: boolean;
}

function StepRow({ label, result }: { label: string; result?: SyncStepResult }) {
  if (!result) return null;
  const icon = result.skipped ? (
    <SkipForward size={13} className="text-text-faint" />
  ) : result.ok ? (
    <CheckCircle2 size={13} className="text-emerald-400" />
  ) : (
    <XCircle size={13} className="text-hot" />
  );
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-xs">
      <span className="flex shrink-0 items-center gap-1.5 font-semibold text-white/80">
        {icon}
        {label}
      </span>
      <span className="text-right text-text-faint">{result.message}</span>
    </div>
  );
}

function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <label
          key={opt.value}
          className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
            value === opt.value ? "bg-white/10" : "hover:bg-white/5"
          }`}
        >
          <input
            type="radio"
            name={name}
            className="mt-1"
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span>
            <span className="block text-sm font-semibold text-white">{opt.label}</span>
            <span className="block text-xs text-text-faint">{opt.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

const REGIONAL_TOPOLOGY_OPTIONS: {
  value: RegionalCachingTopology;
  label: string;
  hint: string;
}[] = [
  {
    value: "all",
    label: "Cache at all PoPs",
    hint: "No restriction — Cloudflare caches content at every edge PoP that serves a request. Highest hit rate, most copies of the content.",
  },
  {
    value: "smart",
    label: "Smart Regional Topology (recommended)",
    hint: "Cloudflare automatically picks the optimal set of upper-tier PoPs based on traffic patterns. Reduces origin load while maintaining high hit rates.",
  },
  {
    value: "custom",
    label: "Custom restricted regions",
    hint: "Only specified Cloudflare regions cache this zone's content. Enterprise plan feature — CF dashboard confirmation required for custom region allowlists.",
  },
];

const TIERED_TOPOLOGY_OPTIONS: {
  value: TieredCacheTopology;
  label: string;
  hint: string;
}[] = [
  {
    value: "smart",
    label: "Smart Tiered Cache (recommended)",
    hint: "Cloudflare automatically selects the optimal upper-tier PoP for each request based on latency and traffic data. Best for most deployments.",
  },
  {
    value: "generic_global",
    label: "Generic Global Topology",
    hint: "Uses a fixed two-tier hierarchy with a small set of globally distributed upper-tier PoPs. Lower-tier PoPs always fetch via an upper tier before hitting origin.",
  },
  {
    value: "generic_regional",
    label: "Generic Regional Topology",
    hint: "One upper-tier PoP per Cloudflare region. Keeps cache fill traffic regional while still protecting origin from direct requests.",
  },
];

/** Admin → Cache → Edge Cache. Six distinct Cloudflare edge-layer features:
 * Workers Cache, ESI, Regional Caching, Smart Edge Revalidation, Tiered
 * Cache, and Origin Shield. Each section syncs independently to CF's API — a
 * plan-gated feature failing doesn't block the others. */
export function CacheEdgeAdminClient() {
  const [settings, setSettings] = useState<EdgeCacheSettings | null>(null);
  const [zoneIdDraft, setZoneIdDraft] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<Record<string, SyncStepResult> | null>(null);

  function load() {
    fetch("/api/admin/cache/edge/settings")
      .then((r) => r.json())
      .then((data) => {
        const mapped = mapEdgeSettingsRow(data.settings);
        setSettings(mapped);
        setZoneIdDraft(mapped.zoneId);
        setSyncSummary((mapped.lastSyncSummary as Record<string, SyncStepResult> | null) ?? null);
      })
      .catch(() => setSettings(DEFAULT_EDGE_CACHE_SETTINGS));
  }

  useEffect(() => {
    load();
  }, []);

  function patch(p: Partial<EdgeCacheSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        zoneId: zoneIdDraft,
        // Workers
        workersEnabled: settings.workersEnabled,
        workersCacheTtlSeconds: settings.workersCacheTtlSeconds,
        workersPassthroughEnabled: settings.workersPassthroughEnabled,
        workersBypassRoutes: settings.workersBypassRoutes,
        // ESI
        esiEnabled: settings.esiEnabled,
        esiMaxAgeSeconds: settings.esiMaxAgeSeconds,
        esiFailOpen: settings.esiFailOpen,
        // Regional
        regionalCachingEnabled: settings.regionalCachingEnabled,
        regionalCachingTopology: settings.regionalCachingTopology,
        restrictedRegions: settings.restrictedRegions,
        // Smart Revalidation
        smartRevalidationEnabled: settings.smartRevalidationEnabled,
        staleWhileRevalidateSeconds: settings.staleWhileRevalidateSeconds,
        staleIfErrorSeconds: settings.staleIfErrorSeconds,
        serveStaleOnError: settings.serveStaleOnError,
        // Tiered Cache
        tieredCacheEnabled: settings.tieredCacheEnabled,
        tieredCacheTopology: settings.tieredCacheTopology,
        // Origin Shield
        originShieldEnabled: settings.originShieldEnabled,
        originShieldRegion: settings.originShieldRegion,
      };
      if (tokenDraft.trim()) body.apiToken = tokenDraft.trim();

      const res = await fetch("/api/admin/cache/edge/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      setSettings(mapEdgeSettingsRow(data.settings));
      setTokenDraft("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!confirm("Disconnect Cloudflare? This clears the stored Zone ID and API Token.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cache/edge/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearCredentials: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to disconnect.");
      setSettings(mapEdgeSettingsRow(data.settings));
      setZoneIdDraft("");
      setTokenDraft("");
      setSyncSummary(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect.");
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/admin/cache/edge/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");
      setSyncSummary(data.summary);
      setSettings(mapEdgeSettingsRow(data.settings));
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      setSyncing(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  const connected = settings.apiTokenSet && Boolean(settings.zoneId);

  return (
    <div className="max-w-3xl">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Edge Cache</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Six distinct Cloudflare edge-layer features — Workers Cache, ESI, Regional Caching, Smart Edge
            Revalidation, Tiered Cache, and Origin Shield. Save first, then sync each feature to Cloudflare
            independently; plan-gated features fail soft without blocking the rest.
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

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {/* ══════════════════════ Cloudflare connection ══════════════════════ */}
      <Section
        title="Cloudflare connection"
        hint="Independent from CDN / Edge Cache credentials — the same Zone ID and token work here if it's the same zone. Token is stored server-side only and never returned to this page."
        icon={<Cloud size={14} />}
      >
        <div className="flex items-center justify-between gap-3">
          {connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
              <CheckCircle2 size={13} />
              {settings.connectedZoneName ? `Connected — ${settings.connectedZoneName}` : "Credentials saved"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-text-faint">
              <Cloud size={13} /> Not connected
            </span>
          )}
          {connected && (
            <button
              type="button"
              onClick={disconnect}
              className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white/70 hover:bg-white/15 hover:text-white"
            >
              <Unlink size={12} /> Disconnect
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">Zone ID</span>
            <input
              value={zoneIdDraft}
              onChange={(e) => setZoneIdDraft(e.target.value)}
              placeholder="023e105f4ecef8ad9ca31a8372d0c353"
              className="admin-input font-mono"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">API Token</span>
            <input
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              placeholder={
                settings.apiTokenPreview ? `Stored, ends in ${settings.apiTokenPreview}` : "Paste a Cloudflare API Token"
              }
              type="password"
              className="admin-input font-mono"
            />
          </label>
        </div>
        <p className="text-xs text-text-faint">
          Needs Zone → Cache Settings edit and Zone Settings edit permissions. Leave the token field blank to keep the
          one already saved.
        </p>
        <a
          href="https://dash.cloudflare.com/profile/api-tokens"
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
        >
          Create an API Token <ExternalLink size={11} />
        </a>
      </Section>

      {/* ══════════════════════ 1. Workers Cache ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Zap size={15} className="text-[var(--color-menu-yellow)]" /> 1. Cloudflare Workers Cache
      </h2>

      <Section
        title="Workers Cache API"
        hint="Workers intercept HTTP requests and can store/serve responses via caches.default — the Cloudflare shared Cache API. Enable this when a deployed Worker script manages cache logic; the Worker handles TTLs, cache keys, and conditional serving independently of zone-level cache rules."
      >
        <ToggleField
          label="Enable Workers Cache"
          hint="Allows deployed Worker scripts to use the Cache API (caches.default). Requires a Worker script already bound to this zone via the dashboard or wrangler."
          checked={settings.workersEnabled}
          onChange={(v) => patch({ workersEnabled: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Default cache TTL"
            hint="Applied when the Worker stores a response with no explicit max-age."
            value={settings.workersCacheTtlSeconds}
            min={60}
            max={86400}
            unit="seconds"
            disabled={!settings.workersEnabled}
            onChange={(v) => patch({ workersCacheTtlSeconds: v })}
          />
        </div>
        <ToggleField
          label="Pass through on cache miss"
          hint="When a Worker cache miss occurs, the request is forwarded transparently to origin. If off, a 504 is returned on miss instead."
          checked={settings.workersPassthroughEnabled}
          disabled={!settings.workersEnabled}
          onChange={(v) => patch({ workersPassthroughEnabled: v })}
        />
      </Section>

      <Section
        title="Workers bypass routes"
        hint="URL path patterns (glob syntax) where Workers cache is bypassed. Use this to exclude admin, API, or per-user paths that should never be served from the Workers cache. Applied as Cloudflare Cache Rules on sync."
      >
        <ChipListField
          values={settings.workersBypassRoutes}
          placeholder="/api/* or /admin/*"
          onAdd={(v) => patch({ workersBypassRoutes: [...settings.workersBypassRoutes, v] })}
          onRemove={(v) => patch({ workersBypassRoutes: settings.workersBypassRoutes.filter((r) => r !== v) })}
        />
        <p className="text-xs text-text-faint">
          Supports glob wildcards. Patterns are pushed as Cache Rules that set{" "}
          <code className="text-white/70">cache: false</code> for matching paths.
        </p>
      </Section>

      {/* ══════════════════════ 2. ESI ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Globe2 size={15} className="text-[var(--color-menu-yellow)]" /> 2. Edge Side Includes (ESI)
      </h2>

      <Section
        title="ESI processing"
        hint="Cloudflare processes <esi:include> tags in HTML responses at the edge, fetching and assembling fragment responses before serving the full page. Allows different cache TTLs per page region. Requires a Business or Enterprise plan."
      >
        <ToggleField
          label="Enable ESI"
          hint="Activates Cloudflare's ESI tag processing on cached responses for this zone. The sync step reports if your plan doesn't support it — no other settings are affected."
          checked={settings.esiEnabled}
          onChange={(v) => patch({ esiEnabled: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="ESI fragment max-age"
            hint="Applied to ESI sub-requests that return no Cache-Control."
            value={settings.esiMaxAgeSeconds}
            min={0}
            max={86400}
            unit="seconds"
            disabled={!settings.esiEnabled}
            onChange={(v) => patch({ esiMaxAgeSeconds: v })}
          />
        </div>
        <ToggleField
          label="Fail open on ESI error"
          hint="On: serve the page with the ESI fragment omitted if the fragment fetch fails. Off: return a 503 for the whole page on ESI error (fail closed)."
          checked={settings.esiFailOpen}
          disabled={!settings.esiEnabled}
          onChange={(v) => patch({ esiFailOpen: v })}
        />
        <a
          href="https://developers.cloudflare.com/cache/advanced-configuration/edge-side-includes/"
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
        >
          Cloudflare ESI docs <ExternalLink size={11} />
        </a>
      </Section>

      {/* ══════════════════════ 3. Regional Caching ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Globe2 size={15} className="text-[var(--color-menu-yellow)]" /> 3. Regional Caching
      </h2>

      <Section
        title="Regional caching topology"
        hint="Controls which Cloudflare PoPs are allowed to cache this zone's content. The default (all PoPs) gives the highest hit rate; Smart topology reduces origin load by routing cache fills through fewer upper-tier nodes."
      >
        <ToggleField
          label="Enable regional caching restrictions"
          hint="When off, Cloudflare caches at every PoP serving a request — the default behaviour. Enable to apply topology restrictions below."
          checked={settings.regionalCachingEnabled}
          onChange={(v) => patch({ regionalCachingEnabled: v })}
        />
        <div className={settings.regionalCachingEnabled ? "" : "pointer-events-none opacity-50"}>
          <RadioGroup<RegionalCachingTopology>
            name="regional-topology"
            value={settings.regionalCachingTopology}
            options={REGIONAL_TOPOLOGY_OPTIONS}
            onChange={(v) => patch({ regionalCachingTopology: v })}
          />
        </div>
        {settings.regionalCachingEnabled && settings.regionalCachingTopology === "custom" && (
          <div className="mt-2">
            <p className="mb-2 text-xs text-text-faint">
              Cloudflare region codes to restrict caching to. Use standard CF PoP codes (e.g.{" "}
              <code className="text-white/70">iad</code>, <code className="text-white/70">lhr</code>,{" "}
              <code className="text-white/70">fra</code>). Custom region allowlists are an Enterprise feature —
              confirm in the CF dashboard after syncing.
            </p>
            <ChipListField
              values={settings.restrictedRegions}
              placeholder="iad, lhr, fra…"
              onAdd={(v) => patch({ restrictedRegions: [...settings.restrictedRegions, v.toLowerCase()] })}
              onRemove={(v) => patch({ restrictedRegions: settings.restrictedRegions.filter((r) => r !== v) })}
            />
          </div>
        )}
      </Section>

      {/* ══════════════════════ 4. Smart Edge Revalidation ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <RotateCcw size={15} className="text-[var(--color-menu-yellow)]" /> 4. Smart Edge Revalidation
      </h2>

      <Section
        title="Stale-while-revalidate"
        hint="Cloudflare serves the stale cached copy immediately while fetching a fresh response from origin in the background. Visitors never wait for revalidation; the next request after the background fetch completes gets the fresh copy."
      >
        <ToggleField
          label="Enable Smart Edge Revalidation"
          hint="Activates stale-while-revalidate behavior at the CF edge. Requires the edge_cache_ttl zone setting to be set (sync applies this automatically)."
          checked={settings.smartRevalidationEnabled}
          onChange={(v) => patch({ smartRevalidationEnabled: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <NumberField
            label="Stale-while-revalidate"
            hint="How long to serve stale while a background revalidation runs."
            value={settings.staleWhileRevalidateSeconds}
            min={0}
            max={3600}
            unit="seconds"
            disabled={!settings.smartRevalidationEnabled}
            onChange={(v) => patch({ staleWhileRevalidateSeconds: v })}
          />
          <NumberField
            label="Stale-if-error"
            hint="How long to serve stale if origin returns a 5xx."
            value={settings.staleIfErrorSeconds}
            min={0}
            max={86400}
            unit="seconds"
            disabled={!settings.smartRevalidationEnabled}
            onChange={(v) => patch({ staleIfErrorSeconds: v })}
          />
        </div>
        <ToggleField
          label='Serve stale on error ("Always Online")'
          hint='Maps to Cloudflare zone setting "always_online". When enabled, CF always serves the cached copy instead of an error page on origin failure, regardless of the stale-if-error window.'
          checked={settings.serveStaleOnError}
          onChange={(v) => patch({ serveStaleOnError: v })}
        />
        <a
          href="https://developers.cloudflare.com/cache/concepts/revalidation/"
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
        >
          Cloudflare revalidation docs <ExternalLink size={11} />
        </a>
      </Section>

      {/* ══════════════════════ 5. Tiered Cache ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Layers size={15} className="text-[var(--color-menu-yellow)]" /> 5. Tiered Cache
      </h2>

      <Section
        title="Argo Tiered Caching"
        hint='Adds a tier of "upper-tier" Cloudflare PoPs between edge PoPs and your origin. When a lower-tier PoP misses its local cache, it fetches from the nearest upper-tier PoP rather than hitting origin directly. The origin only sees a fraction of the total requests. Requires Argo Smart Routing to be enabled on your Cloudflare account.'
      >
        <ToggleField
          label="Enable Tiered Cache"
          hint="Enables Argo Tiered Caching for this zone. The sync step will fail gracefully if Argo Smart Routing is not active on your account."
          checked={settings.tieredCacheEnabled}
          onChange={(v) => patch({ tieredCacheEnabled: v })}
        />
        <div className={settings.tieredCacheEnabled ? "" : "pointer-events-none opacity-50"}>
          <p className="mb-2 text-xs font-semibold text-white/70">Cache topology</p>
          <RadioGroup<TieredCacheTopology>
            name="tiered-topology"
            value={settings.tieredCacheTopology}
            options={TIERED_TOPOLOGY_OPTIONS}
            onChange={(v) => patch({ tieredCacheTopology: v })}
          />
        </div>
        <a
          href="https://developers.cloudflare.com/cache/how-to/tiered-cache/"
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
        >
          Tiered Cache docs <ExternalLink size={11} />
        </a>
      </Section>

      {/* ══════════════════════ 6. Origin Shield ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <ShieldCheck size={15} className="text-[var(--color-menu-yellow)]" /> 6. Origin Shield
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-text-faint">optional</span>
      </h2>

      <Section
        title="Cloudflare Origin Shield"
        hint="A single, dedicated Cloudflare PoP acts as the sole contact point with your origin server. All other CF edge nodes that miss their local (and upper-tier) cache fetch via this shield PoP. Your origin only ever receives connections from one location, making IP allowlisting simple and eliminating origin-storm scenarios. Optional — requires Argo Smart Routing or Cache Reserve on the account."
        icon={<Server size={13} />}
      >
        <ToggleField
          label="Enable Origin Shield"
          hint="Sets the colocate_with field on the Argo tiered caching configuration, designating one PoP as the dedicated origin-facing gateway."
          checked={settings.originShieldEnabled}
          onChange={(v) => patch({ originShieldEnabled: v })}
        />
        <div className={`${settings.originShieldEnabled ? "" : "pointer-events-none opacity-50"}`}>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-white/70">Shield PoP location</span>
            <p className="text-[11px] text-text-faint">
              Choose a Cloudflare PoP geographically close to your origin server to minimise shield→origin latency.
            </p>
            <select
              value={settings.originShieldRegion}
              onChange={(e) => patch({ originShieldRegion: e.target.value })}
              disabled={!settings.originShieldEnabled}
              className="admin-input"
            >
              {ORIGIN_SHIELD_REGIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="rounded-xl bg-amber-500/10 px-4 py-3">
          <p className="text-xs font-medium text-amber-300">
            Origin Shield adds a single point of failure if the shield PoP experiences an outage. Cloudflare
            automatically falls back to direct origin requests if the shield is unreachable, but monitor CF status
            for that PoP if strict uptime is required.
          </p>
        </div>
        <a
          href="https://developers.cloudflare.com/cache/how-to/tiered-cache/#configure-tiered-cache-with-cloudflare-api"
          target="_blank"
          rel="noreferrer"
          className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
        >
          Origin Shield / Argo docs <ExternalLink size={11} />
        </a>
      </Section>

      {/* ══════════════════════ Sync to Cloudflare ══════════════════════ */}
      <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Sync to Cloudflare</h2>
            <p className="mt-1 text-xs text-text-faint">
              Save changes first, then sync — each of the six features is applied to CF's API independently so
              a plan-gated feature (ESI, Origin Shield, Argo) doesn't block the ones that succeed.
            </p>
          </div>
          <button
            type="button"
            onClick={sync}
            disabled={syncing || !connected}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            {syncing ? "Syncing…" : "Sync to Cloudflare"}
          </button>
        </div>

        {!connected && (
          <p className="text-sm text-text-faint">Connect a Zone ID and API Token above first.</p>
        )}
        {syncError && (
          <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{syncError}</div>
        )}

        {syncSummary && (
          <div className="flex flex-col divide-y divide-white/5">
            <StepRow label="Zone" result={syncSummary.zone} />
            <StepRow label="Workers Cache" result={syncSummary.workersCache} />
            <StepRow label="Edge Side Includes (ESI)" result={syncSummary.esi} />
            <StepRow label="Regional Caching" result={syncSummary.regionalCaching} />
            <StepRow label="Smart Edge Revalidation" result={syncSummary.smartRevalidation} />
            <StepRow label="Tiered Cache" result={syncSummary.tieredCache} />
            <StepRow label="Origin Shield" result={syncSummary.originShield} />
          </div>
        )}

        {settings.lastSyncedAt && (
          <p className="text-[11px] text-text-faint">
            Last synced {new Date(settings.lastSyncedAt).toLocaleString()} —{" "}
            {settings.lastSyncStatus === "success"
              ? "all steps succeeded"
              : settings.lastSyncStatus === "partial"
                ? "some steps failed or were skipped"
                : "failed"}.
          </p>
        )}
      </div>

      {/* ══════════════════════ Plan & docs callout ══════════════════════ */}
      <div className="glass rounded-2xl p-5">
        <h2 className="mb-1 text-sm font-bold text-white">Plan requirements</h2>
        <p className="text-xs text-text-faint">
          Workers Cache and Smart Edge Revalidation are available on all paid plans. ESI requires Business or
          Enterprise. Tiered Cache (Argo Smart Routing) requires the Argo add-on. Origin Shield requires Argo or
          Cache Reserve. Regional caching custom topology is Enterprise-only. Plan-gated features report a failed sync
          step with the CF error message — all other features are applied regardless.
        </p>
        <a
          href="https://developers.cloudflare.com/cache/"
          target="_blank"
          rel="noreferrer"
          className="mt-2 flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
        >
          Cloudflare Cache documentation <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}
