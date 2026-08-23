"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  FileCode,
  Loader2,
  Music,
  Palette,
  Save,
  Shapes,
  Smile,
  Trash2,
  Type as TypeIcon,
  Video,
  X,
} from "lucide-react";
import {
  mapStaticAssetCacheRow,
  DEFAULT_STATIC_ASSET_CACHE_SETTINGS,
  FONT_DISPLAY_STRATEGIES,
  MEDIA_PRELOAD_OPTIONS,
  type StaticAssetCacheSettings,
  type StaticAssetTypeConfig,
  type FontAssetConfig,
  type SvgAssetConfig,
  type IconAssetConfig,
  type MediaAssetConfig,
  type StaticAssetKind,
  type FontDisplayStrategy,
  type MediaPreload,
} from "@/lib/static-asset-cache-settings";

// ── Shared sub-components (same visual language as the other Cache admin
//    screens — each Cache*AdminClient keeps its own local copies rather
//    than importing a shared file, matching the existing convention). ────────

function Section({
  title,
  hint,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
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
        <div className="flex items-center gap-2.5">
          {icon && (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
              {icon}
            </span>
          )}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">{title}</h2>
            {hint && open && <p className="mt-0.5 text-xs text-text-faint">{hint}</p>}
          </div>
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

function formatDuration(seconds: number): string {
  if (seconds >= 31536000 && seconds % 31536000 === 0) return `${seconds / 31536000}y`;
  if (seconds >= 2592000 && seconds % 2592000 === 0) return `${seconds / 2592000}mo`;
  if (seconds >= 604800 && seconds % 604800 === 0) return `${seconds / 604800}w`;
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  suffix,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
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
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-36 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50"
        />
        {suffix && <span className="text-xs text-text-faint">{suffix}</span>}
      </div>
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
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-48 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[#1a1a2e]">
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StatChip({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "neutral" }) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-500/15 text-emerald-400"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-400"
        : "bg-white/10 text-text-faint";
  return (
    <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">{label}</span>
      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-bold ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

// ── Fields shared by every asset type ───────────────────────────────────────

function CommonAssetFields({
  config,
  disabled,
  onChange,
}: {
  config: StaticAssetTypeConfig;
  disabled: boolean;
  onChange: (u: Partial<StaticAssetTypeConfig>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <NumberField
          label="Browser max-age"
          hint={`Cache-Control max-age. ≈ ${formatDuration(config.maxAge)}`}
          value={config.maxAge}
          min={0}
          max={31536000}
          suffix="sec"
          disabled={disabled}
          onChange={(v) => onChange({ maxAge: v })}
        />
        <NumberField
          label="CDN edge max-age"
          hint={`s-maxage at the CDN. ≈ ${formatDuration(config.cdnMaxAge)}`}
          value={config.cdnMaxAge}
          min={0}
          max={31536000}
          suffix="sec"
          disabled={disabled}
          onChange={(v) => onChange({ cdnMaxAge: v })}
        />
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <NumberField
          label="Stale-while-revalidate"
          hint="Serve stale while revalidating in the background. 0 disables."
          value={config.staleWhileRevalidate}
          min={0}
          max={2592000}
          suffix="sec"
          disabled={disabled}
          onChange={(v) => onChange({ staleWhileRevalidate: v })}
        />
      </div>
      <ToggleField
        label="Immutable"
        hint="Adds the immutable directive. Only safe when filenames are content-hashed / fingerprinted — otherwise updates won't reach returning visitors until the TTL expires."
        checked={config.immutable}
        disabled={disabled}
        onChange={(v) => onChange({ immutable: v })}
      />
      <ToggleField
        label="Compression (gzip / brotli)"
        hint="Negotiate compressed encodings via Accept-Encoding and send Vary: Accept-Encoding."
        checked={config.compressionEnabled}
        disabled={disabled}
        onChange={(v) => onChange({ compressionEnabled: v })}
      />
    </>
  );
}

// ── Purge panel ──────────────────────────────────────────────────────────────

type PurgeScope = "all" | StaticAssetKind;
type PurgeStatus = "idle" | "purging" | "done" | "error";

const SCOPE_LABELS: Record<PurgeScope, string> = {
  all: "All static asset caches",
  css: "CSS cache",
  javascript: "JavaScript cache",
  fonts: "Fonts cache",
  svg: "SVG cache",
  icons: "Icons cache",
  videos: "Videos cache",
  audio: "Audio cache",
};

function PurgePanel({
  lastPurgedAt,
  onPurged,
}: {
  lastPurgedAt: string | null;
  onPurged: (settings: StaticAssetCacheSettings) => void;
}) {
  const [scope, setScope] = useState<PurgeScope>("all");
  const [status, setStatus] = useState<PurgeStatus>("idle");
  const [message, setMessage] = useState("");

  async function handlePurge() {
    setStatus("purging");
    setMessage("");
    try {
      const res = await fetch("/api/admin/cache/static-assets/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Purge failed.");
        return;
      }
      if (data.settings) onPurged(mapStaticAssetCacheRow(data.settings));
      const label = scope === "all" ? "entire static asset cache" : SCOPE_LABELS[scope].toLowerCase();
      setMessage(`Purged ${label} — ${data.result?.count ?? 0} entries cleared.`);
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Network error — purge could not be completed.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Purge scope"
          hint="Clears cached responses for the selected asset type at the CDN edge."
          value={scope}
          options={Object.entries(SCOPE_LABELS).map(([v, l]) => ({ value: v as PurgeScope, label: l }))}
          onChange={setScope}
        />
        <button
          type="button"
          onClick={handlePurge}
          disabled={status === "purging"}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-red-500/20 px-4 py-2 text-sm font-bold text-red-300 hover:bg-red-500/30 disabled:opacity-50"
        >
          {status === "purging" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          Purge now
        </button>
      </div>

      {message && (
        <p className={`text-xs font-semibold ${status === "error" ? "text-red-400" : "text-emerald-400"}`}>
          {message}
        </p>
      )}

      {lastPurgedAt && <p className="text-xs text-text-faint">Last purged: {new Date(lastPurgedAt).toLocaleString()}</p>}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function CacheStaticAssetsAdminClient() {
  const [settings, setSettings] = useState<StaticAssetCacheSettings>(DEFAULT_STATIC_ASSET_CACHE_SETTINGS);
  const [draft, setDraft] = useState<StaticAssetCacheSettings>(DEFAULT_STATIC_ASSET_CACHE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/cache/static-assets/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const s = mapStaticAssetCacheRow(d.settings ?? null);
        setSettings(s);
        setDraft(s);
      })
      .catch(() => {
        /* silently use defaults */
      })
      .finally(() => setLoading(false));
  }, []);

  const patch = useCallback((update: Partial<StaticAssetCacheSettings>) => {
    setDraft((prev) => ({ ...prev, ...update }));
    setSaveStatus((s) => (s === "saved" || s === "error" ? "idle" : s));
  }, []);

  const patchCss = useCallback(
    (u: Partial<StaticAssetTypeConfig>) => setDraft((prev) => ({ ...prev, css: { ...prev.css, ...u } })),
    [],
  );
  const patchJs = useCallback(
    (u: Partial<StaticAssetTypeConfig>) => setDraft((prev) => ({ ...prev, javascript: { ...prev.javascript, ...u } })),
    [],
  );
  const patchFonts = useCallback(
    (u: Partial<FontAssetConfig>) => setDraft((prev) => ({ ...prev, fonts: { ...prev.fonts, ...u } })),
    [],
  );
  const patchSvg = useCallback(
    (u: Partial<SvgAssetConfig>) => setDraft((prev) => ({ ...prev, svg: { ...prev.svg, ...u } })),
    [],
  );
  const patchIcons = useCallback(
    (u: Partial<IconAssetConfig>) => setDraft((prev) => ({ ...prev, icons: { ...prev.icons, ...u } })),
    [],
  );
  const patchVideos = useCallback(
    (u: Partial<MediaAssetConfig>) => setDraft((prev) => ({ ...prev, videos: { ...prev.videos, ...u } })),
    [],
  );
  const patchAudio = useCallback(
    (u: Partial<MediaAssetConfig>) => setDraft((prev) => ({ ...prev, audio: { ...prev.audio, ...u } })),
    [],
  );

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const masterDisabled = loading || !draft.enabled;

  async function handleSave() {
    setSaveStatus("saving");
    setErrorMessage("");
    try {
      const res = await fetch("/api/admin/cache/static-assets/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveStatus("error");
        setErrorMessage(data.error ?? "Failed to save.");
        return;
      }
      const saved = mapStaticAssetCacheRow(data.settings ?? null);
      setSettings(saved);
      setDraft(saved);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setErrorMessage("Network error — changes not saved.");
    }
  }

  const activeTypeCount = [
    draft.css.enabled,
    draft.javascript.enabled,
    draft.fonts.enabled,
    draft.svg.enabled,
    draft.icons.enabled,
    draft.videos.enabled,
    draft.audio.enabled,
  ].filter(Boolean).length;

  const longCacheCount = [
    draft.css.maxAge,
    draft.javascript.maxAge,
    draft.fonts.maxAge,
    draft.svg.maxAge,
    draft.icons.maxAge,
    draft.videos.maxAge,
    draft.audio.maxAge,
  ].filter((s) => s >= 2592000).length;

  const rangeMediaCount = [draft.videos.rangeRequestsEnabled, draft.audio.rangeRequestsEnabled].filter(
    Boolean,
  ).length;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Static Asset Cache</h1>
          <p className="mt-1 max-w-xl text-sm text-text-faint">
            Cache-Control policy per static asset type — CSS, JavaScript, Fonts, SVG, Icons, Videos, and Audio —
            distinct from the always-immutable Next.js build output and from Browser Cache&apos;s versioned upload
            buckets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isDirty && (
            <button
              type="button"
              onClick={() => setDraft(settings)}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10"
            >
              <X size={13} /> Discard
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveStatus === "saving"}
            className="flex items-center gap-2 rounded-full bg-[var(--color-menu-yellow)] px-4 py-2 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
          >
            {saveStatus === "saving" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : saveStatus === "saved" ? (
              <Check size={14} />
            ) : (
              <Save size={14} />
            )}
            {saveStatus === "saved" ? "Saved" : "Save changes"}
          </button>
        </div>
      </div>

      {saveStatus === "error" && errorMessage && (
        <div className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-400">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-text-faint">
          <Loader2 size={16} className="animate-spin" /> Loading settings…
        </div>
      ) : (
        <>
          {/* Summary chips */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatChip
              label="Static Asset Cache"
              value={draft.enabled ? "Enabled" : "Disabled"}
              tone={draft.enabled ? "emerald" : "neutral"}
            />
            <StatChip label="Types active" value={`${activeTypeCount} of 7`} tone={activeTypeCount > 0 ? "emerald" : "amber"} />
            <StatChip label="Long-cache types" value={`${longCacheCount} of 7`} tone={longCacheCount > 0 ? "emerald" : "neutral"} />
            <StatChip label="Range-request media" value={`${rangeMediaCount} of 2`} tone={rangeMediaCount === 2 ? "emerald" : "amber"} />
          </div>

          {/* ── Master switch ─────────────────────────────────────────────── */}
          <Section
            title="Master switch"
            hint="Disabling this turns off Cache-Control headers for all seven asset types globally without deleting their individual configuration."
            icon={<FileCode size={16} />}
          >
            <ToggleField
              label="Enable Static Asset Cache"
              hint="Turn on Cache-Control policies for CSS, JavaScript, Fonts, SVG, Icons, Videos, and Audio."
              checked={draft.enabled}
              onChange={(v) => patch({ enabled: v })}
            />
          </Section>

          {/* ── 1. CSS ────────────────────────────────────────────────────── */}
          <Section
            title="CSS"
            hint="Cache-Control for stylesheets. Long-lived and immutable is safe once filenames are content-hashed at build time."
            icon={<Palette size={16} />}
          >
            <ToggleField
              label="Enable CSS caching"
              checked={draft.css.enabled}
              disabled={masterDisabled}
              onChange={(v) => patchCss({ enabled: v })}
            />
            {draft.css.enabled && (
              <CommonAssetFields config={draft.css} disabled={masterDisabled} onChange={patchCss} />
            )}
          </Section>

          {/* ── 2. JavaScript ─────────────────────────────────────────────── */}
          <Section
            title="JavaScript"
            hint="Cache-Control for scripts. Mirrors the CSS policy — long-lived and immutable once bundled filenames are hashed."
            icon={<Braces size={16} />}
          >
            <ToggleField
              label="Enable JavaScript caching"
              checked={draft.javascript.enabled}
              disabled={masterDisabled}
              onChange={(v) => patchJs({ enabled: v })}
            />
            {draft.javascript.enabled && (
              <CommonAssetFields config={draft.javascript} disabled={masterDisabled} onChange={patchJs} />
            )}
          </Section>

          {/* ── 3. Fonts ──────────────────────────────────────────────────── */}
          <Section
            title="Fonts"
            hint="Cache-Control plus preload hints, font-display, and cross-origin headers for self-hosted @font-face files."
            icon={<TypeIcon size={16} />}
          >
            <ToggleField
              label="Enable font caching"
              checked={draft.fonts.enabled}
              disabled={masterDisabled}
              onChange={(v) => patchFonts({ enabled: v })}
            />
            {draft.fonts.enabled && (
              <>
                <CommonAssetFields config={draft.fonts} disabled={masterDisabled} onChange={patchFonts} />
                <ToggleField
                  label="Preload critical fonts"
                  hint='Emits <link rel="preload" as="font"> for above-the-fold fonts so they start downloading before CSS is parsed.'
                  checked={draft.fonts.preloadEnabled}
                  disabled={masterDisabled}
                  onChange={(v) => patchFonts({ preloadEnabled: v })}
                />
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <SelectField<FontDisplayStrategy>
                    label="font-display"
                    hint="Controls the swap behaviour between fallback and web font."
                    value={draft.fonts.fontDisplay}
                    options={FONT_DISPLAY_STRATEGIES.map((f) => ({ value: f, label: f }))}
                    disabled={masterDisabled}
                    onChange={(v) => patchFonts({ fontDisplay: v })}
                  />
                </div>
                <ToggleField
                  label="Cross-origin header"
                  hint="Adds crossorigin + Access-Control-Allow-Origin — required whenever fonts are served from a different origin than the page (e.g. a dedicated asset CDN)."
                  checked={draft.fonts.crossOriginEnabled}
                  disabled={masterDisabled}
                  onChange={(v) => patchFonts({ crossOriginEnabled: v })}
                />
              </>
            )}
          </Section>

          {/* ── 4. SVG ────────────────────────────────────────────────────── */}
          <Section
            title="SVG"
            hint="Cache-Control plus optional sprite-sheet bundling and small-icon inlining."
            icon={<Shapes size={16} />}
          >
            <ToggleField
              label="Enable SVG caching"
              checked={draft.svg.enabled}
              disabled={masterDisabled}
              onChange={(v) => patchSvg({ enabled: v })}
            />
            {draft.svg.enabled && (
              <>
                <CommonAssetFields config={draft.svg} disabled={masterDisabled} onChange={patchSvg} />
                <ToggleField
                  label="Sprite-sheet bundling"
                  hint="Bundle icon SVGs into a single cached sprite sheet instead of one request per icon."
                  checked={draft.svg.spriteEnabled}
                  disabled={masterDisabled}
                  onChange={(v) => patchSvg({ spriteEnabled: v })}
                />
                <NumberField
                  label="Inline threshold"
                  hint="SVGs at or under this size are inlined as data: URIs instead of a separate cached request. 0 disables inlining."
                  value={draft.svg.inlineThresholdBytes}
                  min={0}
                  max={65536}
                  suffix="bytes"
                  disabled={masterDisabled}
                  onChange={(v) => patchSvg({ inlineThresholdBytes: v })}
                />
              </>
            )}
          </Section>

          {/* ── 5. Icons ──────────────────────────────────────────────────── */}
          <Section
            title="Icons"
            hint="Favicons, PWA icons, and app icons. A shorter default TTL than CSS/JS since these filenames usually aren't hashed."
            icon={<Smile size={16} />}
          >
            <ToggleField
              label="Enable icon caching"
              checked={draft.icons.enabled}
              disabled={masterDisabled}
              onChange={(v) => patchIcons({ enabled: v })}
            />
            {draft.icons.enabled && (
              <>
                <CommonAssetFields config={draft.icons} disabled={masterDisabled} onChange={patchIcons} />
                <ToggleField
                  label="Fingerprint filenames"
                  hint="Append a content hash to favicon / app-icon filenames so an update busts the cache instead of waiting out the TTL."
                  checked={draft.icons.fingerprintEnabled}
                  disabled={masterDisabled}
                  onChange={(v) => patchIcons({ fingerprintEnabled: v })}
                />
              </>
            )}
          </Section>

          {/* ── 6. Videos ─────────────────────────────────────────────────── */}
          <Section
            title="Videos"
            hint="Cache-Control plus HTTP Range request support so scrubbing doesn't require re-downloading the file."
            icon={<Video size={16} />}
          >
            <ToggleField
              label="Enable video caching"
              checked={draft.videos.enabled}
              disabled={masterDisabled}
              onChange={(v) => patchVideos({ enabled: v })}
            />
            {draft.videos.enabled && (
              <>
                <CommonAssetFields config={draft.videos} disabled={masterDisabled} onChange={patchVideos} />
                <ToggleField
                  label="Range requests"
                  hint="Sends Accept-Ranges: bytes and honours Range requests — required for seeking/scrubbing instead of downloading the whole file up front."
                  checked={draft.videos.rangeRequestsEnabled}
                  disabled={masterDisabled}
                  onChange={(v) => patchVideos({ rangeRequestsEnabled: v })}
                />
                <SelectField<MediaPreload>
                  label="Preload hint"
                  hint="HTML5 preload attribute written onto <video> elements."
                  value={draft.videos.preload}
                  options={MEDIA_PRELOAD_OPTIONS.map((p) => ({ value: p, label: p }))}
                  disabled={masterDisabled}
                  onChange={(v) => patchVideos({ preload: v })}
                />
              </>
            )}
          </Section>

          {/* ── 7. Audio ──────────────────────────────────────────────────── */}
          <Section
            title="Audio"
            hint="Cache-Control plus HTTP Range request support so seeking within a track doesn't require re-downloading the file."
            icon={<Music size={16} />}
          >
            <ToggleField
              label="Enable audio caching"
              checked={draft.audio.enabled}
              disabled={masterDisabled}
              onChange={(v) => patchAudio({ enabled: v })}
            />
            {draft.audio.enabled && (
              <>
                <CommonAssetFields config={draft.audio} disabled={masterDisabled} onChange={patchAudio} />
                <ToggleField
                  label="Range requests"
                  hint="Sends Accept-Ranges: bytes and honours Range requests — required for seeking within a track instead of downloading the whole file up front."
                  checked={draft.audio.rangeRequestsEnabled}
                  disabled={masterDisabled}
                  onChange={(v) => patchAudio({ rangeRequestsEnabled: v })}
                />
                <SelectField<MediaPreload>
                  label="Preload hint"
                  hint="HTML5 preload attribute written onto <audio> elements."
                  value={draft.audio.preload}
                  options={MEDIA_PRELOAD_OPTIONS.map((p) => ({ value: p, label: p }))}
                  disabled={masterDisabled}
                  onChange={(v) => patchAudio({ preload: v })}
                />
              </>
            )}
          </Section>

          {/* ── Purge ─────────────────────────────────────────────────────── */}
          <Section
            title="Purge static asset cache"
            hint="Force-clear cached CDN/edge responses for one asset type or all seven. Has no effect on a type that's currently disabled."
            defaultOpen={false}
            icon={<Trash2 size={16} />}
          >
            <PurgePanel
              lastPurgedAt={draft.lastPurgedAt}
              onPurged={(updated) => {
                setSettings(updated);
                setDraft(updated);
              }}
            />
          </Section>
        </>
      )}
    </div>
  );
}
