"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Network,
  Plug,
  Play,
  Plus,
  Save,
  X,
  XCircle,
} from "lucide-react";
import {
  mapCachePreloadRow,
  DEFAULT_CACHE_PRELOAD_SETTINGS,
  CACHE_PRELOAD_CONCURRENCY_LIMITS,
  CACHE_PRELOAD_TIMEOUT_LIMITS,
  type CachePreloadSettings,
  type CachePreloadRunResult,
} from "@/lib/cache-preload-settings";
import {
  mapResourceHintRow,
  DEFAULT_RESOURCE_HINT_SETTINGS,
  RESOURCE_HINT_AS_VALUES,
  RESOURCE_HINT_FETCH_PRIORITIES,
  type ResourceHintSettings,
  type ResourceHint,
  type ResourceHintAs,
  type ResourceHintFetchPriority,
} from "@/lib/resource-hint-settings";
import {
  mapLinkPrefetchRow,
  DEFAULT_LINK_PREFETCH_SETTINGS,
  LINK_PREFETCH_HOVER_DELAY_LIMITS,
  LINK_PREFETCH_CONCURRENCY_LIMITS,
  type LinkPrefetchSettings,
  type LinkPrefetchStrategy,
} from "@/lib/link-prefetch-settings";
import {
  mapSpeculativeLoadingRow,
  DEFAULT_SPECULATIVE_LOADING_SETTINGS,
  type SpeculativeLoadingSettings,
  type SpeculativeLoadingMode,
  type SpeculativeLoadingEagerness,
} from "@/lib/speculative-loading-settings";
import {
  fetchDnsPrefetchSettings,
  DEFAULT_DNS_PREFETCH_SETTINGS,
  type DnsPrefetchSettings,
} from "@/lib/dns-prefetch-settings";

// ── Local sub-components ────────────────────────────────────────────────────
// Duplicated per-file rather than shared, matching the pattern in
// CacheDnsAdminClient / CacheSessionAdminClient / CacheObjectAdminClient.

