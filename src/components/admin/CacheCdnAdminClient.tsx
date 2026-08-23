"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  Check,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ExternalLink,
  Cloud,
  Plus,
  X,
  Unlink,
} from "lucide-react";
import {
  mapCdnSettingsRow,
  DEFAULT_CDN_CACHE_SETTINGS,
  type CdnCacheSettings,
  type CdnCacheByQueryStringMode,
} from "@/lib/cdn-cache-settings";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">{title}</h2>
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

interface SyncStepResult {
  ok: boolean;
  message: string;
  skipped?: boolean;
}

function StepRow({ label, result }: { label: string; result?: SyncStepResult }) {
  if (!result) return null;
  const icon = result.skipped ? (
    <MinusCircle size={13} className="text-white/30" />
  ) : result.ok ? (
    <CheckCircle2 size={13} className="text-emerald-400" />
  ) : (
    <XCircle size={13} className="text-hot" />
  );
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-xs">
      <span className="flex shrink-0 items-center gap-1.5 font-semibold text-white/80">
        {icon} {label}
      </span>
      <span className="text-right text-text-faint">{result.message}</span>
    </div>
  );
}

const QUERY_STRING_MODE_OPTIONS: { value: CdnCacheByQueryStringMode; label: string; hint: string }[] = [
  { value: "ignore_all", label: "Ignore all query strings", hint: "Highest hit ratio — ?utm_source=… etc. never fragments the cache." },
  { value: "include_all", label: "Include all query strings", hint: "Cloudflare's own default — every distinct query string is a separate cache entry." },
  { value: "include_list", label: "Include specific params only", hint: "Best of both — list the params that actually change the response." },
];

/** Admin → Cache → CDN / Edge Cache. Unlike Browser Cache, nothing here
 * is enforced by this app's own code — it's Cloudflare sitting in front
 * of it. This page stores the desired configuration and, on "Sync to
 * Cloudflare", actually calls Cloudflare's API to apply it (zone
 * settings + a generated Cache Rules ruleset) — see
 * src/app/api/admin/cache/cdn/sync/route.ts for exactly what each
 * toggle turns into. */
