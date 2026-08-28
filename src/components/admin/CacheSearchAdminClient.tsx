"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  Eraser,
  Eye,
  EyeOff,
  Flame,
  Gauge,
  ListFilter,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
  XCircle,
} from "lucide-react";
import {
  mapSearchCacheRow,
  DEFAULT_SEARCH_CACHE_SETTINGS,
  INDEX_SOURCE_CATALOG,
  SUGGESTIONS_MAX_RESULTS_LIMITS,
  SUGGESTIONS_MIN_CHARS_LIMITS,
  SUGGESTIONS_TTL_LIMITS,
  POPULAR_WINDOW_DAYS_LIMITS,
  POPULAR_MAX_RESULTS_LIMITS,
  POPULAR_MIN_OCCURRENCES_LIMITS,
  POPULAR_REFRESH_INTERVAL_LIMITS,
  FILTER_TTL_LIMITS,
  FILTER_MAX_COMBINATIONS_LIMITS,
  AUTOCOMPLETE_MIN_CHARS_LIMITS,
  AUTOCOMPLETE_DEBOUNCE_LIMITS,
  AUTOCOMPLETE_MAX_SUGGESTIONS_LIMITS,
  INDEX_REBUILD_INTERVAL_LIMITS,
  INDEX_SOURCE_WEIGHT_LIMITS,
  type SearchCacheSettings,
  type SearchIndexSource,
  type SuggestionsSource,
  type AutocompleteMatchMode,
  type IndexBackend,
  type ExternalSearchEngine,
  type SearchPurgeScope,
} from "@/lib/search-cache-settings";
import type { SearchCacheStats } from "@/lib/search-cache";

// ── Local sub-components ────────────────────────────────────────────────────
// Duplicated per-file rather than shared, matching the established
// pattern across every Cache*AdminClient (see CacheSessionAdminClient /
// CacheFragmentAdminClient).

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

function TextField({
  label,
  hint,
  value,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
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
        className="admin-input"
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
            disabled={!draft.trim()}
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
    </div>
  );
}