function Section({
  title,
  hint,
  badge,
  children,
  defaultOpen = true,
}: {
  title: string;
  hint?: React.ReactNode;
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
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">{title}</h2>
            {badge}
          </div>
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
        className="admin-input w-56"
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

/** One row per configured <link rel="preload">. More structured than
 * ChipListField since each entry needs href + as + optional type/
 * crossorigin/fetchPriority, not just a bare string. */
function HintListField({
  hints,
  onAdd,
  onRemove,
}: {
  hints: ResourceHint[];
  onAdd: (hint: Omit<ResourceHint, "id">) => void;
  onRemove: (id: string) => void;
}) {
  const [href, setHref] = useState("");
  const [as, setAs] = useState<ResourceHintAs>("font");
  const [type, setType] = useState("");
  const [crossorigin, setCrossorigin] = useState(true);
  const [fetchPriority, setFetchPriority] = useState<ResourceHintFetchPriority>("high");

  function commit() {
    const trimmed = href.trim();
    if (!trimmed) return;
    onAdd({ href: trimmed, as, type: type.trim(), crossorigin, fetchPriority });
    setHref("");
    setType("");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {hints.map((hint) => (
          <div
            key={hint.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/5 px-3.5 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <code className="font-mono text-white/90">{hint.href}</code>
              <span className="rounded-full bg-white/10 px-2 py-0.5 font-bold uppercase tracking-wide text-white/60">
                as={hint.as}
              </span>
              {hint.type && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/50">{hint.type}</span>
              )}
              {hint.crossorigin && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-white/50">crossorigin</span>
              )}
              {hint.fetchPriority !== "auto" && (
                <span className="rounded-full bg-[var(--color-menu-yellow)]/20 px-2 py-0.5 font-bold text-[var(--color-menu-yellow)]">
                  priority: {hint.fetchPriority}
                </span>
              )}
            </div>
            <button type="button" onClick={() => onRemove(hint.id)} className="text-white/40 hover:text-white">
              <X size={13} />
            </button>
          </div>
        ))}
        {hints.length === 0 && <span className="text-xs text-text-faint">No resource hints configured.</span>}
      </div>

      <div className="grid grid-cols-1 gap-2 rounded-xl bg-white/5 p-3.5 sm:grid-cols-2 lg:grid-cols-5">
        <input
          value={href}
          onChange={(e) => setHref(e.target.value)}
          placeholder="/fonts/display.woff2"
          className="admin-input font-mono text-xs lg:col-span-2"
        />
        <select value={as} onChange={(e) => setAs(e.target.value as ResourceHintAs)} className="admin-input">
          {RESOURCE_HINT_AS_VALUES.map((v) => (
            <option key={v} value={v}>
              as={v}
            </option>
          ))}
        </select>
        <input
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="font/woff2 (optional)"
          className="admin-input font-mono text-xs"
        />
        <select
          value={fetchPriority}
          onChange={(e) => setFetchPriority(e.target.value as ResourceHintFetchPriority)}
          className="admin-input"
        >
          {RESOURCE_HINT_FETCH_PRIORITIES.map((v) => (
            <option key={v} value={v}>
              priority: {v}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs font-semibold text-white/70 sm:col-span-2 lg:col-span-4">
          <input
            type="checkbox"
            checked={crossorigin}
            onChange={(e) => setCrossorigin(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-white/30 bg-transparent"
          />
          crossorigin — required for fonts, since they're always fetched anonymously
        </label>
        <button
          type="button"
          onClick={commit}
          className="flex items-center justify-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
        >
          <Plus size={13} /> Add hint
        </button>
      </div>
    </div>
  );
}

function ResultBanner({ ok, message }: { ok: boolean; message: string }) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl px-4 py-3 text-xs ${
        ok ? "bg-emerald-500/10 text-emerald-300" : "bg-hot/15 text-hot"
      }`}
    >
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

/** Small read-only summary card for a pillar that lives on another
 * page — used for DNS Prefetch and Preconnect, which are configured
 * under Admin → Cache → DNS Cache rather than duplicated here. */
function CrossReferenceCard({
  icon,
  title,
  hint,
  status,
  values,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  status: string;
  values: string[];
}) {
  return (
    <Section title={title} hint={hint} defaultOpen={false}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-white/70">
          {icon}
          {status}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span key={v} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80">
              <code>{v}</code>
            </span>
          ))}
          {values.length === 0 && <span className="text-xs text-text-faint">None configured.</span>}
        </div>
        <Link
          href="/admin/cache/dns"
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/15"
        >
          Configure in DNS Cache <ArrowRight size={12} />
        </Link>
      </div>
    </Section>
  );
}

const LINK_PREFETCH_STRATEGY_OPTIONS: { value: LinkPrefetchStrategy; label: string }[] = [
  { value: "hover", label: "On hover (short delay)" },
  { value: "viewport", label: "As links scroll into view" },
  { value: "eager", label: "Everything, immediately" },
  { value: "disabled", label: "Disabled" },
];

const SPECULATIVE_MODE_OPTIONS: { value: SpeculativeLoadingMode; label: string }[] = [
  { value: "prefetch", label: "Prefetch (fetch the HTML only)" },
  { value: "prerender", label: "Prerender (fully render off-screen)" },
];

const SPECULATIVE_EAGERNESS_OPTIONS: { value: SpeculativeLoadingEagerness; label: string }[] = [
  { value: "conservative", label: "Conservative — only on a clear intent signal" },
  { value: "moderate", label: "Moderate — the browser's balanced default" },
  { value: "eager", label: "Eager — light hover/pointerdown signals" },
  { value: "immediate", label: "Immediate — as soon as a rule matches" },
];

export function CachePreloadingAdminClient() {
  const [preload, setPreload] = useState<CachePreloadSettings | null>(null);
  const [hints, setHints] = useState<ResourceHintSettings | null>(null);
  const [linkPrefetch, setLinkPrefetch] = useState<LinkPrefetchSettings | null>(null);
  const [speculative, setSpeculative] = useState<SpeculativeLoadingSettings | null>(null);
  const [dnsPrefetch, setDnsPrefetch] = useState<DnsPrefetchSettings | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<CachePreloadRunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/cache/preloading/settings")
      .then((res) => res.json())
      .then((data) => {
        const mapped = mapCachePreloadRow(data.settings);
        setPreload(mapped);
        setRunResult(mapped.lastRunSummary);
      })
      .catch(() => setPreload(DEFAULT_CACHE_PRELOAD_SETTINGS));

    fetch("/api/resource-hints/settings")
      .then((res) => res.json())
      .then((data) => setHints(mapResourceHintRow(data.settings)))
      .catch(() => setHints(DEFAULT_RESOURCE_HINT_SETTINGS));

    fetch("/api/link-prefetch/settings")
      .then((res) => res.json())
      .then((data) => setLinkPrefetch(mapLinkPrefetchRow(data.settings)))
      .catch(() => setLinkPrefetch(DEFAULT_LINK_PREFETCH_SETTINGS));

    fetch("/api/speculative-loading/settings")
      .then((res) => res.json())
      .then((data) => setSpeculative(mapSpeculativeLoadingRow(data.settings)))
      .catch(() => setSpeculative(DEFAULT_SPECULATIVE_LOADING_SETTINGS));

    fetchDnsPrefetchSettings()
      .then(setDnsPrefetch)
      .catch(() => setDnsPrefetch(DEFAULT_DNS_PREFETCH_SETTINGS));
  }, []);

  function patchPreload(p: Partial<CachePreloadSettings>) {
    setPreload((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }
  function patchHints(p: Partial<ResourceHintSettings>) {
    setHints((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }
  function patchLinkPrefetch(p: Partial<LinkPrefetchSettings>) {
    setLinkPrefetch((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }
  function patchSpeculative(p: Partial<SpeculativeLoadingSettings>) {
    setSpeculative((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  async function save() {
    if (!preload || !hints || !linkPrefetch || !speculative) return;
    setSaving(true);
    setError(null);
    try {
      const [preloadRes, hintsRes, linkRes, specRes] = await Promise.all([
        fetch("/api/admin/cache/preloading/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: preload.enabled,
            preloadUrls: preload.preloadUrls,
            concurrency: preload.concurrency,
            requestTimeoutMs: preload.requestTimeoutMs,
          }),
        }),
        fetch("/api/resource-hints/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: hints.enabled, hints: hints.hints }),
        }),
        fetch("/api/link-prefetch/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: linkPrefetch.enabled,
            strategy: linkPrefetch.strategy,
            hoverDelayMs: linkPrefetch.hoverDelayMs,
            maxConcurrentPrefetches: linkPrefetch.maxConcurrentPrefetches,
            excludePatterns: linkPrefetch.excludePatterns,
          }),
        }),
        fetch("/api/speculative-loading/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            enabled: speculative.enabled,
            mode: speculative.mode,
            eagerness: speculative.eagerness,
            includePatterns: speculative.includePatterns,
            excludePatterns: speculative.excludePatterns,
          }),
        }),
      ]);

      const [preloadData, hintsData, linkData, specData] = await Promise.all([
        preloadRes.json(),
        hintsRes.json(),
        linkRes.json(),
        specRes.json(),
      ]);
      if (!preloadRes.ok) throw new Error(preloadData.error ?? "Failed to save Cache Preloading settings.");
      if (!hintsRes.ok) throw new Error(hintsData.error ?? "Failed to save Resource Hints settings.");
      if (!linkRes.ok) throw new Error(linkData.error ?? "Failed to save Link Prefetch settings.");
      if (!specRes.ok) throw new Error(specData.error ?? "Failed to save Speculative Loading settings.");

      setPreload(mapCachePreloadRow(preloadData.settings));
      setHints(mapResourceHintRow(hintsData.settings));
      setLinkPrefetch(mapLinkPrefetchRow(linkData.settings));
      setSpeculative(mapSpeculativeLoadingRow(specData.settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function runPreloadNow() {
    setRunning(true);
    setRunError(null);
    try {
      const res = await fetch("/api/admin/cache/preloading/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Preload run failed.");
      setRunResult(data.result);
      patchPreload({ lastRunAt: new Date().toISOString(), lastRunStatus: data.result.failed === 0 ? "success" : data.result.ok === 0 ? "failed" : "partial" });
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Preload run failed.");
    } finally {
      setRunning(false);
    }
  }

  if (!preload || !hints || !linkPrefetch || !speculative || !dnsPrefetch) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Preloading &amp; Prefetching</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Six ways to get ahead of a visitor's next request — from warming the server-side cache before anyone
            arrives, down to telling a browser exactly which link they're about to click. DNS Prefetch and
            Preconnect already live under DNS Cache and are linked below rather than duplicated here.
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

      {/* ── 1. Cache Preloading ────────────────────────────────────────────── */}
      <Section
        title="Cache Preloading"
        hint="Server-side: fetches the URLs below against the live site so Full Page Cache, CDN / Edge Cache, and Fragment Cache are already warm before a real visitor pays for the first, uncached render."
      >
        <ToggleField
          label="Enable Cache Preloading"
          hint="Off means neither the manual button below nor the scheduled Automation → Infra → Cache Preloading job will run."
          checked={preload.enabled}
          onChange={(v) => patchPreload({ enabled: v })}
        />
        <div>
          <span className="mb-1 block text-sm font-semibold text-white">URLs to preload</span>
          <span className="mb-2 block text-xs text-text-faint">
            Relative paths, fetched with a bounded worker pool. Keep this to the handful of pages that matter most
            on a cold cache — this isn't meant to be a full-site crawl.
          </span>
          <ChipListField
            values={preload.preloadUrls}
            placeholder="/games/trending"
            onAdd={(v) => patchPreload({ preloadUrls: [...preload.preloadUrls, v] })}
            onRemove={(v) => patchPreload({ preloadUrls: preload.preloadUrls.filter((x) => x !== v) })}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Concurrency"
            hint="How many URLs to fetch in parallel."
            value={preload.concurrency}
            min={CACHE_PRELOAD_CONCURRENCY_LIMITS.min}
            max={CACHE_PRELOAD_CONCURRENCY_LIMITS.max}
            onChange={(v) => patchPreload({ concurrency: v })}
          />
          <NumberField
            label="Request timeout"
            value={preload.requestTimeoutMs}
            min={CACHE_PRELOAD_TIMEOUT_LIMITS.min}
            max={CACHE_PRELOAD_TIMEOUT_LIMITS.max}
            suffix="ms"
            onChange={(v) => patchPreload({ requestTimeoutMs: v })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={runPreloadNow}
            disabled={running || !preload.enabled}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
            {running ? "Preloading…" : "Preload now"}
          </button>
          <span className="text-xs text-text-faint">
            Last run: {timeAgo(preload.lastRunAt)}
            {preload.lastRunStatus && ` — ${preload.lastRunStatus}`}. Also runs on its own schedule from{" "}
            <Link href="/admin/automation" className="underline hover:text-white">
              Admin → Automation → Infra
            </Link>
            .
          </span>
        </div>
        {runError && <ResultBanner ok={false} message={runError} />}
        {runResult && !runError && (
          <ResultBanner
            ok={runResult.failed === 0}
            message={`Preloaded ${runResult.ok}/${runResult.total} URLs in ${runResult.durationMs}ms${
              runResult.failed ? ` — ${runResult.failed} failed` : ""
            }.`}
          />
        )}
      </Section>

      {/* ── 2. Link Prefetch ──────────────────────────────────────────────── */}
      <Section
        title="Link Prefetch"
        hint="Client-side: when a visitor is likely about to click a same-origin link, calls the router's own prefetch() ahead of the actual click — so the click feels instant."
      >
        <ToggleField
          label="Enable Link Prefetch"
          checked={linkPrefetch.enabled}
          onChange={(v) => patchLinkPrefetch({ enabled: v })}
        />
        <SelectField
          label="Strategy"
          value={linkPrefetch.strategy}
          options={LINK_PREFETCH_STRATEGY_OPTIONS}
          disabled={!linkPrefetch.enabled}
          onChange={(v) => patchLinkPrefetch({ strategy: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <NumberField
            label="Hover delay"
            hint="Only used by the “on hover” strategy."
            value={linkPrefetch.hoverDelayMs}
            min={LINK_PREFETCH_HOVER_DELAY_LIMITS.min}
            max={LINK_PREFETCH_HOVER_DELAY_LIMITS.max}
            suffix="ms"
            disabled={!linkPrefetch.enabled || linkPrefetch.strategy !== "hover"}
            onChange={(v) => patchLinkPrefetch({ hoverDelayMs: v })}
          />
          <NumberField
            label="Max concurrent prefetches"
            value={linkPrefetch.maxConcurrentPrefetches}
            min={LINK_PREFETCH_CONCURRENCY_LIMITS.min}
            max={LINK_PREFETCH_CONCURRENCY_LIMITS.max}
            disabled={!linkPrefetch.enabled}
            onChange={(v) => patchLinkPrefetch({ maxConcurrentPrefetches: v })}
          />
        </div>
        <div>
          <span className="mb-1 block text-sm font-semibold text-white">Excluded paths</span>
          <span className="mb-2 block text-xs text-text-faint">
            Links whose path starts with one of these are never prefetched — for destructive or stateful routes.
          </span>
          <ChipListField
            values={linkPrefetch.excludePatterns}
            placeholder="/checkout"
            onAdd={(v) => patchLinkPrefetch({ excludePatterns: [...linkPrefetch.excludePatterns, v] })}
            onRemove={(v) =>
              patchLinkPrefetch({ excludePatterns: linkPrefetch.excludePatterns.filter((x) => x !== v) })
            }
          />
        </div>
      </Section>

      {/* ── 3. DNS Prefetch (cross-reference) ────────────────────────────── */}
      <CrossReferenceCard
        icon={<Network size={14} className="text-white/50" />}
        title="DNS Prefetch"
        hint="Resolves a third-party host's DNS ahead of time. Configured under Admin → Cache → DNS Cache → Browser DNS Cache, not duplicated here."
        status={dnsPrefetch.dnsPrefetchControlEnabled ? "Enabled" : "Disabled"}
        values={dnsPrefetch.dnsPrefetchDomains}
      />

      {/* ── 4. Preconnect (cross-reference) ──────────────────────────────── */}
      <CrossReferenceCard
        icon={<Plug size={14} className="text-white/50" />}
        title="Preconnect"
        hint="DNS resolution plus the TCP/TLS handshake, for hosts about to be used imminently. Same table as DNS Prefetch above — configured in the same place."
        status={dnsPrefetch.preconnectDomains.length > 0 ? "Configured" : "Not configured"}
        values={dnsPrefetch.preconnectDomains}
      />

      {/* ── 5. Resource Hints ─────────────────────────────────────────────── */}
      <Section
        title="Resource Hints"
        hint={
          <>
            <code>{'<link rel="preload">'}</code> for specific critical assets — a hero font, an above-the-fold
            image, critical CSS/JS. Distinct from Static Asset Cache (which sets Cache-Control headers per asset
            type) and from DNS Prefetch above (which only warms a host, not a specific URL).
          </>
        }
      >
        <ToggleField label="Enable Resource Hints" checked={hints.enabled} onChange={(v) => patchHints({ enabled: v })} />
        <HintListField
          hints={hints.hints}
          onAdd={(hint) =>
            patchHints({ hints: [...hints.hints, { ...hint, id: Math.random().toString(36).slice(2, 10) }] })
          }
          onRemove={(id) => patchHints({ hints: hints.hints.filter((h) => h.id !== id) })}
        />
      </Section>

      {/* ── 6. Speculative Loading ────────────────────────────────────────── */}
      <Section
        title="Speculative Loading"
        badge={
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
            Experimental
          </span>
        }
        hint="The browser Speculation Rules API — prefetches or fully prerenders same-origin pages matching the patterns below, well past what Link Prefetch does. Off by default: prerendering has real side effects (analytics firing early, non-idempotent GETs) if pointed at the wrong URLs."
      >
        <ToggleField
          label="Enable Speculative Loading"
          hint="Opt-in — review the include/exclude patterns below before turning this on."
          checked={speculative.enabled}
          onChange={(v) => patchSpeculative({ enabled: v })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Mode"
            value={speculative.mode}
            options={SPECULATIVE_MODE_OPTIONS}
            disabled={!speculative.enabled}
            onChange={(v) => patchSpeculative({ mode: v })}
          />
          <SelectField
            label="Eagerness"
            value={speculative.eagerness}
            options={SPECULATIVE_EAGERNESS_OPTIONS}
            disabled={!speculative.enabled}
            onChange={(v) => patchSpeculative({ eagerness: v })}
          />
        </div>
        <div>
          <span className="mb-1 block text-sm font-semibold text-white">Included path patterns</span>
          <span className="mb-2 block text-xs text-text-faint">
            URL patterns eligible for speculation — e.g. <code>/games/*</code>.
          </span>
          <ChipListField
            values={speculative.includePatterns}
            placeholder="/games/*"
            onAdd={(v) => patchSpeculative({ includePatterns: [...speculative.includePatterns, v] })}
            onRemove={(v) =>
              patchSpeculative({ includePatterns: speculative.includePatterns.filter((x) => x !== v) })
            }
          />
        </div>
        <div>
          <span className="mb-1 block text-sm font-semibold text-white">Excluded path patterns</span>
          <span className="mb-2 block text-xs text-text-faint">
            Always takes priority over the include list above — keep admin, account, checkout, and API routes here.
          </span>
          <ChipListField
            values={speculative.excludePatterns}
            placeholder="/admin/*"
            onAdd={(v) => patchSpeculative({ excludePatterns: [...speculative.excludePatterns, v] })}
            onRemove={(v) =>
              patchSpeculative({ excludePatterns: speculative.excludePatterns.filter((x) => x !== v) })
            }
          />
        </div>
      </Section>
    </div>
  );
}
