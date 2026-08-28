"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  Check,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { mapCacheSettingsRow, DEFAULT_CACHE_SETTINGS, type CacheSettings } from "@/lib/cache-settings";

const PRESETS = [
  { label: "1 hour", seconds: 3600 },
  { label: "1 day", seconds: 86400 },
  { label: "7 days", seconds: 604800 },
  { label: "30 days", seconds: 2592000 },
  { label: "1 year", seconds: 31536000 },
];

function formatDuration(seconds: number): string {
  if (seconds >= 31536000 && seconds % 31536000 === 0) {
    const n = seconds / 31536000;
    return `${n} year${n === 1 ? "" : "s"}`;
  }
  if (seconds >= 604800 && seconds % 604800 === 0) {
    const n = seconds / 604800;
    return `${n} week${n === 1 ? "" : "s"}`;
  }
  if (seconds >= 86400 && seconds % 86400 === 0) {
    const n = seconds / 86400;
    return `${n} day${n === 1 ? "" : "s"}`;
  }
  if (seconds >= 3600 && seconds % 3600 === 0) {
    const n = seconds / 3600;
    return `${n} hour${n === 1 ? "" : "s"}`;
  }
  if (seconds >= 60 && seconds % 60 === 0) {
    const n = seconds / 60;
    return `${n} minute${n === 1 ? "" : "s"}`;
  }
  return `${seconds}s`;
}

function DurationField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const presets = PRESETS.filter((p) => p.seconds >= min && p.seconds <= max);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
          className="glass w-32 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        <span className="text-xs text-text-faint">
          seconds ≈ <span className="font-semibold text-white/70">{formatDuration(value)}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.seconds}
            type="button"
            onClick={() => onChange(p.seconds)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
              value === p.seconds
                ? "bg-[var(--color-menu-yellow)] text-black"
                : "bg-white/10 text-white/70 hover:bg-white/15"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {hint && <span className="block text-xs text-text-faint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
        }`}
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

interface InspectHeaders {
  cacheControl: string | null;
  etag: string | null;
  lastModified: string | null;
  expires: string | null;
}

interface InspectCheck {
  id: string;
  label: string;
  detailUrl: string;
  category: string;
  status: number | null;
  headers: InspectHeaders | null;
  verdict: "pass" | "warn" | "fail";
  note: string;
}

function VerdictBadge({ verdict }: { verdict: InspectCheck["verdict"] }) {
  const map = {
    pass: { cls: "bg-emerald-500/15 text-emerald-400", icon: <CheckCircle2 size={12} />, label: "Pass" },
    warn: { cls: "bg-amber-500/15 text-amber-400", icon: <AlertTriangle size={12} />, label: "Warn" },
    fail: { cls: "bg-hot/15 text-hot", icon: <XCircle size={12} />, label: "Fail" },
  } as const;
  const m = map[verdict];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${m.cls}`}>
      {m.icon} {m.label}
    </span>
  );
}

function HeaderRow({ name, value }: { name: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-text-faint">{name}</dt>
      <dd className="truncate font-mono text-[11px] text-white/80" title={value ?? undefined}>
        {value ?? "—"}
      </dd>
    </div>
  );
}

function CheckCard({ check }: { check: InspectCheck }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{check.label}</span>
            {check.status !== null && <span className="shrink-0 text-xs text-text-faint">HTTP {check.status}</span>}
          </div>
          <p className="mt-1 text-xs text-text-faint">{check.note}</p>
        </div>
        <VerdictBadge verdict={check.verdict} />
      </div>
      {check.headers && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <HeaderRow name="Cache-Control" value={check.headers.cacheControl} />
          <HeaderRow name="ETag" value={check.headers.etag} />
          <HeaderRow name="Last-Modified" value={check.headers.lastModified} />
          <HeaderRow name="Expires" value={check.headers.expires} />
        </dl>
      )}
      <a
        href={check.detailUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center gap-1 truncate text-[11px] text-white/40 hover:text-white/70 hover:underline"
      >
        <ExternalLink size={11} className="shrink-0" />
        <span className="truncate">{check.detailUrl}</span>
      </a>
    </div>
  );
}

/** Admin → Cache → Browser Cache. The single-row `cache_settings` table
 * (Storage upload cache durations + service worker toggle/version — see
 * migration 0033_cache_management.sql) plus a live header inspector that
 * makes real requests instead of asking the admin to trust the config.
 * Everything else in the Browser Cache layer (Cache-Control on
 * /_next/static, ETag generation on HTML pages) is enforced by Next.js
 * itself and isn't configurable here — shown as read-only status in the
 * inspector below instead of a fake toggle. */
