"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Eraser,
  FileJson2,
  Fingerprint,
  GitMerge,
  Loader2,
  Plus,
  RefreshCw,
  Route,
  Save,
  Server,
  Shield,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  mapApiCacheRow,
  DEFAULT_API_CACHE_SETTINGS,
  DEFAULT_ENDPOINT_RULES,
  ETAG_ALGORITHMS,
  HTTP_METHODS,
  type ApiCacheSettings,
  type EndpointTtlRule,
  type ETagAlgorithm,
  type HttpMethod,
  type ApiCacheType,
} from "@/lib/api-cache-settings";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function formatDuration(seconds: number): string {
  if (seconds === 0) return "no cache";
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function nanoid(): string {
  return `rule-${Math.random().toString(36).slice(2, 10)}`;
}

// ── Shared sub-components ────────────────────────────────────────────────────

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
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
  tone: "emerald" | "amber" | "neutral" | "blue";
}) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-500/15 text-emerald-400"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-400"
        : tone === "blue"
          ? "bg-blue-500/15 text-blue-400"
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

// ── Method multi-select chip bar ─────────────────────────────────────────────

function MethodChips({
  value,
  disabled,
  onChange,
}: {
  value: HttpMethod[];
  disabled: boolean;
  onChange: (v: HttpMethod[]) => void;
}) {
  function toggle(m: HttpMethod) {
    if (value.includes(m)) {
      const next = value.filter((x) => x !== m);
      if (next.length > 0) onChange(next);
    } else {
      onChange([...value, m]);
    }
  }
  return (
    <div className="flex flex-wrap gap-1">
      {HTTP_METHODS.map((m) => (
        <button
          key={m}
          type="button"
          disabled={disabled}
          onClick={() => toggle(m)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            value.includes(m)
              ? "bg-[var(--color-menu-yellow)] text-black"
              : "bg-white/10 text-white/60 hover:bg-white/15"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

// ── Cache type badge ─────────────────────────────────────────────────────────

function CacheTypeBadge({ type }: { type: ApiCacheType }) {
  const cls =
    type === "graphql"
      ? "bg-purple-500/15 text-purple-400"
      : type === "json"
        ? "bg-blue-500/15 text-blue-400"
        : "bg-emerald-500/15 text-emerald-400";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      {type === "graphql" ? "GraphQL" : type === "json" ? "JSON" : "REST"}
    </span>
  );
}

// ── Endpoint rule row ────────────────────────────────────────────────────────

function EndpointRuleRow({
  rule,
  disabled,
  purging,
  onPatch,
  onRemove,
  onPurge,
}: {
  rule: EndpointTtlRule;
  disabled: boolean;
  purging: boolean;
  onPatch: (patch: Partial<EndpointTtlRule>) => void;
  onRemove: () => void;
  onPurge: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-white/5 p-4">
      {/* ── Collapsed summary row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <code className="truncate rounded bg-black/30 px-2 py-0.5 text-xs font-mono text-white/80">
            {rule.pattern}
          </code>
          <CacheTypeBadge type={rule.cacheType} />
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
              rule.ttlSeconds === 0
                ? "bg-red-500/15 text-red-400"
                : "bg-white/10 text-white/60"
            }`}
          >
            {formatDuration(rule.ttlSeconds)}
          </span>
          {rule.note && (
            <span className="truncate text-xs text-text-faint">{rule.note}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* Per-row enable toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={rule.enabled}
            disabled={disabled}
            onClick={() => onPatch({ enabled: !rule.enabled })}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
              rule.enabled ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
            } ${disabled ? "cursor-not-allowed" : ""}`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                rule.enabled ? "translate-x-[18px]" : "translate-x-0.5"
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-full bg-white/5 p-1 text-white/60 hover:bg-white/10"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="rounded-full bg-white/5 p-1 text-white/40 hover:bg-red-500/15 hover:text-red-400 disabled:opacity-40"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Expanded edit panel ── */}
      {expanded && (
        <div className="flex flex-col gap-4 border-t border-white/10 pt-4">
          {/* Pattern */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/70">URL pattern</span>
            <input
              type="text"
              value={rule.pattern}
              disabled={disabled}
              onChange={(e) => onPatch({ pattern: e.target.value })}
              placeholder="/api/*"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50"
            />
            <span className="text-[11px] text-text-faint">
              Glob: <code>*</code> = any segment, <code>**</code> = any path. Rules are
              evaluated top-to-bottom; first match wins.
            </span>
          </div>

          {/* Cache type */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/70">Cache type</span>
            <div className="flex flex-wrap gap-1.5">
              {(["rest", "graphql", "json"] as ApiCacheType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPatch({ cacheType: t })}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                    rule.cacheType === t
                      ? "bg-[var(--color-menu-yellow)] text-black"
                      : "bg-white/10 text-white/60 hover:bg-white/15"
                  }`}
                >
                  {t === "graphql" ? "GraphQL" : t === "json" ? "JSON Response" : "REST"}
                </button>
              ))}
            </div>
          </div>

          {/* Methods */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/70">HTTP methods</span>
            <MethodChips
              value={rule.methods}
              disabled={disabled}
              onChange={(m) => onPatch({ methods: m })}
            />
          </div>

          {/* TTL */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/70">
              TTL <span className="font-normal text-text-faint">(0 = bypass / never cache)</span>
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={86400}
                value={rule.ttlSeconds}
                disabled={disabled}
                onChange={(e) =>
                  onPatch({ ttlSeconds: Math.min(86400, Math.max(0, Number(e.target.value) || 0)) })
                }
                className="w-28 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50"
              />
              <span className="text-xs text-text-faint">
                s ≈ <span className="font-semibold text-white/70">{formatDuration(rule.ttlSeconds)}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {[0, 60, 300, 600, 900, 3600].map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPatch({ ttlSeconds: p })}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40 ${
                    rule.ttlSeconds === p
                      ? "bg-[var(--color-menu-yellow)] text-black"
                      : "bg-white/10 text-white/70 hover:bg-white/15"
                  }`}
                >
                  {formatDuration(p)}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-white/70">Note</span>
            <input
              type="text"
              value={rule.note}
              disabled={disabled}
              maxLength={256}
              onChange={(e) => onPatch({ note: e.target.value })}
              placeholder="Human-readable description"
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-white/30 disabled:opacity-50"
            />
          </div>

          {/* Per-rule purge */}
          <div className="flex items-center justify-end border-t border-white/10 pt-2">
            <button
              type="button"
              onClick={onPurge}
              disabled={purging || disabled}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/10 disabled:opacity-50"
            >
              {purging ? <Loader2 size={12} className="animate-spin" /> : <Eraser size={12} />}
              Purge this endpoint
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ETag preview ─────────────────────────────────────────────────────────────

function ETagPreview({ algorithm, weak }: { algorithm: ETagAlgorithm; weak: boolean }) {
  const SAMPLES: Record<ETagAlgorithm, string> = {
    md5: "d41d8cd98f00b204e9800998ecf8427e",
    sha1: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  };
  const hash = SAMPLES[algorithm].slice(0, 16) + "…";
  const etag = weak ? `W/"${hash}"` : `"${hash}"`;
  return (
    <div className="mt-1 rounded-lg bg-black/30 px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-text-faint">Preview</span>
      <code className="mt-1 block break-all text-xs text-white/80">ETag: {etag}</code>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function CacheApiAdminClient() {
  const [settings, setSettings] = useState<ApiCacheSettings>(DEFAULT_API_CACHE_SETTINGS);
  const [draft, setDraft] = useState<ApiCacheSettings>(DEFAULT_API_CACHE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [purgingAll, setPurgingAll] = useState(false);
  const [purgingPattern, setPurgingPattern] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(settings);

  // ── Load ─────────────────────────────────────────────────────────────────

  const load = useCallback(() => {
    return fetch("/api/admin/cache/api-cache/settings")
      .then((r) => r.json())
      .then((d) => {
        const mapped = mapApiCacheRow(d.settings ?? null);
        setSettings(mapped);
        setDraft(mapped);
      })
      .catch(() => {
        setSettings(DEFAULT_API_CACHE_SETTINGS);
        setDraft(DEFAULT_API_CACHE_SETTINGS);
      });
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  // ── Patch helpers ─────────────────────────────────────────────────────────

  const patch = useCallback(<K extends keyof ApiCacheSettings>(key: K, value: ApiCacheSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const patchRule = useCallback((id: string, rulePatch: Partial<EndpointTtlRule>) => {
    setDraft((prev) => ({
      ...prev,
      endpointRules: prev.endpointRules.map((r) => (r.id === id ? { ...r, ...rulePatch } : r)),
    }));
  }, []);

  const addRule = useCallback(() => {
    const newRule: EndpointTtlRule = {
      id: nanoid(),
      pattern: "/api/",
      methods: ["GET", "HEAD"],
      ttlSeconds: 300,
      enabled: true,
      cacheType: "rest",
      note: "",
    };
    setDraft((prev) => ({ ...prev, endpointRules: [...prev.endpointRules, newRule] }));
  }, []);

  const removeRule = useCallback((id: string) => {
    setDraft((prev) => ({
      ...prev,
      endpointRules: prev.endpointRules.filter((r) => r.id !== id),
    }));
  }, []);

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaveStatus("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/cache/api-cache/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed.");
      const updated = mapApiCacheRow(data.settings);
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

  // ── Purge ─────────────────────────────────────────────────────────────────

  const runPurge = async (body: { scope: "all" | "endpoint"; pattern?: string }) => {
    try {
      const res = await fetch("/api/admin/cache/api-cache/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) throw new Error(data.error ?? "Purge failed.");
      if (data.settings) {
        const updated = mapApiCacheRow(data.settings);
        setSettings(updated);
        setDraft((prev) => (isDirty ? prev : updated));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Purge failed.");
    }
  };

  const handlePurgeAll = async () => {
    setPurgingAll(true);
    await runPurge({ scope: "all" });
    setPurgingAll(false);
  };

  const handlePurgeEndpoint = async (pattern: string) => {
    setPurgingPattern(pattern);
    await runPurge({ scope: "endpoint", pattern });
    setPurgingPattern(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-text-faint">
        <Loader2 size={16} className="animate-spin" /> Loading API Cache settings…
      </div>
    );
  }

  const activeRules = draft.endpointRules.filter((r) => r.enabled);
  const bypassRules = draft.endpointRules.filter((r) => r.ttlSeconds === 0);

  return (
    <div className="max-w-3xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">API Cache</h1>
          <p className="mt-1 max-w-xl text-sm text-text-faint">
            Controls caching of this app&apos;s own REST, GraphQL, and JSON API responses — and how ETag &amp;
            Last-Modified headers are generated so clients can make conditional requests for 304s instead
            of full response bodies.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white hover:bg-white/10"
          >
            <RefreshCw size={13} />
            Refresh
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

      {/* ── Summary chips ───────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip
          label="Status"
          value={draft.enabled ? "Enabled" : "Disabled"}
          tone={draft.enabled ? "emerald" : "neutral"}
        />
        <StatChip label="Default TTL" value={formatDuration(draft.defaultTtlSeconds)} tone="neutral" />
        <StatChip
          label="Active rules"
          value={`${activeRules.length} of ${draft.endpointRules.length}`}
          tone={activeRules.length > 0 ? "emerald" : "neutral"}
        />
        <StatChip
          label="Last purge"
          value={settings.lastPurgedAt ? timeAgo(settings.lastPurgedAt) : "Never"}
          tone="neutral"
        />
      </div>

      {/* ── Global Settings ─────────────────────────────────────────────────── */}
      <Section
        title="Global Settings"
        icon={<Server size={16} />}
        hint="Master switch and defaults that every endpoint rule inherits when it doesn't specify its own TTL."
      >
        <ToggleField
          label="API Cache"
          hint="Master switch — disabling this bypasses every rule below and sends no Cache-Control headers for API responses."
          checked={draft.enabled}
          onChange={(v) => patch("enabled", v)}
        />

        <div className="grid grid-cols-1 gap-4 border-t border-white/10 pt-4 sm:grid-cols-2">
          <NumberField
            label="Default TTL"
            hint="Cache-Control max-age applied to API responses with no matching endpoint rule."
            value={draft.defaultTtlSeconds}
            min={0}
            max={86400}
            suffix="seconds"
            disabled={!draft.enabled}
            onChange={(v) => patch("defaultTtlSeconds", v)}
          />
          <NumberField
            label="Stale-while-revalidate"
            hint="Serve a stale response for up to this long while the fresh value is fetched in the background. 0 = off."
            value={draft.staleWhileRevalidateSeconds}
            min={0}
            max={600}
            suffix="seconds"
            disabled={!draft.enabled}
            onChange={(v) => patch("staleWhileRevalidateSeconds", v)}
          />
        </div>

        <div className="border-t border-white/10 pt-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-text-faint">Bypass Conditions</p>
          <ToggleField
            label="Bypass for authenticated requests"
            hint="Don't cache responses when the request carries a valid session or Authorization header — prevents personalised data (favourites, profile) leaking across users."
            checked={draft.bypassAuthenticated}
            disabled={!draft.enabled}
            onChange={(v) => patch("bypassAuthenticated", v)}
          />
          <ToggleField
            label="Bypass when query string is present"
            hint="Useful for search and filter endpoints where every distinct ?q= permutation is a unique resource. Turn off for paginated endpoints like /api/games?page=2 where params are safe to include in the cache key."
            checked={draft.bypassQueryString}
            disabled={!draft.enabled}
            onChange={(v) => patch("bypassQueryString", v)}
          />
        </div>

        <div className="border-t border-white/10 pt-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-text-faint">Vary Headers</p>
          <p className="mb-3 text-xs text-text-faint">
            Added to the <code className="rounded bg-black/20 px-1">Vary:</code> response header so
            caches downstream (CDN, browser) store separate entries for different request variants.
          </p>
          <div className="flex flex-col gap-1">
            <ToggleField
              label="Vary by Accept"
              hint="Separate cache entries for JSON vs HTML vs other MIME types."
              checked={draft.varyByAccept}
              disabled={!draft.enabled}
              onChange={(v) => patch("varyByAccept", v)}
            />
            <ToggleField
              label="Vary by Origin"
              hint="Separate cache entries per origin — needed when CORS pre-flight responses differ."
              checked={draft.varyByOrigin}
              disabled={!draft.enabled}
              onChange={(v) => patch("varyByOrigin", v)}
            />
            <ToggleField
              label="Vary by Accept-Encoding"
              hint="Separate entries for gzip vs br vs identity — almost always the right call."
              checked={draft.varyByAcceptEncoding}
              disabled={!draft.enabled}
              onChange={(v) => patch("varyByAcceptEncoding", v)}
            />
          </div>
        </div>
      </Section>

      {/* ── REST API Caching ─────────────────────────────────────────────────── */}
      <Section
        title="REST API Caching"
        icon={<Route size={16} />}
        hint="Cache-Control and Vary headers applied to JSON REST endpoints. Pairs with the CDN layer — what Next.js sets here, Cloudflare can honour at the edge."
      >
        <ToggleField
          label="REST API Caching"
          hint="Emit Cache-Control headers on REST JSON responses. Requires the master switch above to also be on."
          checked={draft.restEnabled}
          disabled={!draft.enabled}
          onChange={(v) => patch("restEnabled", v)}
        />

        <div className="mt-3 rounded-xl bg-white/5 p-4 text-xs text-text-faint">
          <p className="mb-2 font-semibold text-white/70">How it works</p>
          <p>
            When enabled, route handlers and middleware read these settings and attach the appropriate
            headers to outgoing responses. The CDN layer (Admin → Cache → CDN) then honours those
            headers to serve subsequent requests from the edge without touching Node.js.
          </p>
          <p className="mt-2">
            Example output for a <code className="rounded bg-black/20 px-1">300s</code> TTL with SWR{" "}
            <code className="rounded bg-black/20 px-1">{draft.staleWhileRevalidateSeconds}s</code>:
          </p>
          <code className="mt-2 block rounded-lg bg-black/30 px-3 py-2 text-white/80">
            Cache-Control: public, max-age={draft.defaultTtlSeconds}
            {draft.staleWhileRevalidateSeconds > 0
              ? `, stale-while-revalidate=${draft.staleWhileRevalidateSeconds}`
              : ""}
            <br />
            Vary:{" "}
            {[
              draft.varyByAccept && "Accept",
              draft.varyByOrigin && "Origin",
              draft.varyByAcceptEncoding && "Accept-Encoding",
            ]
              .filter(Boolean)
              .join(", ") || "(none)"}
          </code>
        </div>
      </Section>

      {/* ── GraphQL Caching ──────────────────────────────────────────────────── */}
      <Section
        title="GraphQL Caching"
        icon={<GitMerge size={16} />}
        hint="Caches GraphQL query results by hashing the POST body (query + variables) to form the cache key. Mutations are never cached."
        defaultOpen={false}
      >
        <ToggleField
          label="GraphQL Caching"
          hint="Cache GET and POST GraphQL query responses. POST bodies are content-hashed to form unique cache keys. GraphQL mutations (operationType: 'mutation') bypass the cache unconditionally."
          checked={draft.graphqlEnabled}
          disabled={!draft.enabled}
          onChange={(v) => patch("graphqlEnabled", v)}
        />

        <div className="mt-3 rounded-xl bg-white/5 p-4 text-xs text-text-faint">
          <p className="mb-2 font-semibold text-white/70">Cache key strategy</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <strong className="text-white/70">GET requests</strong> — cache key is the full URL
              (query and operation name are in the query string).
            </li>
            <li>
              <strong className="text-white/70">POST requests</strong> — cache key is a SHA-256
              hash of the normalised JSON body: <code className="rounded bg-black/20 px-1">{"{"}&quot;query&quot;:…,&quot;variables&quot;:…{"}"}</code>.
            </li>
            <li>
              <strong className="text-white/70">Mutations</strong> — always bypass regardless of
              settings; a mutation that appears to be cached is a bug.
            </li>
          </ul>
          <p className="mt-2 text-amber-400/80">
            ⚠ Persisted query caching (APQ) requires a shared store (Redis/Memcached) configured
            in Admin → Cache → Object.
          </p>
        </div>
      </Section>

      {/* ── JSON Response Cache ───────────────────────────────────────────────── */}
      <Section
        title="JSON Response Cache"
        icon={<FileJson2 size={16} />}
        hint="In-process response-level cache — similar to Fragment Cache but for API endpoints rather than HTML page sections. Sits above Fragment Cache and below Next.js's own fetch() cache."
        defaultOpen={false}
      >
        <ToggleField
          label="JSON Response Cache"
          hint="Cache serialised JSON API responses in this process's memory. Faster than re-running route handler logic on repeat requests with identical inputs."
          checked={draft.jsonResponseEnabled}
          disabled={!draft.enabled}
          onChange={(v) => patch("jsonResponseEnabled", v)}
        />

        <div className="mt-3 rounded-xl bg-white/5 p-4 text-xs text-text-faint">
          <p className="mb-2 font-semibold text-white/70">Cache hierarchy</p>
          <div className="flex flex-col gap-1">
            {[
              { label: "CDN / Edge Cache", sublabel: "Cloudflare — Admin → Cache → CDN" },
              { label: "Full Page Cache", sublabel: "Nginx/Varnish — Admin → Cache → Full Page" },
              { label: "API Cache (this)", sublabel: "JSON response cache — in-process" },
              { label: "Fragment Cache", sublabel: "HTML page sections — Admin → Cache → Fragment" },
              { label: "Object Cache", sublabel: "Redis/Memcached — Admin → Cache → Object" },
              { label: "Database", sublabel: "Supabase + DB optimisation layer" },
            ].map(({ label, sublabel }, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 rounded px-2 py-1 ${
                  label.startsWith("API Cache") ? "bg-[var(--color-menu-yellow)]/10" : ""
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    label.startsWith("API Cache") ? "bg-[var(--color-menu-yellow)]" : "bg-white/20"
                  }`}
                />
                <span className={label.startsWith("API Cache") ? "font-bold text-white/90" : "text-white/50"}>
                  {label}
                </span>
                <span className="ml-auto">{sublabel}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Endpoint TTL Rules ────────────────────────────────────────────────── */}
      <Section
        title="Endpoint TTL Rules"
        icon={<Zap size={16} />}
        hint="Per-endpoint TTL overrides evaluated top-to-bottom; first matching pattern wins. TTL 0 = bypass (never cache that endpoint)."
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-xs text-text-faint">
            <span>
              <span className="font-bold text-white">{draft.endpointRules.length}</span> rules
            </span>
            <span>·</span>
            <span>
              <span className="font-bold text-emerald-400">{activeRules.length}</span> active
            </span>
            <span>·</span>
            <span>
              <span className="font-bold text-red-400">{bypassRules.length}</span> bypass
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePurgeAll}
              disabled={purgingAll || !draft.enabled}
              className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1.5 text-[11px] font-bold text-red-400 hover:bg-red-500/25 disabled:opacity-50"
            >
              {purgingAll ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Purge all
            </button>
            <button
              type="button"
              onClick={addRule}
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/10"
            >
              <Plus size={12} />
              Add rule
            </button>
          </div>
        </div>

        {draft.endpointRules.length === 0 ? (
          <div className="rounded-xl bg-white/5 px-4 py-6 text-center text-xs text-text-faint">
            No endpoint rules yet. Add one above or{" "}
            <button
              type="button"
              onClick={() =>
                setDraft((prev) => ({ ...prev, endpointRules: DEFAULT_ENDPOINT_RULES }))
              }
              className="text-[var(--color-menu-yellow)] underline"
            >
              restore defaults
            </button>
            .
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {draft.endpointRules.map((rule) => (
              <EndpointRuleRow
                key={rule.id}
                rule={rule}
                disabled={!draft.enabled}
                purging={purgingPattern === rule.pattern}
                onPatch={(p) => patchRule(rule.id, p)}
                onRemove={() => removeRule(rule.id)}
                onPurge={() => handlePurgeEndpoint(rule.pattern)}
              />
            ))}
          </div>
        )}

        {settings.lastPurgeSummary && (
          <p className="text-[11px] text-text-faint">
            Last purge:{" "}
            {settings.lastPurgeSummary.scope === "all"
              ? "all endpoints"
              : settings.lastPurgeSummary.pattern}
            {settings.lastPurgedAt ? ` · ${timeAgo(settings.lastPurgedAt)}` : ""}
          </p>
        )}
      </Section>

      {/* ── Conditional Requests ─────────────────────────────────────────────── */}
      <Section
        title="Conditional Requests"
        icon={<Fingerprint size={16} />}
        hint="ETag and Last-Modified headers let clients ask 'has this changed?' and receive a 304 Not Modified instead of a full response body, saving bandwidth and TTFB on unchanged resources."
      >
        <ToggleField
          label="Conditional Requests"
          hint="Master toggle for both ETag and Last-Modified header generation. When off, neither header is emitted and clients always receive full responses."
          checked={draft.conditionalRequestsEnabled}
          onChange={(v) => patch("conditionalRequestsEnabled", v)}
        />

        {/* ── ETag ── */}
        <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 text-[10px] font-bold text-white">
              ET
            </span>
            <p className="text-sm font-bold text-white">ETag</p>
          </div>

          <ToggleField
            label="Generate ETag headers"
            hint="Compute an opaque hash of each API response body and send it as an ETag. Clients include it in If-None-Match on the next request; the server replies 304 if the content hasn't changed."
            checked={draft.etagEnabled}
            disabled={!draft.conditionalRequestsEnabled}
            onChange={(v) => patch("etagEnabled", v)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField<ETagAlgorithm>
              label="Hash algorithm"
              hint="Algorithm used to hash the JSON response body. SHA-256 gives the best collision resistance; MD5 is fastest but deprecated for security use."
              value={draft.etagAlgorithm}
              disabled={!draft.conditionalRequestsEnabled || !draft.etagEnabled}
              options={ETAG_ALGORITHMS.map((a) => ({
                value: a,
                label: a === "md5" ? "MD5 (fastest)" : a === "sha1" ? "SHA-1" : "SHA-256 (recommended)",
              }))}
              onChange={(v) => patch("etagAlgorithm", v)}
            />
          </div>

          <ToggleField
            label="Use weak ETags"
            hint="Prefix ETags with W/ (weak comparison). Weak ETags survive gzip re-encoding, chunked transfer, and minor serialisation differences — the right default for JSON APIs. Strong ETags require byte-for-byte identity."
            checked={draft.etagWeak}
            disabled={!draft.conditionalRequestsEnabled || !draft.etagEnabled}
            onChange={(v) => patch("etagWeak", v)}
          />

          {draft.etagEnabled && draft.conditionalRequestsEnabled && (
            <ETagPreview algorithm={draft.etagAlgorithm} weak={draft.etagWeak} />
          )}

          <div className="rounded-xl bg-white/5 p-4 text-xs text-text-faint">
            <p className="mb-1 font-semibold text-white/70">Request / Response flow</p>
            <ol className="ml-4 list-decimal space-y-1">
              <li>
                First request: server responds with full body +{" "}
                <code className="rounded bg-black/20 px-1">ETag: W/&quot;abc123&quot;</code>
              </li>
              <li>
                Client stores ETag; next request includes{" "}
                <code className="rounded bg-black/20 px-1">If-None-Match: W/&quot;abc123&quot;</code>
              </li>
              <li>
                If content unchanged: server replies <code className="rounded bg-black/20 px-1">304 Not Modified</code>{" "}
                with no body — saving bandwidth.
              </li>
              <li>
                If content changed: server recomputes ETag, replies{" "}
                <code className="rounded bg-black/20 px-1">200 OK</code> with fresh body + new ETag.
              </li>
            </ol>
          </div>
        </div>

        {/* ── Last-Modified ── */}
        <div className="flex flex-col gap-3 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-white/60" />
            <p className="text-sm font-bold text-white">Last-Modified</p>
          </div>

          <ToggleField
            label="Generate Last-Modified headers"
            hint="Attach the resource's last-updated timestamp as Last-Modified. Clients include it in If-Modified-Since on the next request; the server replies 304 if nothing has changed since then."
            checked={draft.lastModifiedEnabled}
            disabled={!draft.conditionalRequestsEnabled}
            onChange={(v) => patch("lastModifiedEnabled", v)}
          />

          <NumberField
            label="Timestamp granularity"
            hint="Round Last-Modified timestamps down to the nearest N seconds. 1 = exact second (default). Increase to reduce unnecessary cache misses caused by insignificant sub-second DB write jitter."
            value={draft.lastModifiedGranularitySeconds}
            min={1}
            max={3600}
            suffix="seconds"
            disabled={!draft.conditionalRequestsEnabled || !draft.lastModifiedEnabled}
            onChange={(v) => patch("lastModifiedGranularitySeconds", v)}
          />

          <div className="rounded-xl bg-white/5 p-4 text-xs text-text-faint">
            <p className="mb-1 font-semibold text-white/70">ETag vs Last-Modified</p>
            <p>
              Both mechanisms achieve the same outcome (304 on unchanged content) but via different
              comparison strategies. ETags compare content identity (hash); Last-Modified compares
              time. They can coexist — browsers and CDNs will use whichever is available.
            </p>
            <p className="mt-2">
              <span className="font-semibold text-white/70">When to prefer ETag:</span> content that
              can be regenerated with the same bytes from the same inputs (game data, category
              lists).
            </p>
            <p className="mt-1">
              <span className="font-semibold text-white/70">When to prefer Last-Modified:</span>{" "}
              content where a DB <code className="rounded bg-black/20 px-1">updated_at</code> column
              is the most natural freshness signal (posts, user profiles).
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}