function ChipListField({
  values,
  placeholder,
  disabled,
  onAdd,
  onRemove,
}: {
  values: string[];
  placeholder: string;
  disabled?: boolean;
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
    <div className={`flex flex-col gap-2 ${disabled ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
            <code>{v}</code>
            {!disabled && (
              <button type="button" onClick={() => onRemove(v)} className="text-white/40 hover:text-white">
                <X size={11} />
              </button>
            )}
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-text-faint">None configured.</span>}
      </div>
      {!disabled && (
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
      )}
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

/** Bolds the substring of `text` located at `matchIndex` (length
 * `query.length`) — purely a display helper for the live preview panel;
 * mirrors what autocompleteHighlightMatch would do client-side in a real
 * dropdown. Skipped entirely when `enabled` is off. */
function HighlightedText({
  text,
  matchIndex,
  matchLength,
  enabled,
}: {
  text: string;
  matchIndex: number;
  matchLength: number;
  enabled: boolean;
}) {
  if (!enabled || matchIndex < 0) return <>{text}</>;
  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + matchLength);
  const after = text.slice(matchIndex + matchLength);
  return (
    <>
      {before}
      <span className="font-bold text-[var(--color-menu-yellow)]">{match}</span>
      {after}
    </>
  );
}

const SUGGESTIONS_SOURCE_OPTIONS: { value: SuggestionsSource; label: string }[] = [
  { value: "game_titles", label: "Game titles only" },
  { value: "search_history", label: "Search history only" },
  { value: "both", label: "Both (recommended)" },
];

const MATCH_MODE_OPTIONS: { value: AutocompleteMatchMode; label: string }[] = [
  { value: "prefix", label: "Prefix — \"dr\" matches \"Dragon Quest\"" },
  { value: "contains", label: "Contains — \"quest\" matches \"Dragon Quest\"" },
  { value: "fuzzy", label: "Fuzzy (approximated as contains)" },
];

const INDEX_BACKEND_OPTIONS: { value: IndexBackend; label: string }[] = [
  { value: "postgres_ilike", label: "Postgres ILIKE (simple, no setup)" },
  { value: "postgres_fts", label: "Postgres Full-Text Search" },
  { value: "external", label: "External engine (Meilisearch / Algolia)" },
];

const EXTERNAL_ENGINE_OPTIONS: { value: ExternalSearchEngine; label: string }[] = [
  { value: "meilisearch", label: "Meilisearch" },
  { value: "algolia", label: "Algolia" },
];

const SAMPLE_FILTER_VALUES: Record<string, string> = {
  q: "dragon",
  categories: "puzzle",
  tags: "new",
  platforms: "desktop",
  modes: "singleplayer",
  sort: "popular",
  category: "puzzle",
  tag: "new",
  difficulty: "medium",
};

function buildSampleCacheKey(params: string[], varyByDevice: boolean): string {
  if (params.length === 0 && !varyByDevice) return "(empty — every request shares one entry)";
  const parts = params.map((p) => `${p}=${SAMPLE_FILTER_VALUES[p] ?? "…"}`);
  if (varyByDevice) parts.push("device=mobile");
  return parts.join("&");
}

interface PopularQueryRow {
  rank: number;
  query: string;
  search_count: number;
  avg_results_count: number;
  had_zero_results: boolean;
  last_searched_at: string | null;
  computed_at: string;
}

interface PreviewResponse {
  query: string;
  tookMs: number;
  suggestions: {
    results: { text: string; source: "game_titles" | "search_history"; matchIndex: number }[];
    cacheHit: boolean;
    skippedReason: string | null;
  };
  autocomplete: {
    results: { title: string; slug: string; matchIndex: number }[];
    cacheHit: boolean;
    skippedReason: string | null;
  };
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Admin → Cache → Search Cache.
 *
 * Five independent pillars sharing one settings row:
 *   1. Search Suggestions — "did you mean" suggestions from game titles
 *      and/or recent search history, served through the in-process cache
 *      in search-cache.ts.
 *   2. Popular Searches   — a real leaderboard precomputed from the
 *      search_queries log (search_popular_queries), refreshed on demand.
 *   3. Filter Results     — cache-key shape for filtered game listings;
 *      config-only today since /games filtering is still client-side.
 *   4. Autocomplete       — type-ahead against game titles, same
 *      in-process cache, its own match mode and highlight toggle.
 *   5. Search Indexes     — which backend answers a search and which
 *      content types are indexed; "Rebuild Index Now" runs a real count
 *      against the enabled source tables (or a reachability check for an
 *      external engine).
 *
 * The "Test a query" panel at the bottom exercises the real Suggestions
 * + Autocomplete pipeline end-to-end (including cache hit/miss) without
 * touching the public-facing SearchBox.
 */
export function CacheSearchAdminClient() {
  const [settings, setSettings] = useState<SearchCacheSettings>(DEFAULT_SEARCH_CACHE_SETTINGS);
  const [draft, setDraft] = useState<SearchCacheSettings>(DEFAULT_SEARCH_CACHE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [pendingApiKey, setPendingApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);

  const [liveStats, setLiveStats] = useState<SearchCacheStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [purgingScope, setPurgingScope] = useState<SearchPurgeScope | null>(null);

  const [popular, setPopular] = useState<PopularQueryRow[]>([]);
  const [popularLoading, setPopularLoading] = useState(false);
  const [recomputing, setRecomputing] = useState(false);

  const [rebuilding, setRebuilding] = useState(false);

  const [previewQuery, setPreviewQuery] = useState("dragon");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings) || pendingApiKey !== "" || clearApiKey;

  // ── Load ─────────────────────────────────────────────────────────────────

  const loadSettings = useCallback(() => {
    return fetch("/api/admin/cache/search/settings")
      .then((r) => r.json())
      .then((d) => {
        const mapped = mapSearchCacheRow(d.settings);
        setSettings(mapped);
        setDraft(mapped);
      })
      .catch(() => {
        setSettings(DEFAULT_SEARCH_CACHE_SETTINGS);
        setDraft(DEFAULT_SEARCH_CACHE_SETTINGS);
      });
  }, []);

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    return fetch("/api/admin/cache/search/stats")
      .then((r) => r.json())
      .then((d) => setLiveStats(d.stats ?? null))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const loadPopular = useCallback(() => {
    setPopularLoading(true);
    return fetch("/api/admin/cache/search/popular")
      .then((r) => r.json())
      .then((d) => setPopular(d.popular ?? []))
      .catch(() => {})
      .finally(() => setPopularLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([loadSettings(), loadStats(), loadPopular()]).finally(() => setLoading(false));
    // Light auto-refresh so the in-process cache numbers don't look
    // frozen while an admin has this open — same as Fragment Cache.
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [loadSettings, loadStats, loadPopular]);

  // ── Patch helpers ────────────────────────────────────────────────────────

  const patch = useCallback(<K extends keyof SearchCacheSettings>(key: K, value: SearchCacheSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const patchIndexSource = useCallback((key: string, sourcePatch: Partial<SearchIndexSource>) => {
    setDraft((prev) => ({
      ...prev,
      indexSources: prev.indexSources.map((s) => (s.key === key ? { ...s, ...sourcePatch } : s)),
    }));
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveStatus("saving");
    setErrorMsg(null);
    try {
      const body: Record<string, unknown> = { ...draft };
      delete body.externalApiKeySet;
      delete body.externalApiKeyPreview;
      delete body.updatedAt;
      delete body.lastPurgedAt;
      delete body.lastPurgeSummary;
      delete body.popularSearchesLastRefreshedAt;
      delete body.popularSearchesLastRefreshCount;
      delete body.indexLastBuiltAt;
      delete body.indexLastBuildDurationMs;
      delete body.indexLastBuildDocCount;
      delete body.indexLastBuildStatus;
      delete body.indexLastBuildMessage;
      if (clearApiKey) body.clearExternalApiKey = true;
      else if (pendingApiKey) body.externalApiKey = pendingApiKey;

      const res = await fetch("/api/admin/cache/search/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      const updated = mapSearchCacheRow(data.settings);
      setSettings(updated);
      setDraft(updated);
      setPendingApiKey("");
      setClearApiKey(false);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Save failed.");
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  // ── Purge ────────────────────────────────────────────────────────────────

  const handlePurge = async (scope: SearchPurgeScope) => {
    setPurgingScope(scope);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/cache/search/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Purge failed.");
      if (data.settings) {
        const updated = mapSearchCacheRow(data.settings);
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

  // ── Popular Searches: recompute ──────────────────────────────────────────

  const handleRecomputePopular = async () => {
    setRecomputing(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/cache/search/recompute-popular", { method: "POST" });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Recompute failed.");
      if (data.settings) {
        const updated = mapSearchCacheRow(data.settings);
        setSettings(updated);
        setDraft((prev) => (isDirty ? prev : updated));
      }
      if (data.popular) setPopular(data.popular);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Recompute failed.");
    } finally {
      setRecomputing(false);
    }
  };

  // ── Search Indexes: rebuild ──────────────────────────────────────────────

  const handleRebuildIndex = async () => {
    setRebuilding(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/cache/search/rebuild-index", { method: "POST" });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Rebuild failed.");
      if (data.settings) {
        const updated = mapSearchCacheRow(data.settings);
        setSettings(updated);
        setDraft((prev) => (isDirty ? prev : updated));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Rebuild failed.");
    } finally {
      setRebuilding(false);
    }
  };

  // ── Live preview ─────────────────────────────────────────────────────────

  const handlePreview = async () => {
    if (!previewQuery.trim()) return;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const res = await fetch("/api/admin/cache/search/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: previewQuery.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preview failed.");
      setPreviewResult(data);
      await loadStats();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setPreviewLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-faint">
        <Loader2 size={16} className="animate-spin" /> Loading Search Cache settings…
      </div>
    );
  }

  const suggestionsStats = liveStats?.namespaces.find((n) => n.namespace === "suggestions") ?? null;
  const autocompleteStats = liveStats?.namespaces.find((n) => n.namespace === "autocomplete") ?? null;

  return (
    <div className="max-w-3xl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Search Cache</h1>
          <p className="mt-1 max-w-xl text-sm text-text-faint">
            Suggestions, the popular-searches leaderboard, filtered-listing cache keys, autocomplete, and which
            backend actually answers a search — five pillars behind the search box in the header.
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
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip
          label="Suggestions cache"
          value={suggestionsStats ? `${suggestionsStats.entries} entries` : "—"}
          tone="neutral"
        />
        <StatChip
          label="Suggestions hit rate"
          value={formatPercent(suggestionsStats?.hitRate ?? null)}
          tone={suggestionsStats && suggestionsStats.hitRate !== null && suggestionsStats.hitRate >= 0.5 ? "emerald" : "amber"}
        />
        <StatChip
          label="Autocomplete cache"
          value={autocompleteStats ? `${autocompleteStats.entries} entries` : "—"}
          tone="neutral"
        />
        <StatChip
          label="Autocomplete hit rate"
          value={formatPercent(autocompleteStats?.hitRate ?? null)}
          tone={autocompleteStats && autocompleteStats.hitRate !== null && autocompleteStats.hitRate >= 0.5 ? "emerald" : "amber"}
        />
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/5 px-4 py-3">
        <p className="text-xs text-text-faint">
          Last purged {timeAgo(settings.lastPurgedAt)}
          {settings.lastPurgeSummary
            ? ` — ${settings.lastPurgeSummary.scope}, ${settings.lastPurgeSummary.entriesRemoved} entr${settings.lastPurgeSummary.entriesRemoved === 1 ? "y" : "ies"} removed`
            : ""}
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handlePurge("suggestions")}
            disabled={purgingScope !== null}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {purgingScope === "suggestions" ? <Loader2 size={12} className="animate-spin" /> : <Eraser size={12} />}
            Purge Suggestions
          </button>
          <button
            type="button"
            onClick={() => handlePurge("autocomplete")}
            disabled={purgingScope !== null}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {purgingScope === "autocomplete" ? <Loader2 size={12} className="animate-spin" /> : <Eraser size={12} />}
            Purge Autocomplete
          </button>
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

      {/* ── 1. Search Suggestions ───────────────────────────────────────── */}
      <Section
        title="Search Suggestions"
        icon={<Sparkles size={16} />}
        hint="What shows up before someone finishes typing — drawn from game titles, past searches, or both."
      >
        <ToggleField
          label="Search Suggestions"
          hint="Master switch — when off, the search box shows no suggestions at all."
          checked={draft.suggestionsEnabled}
          onChange={(v) => patch("suggestionsEnabled", v)}
        />
        <div className={`flex flex-col gap-4 border-t border-white/10 pt-4 ${!draft.suggestionsEnabled ? "opacity-50" : ""}`}>
          <SelectField
            label="Source"
            hint="Game titles matches what exists; search history surfaces what other people actually typed."
            value={draft.suggestionsSource}
            options={SUGGESTIONS_SOURCE_OPTIONS}
            disabled={!draft.suggestionsEnabled}
            onChange={(v) => patch("suggestionsSource", v)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NumberField
              label="Min characters"
              hint="Below this, nothing is looked up or cached."
              value={draft.suggestionsMinChars}
              min={SUGGESTIONS_MIN_CHARS_LIMITS.min}
              max={SUGGESTIONS_MIN_CHARS_LIMITS.max}
              disabled={!draft.suggestionsEnabled}
              onChange={(v) => patch("suggestionsMinChars", v)}
            />
            <NumberField
              label="Max results"
              value={draft.suggestionsMaxResults}
              min={SUGGESTIONS_MAX_RESULTS_LIMITS.min}
              max={SUGGESTIONS_MAX_RESULTS_LIMITS.max}
              disabled={!draft.suggestionsEnabled}
              onChange={(v) => patch("suggestionsMaxResults", v)}
            />
            <NumberField
              label="Cache TTL"
              hint="How long one query's result list is reused before recomputing."
              value={draft.suggestionsCacheTtlSeconds}
              min={SUGGESTIONS_TTL_LIMITS.min}
              max={SUGGESTIONS_TTL_LIMITS.max}
              suffix="seconds"
              disabled={!draft.suggestionsEnabled}
              onChange={(v) => patch("suggestionsCacheTtlSeconds", v)}
            />
          </div>
          <ToggleField
            label="Fuzzy matching"
            hint="Matches anywhere in the title/query, not just the start. True edit-distance matching needs the pg_trgm extension — approximated here as substring matching."
            checked={draft.suggestionsFuzzyMatching}
            disabled={!draft.suggestionsEnabled}
            onChange={(v) => patch("suggestionsFuzzyMatching", v)}
          />
        </div>
      </Section>

      {/* ── 2. Popular Searches ─────────────────────────────────────────── */}
      <Section
        title="Popular Searches"
        icon={<TrendingUp size={16} />}
        hint="A precomputed leaderboard of what people actually search for — a real cache table, refreshed on demand, not a live aggregation on every page view."
      >
        <ToggleField
          label="Popular Searches"
          checked={draft.popularSearchesEnabled}
          onChange={(v) => patch("popularSearchesEnabled", v)}
        />
        <div className={`grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2 ${!draft.popularSearchesEnabled ? "opacity-50" : ""}`}>
          <NumberField
            label="Window"
            hint="How far back to look when ranking."
            value={draft.popularSearchesWindowDays}
            min={POPULAR_WINDOW_DAYS_LIMITS.min}
            max={POPULAR_WINDOW_DAYS_LIMITS.max}
            suffix="days"
            disabled={!draft.popularSearchesEnabled}
            onChange={(v) => patch("popularSearchesWindowDays", v)}
          />
          <NumberField
            label="Max results"
            value={draft.popularSearchesMaxResults}
            min={POPULAR_MAX_RESULTS_LIMITS.min}
            max={POPULAR_MAX_RESULTS_LIMITS.max}
            disabled={!draft.popularSearchesEnabled}
            onChange={(v) => patch("popularSearchesMaxResults", v)}
          />
          <NumberField
            label="Min occurrences"
            hint="A query searched fewer times than this in the window doesn't qualify."
            value={draft.popularSearchesMinOccurrences}
            min={POPULAR_MIN_OCCURRENCES_LIMITS.min}
            max={POPULAR_MIN_OCCURRENCES_LIMITS.max}
            disabled={!draft.popularSearchesEnabled}
            onChange={(v) => patch("popularSearchesMinOccurrences", v)}
          />
          <NumberField
            label="Refresh interval"
            hint="How often this should be recomputed on a schedule (Admin → Automation)."
            value={draft.popularSearchesRefreshIntervalMinutes}
            min={POPULAR_REFRESH_INTERVAL_LIMITS.min}
            max={POPULAR_REFRESH_INTERVAL_LIMITS.max}
            suffix="minutes"
            disabled={!draft.popularSearchesEnabled}
            onChange={(v) => patch("popularSearchesRefreshIntervalMinutes", v)}
          />
        </div>
        <div className={`border-t border-white/10 pt-4 ${!draft.popularSearchesEnabled ? "opacity-50" : ""}`}>
          <ToggleField
            label="Exclude zero-result searches"
            hint="A query that never returns anything is a content gap, not a popular one."
            checked={draft.popularSearchesExcludeNoResults}
            disabled={!draft.popularSearchesEnabled}
            onChange={(v) => patch("popularSearchesExcludeNoResults", v)}
          />
        </div>

        <div className="border-t border-white/10 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-text-faint">
              Last recomputed {timeAgo(settings.popularSearchesLastRefreshedAt)}
              {settings.popularSearchesLastRefreshCount > 0 ? ` — ${settings.popularSearchesLastRefreshCount} queries ranked` : ""}.
            </p>
            <button
              type="button"
              onClick={handleRecomputePopular}
              disabled={recomputing}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
            >
              {recomputing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Recompute Now
            </button>
          </div>

          {popularLoading ? (
            <div className="flex items-center gap-2 py-4 text-xs text-text-faint">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          ) : popular.length === 0 ? (
            <p className="rounded-xl bg-white/5 px-4 py-3 text-xs text-text-faint">
              No ranked queries yet — click Recompute Now once there's some search activity in the log.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white/5">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-text-faint">
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Query</th>
                    <th className="px-3 py-2">Searches</th>
                    <th className="px-3 py-2">Avg. results</th>
                    <th className="px-3 py-2">Last searched</th>
                  </tr>
                </thead>
                <tbody>
                  {popular.map((row) => (
                    <tr key={row.rank} className="border-t border-white/5">
                      <td className="px-3 py-2 font-bold text-white/50">{row.rank}</td>
                      <td className="px-3 py-2 font-semibold text-white">
                        {row.query}
                        {row.had_zero_results && (
                          <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">
                            0 results
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-white/70">{row.search_count}</td>
                      <td className="px-3 py-2 text-white/70">{row.avg_results_count}</td>
                      <td className="px-3 py-2 text-text-faint">{timeAgo(row.last_searched_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Section>

      {/* ── 3. Filter Results ───────────────────────────────────────────── */}
      <Section
        title="Filter Results"
        icon={<ListFilter size={16} />}
        hint="Cache-key shape for filtered/faceted game listings (/games?…). Configures which params matter — /games filtering is still client-side today, so there's no live filtered response to size yet; this is forward-compatible config for when it moves server-side."
      >
        <ToggleField
          label="Filter Results Cache"
          checked={draft.filterCacheEnabled}
          onChange={(v) => patch("filterCacheEnabled", v)}
        />
        <div className={`flex flex-col gap-4 border-t border-white/10 pt-4 ${!draft.filterCacheEnabled ? "opacity-50" : ""}`}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Cache TTL"
              value={draft.filterCacheTtlSeconds}
              min={FILTER_TTL_LIMITS.min}
              max={FILTER_TTL_LIMITS.max}
              suffix="seconds"
              disabled={!draft.filterCacheEnabled}
              onChange={(v) => patch("filterCacheTtlSeconds", v)}
            />
            <NumberField
              label="Max cached combinations"
              hint="Distinct filter combinations kept before the oldest is evicted."
              value={draft.filterCacheMaxCombinations}
              min={FILTER_MAX_COMBINATIONS_LIMITS.min}
              max={FILTER_MAX_COMBINATIONS_LIMITS.max}
              disabled={!draft.filterCacheEnabled}
              onChange={(v) => patch("filterCacheMaxCombinations", v)}
            />
          </div>
          <div>
            <span className="text-sm font-semibold text-white">Cacheable params</span>
            <p className="mb-2 text-xs text-text-faint">
              Query params that participate in the cache key — anything else on /games is stripped before hashing.
            </p>
            <ChipListField
              values={draft.filterCacheableParams}
              placeholder="e.g. categories"
              disabled={!draft.filterCacheEnabled}
              onAdd={(v) => patch("filterCacheableParams", [...draft.filterCacheableParams, v])}
              onRemove={(v) => patch("filterCacheableParams", draft.filterCacheableParams.filter((p) => p !== v))}
            />
          </div>
          <ToggleField
            label="Vary by device"
            hint="Mobile and desktop visitors get separate cache entries for the same filter combination."
            checked={draft.filterCacheVaryByDevice}
            disabled={!draft.filterCacheEnabled}
            onChange={(v) => patch("filterCacheVaryByDevice", v)}
          />
          <div className="rounded-xl bg-white/5 px-4 py-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">Sample cache key</span>
            <p className="mt-1 break-all font-mono text-xs text-white/70">
              {buildSampleCacheKey(draft.filterCacheableParams, draft.filterCacheVaryByDevice)}
            </p>
          </div>
        </div>
      </Section>

      {/* ── 4. Autocomplete ─────────────────────────────────────────────── */}
      <Section
        title="Autocomplete"
        icon={<Search size={16} />}
        hint="The type-ahead dropdown itself — matches partial game titles as you type, distinct from Search Suggestions (which can also surface what other people searched)."
      >
        <ToggleField label="Autocomplete" checked={draft.autocompleteEnabled} onChange={(v) => patch("autocompleteEnabled", v)} />
        <div className={`flex flex-col gap-4 border-t border-white/10 pt-4 ${!draft.autocompleteEnabled ? "opacity-50" : ""}`}>
          <SelectField
            label="Match mode"
            value={draft.autocompleteMatchMode}
            options={MATCH_MODE_OPTIONS}
            disabled={!draft.autocompleteEnabled}
            onChange={(v) => patch("autocompleteMatchMode", v)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NumberField
              label="Min characters"
              value={draft.autocompleteMinChars}
              min={AUTOCOMPLETE_MIN_CHARS_LIMITS.min}
              max={AUTOCOMPLETE_MIN_CHARS_LIMITS.max}
              disabled={!draft.autocompleteEnabled}
              onChange={(v) => patch("autocompleteMinChars", v)}
            />
            <NumberField
              label="Debounce"
              hint="Client-side delay before firing a lookup."
              value={draft.autocompleteDebounceMs}
              min={AUTOCOMPLETE_DEBOUNCE_LIMITS.min}
              max={AUTOCOMPLETE_DEBOUNCE_LIMITS.max}
              suffix="ms"
              disabled={!draft.autocompleteEnabled}
              onChange={(v) => patch("autocompleteDebounceMs", v)}
            />
            <NumberField
              label="Max suggestions"
              value={draft.autocompleteMaxSuggestions}
              min={AUTOCOMPLETE_MAX_SUGGESTIONS_LIMITS.min}
              max={AUTOCOMPLETE_MAX_SUGGESTIONS_LIMITS.max}
              disabled={!draft.autocompleteEnabled}
              onChange={(v) => patch("autocompleteMaxSuggestions", v)}
            />
          </div>
          <ToggleField
            label="Highlight matched text"
            hint="Bold the part of the title that matched — see it in action in the Test a query panel below."
            checked={draft.autocompleteHighlightMatch}
            disabled={!draft.autocompleteEnabled}
            onChange={(v) => patch("autocompleteHighlightMatch", v)}
          />
        </div>
      </Section>

      {/* ── 5. Search Indexes ───────────────────────────────────────────── */}
      <Section
        title="Search Indexes"
        icon={<Database size={16} />}
        hint="Which backend answers a search, and which content types it covers."
      >
        <SelectField
          label="Backend"
          value={draft.indexBackend}
          options={INDEX_BACKEND_OPTIONS}
          onChange={(v) => patch("indexBackend", v)}
        />

        <div className="border-t border-white/10 pt-4">
          <span className="text-sm font-semibold text-white">Indexed content</span>
          <p className="mb-3 text-xs text-text-faint">Weight controls relative ranking when a match appears in more than one source.</p>
          <div className="flex flex-col gap-3">
            {draft.indexSources.map((src) => {
              const meta = INDEX_SOURCE_CATALOG[src.key];
              return (
                <div key={src.key} className="flex flex-col gap-2 rounded-xl bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-white">{src.label}</h3>
                      {meta && !meta.wired && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">Off by default</span>
                      )}
                    </div>
                    {meta && <p className="mt-0.5 text-xs text-text-faint">{meta.description}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-white/70">Weight</span>
                      <input
                        type="number"
                        min={INDEX_SOURCE_WEIGHT_LIMITS.min}
                        max={INDEX_SOURCE_WEIGHT_LIMITS.max}
                        value={src.weight}
                        disabled={!src.enabled}
                        onChange={(e) =>
                          patchIndexSource(src.key, {
                            weight: Math.min(
                              INDEX_SOURCE_WEIGHT_LIMITS.max,
                              Math.max(INDEX_SOURCE_WEIGHT_LIMITS.min, Number(e.target.value) || INDEX_SOURCE_WEIGHT_LIMITS.min)
                            ),
                          })
                        }
                        className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white outline-none focus:border-white/30 disabled:opacity-50"
                      />
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={src.enabled}
                      onClick={() => patchIndexSource(src.key, { enabled: !src.enabled })}
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${src.enabled ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${src.enabled ? "translate-x-[22px]" : "translate-x-0.5"}`}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
          <ToggleField
            label="Auto rebuild"
            hint="Reserved for a scheduled job under Admin → Automation."
            checked={draft.indexAutoRebuild}
            onChange={(v) => patch("indexAutoRebuild", v)}
          />
          <NumberField
            label="Rebuild interval"
            value={draft.indexRebuildIntervalHours}
            min={INDEX_REBUILD_INTERVAL_LIMITS.min}
            max={INDEX_REBUILD_INTERVAL_LIMITS.max}
            suffix="hours"
            disabled={!draft.indexAutoRebuild}
            onChange={(v) => patch("indexRebuildIntervalHours", v)}
          />
        </div>

        {draft.indexBackend === "external" && (
          <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
            <SelectField
              label="Engine"
              value={draft.externalEngine}
              options={EXTERNAL_ENGINE_OPTIONS}
              onChange={(v) => patch("externalEngine", v)}
            />
            <TextField
              label="Host"
              placeholder="https://search.example.com"
              value={draft.externalHost}
              onChange={(v) => patch("externalHost", v)}
            />
            <TextField label="Index name" value={draft.externalIndexName} onChange={(v) => patch("externalIndexName", v)} />
            <SecretField
              label="API key"
              hint="Used only by this app's own reachability check when you rebuild — never forwarded anywhere else."
              keySet={draft.externalApiKeySet}
              preview={draft.externalApiKeyPreview}
              onSet={(v) => {
                setPendingApiKey(v);
                setClearApiKey(false);
              }}
              onClear={() => {
                setClearApiKey(true);
                setPendingApiKey("");
              }}
            />
          </div>
        )}

        <div className="border-t border-white/10 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-text-faint">
                Last built {timeAgo(settings.indexLastBuiltAt)}
                {settings.indexLastBuildDurationMs !== null ? ` — ${settings.indexLastBuildDurationMs}ms` : ""}
                {settings.indexLastBuildDocCount !== null ? `, ${settings.indexLastBuildDocCount} documents` : ""}.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRebuildIndex}
              disabled={rebuilding}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
            >
              {rebuilding ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Rebuild Index Now
            </button>
          </div>
          {settings.indexLastBuildMessage && (
            <ResultBanner ok={settings.indexLastBuildStatus === "success"} message={settings.indexLastBuildMessage} />
          )}
        </div>
      </Section>

      {/* ── Live preview ────────────────────────────────────────────────── */}
      <Section
        title="Test a Query"
        icon={<Gauge size={16} />}
        hint="Runs a real query through the live Suggestions + Autocomplete pipelines and the actual in-process cache — the same code path a request would hit, not a mock."
      >
        <div className="flex gap-2">
          <input
            value={previewQuery}
            onChange={(e) => setPreviewQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handlePreview();
            }}
            placeholder="Type a query to test…"
            className="admin-input flex-1"
          />
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewLoading || !previewQuery.trim()}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-yellow)] px-4 py-2 text-xs font-bold text-black hover:opacity-90 disabled:opacity-50"
          >
            {previewLoading ? <Loader2 size={13} className="animate-spin" /> : <Flame size={13} />}
            Test
          </button>
        </div>

        {previewError && <ResultBanner ok={false} message={previewError} />}

        {previewResult && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-white/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-faint">Suggestions</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${previewResult.suggestions.cacheHit ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}
                >
                  {previewResult.suggestions.cacheHit ? "cache hit" : "cache miss"}
                </span>
              </div>
              {previewResult.suggestions.skippedReason ? (
                <p className="text-xs text-text-faint">{previewResult.suggestions.skippedReason}</p>
              ) : previewResult.suggestions.results.length === 0 ? (
                <p className="text-xs text-text-faint">No matches.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {previewResult.suggestions.results.map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-sm text-white">
                      <span>
                        <HighlightedText
                          text={r.text}
                          matchIndex={r.matchIndex}
                          matchLength={previewResult.query.length}
                          enabled={draft.autocompleteHighlightMatch}
                        />
                      </span>
                      <span className="shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-white/50">
                        {r.source === "game_titles" ? "title" : "history"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl bg-white/5 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-text-faint">Autocomplete</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${previewResult.autocomplete.cacheHit ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}
                >
                  {previewResult.autocomplete.cacheHit ? "cache hit" : "cache miss"}
                </span>
              </div>
              {previewResult.autocomplete.skippedReason ? (
                <p className="text-xs text-text-faint">{previewResult.autocomplete.skippedReason}</p>
              ) : previewResult.autocomplete.results.length === 0 ? (
                <p className="text-xs text-text-faint">No matches.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {previewResult.autocomplete.results.map((r) => (
                    <li key={r.slug} className="text-sm text-white">
                      <HighlightedText
                        text={r.title}
                        matchIndex={r.matchIndex}
                        matchLength={previewResult.query.length}
                        enabled={draft.autocompleteHighlightMatch}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {previewResult && <p className="text-[11px] text-text-faint">Took {previewResult.tookMs}ms.</p>}
      </Section>
    </div>
  );
}
