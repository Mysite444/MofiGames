"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  Check,
  Trash2,
  Video,
  Music,
  PlaySquare,
  MonitorPlay,
  Camera,
  Film,
} from "lucide-react";
import {
  mapMediaCacheRow,
  DEFAULT_MEDIA_CACHE_SETTINGS,
  type MediaCacheSettings,
  VIDEO_TTL_LIMITS,
  VIDEO_SWR_LIMITS,
  VIDEO_SIZE_LIMITS,
  AUDIO_TTL_LIMITS,
  AUDIO_SWR_LIMITS,
  AUDIO_SIZE_LIMITS,
  PREVIEWS_TTL_LIMITS,
  PREVIEWS_SWR_LIMITS,
  LOADING_TTL_LIMITS,
  LOADING_SWR_LIMITS,
  SCREENSHOT_TTL_LIMITS,
  SCREENSHOT_SWR_LIMITS,
} from "@/lib/media-cache-settings";
import type { MediaPurgeScope } from "@/lib/validation-media-cache";

// ── Shared building blocks (mirrors CacheFeedAdminClient's pattern) ────────────

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
          className="glass w-36 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40 disabled:cursor-not-allowed"
        />
        {suffix && <span className="text-xs text-text-faint">{suffix}</span>}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-faint">{label}</span>
      <span className="font-semibold text-white">{value}</span>
    </div>
  );
}

function formatWhen(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "Never purged";
}

// ── Purge button ───────────────────────────────────────────────────────────────

