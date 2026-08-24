"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Award,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Eraser,
  Flame,
  Gamepad2,
  Globe2,
  Loader2,
  RefreshCw,
  Save,
  Shapes,
  Tag,
  Trash2,
  UserCog,
  XCircle,
  Zap,
} from "lucide-react";
import {
  mapMetadataCacheRow,
  DEFAULT_METADATA_CACHE_SETTINGS,
  METADATA_NAMESPACE_CATALOG,
  CATEGORIES_TTL_LIMITS,
  CATEGORIES_MAX_ENTRIES_LIMITS,
  TAGS_TTL_LIMITS,
  TAGS_MAX_ENTRIES_LIMITS,
  DEVELOPERS_TTL_LIMITS,
  DEVELOPERS_MIN_GAMES_LIMITS,
  DEVELOPERS_MAX_RESULTS_LIMITS,
  PUBLISHERS_TTL_LIMITS,
  PUBLISHERS_MIN_GAMES_LIMITS,
  PUBLISHERS_MAX_RESULTS_LIMITS,
  GAME_METADATA_TTL_LIMITS,
  GAME_METADATA_MAX_ENTRIES_LIMITS,
  SEO_METADATA_TTL_LIMITS,
  SEO_METADATA_MAX_ENTRIES_LIMITS,
  type MetadataCacheSettings,
  type MetadataPurgeScope,
  type DeveloperSortBy,
  type PublisherSortBy,
  type SeoEntityType,
} from "@/lib/metadata-cache-settings";
import type { MetadataCacheStats, MetadataCacheNamespace } from "@/lib/metadata-cache";

// ── Local sub-components ────────────────────────────────────────────────────
// Duplicated per-file rather than shared, matching the established
// pattern across every Cache*AdminClient (see CacheSearchAdminClient /
// CacheSessionAdminClient / CacheFragmentAdminClient).

