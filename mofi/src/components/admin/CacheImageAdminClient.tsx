"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Check,
  Eraser,
  FileImage,
  ImageOff,
  Loader2,
  Monitor,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  mapImageCacheRow,
  DEFAULT_IMAGE_CACHE_SETTINGS,
  DEFAULT_SRCSET_BREAKPOINTS,
  IMAGE_FIT_OPTIONS,
  LAZY_LOAD_STRATEGIES,
  type ImageCacheSettings,
  type SrcsetBreakpoint,
  type ImageFit,
  type LazyLoadStrategy,
} from "@/lib/image-cache-settings";

// ── Shared sub-components ───────────────────────────────────────────────────

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

function TextField({
  label,
  hint,
  value,
  placeholder,
  maxLength,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
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
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="admin-input"
      />
    </div>
  );
}

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "neutral";
}) {
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

// ── Srcset breakpoint table ─────────────────────────────────────────────────

function SrcsetEditor({
  breakpoints,
  disabled,
  onChange,
}: {
  breakpoints: SrcsetBreakpoint[];
  disabled: boolean;
  onChange: (v: SrcsetBreakpoint[]) => void;
}) {
  const [draftWidth, setDraftWidth] = useState("");
  const [draftDensity, setDraftDensity] = useState<1 | 2 | 3>(1);

  function add() {
    const w = parseInt(draftWidth, 10);
    if (isNaN(w) || w < 16 || w > 8192) return;
    if (breakpoints.some((b) => b.width === w && b.density === draftDensity)) return;
    const next = [...breakpoints, { width: w, density: draftDensity }].sort((a, b) => a.width - b.width);
    onChange(next);
    setDraftWidth("");
  }

  function remove(idx: number) {
    onChange(breakpoints.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {breakpoints.map((bp, i) => (
          <span
            key={`${bp.width}x${bp.density}`}
            className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80"
          >
            <code>
              {bp.width}w{bp.density > 1 ? ` ${bp.density}x` : ""}
            </code>
            {!disabled && (
              <button type="button" onClick={() => remove(i)} className="text-white/40 hover:text-white">
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        {breakpoints.length === 0 && <span className="text-xs text-text-faint">No breakpoints configured.</span>}
      </div>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            value={draftWidth}
            onChange={(e) => setDraftWidth(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Width px"
            min={16}
            max={8192}
            className="w-28 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
          />
          <select
            value={draftDensity}
            onChange={(e) => setDraftDensity(Number(e.target.value) as 1 | 2 | 3)}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30"
          >
            <option value={1} className="bg-[#1a1a2e]">1×</option>
            <option value={2} className="bg-[#1a1a2e]">2×</option>
            <option value={3} className="bg-[#1a1a2e]">3×</option>
          </select>
          <button
            type="button"
            onClick={add}
            className="flex shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
          >
            <Plus size={13} /> Add
          </button>
          <button
            type="button"
            onClick={() => onChange(DEFAULT_SRCSET_BREAKPOINTS)}
            className="flex shrink-0 items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-white/60 hover:bg-white/5"
          >
            <RefreshCw size={12} /> Reset defaults
          </button>
        </div>
      )}
    </div>
  );
}

// ── Purge panel ─────────────────────────────────────────────────────────────

type PurgeScope = "all" | "thumbnails" | "resized" | "optimised";
type PurgeStatus = "idle" | "purging" | "done" | "error";

function PurgePanel({
  lastPurgedAt,
  onPurged,
}: {
  lastPurgedAt: string | null;
  onPurged: (settings: ImageCacheSettings) => void;
}) {
  const [scope, setScope] = useState<PurgeScope>("all");
  const [status, setStatus] = useState<PurgeStatus>("idle");
  const [message, setMessage] = useState("");

  async function handlePurge() {
    setStatus("purging");
    setMessage("");
    try {
      const res = await fetch("/api/admin/cache/image/purge", {
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
      if (data.settings) onPurged(mapImageCacheRow(data.settings));
      const label = scope === "all" ? "entire image cache" : `${scope} cache`;
      setMessage(`Purged ${label} — ${data.result?.count ?? 0} entries cleared.`);
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Network error — purge could not be completed.");
    }
  }

  const SCOPE_LABELS: Record<PurgeScope, string> = {
    all:       "All image caches",
    thumbnails: "Thumbnail cache",
    resized:   "Resized variants",
    optimised: "WebP / AVIF transcodes",
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Purge scope"
          hint="Thumbnail cache stores pre-generated thumbs. Resized cache stores on-demand dimension variants."
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
          {status === "purging" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Trash2 size={14} />
          )}
          Purge now
        </button>
      </div>

      {message && (
        <p
          className={`text-xs font-semibold ${
            status === "error" ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {message}
        </p>
      )}

      {lastPurgedAt && (
        <p className="text-xs text-text-faint">
          Last purged: {new Date(lastPurgedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function CacheImageAdminClient() {
  const [settings, setSettings] = useState<ImageCacheSettings>(DEFAULT_IMAGE_CACHE_SETTINGS);
  const [draft,    setDraft]    = useState<ImageCacheSettings>(DEFAULT_IMAGE_CACHE_SETTINGS);
  const [loading,  setLoading]  = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/cache/image/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        const s = mapImageCacheRow(d.settings ?? null);
        setSettings(s);
        setDraft(s);
      })
      .catch(() => {/* silently use defaults */})
      .finally(() => setLoading(false));
  }, []);

  const patch = useCallback(
    (update: Partial<ImageCacheSettings>) => {
      setDraft((prev) => ({ ...prev, ...update }));
      if (saveStatus === "saved" || saveStatus === "error") setSaveStatus("idle");
    },
    [saveStatus],
  );

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  async function handleSave() {
    setSaveStatus("saving");
    setErrorMessage("");
    try {
      const res = await fetch("/api/admin/cache/image/settings", {
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
      const saved = mapImageCacheRow(data.settings ?? null);
      setSettings(saved);
      setDraft(saved);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setErrorMessage("Network error — changes not saved.");
    }
  }

  // Summary chips
  const activeFormats = [draft.webpEnabled && "WebP", draft.avifEnabled && "AVIF"].filter(Boolean).join(" + ");
  const cacheCount = [
    draft.thumbnailCacheEnabled && "Thumbnails",
    draft.optimisationCacheEnabled && "Optimisation",
    draft.resizingCacheEnabled && "Resizing",
  ].filter(Boolean).length;

  const masterDisabled = loading || !draft.enabled;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Image Cache</h1>
          <p className="mt-1 max-w-xl text-sm text-text-faint">
            Next-gen format transcoding, responsive srcset generation, per-variant caching, and
            lazy-load configuration — all in one place.
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
              label="Image Cache"
              value={draft.enabled ? "Enabled" : "Disabled"}
              tone={draft.enabled ? "emerald" : "neutral"}
            />
            <StatChip
              label="Formats"
              value={activeFormats || "Off"}
              tone={activeFormats ? "emerald" : "neutral"}
            />
            <StatChip
              label="Cache layers"
              value={`${cacheCount} active`}
              tone={cacheCount > 0 ? "emerald" : "amber"}
            />
            <StatChip
              label="Lazy load"
              value={draft.lazyLoadEnabled ? draft.lazyLoadStrategy : "Disabled"}
              tone={draft.lazyLoadEnabled ? "emerald" : "neutral"}
            />
          </div>

          {/* ── Master toggle ─────────────────────────────────────────────── */}
          <Section
            title="Master switch"
            hint="Disabling this turns off all image cache features globally without deleting stored settings."
            icon={<FileImage size={16} />}
          >
            <ToggleField
              label="Enable Image Cache"
              hint="Turn on next-gen formats, responsive srcset, thumbnail caching, and lazy loading."
              checked={draft.enabled}
              onChange={(v) => patch({ enabled: v })}
            />
          </Section>

          {/* ── 1. WebP Generation ───────────────────────────────────────── */}
          <Section
            title="WebP Generation"
            hint="Transcode uploaded images to WebP at save time. Browsers that support WebP receive ~30% smaller files with identical visual quality."
            icon={<Zap size={16} />}
          >
            <ToggleField
              label="Enable WebP generation"
              hint="Newly uploaded images are automatically transcoded to WebP."
              checked={draft.webpEnabled}
              disabled={masterDisabled}
              onChange={(v) => patch({ webpEnabled: v })}
            />

            {draft.webpEnabled && (
              <>
                <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <NumberField
                    label="WebP quality"
                    hint="1–100. 80 is visually lossless for most images."
                    value={draft.webpQuality}
                    min={1}
                    max={100}
                    suffix="/ 100"
                    disabled={masterDisabled}
                    onChange={(v) => patch({ webpQuality: v })}
                  />
                  <NumberField
                    label="Size saving threshold"
                    hint="Minimum % saving required to keep the WebP. 0 = always keep."
                    value={Math.round(draft.webpSizeThreshold * 100)}
                    min={0}
                    max={100}
                    suffix="%"
                    disabled={masterDisabled}
                    onChange={(v) => patch({ webpSizeThreshold: v / 100 })}
                  />
                </div>
                <ToggleField
                  label="Keep original alongside WebP"
                  hint="Preserve the source JPEG / PNG for browsers that don't support WebP."
                  checked={draft.webpKeepOriginal}
                  disabled={masterDisabled}
                  onChange={(v) => patch({ webpKeepOriginal: v })}
                />
              </>
            )}
          </Section>

          {/* ── 2. AVIF Generation ───────────────────────────────────────── */}
          <Section
            title="AVIF Generation"
            hint="AVIF achieves 40–50% smaller files than JPEG at comparable quality. Encoding is CPU-intensive — pair with the Image Resizing Cache to avoid re-encoding on every request."
            icon={<Zap size={16} />}
          >
            <ToggleField
              label="Enable AVIF generation"
              hint="Images are transcoded to AVIF after WebP (if enabled). Requires sharp with libavif."
              checked={draft.avifEnabled}
              disabled={masterDisabled}
              onChange={(v) => patch({ avifEnabled: v })}
            />

            {draft.avifEnabled && (
              <>
                <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <NumberField
                    label="AVIF quality"
                    hint="1–100. 60 is roughly equivalent to WebP at 80."
                    value={draft.avifQuality}
                    min={1}
                    max={100}
                    suffix="/ 100"
                    disabled={masterDisabled}
                    onChange={(v) => patch({ avifQuality: v })}
                  />
                  <NumberField
                    label="Encoding effort"
                    hint="0–10. Higher = smaller file, slower encode. 4 is a good default."
                    value={draft.avifEffort}
                    min={0}
                    max={10}
                    suffix="/ 10"
                    disabled={masterDisabled}
                    onChange={(v) => patch({ avifEffort: v })}
                  />
                </div>
                <ToggleField
                  label="Keep original alongside AVIF"
                  hint="Preserve the source file for browsers that don't support AVIF."
                  checked={draft.avifKeepOriginal}
                  disabled={masterDisabled}
                  onChange={(v) => patch({ avifKeepOriginal: v })}
                />
              </>
            )}
          </Section>

          {/* ── 3. Responsive Images ─────────────────────────────────────── */}
          <Section
            title="Responsive Images"
            hint="Generate srcset width descriptors so browsers download only the image size they need. Uses native <img srcset> or a <picture> element for format negotiation."
            icon={<Monitor size={16} />}
          >
            <ToggleField
              label="Enable responsive images"
              hint="Emit srcset attributes and generate resized variants at each breakpoint."
              checked={draft.responsiveEnabled}
              disabled={masterDisabled}
              onChange={(v) => patch({ responsiveEnabled: v })}
            />

            {draft.responsiveEnabled && (
              <>
                <div className="mt-2 flex flex-col gap-2">
                  <span className="text-sm font-semibold text-white">Srcset breakpoints</span>
                  <span className="text-xs text-text-faint">
                    Width variants that will be generated. Sorted ascending automatically.
                  </span>
                  <SrcsetEditor
                    breakpoints={draft.srcsetBreakpoints}
                    disabled={masterDisabled}
                    onChange={(v) => patch({ srcsetBreakpoints: v })}
                  />
                </div>

                <ToggleField
                  label="Emit <picture> element"
                  hint="Wraps each <img> in a <picture> so AVIF / WebP versions are negotiated via <source type>."
                  checked={draft.pictureElementEnabled}
                  disabled={masterDisabled}
                  onChange={(v) => patch({ pictureElementEnabled: v })}
                />

                <TextField
                  label='sizes="" attribute'
                  hint='Written into generated <img> markup. Tells the browser what fraction of the viewport each image occupies.'
                  value={draft.sizesAttribute}
                  placeholder="(max-width: 768px) 100vw, 50vw"
                  maxLength={256}
                  disabled={masterDisabled}
                  onChange={(v) => patch({ sizesAttribute: v })}
                />
              </>
            )}
          </Section>

          {/* ── 4. Thumbnail Cache ───────────────────────────────────────── */}
          <Section
            title="Thumbnail Cache"
            hint="Pre-generated thumbnails are stored on disk or in object storage and served directly — bypassing the image pipeline on repeat requests."
            icon={<FileImage size={16} />}
          >
            <ToggleField
              label="Enable thumbnail cache"
              hint="Thumbnails are written to the configured storage driver after first generation."
              checked={draft.thumbnailCacheEnabled}
              disabled={masterDisabled}
              onChange={(v) => patch({ thumbnailCacheEnabled: v })}
            />

            {draft.thumbnailCacheEnabled && (
              <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <NumberField
                  label="Cache TTL"
                  hint="How long a thumbnail is considered fresh before re-generation."
                  value={draft.thumbnailCacheTtl}
                  min={0}
                  max={604800}
                  suffix="sec"
                  disabled={masterDisabled}
                  onChange={(v) => patch({ thumbnailCacheTtl: v })}
                />
                <NumberField
                  label="Max variants per image"
                  hint="Older variants are evicted LRU-style when this limit is reached."
                  value={draft.thumbnailMaxVariants}
                  min={1}
                  max={200}
                  suffix="variants"
                  disabled={masterDisabled}
                  onChange={(v) => patch({ thumbnailMaxVariants: v })}
                />
                <SelectField
                  label="Storage driver"
                  hint='"disk" writes to /public/cache/thumbs. "object-store" uses the configured S3-compatible bucket.'
                  value={draft.thumbnailStorageDriver}
                  options={[
                    { value: "disk",         label: "Disk (/public/cache/thumbs)" },
                    { value: "object-store", label: "Object store (S3-compatible)" },
                  ]}
                  disabled={masterDisabled}
                  onChange={(v) => patch({ thumbnailStorageDriver: v })}
                />
              </div>
            )}
          </Section>

          {/* ── 5. Lazy Loading ──────────────────────────────────────────── */}
          <Section
            title="Lazy Loading"
            hint="Defer off-screen image loads to improve initial page weight and LCP. Native uses loading=&quot;lazy&quot;; Observer wires IntersectionObserver for custom thresholds."
            icon={<ImageOff size={16} />}
          >
            <ToggleField
              label="Enable lazy loading"
              hint="Images below the fold are not loaded until the user scrolls toward them."
              checked={draft.lazyLoadEnabled}
              disabled={masterDisabled}
              onChange={(v) => patch({ lazyLoadEnabled: v })}
            />

            {draft.lazyLoadEnabled && (
              <>
                <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <SelectField<LazyLoadStrategy>
                    label="Strategy"
                    hint='"both" applies native loading=lazy and Observer for maximum compatibility.'
                    value={draft.lazyLoadStrategy}
                    options={LAZY_LOAD_STRATEGIES.map((s) => ({
                      value: s,
                      label: s === "native" ? "Native (loading=lazy)" : s === "observer" ? "IntersectionObserver" : "Both",
                    }))}
                    disabled={masterDisabled}
                    onChange={(v) => patch({ lazyLoadStrategy: v })}
                  />
                  {(draft.lazyLoadStrategy === "observer" || draft.lazyLoadStrategy === "both") && (
                    <NumberField
                      label="Observer threshold"
                      hint="Fraction of the image (0.0–1.0) visible before load triggers."
                      value={draft.lazyLoadThreshold}
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={masterDisabled}
                      onChange={(v) => patch({ lazyLoadThreshold: v })}
                    />
                  )}
                </div>

                {(draft.lazyLoadStrategy === "observer" || draft.lazyLoadStrategy === "both") && (
                  <TextField
                    label="Root margin"
                    hint="How far ahead of the viewport to start loading. e.g. &quot;200px 0px&quot; pre-loads 200 px before the image enters view."
                    value={draft.lazyLoadRootMargin}
                    placeholder="200px 0px"
                    maxLength={64}
                    disabled={masterDisabled}
                    onChange={(v) => patch({ lazyLoadRootMargin: v })}
                  />
                )}

                <ToggleField
                  label="LQIP (Low-Quality Image Placeholder)"
                  hint="Show a tiny blurred placeholder while the full image loads — reduces perceived loading time."
                  checked={draft.lqipEnabled}
                  disabled={masterDisabled}
                  onChange={(v) => patch({ lqipEnabled: v })}
                />

                {!draft.lqipEnabled && (
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-white">Placeholder colour</span>
                    <span className="text-xs text-text-faint">
                      Background colour shown while the image loads (LQIP disabled).
                    </span>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={draft.placeholderColor}
                        disabled={masterDisabled}
                        onChange={(e) => patch({ placeholderColor: e.target.value })}
                        className="h-9 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent disabled:opacity-50"
                      />
                      <code className="text-xs text-white/60">{draft.placeholderColor}</code>
                    </div>
                  </div>
                )}
              </>
            )}
          </Section>

          {/* ── 6. Image Optimisation Cache ──────────────────────────────── */}
          <Section
            title="Image Optimisation Cache"
            hint="Adds Cache-Control headers to /api/image responses so browsers, CDN edges, and reverse proxies serve repeat requests without hitting the Next.js image pipeline."
            defaultOpen={false}
            icon={<Zap size={16} />}
          >
            <ToggleField
              label="Enable optimisation cache"
              hint="Cache-Control max-age and stale-while-revalidate headers are added to image route responses."
              checked={draft.optimisationCacheEnabled}
              disabled={masterDisabled}
              onChange={(v) => patch({ optimisationCacheEnabled: v })}
            />

            {draft.optimisationCacheEnabled && (
              <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2">
                <NumberField
                  label="Cache TTL"
                  hint="max-age in Cache-Control headers for optimised image responses."
                  value={draft.optimisationCacheTtl}
                  min={0}
                  max={604800}
                  suffix="sec"
                  disabled={masterDisabled}
                  onChange={(v) => patch({ optimisationCacheTtl: v })}
                />
                <NumberField
                  label="Stale-while-revalidate"
                  hint="Serve stale for this many seconds while revalidating in the background. 0 disables."
                  value={draft.optimisationCacheSwr}
                  min={0}
                  max={3600}
                  suffix="sec"
                  disabled={masterDisabled}
                  onChange={(v) => patch({ optimisationCacheSwr: v })}
                />
              </div>
            )}

            {draft.optimisationCacheEnabled && (
              <ToggleField
                label="Vary by Accept header"
                hint="Adds Vary: Accept so CDN edges cache WebP and JPEG/PNG responses in separate buckets."
                checked={draft.varyByAccept}
                disabled={masterDisabled}
                onChange={(v) => patch({ varyByAccept: v })}
              />
            )}
          </Section>

          {/* ── 7. Image Resizing Cache ───────────────────────────────────── */}
          <Section
            title="Image Resizing Cache"
            hint="On-demand resized variants — (source URL, width, height, quality) tuples — are kept in an LRU cache so the same dimensions are never re-encoded twice."
            defaultOpen={false}
            icon={<Eraser size={16} />}
          >
            <ToggleField
              label="Enable resizing cache"
              hint="Resized image variants are stored and served from the in-process LRU cache."
              checked={draft.resizingCacheEnabled}
              disabled={masterDisabled}
              onChange={(v) => patch({ resizingCacheEnabled: v })}
            />

            {draft.resizingCacheEnabled && (
              <>
                <div className="mt-2 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <NumberField
                    label="Cache TTL"
                    hint="How long a resized variant is kept before re-generation."
                    value={draft.resizingCacheTtl}
                    min={0}
                    max={604800}
                    suffix="sec"
                    disabled={masterDisabled}
                    onChange={(v) => patch({ resizingCacheTtl: v })}
                  />
                  <NumberField
                    label="Max cache entries"
                    hint="LRU eviction kicks in when this entry count is reached."
                    value={draft.resizingCacheMaxEntries}
                    min={100}
                    max={50000}
                    suffix="entries"
                    disabled={masterDisabled}
                    onChange={(v) => patch({ resizingCacheMaxEntries: v })}
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <SelectField<ImageFit>
                    label="Default fit mode"
                    hint="Used when the caller doesn't specify a fit parameter."
                    value={draft.defaultFit}
                    options={IMAGE_FIT_OPTIONS.map((f) => ({ value: f, label: f.charAt(0).toUpperCase() + f.slice(1) }))}
                    disabled={masterDisabled}
                    onChange={(v) => patch({ defaultFit: v })}
                  />
                  <NumberField
                    label="Default quality"
                    hint="Used when the caller doesn't specify a quality parameter."
                    value={draft.defaultQuality}
                    min={1}
                    max={100}
                    suffix="/ 100"
                    disabled={masterDisabled}
                    onChange={(v) => patch({ defaultQuality: v })}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm font-semibold text-white">Max resize dimensions</span>
                  <span className="text-xs text-text-faint">
                    Requests exceeding these dimensions are rejected (429) to prevent abuse.
                  </span>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/60">W</span>
                      <input
                        type="number"
                        value={draft.maxResizeWidth}
                        min={16}
                        max={8192}
                        disabled={masterDisabled}
                        onChange={(e) => patch({ maxResizeWidth: Math.min(8192, Math.max(16, Number(e.target.value) || 16)) })}
                        className="w-28 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50"
                      />
                      <span className="text-xs text-text-faint">px</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/60">H</span>
                      <input
                        type="number"
                        value={draft.maxResizeHeight}
                        min={16}
                        max={8192}
                        disabled={masterDisabled}
                        onChange={(e) => patch({ maxResizeHeight: Math.min(8192, Math.max(16, Number(e.target.value) || 16)) })}
                        className="w-28 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50"
                      />
                      <span className="text-xs text-text-faint">px</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </Section>

          {/* ── Purge ─────────────────────────────────────────────────────── */}
          <Section
            title="Purge image cache"
            hint="Force-clear stored thumbnails, resized variants, or WebP / AVIF transcodes. Has no effect if the corresponding cache layer is disabled."
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