function PurgeRow({
  scope,
  lastPurgedAt,
  purgingScope,
  purgeError,
  onPurge,
}: {
  scope: MediaPurgeScope;
  lastPurgedAt: string | null;
  purgingScope: MediaPurgeScope | null;
  purgeError: string | null;
  onPurge: (scope: MediaPurgeScope) => void;
}) {
  const isThisScope = purgingScope === scope;
  const isAnyScope = purgingScope !== null;

  return (
    <div className="flex flex-col gap-2 border-t border-white/5 pt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-faint">Last purged: {formatWhen(lastPurgedAt)}</p>
        <button
          type="button"
          onClick={() => onPurge(scope)}
          disabled={isAnyScope}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
        >
          {isThisScope ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {isThisScope ? "Purging…" : "Purge now"}
        </button>
      </div>
      {purgeError && isThisScope && (
        <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{purgeError}</div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

/** Admin → Cache → Media Cache.
 * Five pillars — Videos, Audio, Game Previews, Loading Screens, Screenshots —
 * each with its own TTL, stale-while-revalidate, CDN offload toggle, and
 * dedicated purge scope. All five share a single Supabase settings row
 * (media_cache_settings) and are saved together with one PUT. */
export function CacheMediaAdminClient() {
  const [media, setMedia] = useState<MediaCacheSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [purgingScope, setPurgingScope] = useState<MediaPurgeScope | null>(null);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeSuccess, setPurgeSuccess] = useState<MediaPurgeScope | null>(null);

  function load() {
    fetch("/api/admin/cache/media/settings")
      .then((res) => res.json())
      .then((data) => setMedia(mapMediaCacheRow(data.settings)))
      .catch(() => setMedia(DEFAULT_MEDIA_CACHE_SETTINGS));
  }

  useEffect(() => {
    load();
  }, []);

  function patch(p: Partial<MediaCacheSettings>) {
    setMedia((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  async function save() {
    if (!media) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        enabled: media.enabled,

        videosEnabled:              media.videosEnabled,
        videosCacheTtlSeconds:      media.videosCacheTtlSeconds,
        videosSwrSeconds:           media.videosSwrSeconds,
        videosRangeRequestsEnabled: media.videosRangeRequestsEnabled,
        videosCdnOffloadEnabled:    media.videosCdnOffloadEnabled,
        videosMaxFileSizeMb:        media.videosMaxFileSizeMb,

        audioEnabled:               media.audioEnabled,
        audioCacheTtlSeconds:       media.audioCacheTtlSeconds,
        audioSwrSeconds:            media.audioSwrSeconds,
        audioRangeRequestsEnabled:  media.audioRangeRequestsEnabled,
        audioCdnOffloadEnabled:     media.audioCdnOffloadEnabled,
        audioMaxFileSizeMb:         media.audioMaxFileSizeMb,

        previewsEnabled:            media.previewsEnabled,
        previewsCacheTtlSeconds:    media.previewsCacheTtlSeconds,
        previewsSwrSeconds:         media.previewsSwrSeconds,
        previewsCdnOffloadEnabled:  media.previewsCdnOffloadEnabled,
        previewsEagerLoadEnabled:   media.previewsEagerLoadEnabled,
        previewsAutoplayOnHover:    media.previewsAutoplayOnHover,

        loadingScreensEnabled:           media.loadingScreensEnabled,
        loadingScreensCacheTtlSeconds:   media.loadingScreensCacheTtlSeconds,
        loadingScreensSwrSeconds:        media.loadingScreensSwrSeconds,
        loadingScreensCdnOffloadEnabled: media.loadingScreensCdnOffloadEnabled,
        loadingScreensPrefetchEnabled:   media.loadingScreensPrefetchEnabled,

        screenshotsEnabled:            media.screenshotsEnabled,
        screenshotsCacheTtlSeconds:    media.screenshotsCacheTtlSeconds,
        screenshotsSwrSeconds:         media.screenshotsSwrSeconds,
        screenshotsCdnOffloadEnabled:  media.screenshotsCdnOffloadEnabled,
        screenshotsLazyLoadEnabled:    media.screenshotsLazyLoadEnabled,
        screenshotsWebpConvertEnabled: media.screenshotsWebpConvertEnabled,
      };

      const res = await fetch("/api/admin/cache/media/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save Media Cache settings.");
      setMedia(mapMediaCacheRow(data.settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function purge(scope: MediaPurgeScope) {
    setPurgingScope(scope);
    setPurgeError(null);
    setPurgeSuccess(null);
    try {
      const res = await fetch("/api/admin/cache/media/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Purge failed.");
      if (data.settings) setMedia(mapMediaCacheRow(data.settings));
      if (data.warning) setPurgeError(data.warning);
      else setPurgeSuccess(scope);
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : "Purge failed.");
    } finally {
      setPurgingScope(null);
    }
  }

  if (!media) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Media Cache</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Five media-caching pillars — Videos, Audio, Game Previews, Loading Screens, and Screenshots — each with
            its own TTL, stale-while-revalidate, and CDN offload controls. Settings are saved globally; purges are
            scoped so you can flush one pillar without touching the others.
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

      {/* Global master switch */}
      <Section
        title="Master switch"
        hint="When disabled, none of the five pillars write any Cache-Control headers and all CDN offload is bypassed — useful while migrating storage providers."
      >
        <ToggleField
          label="Enable Media Cache"
          hint="Global on/off. Individual pillar toggles still control behaviour when this is on."
          checked={media.enabled}
          onChange={(v) => patch({ enabled: v })}
        />

        {/* Purge all */}
        <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
          <div>
            <p className="text-sm font-semibold text-white">Purge all media caches</p>
            <p className="text-xs text-text-faint">
              Last global purge: {formatWhen(media.lastPurgedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => purge("all")}
            disabled={purgingScope !== null}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-hot/20 px-4 py-2 text-xs font-bold text-hot hover:bg-hot/30 disabled:opacity-60"
          >
            {purgingScope === "all" ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {purgingScope === "all" ? "Purging…" : "Purge all"}
          </button>
        </div>
        {purgeSuccess === "all" && (
          <p className="text-xs font-semibold text-emerald-400">All media cache pillars purged.</p>
        )}
        {purgeError && purgingScope === null && (
          <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{purgeError}</div>
        )}
      </Section>

      {/* ═════════════════════════ 1. Videos ══════════════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Video size={15} className="text-[var(--color-menu-yellow)]" /> 1. Videos
      </h2>

      <Section
        title="Video caching"
        hint="Applied to long-form video files (.mp4, .webm, .mov). HTTP range requests let clients seek to any timestamp without re-downloading from the origin — essential for any video longer than a few seconds."
      >
        <ToggleField
          label="Enable video cache"
          checked={media.videosEnabled}
          disabled={!media.enabled}
          onChange={(v) => patch({ videosEnabled: v })}
        />
        <NumberField
          label="Cache TTL"
          hint="How long a CDN or browser may serve a cached copy before re-fetching."
          value={media.videosCacheTtlSeconds}
          min={VIDEO_TTL_LIMITS.min}
          max={VIDEO_TTL_LIMITS.max}
          suffix="seconds"
          disabled={!media.enabled || !media.videosEnabled}
          onChange={(v) => patch({ videosCacheTtlSeconds: v })}
        />
        <NumberField
          label="Stale-while-revalidate"
          hint="How much longer a stale copy may be served while a fresh one is fetched in the background. 0 disables."
          value={media.videosSwrSeconds}
          min={VIDEO_SWR_LIMITS.min}
          max={VIDEO_SWR_LIMITS.max}
          suffix="seconds"
          disabled={!media.enabled || !media.videosEnabled}
          onChange={(v) => patch({ videosSwrSeconds: v })}
        />
        <NumberField
          label="Max file size to cache"
          hint="Files larger than this bypass the cache entirely — protects CDN/storage budget."
          value={media.videosMaxFileSizeMb}
          min={VIDEO_SIZE_LIMITS.min}
          max={VIDEO_SIZE_LIMITS.max}
          suffix="MB"
          disabled={!media.enabled || !media.videosEnabled}
          onChange={(v) => patch({ videosMaxFileSizeMb: v })}
        />
        <ToggleField
          label="HTTP Range request support"
          hint="Pass Range headers through to the cache so clients can seek without re-downloading from byte 0. Required for any seekable video player."
          checked={media.videosRangeRequestsEnabled}
          disabled={!media.enabled || !media.videosEnabled}
          onChange={(v) => patch({ videosRangeRequestsEnabled: v })}
        />
        <ToggleField
          label="CDN offload"
          hint="Serve video files from the CDN edge rather than streaming from the origin server on every request."
          checked={media.videosCdnOffloadEnabled}
          disabled={!media.enabled || !media.videosEnabled}
          onChange={(v) => patch({ videosCdnOffloadEnabled: v })}
        />

        <div className="rounded-xl bg-white/5 px-4 py-3">
          <StatRow label="Last purged" value={formatWhen(media.videosLastPurgedAt)} />
        </div>

        <PurgeRow
          scope="videos"
          lastPurgedAt={media.videosLastPurgedAt}
          purgingScope={purgingScope}
          purgeError={purgeError}
          onPurge={purge}
        />
        {purgeSuccess === "videos" && (
          <p className="text-xs font-semibold text-emerald-400">Video cache purged.</p>
        )}
      </Section>

      {/* ═════════════════════════ 2. Audio ═══════════════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Music size={15} className="text-[var(--color-menu-yellow)]" /> 2. Audio
      </h2>

      <Section
        title="Audio caching"
        hint="Applied to audio tracks (.mp3, .ogg, .wav, .flac) including background music, sound effects, and voice-over files. Range requests are required for the Web Audio API and for <audio> seek to work without buffering the whole file."
      >
        <ToggleField
          label="Enable audio cache"
          checked={media.audioEnabled}
          disabled={!media.enabled}
          onChange={(v) => patch({ audioEnabled: v })}
        />
        <NumberField
          label="Cache TTL"
          value={media.audioCacheTtlSeconds}
          min={AUDIO_TTL_LIMITS.min}
          max={AUDIO_TTL_LIMITS.max}
          suffix="seconds"
          disabled={!media.enabled || !media.audioEnabled}
          onChange={(v) => patch({ audioCacheTtlSeconds: v })}
        />
        <NumberField
          label="Stale-while-revalidate"
          hint="0 disables."
          value={media.audioSwrSeconds}
          min={AUDIO_SWR_LIMITS.min}
          max={AUDIO_SWR_LIMITS.max}
          suffix="seconds"
          disabled={!media.enabled || !media.audioEnabled}
          onChange={(v) => patch({ audioSwrSeconds: v })}
        />
        <NumberField
          label="Max file size to cache"
          hint="Audio files larger than this are streamed directly from origin."
          value={media.audioMaxFileSizeMb}
          min={AUDIO_SIZE_LIMITS.min}
          max={AUDIO_SIZE_LIMITS.max}
          suffix="MB"
          disabled={!media.enabled || !media.audioEnabled}
          onChange={(v) => patch({ audioMaxFileSizeMb: v })}
        />
        <ToggleField
          label="HTTP Range request support"
          hint="Enables byte-range seeking for the Web Audio API and <audio> element — without this, the browser must buffer the entire file before playback can start."
          checked={media.audioRangeRequestsEnabled}
          disabled={!media.enabled || !media.audioEnabled}
          onChange={(v) => patch({ audioRangeRequestsEnabled: v })}
        />
        <ToggleField
          label="CDN offload"
          hint="Serve audio files from the CDN edge."
          checked={media.audioCdnOffloadEnabled}
          disabled={!media.enabled || !media.audioEnabled}
          onChange={(v) => patch({ audioCdnOffloadEnabled: v })}
        />

        <div className="rounded-xl bg-white/5 px-4 py-3">
          <StatRow label="Last purged" value={formatWhen(media.audioLastPurgedAt)} />
        </div>

        <PurgeRow
          scope="audio"
          lastPurgedAt={media.audioLastPurgedAt}
          purgingScope={purgingScope}
          purgeError={purgeError}
          onPurge={purge}
        />
        {purgeSuccess === "audio" && (
          <p className="text-xs font-semibold text-emerald-400">Audio cache purged.</p>
        )}
      </Section>

      {/* ════════════════════ 3. Game Previews ════════════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <PlaySquare size={15} className="text-[var(--color-menu-yellow)]" /> 3. Game Previews
      </h2>

      <Section
        title="Game preview caching"
        hint="Short animated clips, GIFs, or video thumbnails shown on game cards and search results. These are fetched frequently and benefit from aggressive CDN caching — a 7-day TTL is a sensible baseline since previews rarely change without a re-upload."
      >
        <ToggleField
          label="Enable preview cache"
          checked={media.previewsEnabled}
          disabled={!media.enabled}
          onChange={(v) => patch({ previewsEnabled: v })}
        />
        <NumberField
          label="Cache TTL"
          hint="7 days (604800 s) is the default — previews don't change often."
          value={media.previewsCacheTtlSeconds}
          min={PREVIEWS_TTL_LIMITS.min}
          max={PREVIEWS_TTL_LIMITS.max}
          suffix="seconds"
          disabled={!media.enabled || !media.previewsEnabled}
          onChange={(v) => patch({ previewsCacheTtlSeconds: v })}
        />
        <NumberField
          label="Stale-while-revalidate"
          hint="0 disables."
          value={media.previewsSwrSeconds}
          min={PREVIEWS_SWR_LIMITS.min}
          max={PREVIEWS_SWR_LIMITS.max}
          suffix="seconds"
          disabled={!media.enabled || !media.previewsEnabled}
          onChange={(v) => patch({ previewsSwrSeconds: v })}
        />
        <ToggleField
          label="CDN offload"
          hint="Serve previews from the CDN edge — recommended, as preview clips are one of the most frequently fetched assets on game listing pages."
          checked={media.previewsCdnOffloadEnabled}
          disabled={!media.enabled || !media.previewsEnabled}
          onChange={(v) => patch({ previewsCdnOffloadEnabled: v })}
        />
        <ToggleField
          label="Eager-load previews"
          hint="Begin fetching preview clips for game cards that are about to scroll into the viewport — trades a little bandwidth for a faster first-frame."
          checked={media.previewsEagerLoadEnabled}
          disabled={!media.enabled || !media.previewsEnabled}
          onChange={(v) => patch({ previewsEagerLoadEnabled: v })}
        />
        <ToggleField
          label="Autoplay on hover"
          hint="Start playing the preview clip when the user's pointer enters a game card. Disable on data-saver or low-power environments."
          checked={media.previewsAutoplayOnHover}
          disabled={!media.enabled || !media.previewsEnabled}
          onChange={(v) => patch({ previewsAutoplayOnHover: v })}
        />

        <div className="rounded-xl bg-white/5 px-4 py-3">
          <StatRow label="Last purged" value={formatWhen(media.previewsLastPurgedAt)} />
        </div>

        <PurgeRow
          scope="previews"
          lastPurgedAt={media.previewsLastPurgedAt}
          purgingScope={purgingScope}
          purgeError={purgeError}
          onPurge={purge}
        />
        {purgeSuccess === "previews" && (
          <p className="text-xs font-semibold text-emerald-400">Game preview cache purged.</p>
        )}
      </Section>

      {/* ══════════════════ 4. Loading Screens ════════════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <MonitorPlay size={15} className="text-[var(--color-menu-yellow)]" /> 4. Loading Screens
      </h2>

      <Section
        title="Loading screen caching"
        hint="Background images and animations displayed while the game engine boots. These are among the most static assets on the platform — once a loading screen is published it almost never changes, so long TTLs (30 days to 1 year) are appropriate."
      >
        <ToggleField
          label="Enable loading screen cache"
          checked={media.loadingScreensEnabled}
          disabled={!media.enabled}
          onChange={(v) => patch({ loadingScreensEnabled: v })}
        />
        <NumberField
          label="Cache TTL"
          hint="30 days (2 592 000 s) default — use Purge now after updating a loading screen."
          value={media.loadingScreensCacheTtlSeconds}
          min={LOADING_TTL_LIMITS.min}
          max={LOADING_TTL_LIMITS.max}
          suffix="seconds"
          disabled={!media.enabled || !media.loadingScreensEnabled}
          onChange={(v) => patch({ loadingScreensCacheTtlSeconds: v })}
        />
        <NumberField
          label="Stale-while-revalidate"
          hint="0 disables."
          value={media.loadingScreensSwrSeconds}
          min={LOADING_SWR_LIMITS.min}
          max={LOADING_SWR_LIMITS.max}
          suffix="seconds"
          disabled={!media.enabled || !media.loadingScreensEnabled}
          onChange={(v) => patch({ loadingScreensSwrSeconds: v })}
        />
        <ToggleField
          label="CDN offload"
          hint="Serve loading screens from the CDN edge."
          checked={media.loadingScreensCdnOffloadEnabled}
          disabled={!media.enabled || !media.loadingScreensEnabled}
          onChange={(v) => patch({ loadingScreensCdnOffloadEnabled: v })}
        />
        <ToggleField
          label="Prefetch on game page load"
          hint="Queue the loading screen asset for prefetch as soon as the user navigates to the game page — eliminates the blank-before-game-starts flash on slower connections."
          checked={media.loadingScreensPrefetchEnabled}
          disabled={!media.enabled || !media.loadingScreensEnabled}
          onChange={(v) => patch({ loadingScreensPrefetchEnabled: v })}
        />

        <div className="rounded-xl bg-white/5 px-4 py-3">
          <StatRow label="Last purged" value={formatWhen(media.loadingScreensLastPurgedAt)} />
        </div>

        <PurgeRow
          scope="loading-screens"
          lastPurgedAt={media.loadingScreensLastPurgedAt}
          purgingScope={purgingScope}
          purgeError={purgeError}
          onPurge={purge}
        />
        {purgeSuccess === "loading-screens" && (
          <p className="text-xs font-semibold text-emerald-400">Loading screen cache purged.</p>
        )}
      </Section>

      {/* ══════════════════════ 5. Screenshots ════════════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Camera size={15} className="text-[var(--color-menu-yellow)]" /> 5. Screenshots
      </h2>

      <Section
        title="Screenshot caching"
        hint="In-game screenshots shown in game detail pages, galleries, and thumbnails. Screenshots change more often than loading screens but far less than live content — a 7-day TTL with lazy loading is a good baseline."
      >
        <ToggleField
          label="Enable screenshot cache"
          checked={media.screenshotsEnabled}
          disabled={!media.enabled}
          onChange={(v) => patch({ screenshotsEnabled: v })}
        />
        <NumberField
          label="Cache TTL"
          hint="7 days (604 800 s) default."
          value={media.screenshotsCacheTtlSeconds}
          min={SCREENSHOT_TTL_LIMITS.min}
          max={SCREENSHOT_TTL_LIMITS.max}
          suffix="seconds"
          disabled={!media.enabled || !media.screenshotsEnabled}
          onChange={(v) => patch({ screenshotsCacheTtlSeconds: v })}
        />
        <NumberField
          label="Stale-while-revalidate"
          hint="0 disables."
          value={media.screenshotsSwrSeconds}
          min={SCREENSHOT_SWR_LIMITS.min}
          max={SCREENSHOT_SWR_LIMITS.max}
          suffix="seconds"
          disabled={!media.enabled || !media.screenshotsEnabled}
          onChange={(v) => patch({ screenshotsSwrSeconds: v })}
        />
        <ToggleField
          label="CDN offload"
          hint="Serve screenshots from the CDN edge."
          checked={media.screenshotsCdnOffloadEnabled}
          disabled={!media.enabled || !media.screenshotsEnabled}
          onChange={(v) => patch({ screenshotsCdnOffloadEnabled: v })}
        />
        <ToggleField
          label="Lazy load"
          hint="Defer loading screenshots that are below the fold — speeds up initial game-page render. Uses the browser-native loading='lazy' attribute."
          checked={media.screenshotsLazyLoadEnabled}
          disabled={!media.enabled || !media.screenshotsEnabled}
          onChange={(v) => patch({ screenshotsLazyLoadEnabled: v })}
        />
        <ToggleField
          label="Convert to WebP at serve time"
          hint="Transcode screenshots to WebP on the fly, reducing payload size for modern browsers. Enable Image Cache → WebP Generation to handle this at upload time instead."
          checked={media.screenshotsWebpConvertEnabled}
          disabled={!media.enabled || !media.screenshotsEnabled}
          onChange={(v) => patch({ screenshotsWebpConvertEnabled: v })}
        />

        <div className="rounded-xl bg-white/5 px-4 py-3">
          <StatRow label="Last purged" value={formatWhen(media.screenshotsLastPurgedAt)} />
        </div>

        <PurgeRow
          scope="screenshots"
          lastPurgedAt={media.screenshotsLastPurgedAt}
          purgingScope={purgingScope}
          purgeError={purgeError}
          onPurge={purge}
        />
        {purgeSuccess === "screenshots" && (
          <p className="text-xs font-semibold text-emerald-400">Screenshot cache purged.</p>
        )}
      </Section>

      {/* Related note */}
      <div className="glass mt-2 rounded-2xl px-5 py-4">
        <div className="flex items-start gap-3">
          <Film size={16} className="mt-0.5 shrink-0 text-text-faint" />
          <div>
            <p className="text-sm font-semibold text-white">Related: Image Cache</p>
            <p className="mt-0.5 text-xs text-text-faint">
              Screenshot WebP/AVIF transcoding at <em>upload time</em> — rather than at serve time — is controlled
              under Admin → Cache → Image Cache. Enable that for permanently smaller originals; enable the WebP toggle
              above for on-the-fly conversion without re-encoding stored files.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