function Section({
  title,
  hint,
  icon,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
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
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">{title}</h2>
              {badge}
            </div>
            {hint && open && <p className="mt-0.5 max-w-2xl text-xs text-text-faint">{hint}</p>}
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

function WiredBadge({ wired }: { wired: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
        wired ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-text-faint"
      }`}
    >
      {wired ? "live in production" : "warm/preview only"}
    </span>
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
        className="admin-input w-64"
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

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Static option lists ──────────────────────────────────────────────────

const DEVELOPER_SORT_OPTIONS: { value: DeveloperSortBy; label: string }[] = [
  { value: "game_count", label: "Most games first" },
  { value: "name", label: "Alphabetical" },
];

const PUBLISHER_SORT_OPTIONS: { value: PublisherSortBy; label: string }[] = [
  { value: "game_count", label: "Most games first" },
  { value: "name", label: "Alphabetical" },
];

const ENTITY_TYPE_OPTIONS: { value: SeoEntityType; label: string; disabled?: boolean }[] = [
  { value: "games", label: "Games" },
  { value: "categories", label: "Categories" },
  { value: "tags", label: "Tags" },
  { value: "pages", label: "Pages (no resolver yet)", disabled: true },
];

const NAMESPACE_OPTIONS: { value: MetadataCacheNamespace; label: string }[] = [
  { value: "categories", label: "Categories" },
  { value: "tags", label: "Tags" },
  { value: "developers", label: "Developers" },
  { value: "publishers", label: "Publishers" },
  { value: "games", label: "Game Metadata" },
  { value: "seo", label: "SEO Metadata" },
];

const NAMESPACE_KEY_PLACEHOLDER: Record<MetadataCacheNamespace, string> = {
  categories: "e.g. puzzle",
  tags: "e.g. multiplayer",
  developers: "e.g. Blitz Studios",
  publishers: "e.g. Mofigames Originals",
  games: "e.g. dragon-quest",
  seo: "e.g. dragon-quest",
};

// ── API response shapes ──────────────────────────────────────────────────

interface FacetRow {
  developer?: string;
  publisher?: string;
  game_count: number;
  avg_rating: number | null;
  computed_at: string;
}

interface WarmResult {
  scope: string;
  attempted: number;
  warmed: number;
  tookMs: number;
}

interface PreviewResult {
  namespace: MetadataCacheNamespace;
  key: string;
  entityType: SeoEntityType | null;
  found: boolean;
  cacheHit: boolean;
  tookMs: number;
  value: unknown;
}

export function CacheMetadataAdminClient() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<MetadataCacheSettings>(DEFAULT_METADATA_CACHE_SETTINGS);
  const [draft, setDraft] = useState<MetadataCacheSettings>(DEFAULT_METADATA_CACHE_SETTINGS);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [liveStats, setLiveStats] = useState<MetadataCacheStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [purgingScope, setPurgingScope] = useState<MetadataPurgeScope | null>(null);
  const [warmingScope, setWarmingScope] = useState<MetadataCacheNamespace | null>(null);
  const [warmResult, setWarmResult] = useState<WarmResult | null>(null);
  const [warmError, setWarmError] = useState<string | null>(null);

  const [developerFacets, setDeveloperFacets] = useState<FacetRow[]>([]);
  const [publisherFacets, setPublisherFacets] = useState<FacetRow[]>([]);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [recomputingScope, setRecomputingScope] = useState<"developers" | "publishers" | null>(null);

  const [previewNamespace, setPreviewNamespace] = useState<MetadataCacheNamespace>("games");
  const [previewKey, setPreviewKey] = useState("");
  const [previewEntityType, setPreviewEntityType] = useState<SeoEntityType>("games");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  // ── Load ───────────────────────────────────────────────────────────────

  const loadSettings = useCallback(() => {
    return fetch("/api/admin/cache/metadata/settings")
      .then((r) => r.json())
      .then((d) => {
        const mapped = mapMetadataCacheRow(d.settings);
        setSettings(mapped);
        setDraft(mapped);
      })
      .catch(() => {
        setSettings(DEFAULT_METADATA_CACHE_SETTINGS);
        setDraft(DEFAULT_METADATA_CACHE_SETTINGS);
      });
  }, []);

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    return fetch("/api/admin/cache/metadata/stats")
      .then((r) => r.json())
      .then((d) => setLiveStats(d.stats ?? null))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const loadFacets = useCallback(() => {
    setFacetsLoading(true);
    return Promise.all([
      fetch("/api/admin/cache/metadata/facets?scope=developers")
        .then((r) => r.json())
        .then((d) => setDeveloperFacets(d.facets ?? [])),
      fetch("/api/admin/cache/metadata/facets?scope=publishers")
        .then((r) => r.json())
        .then((d) => setPublisherFacets(d.facets ?? [])),
    ])
      .catch(() => {})
      .finally(() => setFacetsLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([loadSettings(), loadStats(), loadFacets()]).finally(() => setLoading(false));
    // Light auto-refresh so the in-process cache numbers don't look
    // frozen while an admin has this open — same as Fragment/Search Cache.
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [loadSettings, loadStats, loadFacets]);

  // ── Patch helper ──────────────────────────────────────────────────────

  const patch = useCallback(<K extends keyof MetadataCacheSettings>(key: K, value: MetadataCacheSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleEntityType = useCallback((type: SeoEntityType) => {
    setDraft((prev) => {
      const has = prev.seoMetadataEntityTypes.includes(type);
      const next = has
        ? prev.seoMetadataEntityTypes.filter((t) => t !== type)
        : [...prev.seoMetadataEntityTypes, type];
      return { ...prev, seoMetadataEntityTypes: next.length > 0 ? next : prev.seoMetadataEntityTypes };
    });
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveStatus("saving");
    setErrorMsg(null);
    try {
      const body: Record<string, unknown> = { ...draft };
      delete body.updatedAt;
      delete body.lastPurgedAt;
      delete body.lastPurgeSummary;
      delete body.developersLastRefreshedAt;
      delete body.developersLastRefreshCount;
      delete body.publishersLastRefreshedAt;
      delete body.publishersLastRefreshCount;

      const res = await fetch("/api/admin/cache/metadata/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      const updated = mapMetadataCacheRow(data.settings);
      setSettings(updated);
      setDraft(updated);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Save failed.");
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // ── Purge ─────────────────────────────────────────────────────────────

  const handlePurge = async (scope: MetadataPurgeScope) => {
    setPurgingScope(scope);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/cache/metadata/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Purge failed.");
      if (data.settings) {
        const updated = mapMetadataCacheRow(data.settings);
        setSettings(updated);
        setDraft((prev) => (isDirty ? prev : updated));
      }
      await loadStats();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Purge failed.");
    } finally {
      setPurgingScope(null);
    }
  };

  // ── Warm ──────────────────────────────────────────────────────────────

  const handleWarm = async (scope: MetadataCacheNamespace) => {
    setWarmingScope(scope);
    setWarmError(null);
    setWarmResult(null);
    try {
      const res = await fetch("/api/admin/cache/metadata/warm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Warm failed.");
      setWarmResult(data.result);
      await loadStats();
    } catch (err) {
      setWarmError(err instanceof Error ? err.message : "Warm failed.");
    } finally {
      setWarmingScope(null);
    }
  };

  // ── Developers / Publishers: recompute ───────────────────────────────

  const handleRecomputeFacets = async (scope: "developers" | "publishers") => {
    setRecomputingScope(scope);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/cache/metadata/recompute-facets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Recompute failed.");
      if (data.settings) {
        const updated = mapMetadataCacheRow(data.settings);
        setSettings(updated);
        setDraft((prev) => (isDirty ? prev : updated));
      }
      if (data.facets) {
        if (scope === "developers") setDeveloperFacets(data.facets);
        else setPublisherFacets(data.facets);
      }
      await loadStats();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Recompute failed.");
    } finally {
      setRecomputingScope(null);
    }
  };

  // ── Test a lookup ─────────────────────────────────────────────────────

  const handlePreview = async () => {
    if (!previewKey.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/admin/cache/metadata/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          namespace: previewNamespace,
          key: previewKey.trim(),
          ...(previewNamespace === "seo" ? { entityType: previewEntityType } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed.");
      setPreviewResult(data.result);
      await loadStats();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-faint">
        <Loader2 size={16} className="animate-spin" /> Loading Metadata Cache settings…
      </div>
    );
  }

  const statFor = (ns: MetadataCacheNamespace) => liveStats?.namespaces.find((n) => n.namespace === ns) ?? null;

  return (
    <div className="max-w-3xl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Metadata Cache</h1>
          <p className="mt-1 max-w-xl text-sm text-text-faint">
            Categories, Tags, Developers, Publishers, Game Metadata, and SEO Metadata — six lookup-shaped caches, distinct
            from Fragment Cache&apos;s listing/grid caches. Tags and Game Metadata are wired into real production call
            sites; the rest are fully functional against live data via Warm and Test below.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={loadStats}
            disabled={statsLoading}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-60"
          >
            {statsLoading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Refresh Stats
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saveStatus === "saving"}
            className="flex items-center gap-1.5 rounded-full bg-[var(--color-menu-yellow)] px-4 py-2 text-xs font-bold text-black hover:opacity-90 disabled:opacity-50"
          >
            {saveStatus === "saving" ? (
              <Loader2 size={13} className="animate-spin" />
            ) : saveStatus === "saved" ? (
              <Check size={13} />
            ) : (
              <Save size={13} />
            )}
            {saveStatus === "saved" ? "Saved" : "Save Changes"}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-semibold text-red-400">
          {errorMsg}
        </div>
      )}

      {/* ── Live overview ───────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatChip label="Total entries" value={liveStats ? String(liveStats.totalEntries) : "—"} tone="neutral" />
        <StatChip
          label="Approx. size"
          value={liveStats ? formatBytes(liveStats.totalApproxBytes) : "—"}
          tone="neutral"
        />
        <StatChip
          label="Namespaces enabled"
          value={`${
            [
              draft.categoriesEnabled,
              draft.tagsEnabled,
              draft.developersEnabled,
              draft.publishersEnabled,
              draft.gameMetadataEnabled,
              draft.seoMetadataEnabled,
            ].filter(Boolean).length
          } / 6`}
          tone="neutral"
        />
      </div>

      <div className="mb-4 overflow-hidden rounded-2xl bg-white/5">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-text-faint">
              <th className="px-4 py-2.5">Namespace</th>
              <th className="px-4 py-2.5">Entries</th>
              <th className="px-4 py-2.5">Size</th>
              <th className="px-4 py-2.5">Hit rate</th>
              <th className="px-4 py-2.5">Hits</th>
              <th className="px-4 py-2.5">Misses</th>
              <th className="px-4 py-2.5">Bypassed</th>
            </tr>
          </thead>
          <tbody>
            {NAMESPACE_OPTIONS.map(({ value, label }) => {
              const s = statFor(value);
              return (
                <tr key={value} className="border-t border-white/5">
                  <td className="px-4 py-2.5 font-semibold text-white">{label}</td>
                  <td className="px-4 py-2.5 text-white/70">{s ? s.entries : "—"}</td>
                  <td className="px-4 py-2.5 text-white/70">{s ? formatBytes(s.approxBytes) : "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        s && s.hitRate !== null && s.hitRate >= 0.5
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-400"
                      }`}
                    >
                      {formatPercent(s?.hitRate ?? null)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-white/50">{s ? s.hits : "—"}</td>
                  <td className="px-4 py-2.5 text-white/50">{s ? s.misses : "—"}</td>
                  <td className="px-4 py-2.5 text-white/50">{s ? s.bypassed : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
        <p className="text-xs text-text-faint">
          Last purged {timeAgo(settings.lastPurgedAt)}
          {settings.lastPurgeSummary
            ? ` — ${settings.lastPurgeSummary.scope}, ${settings.lastPurgeSummary.entriesRemoved} entr${
                settings.lastPurgeSummary.entriesRemoved === 1 ? "y" : "ies"
              } removed`
            : ""}
          .
        </p>
        <div className="flex flex-wrap gap-2">
          {NAMESPACE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => handlePurge(value)}
              disabled={purgingScope !== null}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/10 disabled:opacity-50"
            >
              {purgingScope === value ? <Loader2 size={12} className="animate-spin" /> : <Eraser size={12} />}
              Purge {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => handlePurge("all")}
            disabled={purgingScope !== null}
            className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1.5 text-[11px] font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
          >
            {purgingScope === "all" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
            Purge All
          </button>
        </div>
      </div>

      {/* ── 1. Categories ───────────────────────────────────────────────── */}
      <Section
        title="Categories"
        icon={<Shapes size={16} />}
        badge={<WiredBadge wired={METADATA_NAMESPACE_CATALOG.categories.wired} />}
        hint={METADATA_NAMESPACE_CATALOG.categories.description}
      >
        <ToggleField
          label="Categories Cache"
          checked={draft.categoriesEnabled}
          onChange={(v) => patch("categoriesEnabled", v)}
        />
        <div
          className={`flex flex-col gap-4 border-t border-white/10 pt-4 ${!draft.categoriesEnabled ? "opacity-50" : ""}`}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Cache TTL"
              value={draft.categoriesTtlSeconds}
              min={CATEGORIES_TTL_LIMITS.min}
              max={CATEGORIES_TTL_LIMITS.max}
              suffix="seconds"
              disabled={!draft.categoriesEnabled}
              onChange={(v) => patch("categoriesTtlSeconds", v)}
            />
            <NumberField
              label="Max entries"
              hint="LRU cap on distinct category slugs held at once."
              value={draft.categoriesMaxEntries}
              min={CATEGORIES_MAX_ENTRIES_LIMITS.min}
              max={CATEGORIES_MAX_ENTRIES_LIMITS.max}
              disabled={!draft.categoriesEnabled}
              onChange={(v) => patch("categoriesMaxEntries", v)}
            />
          </div>
          <ToggleField
            label="Include SEO fields"
            hint="Title, description, canonical URL, focus keyword, index directive."
            checked={draft.categoriesIncludeSeoFields}
            disabled={!draft.categoriesEnabled}
            onChange={(v) => patch("categoriesIncludeSeoFields", v)}
          />
          <ToggleField
            label="Include live game count"
            hint="One extra count(*) query per cache miss."
            checked={draft.categoriesIncludeGameCounts}
            disabled={!draft.categoriesEnabled}
            onChange={(v) => patch("categoriesIncludeGameCounts", v)}
          />
        </div>
        <div className="border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => handleWarm("categories")}
            disabled={warmingScope !== null || !draft.categoriesEnabled}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {warmingScope === "categories" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            Warm Cache Now
          </button>
          {warmResult?.scope === "categories" && (
            <p className="mt-2 text-[11px] text-text-faint">
              Warmed {warmResult.warmed}/{warmResult.attempted} categories in {warmResult.tookMs}ms.
            </p>
          )}
          {warmError && warmingScope === null && <div className="mt-2"><ResultBanner ok={false} message={warmError} /></div>}
        </div>
      </Section>

      {/* ── 2. Tags ─────────────────────────────────────────────────────── */}
      <Section
        title="Tags"
        icon={<Tag size={16} />}
        badge={<WiredBadge wired={METADATA_NAMESPACE_CATALOG.tags.wired} />}
        hint={METADATA_NAMESPACE_CATALOG.tags.description}
      >
        <ToggleField label="Tags Cache" checked={draft.tagsEnabled} onChange={(v) => patch("tagsEnabled", v)} />
        <div className={`flex flex-col gap-4 border-t border-white/10 pt-4 ${!draft.tagsEnabled ? "opacity-50" : ""}`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Cache TTL"
              value={draft.tagsTtlSeconds}
              min={TAGS_TTL_LIMITS.min}
              max={TAGS_TTL_LIMITS.max}
              suffix="seconds"
              disabled={!draft.tagsEnabled}
              onChange={(v) => patch("tagsTtlSeconds", v)}
            />
            <NumberField
              label="Max entries"
              value={draft.tagsMaxEntries}
              min={TAGS_MAX_ENTRIES_LIMITS.min}
              max={TAGS_MAX_ENTRIES_LIMITS.max}
              disabled={!draft.tagsEnabled}
              onChange={(v) => patch("tagsMaxEntries", v)}
            />
          </div>
          <ToggleField
            label="Include SEO fields"
            checked={draft.tagsIncludeSeoFields}
            disabled={!draft.tagsEnabled}
            onChange={(v) => patch("tagsIncludeSeoFields", v)}
          />
          <ToggleField
            label="Include usage counts"
            hint="How many games and posts carry this tag — two extra count(*) queries per miss."
            checked={draft.tagsIncludeUsageCounts}
            disabled={!draft.tagsEnabled}
            onChange={(v) => patch("tagsIncludeUsageCounts", v)}
          />
        </div>
        <div className="border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => handleWarm("tags")}
            disabled={warmingScope !== null || !draft.tagsEnabled}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {warmingScope === "tags" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            Warm Cache Now
          </button>
          {warmResult?.scope === "tags" && (
            <p className="mt-2 text-[11px] text-text-faint">
              Warmed {warmResult.warmed}/{warmResult.attempted} tags in {warmResult.tookMs}ms.
            </p>
          )}
        </div>
      </Section>

      {/* ── 3. Developers ───────────────────────────────────────────────── */}
      <Section
        title="Developers"
        icon={<UserCog size={16} />}
        badge={<WiredBadge wired={METADATA_NAMESPACE_CATALOG.developers.wired} />}
        hint={METADATA_NAMESPACE_CATALOG.developers.description}
      >
        <ToggleField
          label="Developers Cache"
          checked={draft.developersEnabled}
          onChange={(v) => patch("developersEnabled", v)}
        />
        <div
          className={`grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2 ${!draft.developersEnabled ? "opacity-50" : ""}`}
        >
          <NumberField
            label="Cache TTL"
            hint="How long the in-process read of the leaderboard is reused."
            value={draft.developersTtlSeconds}
            min={DEVELOPERS_TTL_LIMITS.min}
            max={DEVELOPERS_TTL_LIMITS.max}
            suffix="seconds"
            disabled={!draft.developersEnabled}
            onChange={(v) => patch("developersTtlSeconds", v)}
          />
          <SelectField
            label="Sort by"
            value={draft.developersSortBy}
            options={DEVELOPER_SORT_OPTIONS}
            disabled={!draft.developersEnabled}
            onChange={(v) => patch("developersSortBy", v)}
          />
          <NumberField
            label="Min games"
            hint="A developer credited on fewer games than this doesn't qualify."
            value={draft.developersMinGames}
            min={DEVELOPERS_MIN_GAMES_LIMITS.min}
            max={DEVELOPERS_MIN_GAMES_LIMITS.max}
            disabled={!draft.developersEnabled}
            onChange={(v) => patch("developersMinGames", v)}
          />
          <NumberField
            label="Max results"
            value={draft.developersMaxResults}
            min={DEVELOPERS_MAX_RESULTS_LIMITS.min}
            max={DEVELOPERS_MAX_RESULTS_LIMITS.max}
            disabled={!draft.developersEnabled}
            onChange={(v) => patch("developersMaxResults", v)}
          />
        </div>

        <div className="border-t border-white/10 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-faint">
              Last recomputed {timeAgo(settings.developersLastRefreshedAt)}
              {settings.developersLastRefreshCount > 0 ? ` — ${settings.developersLastRefreshCount} developers ranked` : ""}.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleWarm("developers")}
                disabled={warmingScope !== null || !draft.developersEnabled}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
              >
                {warmingScope === "developers" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                Warm Cache
              </button>
              <button
                type="button"
                onClick={() => handleRecomputeFacets("developers")}
                disabled={recomputingScope !== null || !draft.developersEnabled}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
              >
                {recomputingScope === "developers" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Recompute Now
              </button>
            </div>
          </div>

          {facetsLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-text-faint">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : developerFacets.length === 0 ? (
            <p className="rounded-xl bg-white/5 px-4 py-3 text-xs text-text-faint">
              No leaderboard yet — click Recompute Now to aggregate every published game&apos;s developer field.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto overflow-x-hidden rounded-xl bg-white/5">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#141414]">
                  <tr className="text-[10px] uppercase tracking-wider text-text-faint">
                    <th className="px-3 py-2">Developer</th>
                    <th className="px-3 py-2">Games</th>
                    <th className="px-3 py-2">Avg. rating</th>
                  </tr>
                </thead>
                <tbody>
                  {developerFacets.map((row) => (
                    <tr key={row.developer} className="border-t border-white/5">
                      <td className="px-3 py-2 font-semibold text-white">{row.developer}</td>
                      <td className="px-3 py-2 text-white/70">{row.game_count}</td>
                      <td className="px-3 py-2 text-white/70">{row.avg_rating !== null ? row.avg_rating.toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {warmResult?.scope === "developers" && (
            <p className="mt-2 text-[11px] text-text-faint">Warmed {warmResult.warmed} developers in {warmResult.tookMs}ms.</p>
          )}
        </div>
      </Section>

      {/* ── 4. Publishers ───────────────────────────────────────────────── */}
      <Section
        title="Publishers"
        icon={<Award size={16} />}
        badge={<WiredBadge wired={METADATA_NAMESPACE_CATALOG.publishers.wired} />}
        hint={METADATA_NAMESPACE_CATALOG.publishers.description}
      >
        <ToggleField
          label="Publishers Cache"
          checked={draft.publishersEnabled}
          onChange={(v) => patch("publishersEnabled", v)}
        />
        <div
          className={`grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2 ${!draft.publishersEnabled ? "opacity-50" : ""}`}
        >
          <NumberField
            label="Cache TTL"
            value={draft.publishersTtlSeconds}
            min={PUBLISHERS_TTL_LIMITS.min}
            max={PUBLISHERS_TTL_LIMITS.max}
            suffix="seconds"
            disabled={!draft.publishersEnabled}
            onChange={(v) => patch("publishersTtlSeconds", v)}
          />
          <SelectField
            label="Sort by"
            value={draft.publishersSortBy}
            options={PUBLISHER_SORT_OPTIONS}
            disabled={!draft.publishersEnabled}
            onChange={(v) => patch("publishersSortBy", v)}
          />
          <NumberField
            label="Min games"
            value={draft.publishersMinGames}
            min={PUBLISHERS_MIN_GAMES_LIMITS.min}
            max={PUBLISHERS_MIN_GAMES_LIMITS.max}
            disabled={!draft.publishersEnabled}
            onChange={(v) => patch("publishersMinGames", v)}
          />
          <NumberField
            label="Max results"
            value={draft.publishersMaxResults}
            min={PUBLISHERS_MAX_RESULTS_LIMITS.min}
            max={PUBLISHERS_MAX_RESULTS_LIMITS.max}
            disabled={!draft.publishersEnabled}
            onChange={(v) => patch("publishersMaxResults", v)}
          />
        </div>

        <div className="border-t border-white/10 pt-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-text-faint">
              Last recomputed {timeAgo(settings.publishersLastRefreshedAt)}
              {settings.publishersLastRefreshCount > 0 ? ` — ${settings.publishersLastRefreshCount} publishers ranked` : ""}.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleWarm("publishers")}
                disabled={warmingScope !== null || !draft.publishersEnabled}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
              >
                {warmingScope === "publishers" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                Warm Cache
              </button>
              <button
                type="button"
                onClick={() => handleRecomputeFacets("publishers")}
                disabled={recomputingScope !== null || !draft.publishersEnabled}
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
              >
                {recomputingScope === "publishers" ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                Recompute Now
              </button>
            </div>
          </div>

          {facetsLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-text-faint">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : publisherFacets.length === 0 ? (
            <p className="rounded-xl bg-white/5 px-4 py-3 text-xs text-text-faint">
              No leaderboard yet — click Recompute Now to aggregate every published game&apos;s publisher field.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto overflow-x-hidden rounded-xl bg-white/5">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-[#141414]">
                  <tr className="text-[10px] uppercase tracking-wider text-text-faint">
                    <th className="px-3 py-2">Publisher</th>
                    <th className="px-3 py-2">Games</th>
                    <th className="px-3 py-2">Avg. rating</th>
                  </tr>
                </thead>
                <tbody>
                  {publisherFacets.map((row) => (
                    <tr key={row.publisher} className="border-t border-white/5">
                      <td className="px-3 py-2 font-semibold text-white">{row.publisher}</td>
                      <td className="px-3 py-2 text-white/70">{row.game_count}</td>
                      <td className="px-3 py-2 text-white/70">{row.avg_rating !== null ? row.avg_rating.toFixed(2) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {warmResult?.scope === "publishers" && (
            <p className="mt-2 text-[11px] text-text-faint">Warmed {warmResult.warmed} publishers in {warmResult.tookMs}ms.</p>
          )}
        </div>
      </Section>

      {/* ── 5. Game Metadata ────────────────────────────────────────────── */}
      <Section
        title="Game Metadata"
        icon={<Gamepad2 size={16} />}
        badge={<WiredBadge wired={METADATA_NAMESPACE_CATALOG.games.wired} />}
        hint={METADATA_NAMESPACE_CATALOG.games.description}
      >
        <ToggleField
          label="Game Metadata Cache"
          checked={draft.gameMetadataEnabled}
          onChange={(v) => patch("gameMetadataEnabled", v)}
        />
        <div
          className={`flex flex-col gap-4 border-t border-white/10 pt-4 ${!draft.gameMetadataEnabled ? "opacity-50" : ""}`}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Cache TTL"
              hint="Short by design — a game's stats (plays, rating) change often."
              value={draft.gameMetadataTtlSeconds}
              min={GAME_METADATA_TTL_LIMITS.min}
              max={GAME_METADATA_TTL_LIMITS.max}
              suffix="seconds"
              disabled={!draft.gameMetadataEnabled}
              onChange={(v) => patch("gameMetadataTtlSeconds", v)}
            />
            <NumberField
              label="Max entries"
              hint="LRU cap on distinct game slugs held at once."
              value={draft.gameMetadataMaxEntries}
              min={GAME_METADATA_MAX_ENTRIES_LIMITS.min}
              max={GAME_METADATA_MAX_ENTRIES_LIMITS.max}
              disabled={!draft.gameMetadataEnabled}
              onChange={(v) => patch("gameMetadataMaxEntries", v)}
            />
          </div>
          <ToggleField
            label="Include related counts"
            hint="Rating count and favorite count as a point-in-time snapshot."
            checked={draft.gameMetadataIncludeRelatedCounts}
            disabled={!draft.gameMetadataEnabled}
            onChange={(v) => patch("gameMetadataIncludeRelatedCounts", v)}
          />
          <ToggleField
            label="Bypass for admins"
            hint="An admin always sees a live read, never a cached snapshot — on by default so editing a game and immediately previewing it always shows the fresh save."
            checked={draft.gameMetadataBypassForAdmins}
            disabled={!draft.gameMetadataEnabled}
            onChange={(v) => patch("gameMetadataBypassForAdmins", v)}
          />
        </div>
        <div className="border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => handleWarm("games")}
            disabled={warmingScope !== null || !draft.gameMetadataEnabled}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {warmingScope === "games" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            Warm Cache Now
          </button>
          <p className="mt-2 text-[11px] text-text-faint">Warms the 25 most recently updated published games.</p>
          {warmResult?.scope === "games" && (
            <p className="mt-1 text-[11px] text-text-faint">
              Warmed {warmResult.warmed}/{warmResult.attempted} games in {warmResult.tookMs}ms.
            </p>
          )}
        </div>
      </Section>

      {/* ── 6. SEO Metadata ─────────────────────────────────────────────── */}
      <Section
        title="SEO Metadata"
        icon={<Globe2 size={16} />}
        badge={<WiredBadge wired={METADATA_NAMESPACE_CATALOG.seo.wired} />}
        hint={METADATA_NAMESPACE_CATALOG.seo.description}
      >
        <ToggleField
          label="SEO Metadata Cache"
          checked={draft.seoMetadataEnabled}
          onChange={(v) => patch("seoMetadataEnabled", v)}
        />
        <div
          className={`flex flex-col gap-4 border-t border-white/10 pt-4 ${!draft.seoMetadataEnabled ? "opacity-50" : ""}`}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Cache TTL"
              value={draft.seoMetadataTtlSeconds}
              min={SEO_METADATA_TTL_LIMITS.min}
              max={SEO_METADATA_TTL_LIMITS.max}
              suffix="seconds"
              disabled={!draft.seoMetadataEnabled}
              onChange={(v) => patch("seoMetadataTtlSeconds", v)}
            />
            <NumberField
              label="Max entries"
              value={draft.seoMetadataMaxEntries}
              min={SEO_METADATA_MAX_ENTRIES_LIMITS.min}
              max={SEO_METADATA_MAX_ENTRIES_LIMITS.max}
              disabled={!draft.seoMetadataEnabled}
              onChange={(v) => patch("seoMetadataMaxEntries", v)}
            />
          </div>
          <div className={`flex flex-col gap-1.5 ${!draft.seoMetadataEnabled ? "opacity-50" : ""}`}>
            <span className="text-sm font-semibold text-white">Entity types</span>
            <span className="text-xs text-text-faint">Which record types this namespace resolves and caches.</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {ENTITY_TYPE_OPTIONS.map((opt) => {
                const active = draft.seoMetadataEntityTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={!draft.seoMetadataEnabled || opt.disabled}
                    onClick={() => toggleEntityType(opt.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      active ? "bg-[var(--color-menu-yellow)] text-black" : "bg-white/10 text-white/70 hover:bg-white/15"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <ToggleField
            label="Include JSON-LD"
            hint="Whether structured-data (VideoGame/CollectionPage schema) flags are considered part of the cached payload."
            checked={draft.seoMetadataIncludeJsonLd}
            disabled={!draft.seoMetadataEnabled}
            onChange={(v) => patch("seoMetadataIncludeJsonLd", v)}
          />
        </div>
        <div className="border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => handleWarm("seo")}
            disabled={warmingScope !== null || !draft.seoMetadataEnabled}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {warmingScope === "seo" ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
            Warm Cache Now
          </button>
          <p className="mt-2 text-[11px] text-text-faint">
            Resolves and caches SEO metadata for a sample of games plus every category and tag, via the same
            buildGameMetadata()/buildCategoryMetadata() functions the live site uses.
          </p>
          {warmResult?.scope === "seo" && (
            <p className="mt-1 text-[11px] text-text-faint">
              Warmed {warmResult.warmed}/{warmResult.attempted} items in {warmResult.tookMs}ms.
            </p>
          )}
        </div>
      </Section>

      {/* ── Test a lookup ───────────────────────────────────────────────── */}
      <Section
        title="Test a Lookup"
        icon={<Flame size={16} />}
        hint="Runs one real lookup through the exact cache pipeline a live call site uses — the same getOrSetMetadataCache() function, not a mock."
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <SelectField
            label="Namespace"
            value={previewNamespace}
            options={NAMESPACE_OPTIONS}
            onChange={(v) => setPreviewNamespace(v)}
          />
          {previewNamespace === "seo" && (
            <SelectField
              label="Entity type"
              value={previewEntityType}
              options={ENTITY_TYPE_OPTIONS.filter((o) => !o.disabled)}
              onChange={(v) => setPreviewEntityType(v)}
            />
          )}
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-semibold text-white">Key</span>
            <input
              value={previewKey}
              onChange={(e) => setPreviewKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handlePreview();
              }}
              placeholder={NAMESPACE_KEY_PLACEHOLDER[previewNamespace]}
              className="admin-input"
            />
          </div>
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewLoading || !previewKey.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-yellow)] px-4 py-2 text-xs font-bold text-black hover:opacity-90 disabled:opacity-50"
          >
            {previewLoading ? <Loader2 size={13} className="animate-spin" /> : <Flame size={13} />}
            Test
          </button>
        </div>

        {previewError && <ResultBanner ok={false} message={previewError} />}

        {previewResult && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${previewResult.cacheHit ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}
              >
                {previewResult.cacheHit ? "cache hit" : "cache miss"}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${previewResult.found ? "bg-white/10 text-white/70" : "bg-hot/15 text-hot"}`}
              >
                {previewResult.found ? "found" : "not found"}
              </span>
              <span className="text-[11px] text-text-faint">Took {previewResult.tookMs}ms.</span>
            </div>
            {previewResult.found && (
              <pre className="max-h-96 overflow-auto rounded-xl bg-white/5 p-4 text-[11px] leading-relaxed text-white/80">
                {JSON.stringify(previewResult.value, null, 2)}
              </pre>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