export function CacheCdnAdminClient() {
  const [settings, setSettings] = useState<CdnCacheSettings | null>(null);
  const [zoneIdDraft, setZoneIdDraft] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<Record<string, SyncStepResult> | null>(null);

  const load = () =>
    fetch("/api/admin/cache/cdn/settings")
      .then((res) => res.json())
      .then((data) => {
        const mapped = mapCdnSettingsRow(data.settings);
        setSettings(mapped);
        setZoneIdDraft(mapped.zoneId);
        setSyncSummary((mapped.lastSyncSummary as Record<string, SyncStepResult> | null) ?? null);
      })
      .catch(() => setSettings(DEFAULT_CDN_CACHE_SETTINGS));

  useEffect(() => {
    load();
  }, []);

  function patch(p: Partial<CdnCacheSettings>) {
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
        edgeCachingEnabled: settings.edgeCachingEnabled,
        smartCacheRulesEnabled: settings.smartCacheRulesEnabled,
        cacheEverythingEnabled: settings.cacheEverythingEnabled,
        cacheEverythingPaths: settings.cacheEverythingPaths,
        cacheByDeviceEnabled: settings.cacheByDeviceEnabled,
        cacheByQueryStringMode: settings.cacheByQueryStringMode,
        cacheByQueryStringParams: settings.cacheByQueryStringParams,
        imageCdnEnabled: settings.imageCdnEnabled,
        brotliEnabled: settings.brotliEnabled,
        http3Enabled: settings.http3Enabled,
        earlyHintsEnabled: settings.earlyHintsEnabled,
        edgeTtlSeconds: settings.edgeTtlSeconds,
      };
      if (tokenDraft.trim()) body.apiToken = tokenDraft.trim();

      const res = await fetch("/api/admin/cache/cdn/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      setSettings(mapCdnSettingsRow(data.settings));
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
      const res = await fetch("/api/admin/cache/cdn/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearCredentials: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to disconnect.");
      const mapped = mapCdnSettingsRow(data.settings);
      setSettings(mapped);
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
      const res = await fetch("/api/admin/cache/cdn/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");
      setSyncSummary(data.summary);
      setSettings(mapCdnSettingsRow(data.settings));
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
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">CDN / Edge Cache</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            What Cloudflare, sitting in front of this app, is allowed to keep at the edge.
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

      {/* --- Connection ------------------------------------------------- */}
      <Section
        title="Cloudflare connection"
        hint="This app calls Cloudflare's API on your behalf to actually apply the settings below — toggling them here does nothing on Cloudflare's side until you save and sync."
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
              placeholder={settings.apiTokenPreview ? `Stored, ends in ${settings.apiTokenPreview}` : "Paste a Cloudflare API Token"}
              type="password"
              className="admin-input font-mono"
            />
          </label>
        </div>
        <p className="text-xs text-text-faint">
          Needs Zone → Cache Purge, Zone Settings, and Zone edit permissions for this zone. The token is stored
          server-side only and never sent back to this page — leave it blank to keep the one already saved.
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

      {/* --- Master toggle ------------------------------------------------ */}
      <Section title="Edge Caching">
        <ToggleField
          label="Enable Edge Caching"
          hint="Master switch. Off means every toggle below is saved here but never pushed to Cloudflare — syncing while this is off clears any Cache Rules this app previously deployed."
          checked={settings.edgeCachingEnabled}
          onChange={(v) => patch({ edgeCachingEnabled: v })}
        />
      </Section>

      {/* --- Smart Cache Rules -------------------------------------------- */}
      <Section
        title="Smart Cache Rules"
        hint="One generated Cache Rule that bypasses the edge cache for /admin and /api routes, so nothing user-specific or dynamic ever gets served from a shared cache."
      >
        <ToggleField
          label="Enable Smart Cache Rules"
          checked={settings.smartCacheRulesEnabled}
          disabled={!settings.edgeCachingEnabled}
          onChange={(v) => patch({ smartCacheRulesEnabled: v })}
        />
      </Section>

      {/* --- Cache Everything ---------------------------------------------- */}
      <Section
        title="Cache Everything (where appropriate)"
        hint="Cloudflare's default cache level only caches static file extensions — this tells it to cache full responses (including HTML) for the specific path patterns below, which is only safe for pages with no per-visitor content."
      >
        <ToggleField
          label="Enable Cache Everything"
          checked={settings.cacheEverythingEnabled}
          disabled={!settings.edgeCachingEnabled}
          onChange={(v) => patch({ cacheEverythingEnabled: v })}
        />
        {settings.cacheEverythingEnabled && (
          <>
            <ChipListField
              values={settings.cacheEverythingPaths}
              placeholder="/games/*"
              onAdd={(v) => patch({ cacheEverythingPaths: [...settings.cacheEverythingPaths, v] })}
              onRemove={(v) => patch({ cacheEverythingPaths: settings.cacheEverythingPaths.filter((p) => p !== v) })}
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-white/70">Edge TTL for matched paths</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={60}
                  max={2592000}
                  value={settings.edgeTtlSeconds}
                  onChange={(e) =>
                    patch({ edgeTtlSeconds: Math.min(2592000, Math.max(60, Number(e.target.value) || 60)) })
                  }
                  className="glass w-32 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
                />
                <span className="text-xs text-text-faint">seconds</span>
              </div>
            </label>
          </>
        )}
      </Section>

      {/* --- Cache by Device ---------------------------------------------- */}
      <Section
        title="Cache by Device (optional)"
        hint="Splits the cache key by device type (desktop/mobile/tablet) so each gets its own cached copy — only worth it if pages actually render differently per device. Off by default since it multiplies cache misses."
      >
        <ToggleField
          label="Vary cache by device type"
          checked={settings.cacheByDeviceEnabled}
          disabled={!settings.edgeCachingEnabled}
          onChange={(v) => patch({ cacheByDeviceEnabled: v })}
        />
      </Section>

      {/* --- Cache by Query String ------------------------------------------ */}
      <Section
        title="Cache by Query String"
        hint="Controls whether ?query=strings fragment the cache key. Ignoring irrelevant ones (tracking params, etc.) raises the hit ratio without risking serving the wrong content for ones that matter."
      >
        <div className="flex flex-col gap-2">
          {QUERY_STRING_MODE_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                settings.cacheByQueryStringMode === opt.value ? "bg-white/10" : "hover:bg-white/5"
              } ${!settings.edgeCachingEnabled ? "opacity-50" : ""}`}
            >
              <input
                type="radio"
                name="query-string-mode"
                className="mt-1"
                checked={settings.cacheByQueryStringMode === opt.value}
                disabled={!settings.edgeCachingEnabled}
                onChange={() => patch({ cacheByQueryStringMode: opt.value })}
              />
              <span>
                <span className="block text-sm font-semibold text-white">{opt.label}</span>
                <span className="block text-xs text-text-faint">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {settings.cacheByQueryStringMode === "include_list" && (
          <ChipListField
            values={settings.cacheByQueryStringParams}
            placeholder="page"
            onAdd={(v) => patch({ cacheByQueryStringParams: [...settings.cacheByQueryStringParams, v] })}
            onRemove={(v) =>
              patch({ cacheByQueryStringParams: settings.cacheByQueryStringParams.filter((p) => p !== v) })
            }
          />
        )}
      </Section>

      {/* --- Image CDN ---------------------------------------------------- */}
      <Section
        title="Image CDN"
        hint="Cloudflare Image Resizing — on-demand resizing, format conversion (WebP/AVIF), and optimization at the edge. Plan-gated on some Cloudflare accounts; if syncing reports this failed, it usually means the zone's plan doesn't include it."
      >
        <ToggleField
          label="Enable Image CDN"
          checked={settings.imageCdnEnabled}
          disabled={!settings.edgeCachingEnabled}
          onChange={(v) => patch({ imageCdnEnabled: v })}
        />
      </Section>

      {/* --- Brotli / HTTP3 / Early Hints --------------------------------- */}
      <Section title="Transport">
        <ToggleField
          label="Brotli Compression"
          hint="Smaller responses for clients that support it. Safe to leave on."
          checked={settings.brotliEnabled}
          disabled={!settings.edgeCachingEnabled}
          onChange={(v) => patch({ brotliEnabled: v })}
        />
        <ToggleField
          label="HTTP/3"
          hint="QUIC-based transport — faster connection setup, especially on flaky mobile networks."
          checked={settings.http3Enabled}
          disabled={!settings.edgeCachingEnabled}
          onChange={(v) => patch({ http3Enabled: v })}
        />
        <ToggleField
          label="Early Hints (103)"
          hint="Lets the browser start fetching preload-able resources before the full response is ready. Only helps once the app actually sends preload Link headers — off by default until it does."
          checked={settings.earlyHintsEnabled}
          disabled={!settings.edgeCachingEnabled}
          onChange={(v) => patch({ earlyHintsEnabled: v })}
        />
      </Section>

      {/* --- Sync ----------------------------------------------------------- */}
      <div className="glass flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Sync to Cloudflare</h2>
            <p className="mt-1 text-xs text-text-faint">
              Save changes first, then sync — this calls Cloudflare's API and reports exactly what happened,
              instead of assuming the save above already took effect out there.
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

        {!connected && <p className="text-sm text-text-faint">Connect a Zone ID and API Token above first.</p>}
        {syncError && <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{syncError}</div>}

        {syncSummary && (
          <div className="flex flex-col divide-y divide-white/5">
            <StepRow label="Zone" result={syncSummary.zone} />
            <StepRow label="Brotli Compression" result={syncSummary.brotli} />
            <StepRow label="HTTP/3" result={syncSummary.http3} />
            <StepRow label="Early Hints (103)" result={syncSummary.earlyHints} />
            <StepRow label="Image CDN" result={syncSummary.imageCdn} />
            <StepRow label="Cache Rules" result={syncSummary.cacheRules} />
          </div>
        )}

        {settings.lastSyncedAt && (
          <p className="text-[11px] text-text-faint">
            Last synced {new Date(settings.lastSyncedAt).toLocaleString()} —{" "}
            {settings.lastSyncStatus === "success" ? "all steps succeeded" : settings.lastSyncStatus === "partial" ? "some steps failed" : "failed"}.
          </p>
        )}
      </div>
    </div>
  );
}
