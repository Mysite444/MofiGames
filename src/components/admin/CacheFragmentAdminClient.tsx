"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Eraser,
  Layers3,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import {
  mapFragmentCacheRow,
  DEFAULT_FRAGMENT_CACHE_SETTINGS,
  FRAGMENT_CATALOG,
  type FragmentCacheSettings,
  type FragmentDefinition,
} from "@/lib/fragment-cache-settings";
import type { FragmentCacheStats, FragmentStatsRow } from "@/lib/fragment-cache";

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatPercent(v: number | null): string {
  if (v === null) return "—";
  return `${Math.round(v * 100)}%`;
}

// ── Shared sub-components ───────────────────────────────────────────────────
// Mirrors the exact pattern from CachePhpOpcacheAdminClient / CacheObjectAdminClient.

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
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          className="w-36 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50"
        />
        {suffix && <span className="text-xs text-text-faint">{suffix}</span>}
      </div>
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

// ── Per-fragment row ─────────────────────────────────────────────────────────

function FragmentRow({
  def,
  stats,
  disabled,
  purging,
  onPatch,
  onPurge,
}: {
  def: FragmentDefinition;
  stats: FragmentStatsRow | undefined;
  disabled: boolean;
  purging: boolean;
  onPatch: (patch: Partial<FragmentDefinition>) => void;
  onPurge: () => void;
}) {
  const meta = FRAGMENT_CATALOG[def.key];
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-white">{def.label}</h3>
            <code className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] text-white/50">{def.key}</code>
            {meta && !meta.wired && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                No independent data source yet
              </span>
            )}
          </div>
          {meta && <p className="mt-1 text-xs text-text-faint">{meta.description}</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={def.enabled}
          disabled={disabled}
          onClick={() => onPatch({ enabled: !def.enabled })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            def.enabled ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
          } ${disabled ? "cursor-not-allowed" : ""}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              def.enabled ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-white/70">TTL</span>
          <input
            type="number"
            min={5}
            max={86400}
            value={def.ttlSeconds}
            disabled={disabled}
            onChange={(e) => onPatch({ ttlSeconds: Math.min(86400, Math.max(5, Number(e.target.value) || 5)) })}
            className="w-24 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white outline-none focus:border-white/30 disabled:opacity-50"
          />
          <span className="text-[11px] text-text-faint">sec</span>
        </div>

        {stats && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-faint">
            <span>
              <span className="font-bold text-white">{stats.entries}</span> entries
            </span>
            <span>
              <span className="font-bold text-emerald-400">{stats.hits + stats.staleHits}</span> hits
            </span>
            <span>
              <span className="font-bold text-amber-400">{stats.misses}</span> misses
            </span>
            <span>
              hit rate <span className="font-bold text-white">{formatPercent(stats.hitRate)}</span>
            </span>
            <span>{formatBytes(stats.approxBytes)}</span>
            {stats.errors > 0 && <span className="text-red-400">{stats.errors} errors</span>}
          </div>
        )}

        <button
          type="button"
          onClick={onPurge}
          disabled={purging}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/10 disabled:opacity-50"
        >
          {purging ? <Loader2 size={12} className="animate-spin" /> : <Eraser size={12} />}
          Purge
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function CacheFragmentAdminClient() {
  const [settings, setSettings] = useState<FragmentCacheSettings>(DEFAULT_FRAGMENT_CACHE_SETTINGS);
  const [draft, setDraft] = useState<FragmentCacheSettings>(DEFAULT_FRAGMENT_CACHE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [liveStats, setLiveStats] = useState<FragmentCacheStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [purgingKey, setPurgingKey] = useState<string | null>(null);
  const [purgingAll, setPurgingAll] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  // ── Load settings ────────────────────────────────────────────────────────

  const loadSettings = useCallback(() => {
    return fetch("/api/admin/cache/fragment/settings")
      .then((r) => r.json())
      .then((d) => {
        const mapped = mapFragmentCacheRow(d.settings);
        setSettings(mapped);
        setDraft(mapped);
      })
      .catch(() => {
        setSettings(DEFAULT_FRAGMENT_CACHE_SETTINGS);
        setDraft(DEFAULT_FRAGMENT_CACHE_SETTINGS);
      });
  }, []);

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    return fetch("/api/admin/cache/fragment/stats")
      .then((r) => r.json())
      .then((d) => setLiveStats(d.stats ?? null))
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    Promise.all([loadSettings(), loadStats()]).finally(() => setLoading(false));
    // Light auto-refresh so the numbers on this dashboard don't look
    // frozen while an admin has it open — matches the "live status"
    // feel of the PHP OPcache page without needing a manual click.
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [loadSettings, loadStats]);

  // ── Patch helpers ────────────────────────────────────────────────────────

  const patch = useCallback(<K extends keyof FragmentCacheSettings>(key: K, value: FragmentCacheSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const patchFragment = useCallback((key: string, fragPatch: Partial<FragmentDefinition>) => {
    setDraft((prev) => ({
      ...prev,
      fragments: prev.fragments.map((f) => (f.key === key ? { ...f, ...fragPatch } : f)),
    }));
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveStatus("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/cache/fragment/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      const updated = mapFragmentCacheRow(data.settings);
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

  // ── Purge ────────────────────────────────────────────────────────────────

  const runPurge = async (body: { scope: "all" | "fragment"; key?: string }) => {
    try {
      const res = await fetch("/api/admin/cache/fragment/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Purge failed.");
      if (data.settings) {
        const updated = mapFragmentCacheRow(data.settings);
        setSettings(updated);
        setDraft((prev) => (isDirty ? prev : updated));
      }
      await loadStats();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Purge failed.");
    }
  };

  const handlePurgeFragment = async (key: string) => {
    setPurgingKey(key);
    await runPurge({ scope: "fragment", key });
    setPurgingKey(null);
  };

  const handlePurgeAll = async () => {
    setPurgingAll(true);
    await runPurge({ scope: "all" });
    setPurgingAll(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-faint">
        <Loader2 size={16} className="animate-spin" /> Loading Fragment Cache settings…
      </div>
    );
  }

  const statsByKey = new Map((liveStats?.fragments ?? []).map((f) => [f.key, f]));
  const overallLookups = liveStats
    ? liveStats.fragments.reduce((sum, f) => sum + f.hits + f.staleHits + f.misses, 0)
    : 0;
  const overallHits = liveStats ? liveStats.fragments.reduce((sum, f) => sum + f.hits + f.staleHits, 0) : 0;
  const overallHitRate = overallLookups > 0 ? overallHits / overallLookups : null;

  return (
    <div className="max-w-3xl">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Fragment Cache</h1>
          <p className="mt-1 max-w-xl text-sm text-text-faint">
            Caches only the expensive page sections — not whole pages (that's Full Page Cache) and not a generic
            key/value store (that's Object Cache) — each with its own TTL, served from this app's own process.
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
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip
          label="Entries"
          value={liveStats ? `${liveStats.totalEntries} / ${liveStats.maxEntries}` : "—"}
          tone="neutral"
        />
        <StatChip label="Overall hit rate" value={formatPercent(overallHitRate)} tone={overallHitRate !== null && overallHitRate >= 0.5 ? "emerald" : "amber"} />
        <StatChip label="Approx. size" value={liveStats ? formatBytes(liveStats.totalApproxBytes) : "—"} tone="neutral" />
        <StatChip
          label="Last purge"
          value={settings.lastPurgedAt ? timeAgo(settings.lastPurgedAt) : "Never"}
          tone="neutral"
        />
      </div>

      {/* ── Global settings ─────────────────────────────────────────────── */}
      <Section
        title="Global Settings"
        icon={<Boxes size={16} />}
        hint="The master switch and defaults every fragment falls back to."
      >
        <ToggleField
          label="Fragment Cache"
          hint="Master switch — when off, every fragment below is recomputed on every request regardless of its own toggle."
          checked={draft.enabled}
          onChange={(v) => patch("enabled", v)}
        />
        <div className="grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
          <NumberField
            label="Default TTL"
            hint="Used only if a fragment's own row is somehow missing a TTL."
            value={draft.defaultTtlSeconds}
            min={5}
            max={86400}
            suffix="seconds"
            onChange={(v) => patch("defaultTtlSeconds", v)}
          />
          <NumberField
            label="Max entries"
            hint="Store-wide cap across every fragment and variant (e.g. one Related Games entry per category). Oldest-accessed evicted first."
            value={draft.maxEntries}
            min={20}
            max={20000}
            onChange={(v) => patch("maxEntries", v)}
          />
          <NumberField
            label="Stale-while-revalidate"
            hint="After a fragment expires, serve the stale copy for up to this long while it refreshes in the background. 0 disables it."
            value={draft.staleWhileRevalidateSeconds}
            min={0}
            max={600}
            suffix="seconds"
            onChange={(v) => patch("staleWhileRevalidateSeconds", v)}
          />
        </div>
        <div className="border-t border-white/10 pt-4">
          <ToggleField
            label="Bypass for admins"
            hint="Signed-in admins previewing draft games/pages always see fresh content, never a stale cached fragment."
            checked={draft.bypassForAdmins}
            onChange={(v) => patch("bypassForAdmins", v)}
          />
          <ToggleField
            label="Vary by locale"
            hint="Reserved for the localization phase — namespaces cache entries per language once fragments become locale-dependent."
            checked={draft.varyByLocale}
            onChange={(v) => patch("varyByLocale", v)}
          />
        </div>
      </Section>

      {/* ── Per-fragment catalogue ──────────────────────────────────────── */}
      <Section
        title="Cached Sections"
        icon={<Layers3 size={16} />}
        hint="The eight page sections this app knows how to fragment-cache, each independently toggleable and TTL'd."
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-faint">
            Purging a fragment clears every variant of it immediately (e.g. Related Games for every category).
          </p>
          <button
            type="button"
            onClick={handlePurgeAll}
            disabled={purgingAll}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/15 px-3.5 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
          >
            {purgingAll ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Purge All Fragments
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {draft.fragments.map((def) => (
            <FragmentRow
              key={def.key}
              def={def}
              stats={statsByKey.get(def.key)}
              disabled={!draft.enabled}
              purging={purgingKey === def.key}
              onPatch={(p) => patchFragment(def.key, p)}
              onPurge={() => handlePurgeFragment(def.key)}
            />
          ))}
        </div>

        {settings.lastPurgeSummary && (
          <p className="text-[11px] text-text-faint">
            Last purge: {settings.lastPurgeSummary.scope === "all" ? "all fragments" : settings.lastPurgeSummary.key}{" "}
            — {settings.lastPurgeSummary.entriesRemoved} entr
            {settings.lastPurgeSummary.entriesRemoved === 1 ? "y" : "ies"} removed
            {settings.lastPurgedAt ? `, ${timeAgo(settings.lastPurgedAt)}` : ""}.
          </p>
        )}
      </Section>
    </div>
  );
}