export function CacheBrowserAdminClient() {
  const [settings, setSettings] = useState<CacheSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [checks, setChecks] = useState<InspectCheck[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cache/settings")
      .then((res) => res.json())
      .then((data) => setSettings(mapCacheSettingsRow(data.settings)))
      .catch(() => setSettings(DEFAULT_CACHE_SETTINGS));
  }, []);

  function patch(p: Partial<CacheSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/cache/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentImagesMaxAge: settings.contentImagesMaxAge,
          gameThumbnailsMaxAge: settings.gameThumbnailsMaxAge,
          gameMediaMaxAge: settings.gameMediaMaxAge,
          mediaLibraryMaxAge: settings.mediaLibraryMaxAge,
          gameFilesMaxAge: settings.gameFilesMaxAge,
          serviceWorkerEnabled: settings.serviceWorkerEnabled,
          serviceWorkerCacheVersion: settings.serviceWorkerCacheVersion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      setSettings(mapCacheSettingsRow(data.settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function runInspect() {
    setInspecting(true);
    setInspectError(null);
    try {
      const res = await fetch("/api/admin/cache/inspect");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed.");
      setChecks(data.checks);
      setCheckedAt(data.checkedAt);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : "Check failed.");
    } finally {
      setInspecting(false);
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
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Browser Cache</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Cache-Control, ETag/Last-Modified, immutable & versioned assets, and the service worker.
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

      {/* --- Already enforced, nothing to configure -------------------- */}
      <div className="glass mb-4 flex flex-col gap-2 rounded-2xl p-6 sm:p-7">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Enforced automatically</h2>
        <p className="text-sm text-text-faint">
          Next.js already handles these — there&apos;s nothing to toggle, and the live check below confirms they&apos;re
          actually happening rather than just assuming it.
        </p>
        <ul className="mt-1 flex flex-col gap-1.5 text-sm text-white/80">
          <li>
            <span className="font-semibold text-white">Immutable, versioned build assets</span> — every file under{" "}
            <code className="text-xs text-white/60">/_next/static</code> is content-hashed and served as{" "}
            <code className="text-xs text-white/60">public, max-age=31536000, immutable</code>. Not overridable, and
            doesn&apos;t need to be.
          </li>
          <li>
            <span className="font-semibold text-white">ETag on HTML pages</span> — generated per page by default
            (Next.js <code className="text-xs text-white/60">generateEtags</code>).
          </li>
        </ul>
      </div>

      {/* --- Configurable: versioned Storage buckets ------------------- */}
      <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">
            Storage cache — versioned buckets
          </h2>
          <p className="mt-1 text-xs text-text-faint">
            These buckets stamp the upload time into the storage path, so a re-upload is a brand-new URL — the old
            one is never reused. That makes a long, effectively-immutable cache safe.
          </p>
        </div>
        <DurationField
          label="Content images"
          hint="Inline images used in blog posts and editable pages."
          value={settings.contentImagesMaxAge}
          min={60}
          max={31536000}
          onChange={(v) => patch({ contentImagesMaxAge: v })}
        />
        <DurationField
          label="Game thumbnails"
          value={settings.gameThumbnailsMaxAge}
          min={60}
          max={31536000}
          onChange={(v) => patch({ gameThumbnailsMaxAge: v })}
        />
        <DurationField
          label="Game media"
          hint="Screenshots and trailers on a game's page."
          value={settings.gameMediaMaxAge}
          min={60}
          max={31536000}
          onChange={(v) => patch({ gameMediaMaxAge: v })}
        />
        <DurationField
          label="Media library"
          hint="Admin → Media Management uploads."
          value={settings.mediaLibraryMaxAge}
          min={60}
          max={31536000}
          onChange={(v) => patch({ mediaLibraryMaxAge: v })}
        />
      </div>

      {/* --- Configurable: the one non-versioned bucket ----------------- */}
      <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">
            Storage cache — game build files
          </h2>
          <p className="mt-1 text-xs text-text-faint">
            Unlike the buckets above, re-uploading a game build overwrites the same path (
            <code className="text-xs text-white/60">{"{slug}/index.html"}</code>, etc.) instead of creating a new
            one — so this ceiling is intentionally much lower. Caching this long-lived would mean returning players
            get a stale build for up to that long after you push a fix.
          </p>
        </div>
        <DurationField
          label="Game files"
          value={settings.gameFilesMaxAge}
          min={60}
          max={604800}
          onChange={(v) => patch({ gameFilesMaxAge: v })}
        />
      </div>

      {/* --- Service worker --------------------------------------------- */}
      <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Service Worker (optional)</h2>
        <ToggleField
          label="Enable service worker caching"
          hint="Cache-first for static assets and images, network-first for pages. Turning this off serves a self-unregistering worker so existing installs clean themselves up rather than running forever."
          checked={settings.serviceWorkerEnabled}
          onChange={(v) => patch({ serviceWorkerEnabled: v })}
        />
        <div className="flex items-center justify-between gap-4 py-1">
          <span>
            <span className="block text-sm font-semibold text-white">Cache version</span>
            <span className="block text-xs text-text-faint">
              Bump this to force every visitor to drop their cached copy and start clean (e.g. after changing what
              gets precached).
            </span>
          </span>
          <button
            type="button"
            onClick={() => patch({ serviceWorkerCacheVersion: settings.serviceWorkerCacheVersion + 1 })}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/15"
          >
            <RefreshCcw size={13} /> v{settings.serviceWorkerCacheVersion} → v{settings.serviceWorkerCacheVersion + 1}
          </button>
        </div>
      </div>

      {/* --- Live inspector ---------------------------------------------- */}
      <div className="glass flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Live header check</h2>
            <p className="mt-1 text-xs text-text-faint">
              Makes real requests to this site and reports the actual headers that came back.
            </p>
          </div>
          <button
            type="button"
            onClick={runInspect}
            disabled={inspecting}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {inspecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            {inspecting ? "Checking…" : "Run live check"}
          </button>
        </div>

        {inspectError && (
          <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{inspectError}</div>
        )}

        {checks && (
          <>
            {checkedAt && (
              <p className="text-[11px] text-text-faint">Checked {new Date(checkedAt).toLocaleString()}</p>
            )}
            <div className="flex flex-col gap-3">
              {checks.map((check) => (
                <CheckCard key={check.id} check={check} />
              ))}
            </div>
          </>
        )}

        {!checks && !inspecting && <p className="text-sm text-text-faint">No check has been run yet this session.</p>}
      </div>
    </div>
  );
}
