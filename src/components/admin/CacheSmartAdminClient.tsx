"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Flame,
  Loader2,
  Lock,
  Plus,
  RefreshCcw,
  Save,
  Shield,
  Tag,
  Trash2,
  X,
  XCircle,
  GitMerge,
  RotateCcw,
  Wifi,
} from "lucide-react";
import {
  mapSmartCacheSettingsRow,
  DEFAULT_SMART_CACHE_SETTINGS,
  TAG_HEADER_NAMES,
  SMART_CACHE_WARMING_CONCURRENCY,
  SMART_CACHE_WARMING_TIMEOUT,
  SMART_CACHE_REGEN_CONCURRENCY,
  SMART_CACHE_REGEN_DELAY,
  SMART_CACHE_COALESCING_WINDOW,
  SMART_CACHE_COALESCING_WAITERS,
  SMART_CACHE_LOCK_TTL,
  SMART_CACHE_LOCK_TIMEOUT,
  SMART_CACHE_LOCK_RETRY,
  SMART_CACHE_SWR_SECONDS,
  SMART_CACHE_SIE_SECONDS,
  SMART_CACHE_MAX_TAGS,
  SMART_CACHE_INVALIDATION_DELAY,
  type SmartCacheSettings,
  type InvalidationRule,
  type CacheTag,
  type InvalidationTrigger,
  type WarmingStatus,
} from "@/lib/smart-cache-settings";

// ── Building blocks ──────────────────────────────────────────────────────────

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
        <div>
          <div className="flex items-center gap-2">
            {icon && <span className="text-[var(--color-menu-yellow)]">{icon}</span>}
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
  disabled,
  unit,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <label className="text-sm font-semibold text-white">{label}</label>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
          }}
          className="w-32 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-[var(--color-menu-yellow)] focus:outline-none disabled:cursor-not-allowed"
        />
        {unit && <span className="text-xs text-text-faint">{unit}</span>}
      </div>
    </div>
  );
}

function SelectField({
  label,
  hint,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <label className="text-sm font-semibold text-white">{label}</label>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-[var(--color-menu-yellow)] focus:outline-none disabled:cursor-not-allowed"
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
  disabled,
}: {
  values: string[];
  placeholder?: string;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white">
            {v}
            <button type="button" onClick={() => onRemove(v)} className="ml-0.5 text-white/50 hover:text-white">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const v = draft.trim();
              if (v && !values.includes(v)) {
                onAdd(v);
                setDraft("");
              }
            }
          }}
          className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--color-menu-yellow)] focus:outline-none"
        />
        <button
          type="button"
          disabled={!draft.trim() || disabled}
          onClick={() => {
            const v = draft.trim();
            if (v && !values.includes(v)) {
              onAdd(v);
              setDraft("");
            }
          }}
          className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-40"
        >
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

function NumberChipField({
  values,
  placeholder,
  min,
  max,
  onAdd,
  onRemove,
  disabled,
}: {
  values: number[];
  placeholder?: string;
  min: number;
  max: number;
  onAdd: (v: number) => void;
  onRemove: (v: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v) => (
          <span key={v} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white">
            {v}
            <button type="button" onClick={() => onRemove(v)} className="ml-0.5 text-white/50 hover:text-white">
              <X size={10} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={min}
          max={max}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              const n = parseInt(draft, 10);
              if (!isNaN(n) && n >= min && n <= max && !values.includes(n)) {
                onAdd(n);
                setDraft("");
              }
            }
          }}
          className="w-24 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-[var(--color-menu-yellow)] focus:outline-none"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const n = parseInt(draft, 10);
            if (!isNaN(n) && n >= min && n <= max && !values.includes(n)) {
              onAdd(n);
              setDraft("");
            }
          }}
          className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20 disabled:opacity-40"
        >
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WarmingStatus | "success" | "partial" | "failed" | null }) {
  if (!status) return null;
  const cfg = {
    success: { icon: <CheckCircle2 size={12} />, cls: "text-green-400 bg-green-400/10" },
    partial: { icon: <AlertTriangle size={12} />, cls: "text-yellow-400 bg-yellow-400/10" },
    failed: { icon: <XCircle size={12} />, cls: "text-red-400 bg-red-400/10" },
  }[status] ?? { icon: null, cls: "text-white/50 bg-white/10" };
  return (
    <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cfg.cls}`}>
      {cfg.icon}
      {status}
    </span>
  );
}

// ── Invalidation Rules manager ───────────────────────────────────────────────

const ALL_TRIGGERS: { value: InvalidationTrigger; label: string }[] = [
  { value: "publish", label: "Publish" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "manual", label: "Manual" },
];

function InvalidationRulesManager({
  rules,
  disabled,
  onChange,
}: {
  rules: InvalidationRule[];
  disabled: boolean;
  onChange: (rules: InvalidationRule[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Omit<InvalidationRule, "id">>({
    name: "",
    pattern: "",
    triggers: ["publish", "update"],
    enabled: true,
  });

  function addRule() {
    if (!draft.name.trim() || !draft.pattern.trim()) return;
    onChange([
      ...rules,
      { ...draft, id: Math.random().toString(36).slice(2, 10) },
    ]);
    setDraft({ name: "", pattern: "", triggers: ["publish", "update"], enabled: true });
    setAdding(false);
  }

  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      {rules.length === 0 && !adding && (
        <p className="text-xs text-text-faint mb-2">No rules configured. Add one to auto-invalidate cache paths when content changes.</p>
      )}
      <div className="flex flex-col gap-2 mb-3">
        {rules.map((rule, i) => (
          <div key={rule.id} className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/4 p-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-semibold text-white truncate">{rule.name}</span>
                {!rule.enabled && (
                  <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">disabled</span>
                )}
              </div>
              <span className="block text-xs text-text-faint font-mono mb-1">{rule.pattern}</span>
              <div className="flex flex-wrap gap-1">
                {rule.triggers.map((t) => (
                  <span key={t} className="rounded-full bg-[var(--color-menu-yellow)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--color-menu-yellow)] uppercase">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onChange(rules.map((r, j) => j === i ? { ...r, enabled: !r.enabled } : r))}
                className="text-xs text-text-faint hover:text-white"
              >
                {rule.enabled ? "Disable" : "Enable"}
              </button>
              <button
                type="button"
                onClick={() => onChange(rules.filter((_, j) => j !== i))}
                className="text-red-400/60 hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Rule name</label>
              <input
                type="text"
                value={draft.name}
                placeholder="e.g. Invalidate game pages"
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--color-menu-yellow)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white mb-1">URL pattern</label>
              <input
                type="text"
                value={draft.pattern}
                placeholder="/game/*"
                onChange={(e) => setDraft((d) => ({ ...d, pattern: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 font-mono focus:border-[var(--color-menu-yellow)] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white mb-1">Triggers</label>
            <div className="flex flex-wrap gap-2">
              {ALL_TRIGGERS.map((t) => {
                const active = draft.triggers.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        triggers: active
                          ? d.triggers.filter((x) => x !== t.value)
                          : [...d.triggers, t.value],
                      }))
                    }
                    className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase transition-colors ${
                      active
                        ? "bg-[var(--color-menu-yellow)] text-black"
                        : "bg-white/10 text-white/60 hover:bg-white/20"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={addRule}
              disabled={!draft.name.trim() || !draft.pattern.trim() || draft.triggers.length === 0}
              className="rounded-lg bg-[var(--color-menu-yellow)] px-3 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
            >
              Add rule
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/14 hover:text-white"
        >
          <Plus size={13} /> Add rule
        </button>
      )}
    </div>
  );
}

// ── Cache Tags manager ───────────────────────────────────────────────────────

function CacheTagsManager({
  tags,
  disabled,
  onChange,
}: {
  tags: CacheTag[];
  disabled: boolean;
  onChange: (tags: CacheTag[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ tag: "", description: "", patterns: [] as string[] });
  const [patternDraft, setPatternDraft] = useState("");

  function addTag() {
    if (!draft.tag.trim()) return;
    onChange([...tags, { ...draft, id: Math.random().toString(36).slice(2, 10) }]);
    setDraft({ tag: "", description: "", patterns: [] });
    setAdding(false);
  }

  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      {tags.length === 0 && !adding && (
        <p className="text-xs text-text-faint mb-2">No tags defined. Cache tags let you purge groups of URLs in one call.</p>
      )}
      <div className="flex flex-col gap-2 mb-3">
        {tags.map((t, i) => (
          <div key={t.id} className="flex items-start gap-3 rounded-xl border border-white/8 bg-white/4 p-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Tag size={12} className="text-[var(--color-menu-yellow)] shrink-0" />
                <span className="text-sm font-semibold text-white font-mono">{t.tag}</span>
              </div>
              {t.description && <span className="block text-xs text-text-faint mb-1">{t.description}</span>}
              <div className="flex flex-wrap gap-1">
                {t.patterns.map((p) => (
                  <span key={p} className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] font-mono text-white/70">
                    {p}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChange(tags.filter((_, j) => j !== i))}
              className="text-red-400/60 hover:text-red-400 shrink-0"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
      {adding ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Tag identifier</label>
              <input
                type="text"
                value={draft.tag}
                placeholder="game-homepage"
                onChange={(e) => setDraft((d) => ({ ...d, tag: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white font-mono placeholder:text-white/30 focus:border-[var(--color-menu-yellow)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-white mb-1">Description</label>
              <input
                type="text"
                value={draft.description}
                placeholder="Homepage game listings"
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:border-[var(--color-menu-yellow)] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-white mb-1">URL patterns</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {draft.patterns.map((p) => (
                <span key={p} className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-xs font-mono text-white">
                  {p}
                  <button type="button" onClick={() => setDraft((d) => ({ ...d, patterns: d.patterns.filter((x) => x !== p) }))}>
                    <X size={9} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={patternDraft}
                placeholder="/games/*"
                onChange={(e) => setPatternDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = patternDraft.trim();
                    if (v && !draft.patterns.includes(v)) {
                      setDraft((d) => ({ ...d, patterns: [...d.patterns, v] }));
                      setPatternDraft("");
                    }
                  }
                }}
                className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white font-mono placeholder:text-white/30 focus:border-[var(--color-menu-yellow)] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  const v = patternDraft.trim();
                  if (v && !draft.patterns.includes(v)) {
                    setDraft((d) => ({ ...d, patterns: [...d.patterns, v] }));
                    setPatternDraft("");
                  }
                }}
                className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
              >
                <Plus size={12} /> Add
              </button>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={addTag}
              disabled={!draft.tag.trim()}
              className="rounded-lg bg-[var(--color-menu-yellow)] px-3 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
            >
              Add tag
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/14 hover:text-white"
        >
          <Plus size={13} /> Add tag
        </button>
      )}
    </div>
  );
}

// ── Selective Purge panel ────────────────────────────────────────────────────

function SelectivePurgePanel({
  lastPurgeAt,
  lastPurgeStatus,
  disabled,
}: {
  lastPurgeAt: string | null;
  lastPurgeStatus: "success" | "partial" | "failed" | null;
  disabled: boolean;
}) {
  const [patterns, setPatterns] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ status: string; total: number; ok: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runPurge() {
    if (patterns.length === 0) return;
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/cache/smart/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patterns }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Purge failed.");
      setResult({ status: json.status, total: json.summary.total, ok: json.summary.ok });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Purge failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={disabled ? "opacity-50 pointer-events-none" : ""}>
      <div className="mb-3">
        <span className="block text-sm font-semibold text-white mb-1">URL patterns to purge</span>
        <span className="block text-xs text-text-faint mb-2">
          Wildcards supported — e.g. <code className="text-white/70">/game/*</code>, <code className="text-white/70">/categories/*</code>, or an exact path like <code className="text-white/70">/</code>.
        </span>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {patterns.map((p) => (
            <span key={p} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-mono text-white">
              {p}
              <button type="button" onClick={() => setPatterns((ps) => ps.filter((x) => x !== p))}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            placeholder="/game/*"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                const v = draft.trim();
                if (v && !patterns.includes(v)) { setPatterns((ps) => [...ps, v]); setDraft(""); }
              }
            }}
            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white font-mono placeholder:text-white/30 focus:border-[var(--color-menu-yellow)] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => { const v = draft.trim(); if (v && !patterns.includes(v)) { setPatterns((ps) => [...ps, v]); setDraft(""); } }}
            className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          disabled={running || patterns.length === 0}
          onClick={runPurge}
          className="flex items-center gap-2 rounded-lg bg-red-500/80 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-40"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          {running ? "Purging…" : "Run Purge"}
        </button>
        {result && (
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${result.status === "success" ? "text-green-400" : "text-yellow-400"}`}>
            <CheckCircle2 size={13} />
            Purged {result.ok}/{result.total} patterns
          </span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
        {!result && !error && lastPurgeAt && (
          <span className="text-xs text-text-faint flex items-center gap-1">
            Last purge: {new Date(lastPurgeAt).toLocaleString()}
            {lastPurgeStatus && <StatusBadge status={lastPurgeStatus} />}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Cache Warming run panel ──────────────────────────────────────────────────

function WarmingRunPanel({
  lastWarmingAt,
  lastWarmingStatus,
  disabled,
}: {
  lastWarmingAt: string | null;
  lastWarmingStatus: WarmingStatus | null;
  disabled: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ status: string; total: number; ok: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runWarming() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/cache/smart/warm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Warming failed.");
      setResult({ status: json.status, total: json.summary.total, ok: json.summary.ok });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Warming failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className={`flex items-center gap-3 flex-wrap ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <button
        type="button"
        disabled={running || disabled}
        onClick={runWarming}
        className="flex items-center gap-2 rounded-lg bg-[var(--color-menu-yellow)]/90 px-4 py-2 text-sm font-bold text-black hover:bg-[var(--color-menu-yellow)] disabled:opacity-40"
      >
        {running ? <Loader2 size={14} className="animate-spin" /> : <Flame size={14} />}
        {running ? "Warming…" : "Run Now"}
      </button>
      {result && (
        <span className={`flex items-center gap-1.5 text-xs font-semibold ${result.status === "success" ? "text-green-400" : "text-yellow-400"}`}>
          <CheckCircle2 size={13} />
          Warmed {result.ok}/{result.total} URLs
        </span>
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
      {!result && !error && lastWarmingAt && (
        <span className="text-xs text-text-faint flex items-center gap-1.5">
          <Clock size={11} />
          Last run: {new Date(lastWarmingAt).toLocaleString()}
          {lastWarmingStatus && <StatusBadge status={lastWarmingStatus} />}
        </span>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function CacheSmartAdminClient() {
  const [settings, setSettings] = useState<SmartCacheSettings>(DEFAULT_SMART_CACHE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/cache/smart/settings");
        const json = await res.json();
        if (json.settings) {
          setSettings(mapSmartCacheSettingsRow(json.settings as Record<string, unknown>));
        }
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const patch = useCallback(<K extends keyof SmartCacheSettings>(key: K, value: SmartCacheSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/cache/smart/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed.");
      if (json.settings) setSettings(mapSmartCacheSettingsRow(json.settings as Record<string, unknown>));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-text-faint py-12 justify-center">
        <Loader2 size={18} className="animate-spin" />
        Loading Smart Cache settings…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Smart Cache Management</h1>
          <p className="mt-1 text-xs text-text-faint">
            Intelligent cache lifecycle — invalidation rules, selective purging, tag-based grouping, scheduled warming, and advanced
            concurrency controls.
          </p>
        </div>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--color-menu-yellow)] px-4 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-60"
        >
          {saving ? (
            <Loader2 size={15} className="animate-spin" />
          ) : saved ? (
            <Check size={15} />
          ) : (
            <Save size={15} />
          )}
          {saving ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          <XCircle size={15} />
          {error}
        </div>
      )}

      {/* ── 1. Automatic Cache Invalidation ─────────────────────────────── */}
      <Section
        title="Automatic Cache Invalidation"
        icon={<RefreshCcw size={14} />}
        hint="Wipes matching cache entries automatically when CMS content is published, updated, or deleted. Rules are evaluated in order — the first match wins."
      >
        <ToggleField
          label="Enable automatic invalidation"
          hint="When off, cache is never cleared automatically — you must purge manually."
          checked={settings.autoInvalidationEnabled}
          onChange={(v) => patch("autoInvalidationEnabled", v)}
        />
        {settings.autoInvalidationEnabled && (
          <>
            <div className="mt-2 flex flex-wrap gap-3">
              <ToggleField
                label="On Publish"
                checked={settings.invalidateOnPublish}
                onChange={(v) => patch("invalidateOnPublish", v)}
              />
              <ToggleField
                label="On Update"
                checked={settings.invalidateOnUpdate}
                onChange={(v) => patch("invalidateOnUpdate", v)}
              />
              <ToggleField
                label="On Delete"
                checked={settings.invalidateOnDelete}
                onChange={(v) => patch("invalidateOnDelete", v)}
              />
            </div>
            <NumberField
              label="Invalidation delay"
              hint="Wait this long after the CMS event before clearing cache. Useful for debouncing rapid bulk updates."
              value={settings.invalidationDelayMs}
              min={SMART_CACHE_INVALIDATION_DELAY.min}
              max={SMART_CACHE_INVALIDATION_DELAY.max}
              unit="ms"
              onChange={(v) => patch("invalidationDelayMs", v)}
            />
            <div>
              <span className="block text-sm font-semibold text-white mb-1">Invalidation rules</span>
              <span className="block text-xs text-text-faint mb-3">
                Each rule maps a URL pattern to one or more CMS event triggers. Supports glob syntax — <code className="text-white/70">*</code> matches any single segment, <code className="text-white/70">**</code> matches multiple.
              </span>
              <InvalidationRulesManager
                rules={settings.invalidationRules}
                disabled={false}
                onChange={(rules) => patch("invalidationRules", rules)}
              />
            </div>
          </>
        )}
      </Section>

      {/* ── 2. Selective Purge ───────────────────────────────────────────── */}
      <Section
        title="Selective Purge"
        icon={<Trash2 size={14} />}
        hint="Purge specific URL paths or wildcard patterns from cache on demand, without flushing everything."
      >
        <ToggleField
          label="Enable selective purge"
          hint="When disabled, only full cache flushes are available from the Overview page."
          checked={settings.selectivePurgeEnabled}
          onChange={(v) => patch("selectivePurgeEnabled", v)}
        />
        {settings.selectivePurgeEnabled && (
          <SelectivePurgePanel
            lastPurgeAt={settings.lastPurgeAt}
            lastPurgeStatus={settings.lastPurgeStatus}
            disabled={false}
          />
        )}
      </Section>

      {/* ── 3. Cache Tags ─────────────────────────────────────────────────── */}
      <Section
        title="Cache Tags"
        icon={<Tag size={14} />}
        hint="Associate logical tags with URL patterns. Purging by tag clears every URL that carries it — one API call instead of listing every path individually."
      >
        <ToggleField
          label="Enable cache tags"
          hint="Requires your CDN or reverse proxy to support surrogate-key / cache-tag headers."
          checked={settings.cacheTagsEnabled}
          onChange={(v) => patch("cacheTagsEnabled", v)}
        />
        {settings.cacheTagsEnabled && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SelectField
                label="Tag header name"
                hint="HTTP response header that carries the tag list."
                value={settings.tagHeaderName}
                options={TAG_HEADER_NAMES.map((n) => ({ value: n, label: n }))}
                onChange={(v) => patch("tagHeaderName", v as typeof settings.tagHeaderName)}
              />
              <NumberField
                label="Max tags per response"
                hint="Cloudflare allows up to 1,000; lower limits vary by provider."
                value={settings.maxTagsPerResponse}
                min={SMART_CACHE_MAX_TAGS.min}
                max={SMART_CACHE_MAX_TAGS.max}
                unit="tags"
                onChange={(v) => patch("maxTagsPerResponse", v)}
              />
            </div>
            <div>
              <span className="block text-sm font-semibold text-white mb-1">Tag definitions</span>
              <CacheTagsManager
                tags={settings.cacheTags}
                disabled={false}
                onChange={(tags) => patch("cacheTags", tags)}
              />
            </div>
          </>
        )}
      </Section>

      {/* ── 4. Scheduled Cache Warming ────────────────────────────────────── */}
      <Section
        title="Scheduled Cache Warming"
        icon={<Flame size={14} />}
        hint="Pre-populates cache for high-traffic URLs on a schedule, so the first real visitor always gets a cache hit."
      >
        <ToggleField
          label="Enable scheduled warming"
          hint="Runs at the configured cron schedule using the URL list below."
          checked={settings.scheduledWarmingEnabled}
          onChange={(v) => patch("scheduledWarmingEnabled", v)}
        />
        {settings.scheduledWarmingEnabled && (
          <>
            <div>
              <label className="block text-sm font-semibold text-white mb-1">Cron schedule</label>
              <span className="block text-xs text-text-faint mb-1.5">
                Standard 5-field cron — <code className="text-white/70">0 4 * * *</code> = daily at 04:00 UTC.
              </span>
              <input
                type="text"
                value={settings.warmingSchedule}
                onChange={(e) => patch("warmingSchedule", e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white font-mono focus:border-[var(--color-menu-yellow)] focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                label="Concurrency"
                hint="Parallel fetch workers per warming run."
                value={settings.warmingConcurrency}
                min={SMART_CACHE_WARMING_CONCURRENCY.min}
                max={SMART_CACHE_WARMING_CONCURRENCY.max}
                unit="workers"
                onChange={(v) => patch("warmingConcurrency", v)}
              />
              <NumberField
                label="Request timeout"
                hint="Abort a warming fetch after this duration."
                value={settings.warmingTimeoutMs}
                min={SMART_CACHE_WARMING_TIMEOUT.min}
                max={SMART_CACHE_WARMING_TIMEOUT.max}
                unit="ms"
                onChange={(v) => patch("warmingTimeoutMs", v)}
              />
            </div>
          </>
        )}
        <div>
          <span className="block text-sm font-semibold text-white mb-1">URLs to warm</span>
          <span className="block text-xs text-text-faint mb-2">Relative paths only — e.g. <code className="text-white/70">/games</code>, <code className="text-white/70">/categories/action</code>.</span>
          <ChipListField
            values={settings.warmingUrls}
            placeholder="/games"
            onAdd={(v) => patch("warmingUrls", [...settings.warmingUrls, v])}
            onRemove={(v) => patch("warmingUrls", settings.warmingUrls.filter((x) => x !== v))}
          />
        </div>
        <WarmingRunPanel
          lastWarmingAt={settings.lastWarmingAt}
          lastWarmingStatus={settings.lastWarmingStatus}
          disabled={false}
        />
      </Section>

      {/* ── 5. Background Cache Regeneration ─────────────────────────────── */}
      <Section
        title="Background Cache Regeneration"
        icon={<RotateCcw size={14} />}
        hint="After a cache entry is invalidated, immediately fire background fetches to repopulate it before any visitor triggers a cold miss."
      >
        <ToggleField
          label="Enable background regeneration"
          hint="Works alongside Automatic Cache Invalidation — invalidate first, then regen fills the gap."
          checked={settings.backgroundRegenEnabled}
          onChange={(v) => patch("backgroundRegenEnabled", v)}
        />
        {settings.backgroundRegenEnabled && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                label="Concurrency"
                hint="Parallel regen workers. Keep low to avoid origin overload."
                value={settings.regenConcurrency}
                min={SMART_CACHE_REGEN_CONCURRENCY.min}
                max={SMART_CACHE_REGEN_CONCURRENCY.max}
                unit="workers"
                onChange={(v) => patch("regenConcurrency", v)}
              />
              <NumberField
                label="Regen delay"
                hint="Wait after invalidation before triggering regen."
                value={settings.regenDelayMs}
                min={SMART_CACHE_REGEN_DELAY.min}
                max={SMART_CACHE_REGEN_DELAY.max}
                unit="ms"
                onChange={(v) => patch("regenDelayMs", v)}
              />
            </div>
            <div>
              <span className="block text-sm font-semibold text-white mb-1">Priority URLs</span>
              <span className="block text-xs text-text-faint mb-2">These paths are always regenerated first, ahead of the normal queue.</span>
              <ChipListField
                values={settings.regenPriorityUrls}
                placeholder="/"
                onAdd={(v) => patch("regenPriorityUrls", [...settings.regenPriorityUrls, v])}
                onRemove={(v) => patch("regenPriorityUrls", settings.regenPriorityUrls.filter((x) => x !== v))}
              />
            </div>
          </>
        )}
      </Section>

      {/* ── 6. Request Coalescing ─────────────────────────────────────────── */}
      <Section
        title="Request Coalescing"
        icon={<GitMerge size={14} />}
        hint="When multiple clients request the same uncached resource simultaneously, coalescing collapses them into a single origin fetch — all waiters share the single response."
      >
        <ToggleField
          label="Enable request coalescing"
          hint="Prevents cache stampedes from concurrent cache misses on the same URL."
          checked={settings.requestCoalescingEnabled}
          onChange={(v) => patch("requestCoalescingEnabled", v)}
        />
        {settings.requestCoalescingEnabled && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberField
              label="Coalescing window"
              hint="Time window during which duplicate requests are held and merged."
              value={settings.coalescingWindowMs}
              min={SMART_CACHE_COALESCING_WINDOW.min}
              max={SMART_CACHE_COALESCING_WINDOW.max}
              unit="ms"
              onChange={(v) => patch("coalescingWindowMs", v)}
            />
            <NumberField
              label="Max waiters"
              hint="Requests beyond this limit bypass coalescing and hit origin directly."
              value={settings.coalescingMaxWaiters}
              min={SMART_CACHE_COALESCING_WAITERS.min}
              max={SMART_CACHE_COALESCING_WAITERS.max}
              unit="requests"
              onChange={(v) => patch("coalescingMaxWaiters", v)}
            />
          </div>
        )}
      </Section>

      {/* ── 7. Cache Locking ─────────────────────────────────────────────── */}
      <Section
        title="Cache Locking"
        icon={<Lock size={14} />}
        hint="A mutex on cache writes — only one writer populates a given key at a time. Subsequent misses wait for the lock rather than all piling onto the origin."
      >
        <ToggleField
          label="Enable cache locking"
          hint="Pairs well with Request Coalescing for full stampede protection."
          checked={settings.cacheLockingEnabled}
          onChange={(v) => patch("cacheLockingEnabled", v)}
        />
        {settings.cacheLockingEnabled && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <NumberField
              label="Lock TTL"
              hint="Lock is auto-released after this time even if the writer crashes."
              value={settings.lockTtlMs}
              min={SMART_CACHE_LOCK_TTL.min}
              max={SMART_CACHE_LOCK_TTL.max}
              unit="ms"
              onChange={(v) => patch("lockTtlMs", v)}
            />
            <NumberField
              label="Acquire timeout"
              hint="How long a waiter will poll before giving up and hitting origin."
              value={settings.lockTimeoutMs}
              min={SMART_CACHE_LOCK_TIMEOUT.min}
              max={SMART_CACHE_LOCK_TIMEOUT.max}
              unit="ms"
              onChange={(v) => patch("lockTimeoutMs", v)}
            />
            <NumberField
              label="Retry interval"
              hint="Polling interval while waiting for a lock to be released."
              value={settings.lockRetryIntervalMs}
              min={SMART_CACHE_LOCK_RETRY.min}
              max={SMART_CACHE_LOCK_RETRY.max}
              unit="ms"
              onChange={(v) => patch("lockRetryIntervalMs", v)}
            />
          </div>
        )}
      </Section>

      {/* ── 8. Stale-While-Revalidate ─────────────────────────────────────── */}
      <Section
        title="Stale-While-Revalidate"
        icon={<Wifi size={14} />}
        hint="Serve a stale cached response instantly while a fresh copy is fetched in the background. Eliminates revalidation latency for the end user."
      >
        <ToggleField
          label="Enable stale-while-revalidate"
          hint={<>Emits <code className="text-white/70">stale-while-revalidate</code> in Cache-Control responses, or applies it via a CDN cache rule.</>}
          checked={settings.staleWhileRevalidateEnabled}
          onChange={(v) => patch("staleWhileRevalidateEnabled", v)}
        />
        {settings.staleWhileRevalidateEnabled && (
          <>
            <NumberField
              label="Stale window"
              hint="How long past max-age to serve stale content while revalidating."
              value={settings.staleWhileRevalidateSeconds}
              min={SMART_CACHE_SWR_SECONDS.min}
              max={SMART_CACHE_SWR_SECONDS.max}
              unit="seconds"
              onChange={(v) => patch("staleWhileRevalidateSeconds", v)}
            />
            <div>
              <span className="block text-sm font-semibold text-white mb-1">Apply to paths</span>
              <span className="block text-xs text-text-faint mb-2">
                Restrict SWR to these path prefixes. Leave empty to apply globally.
              </span>
              <ChipListField
                values={settings.swiApplyToPaths}
                placeholder="/games"
                onAdd={(v) => patch("swiApplyToPaths", [...settings.swiApplyToPaths, v])}
                onRemove={(v) => patch("swiApplyToPaths", settings.swiApplyToPaths.filter((x) => x !== v))}
              />
            </div>
          </>
        )}
      </Section>

      {/* ── 9. Stale-If-Error ────────────────────────────────────────────── */}
      <Section
        title="Stale-If-Error"
        icon={<Shield size={14} />}
        hint="When your origin returns an error response, serve the last known-good cached copy rather than propagating the error to users."
      >
        <ToggleField
          label="Enable stale-if-error"
          hint={<>Emits <code className="text-white/70">stale-if-error</code> in Cache-Control, or applies via CDN rule. Requires a stale copy in cache.</>}
          checked={settings.staleIfErrorEnabled}
          onChange={(v) => patch("staleIfErrorEnabled", v)}
        />
        {settings.staleIfErrorEnabled && (
          <>
            <NumberField
              label="Stale-if-error window"
              hint="Seconds to serve the stale copy when origin is returning errors."
              value={settings.staleIfErrorSeconds}
              min={SMART_CACHE_SIE_SECONDS.min}
              max={SMART_CACHE_SIE_SECONDS.max}
              unit="seconds"
              onChange={(v) => patch("staleIfErrorSeconds", v)}
            />
            <div>
              <span className="block text-sm font-semibold text-white mb-1">Error status codes</span>
              <span className="block text-xs text-text-faint mb-2">
                HTTP status codes that activate stale-if-error. Typical set: 500, 502, 503, 504.
              </span>
              <NumberChipField
                values={settings.staleIfErrorCodes}
                placeholder="503"
                min={400}
                max={599}
                onAdd={(v) => patch("staleIfErrorCodes", [...settings.staleIfErrorCodes, v])}
                onRemove={(v) => patch("staleIfErrorCodes", settings.staleIfErrorCodes.filter((x) => x !== v))}
              />
            </div>
          </>
        )}
      </Section>

      {/* Save footer */}
      <div className="sticky bottom-4 mt-2 flex items-center justify-between rounded-2xl border border-white/8 bg-black/60 px-5 py-3 backdrop-blur-sm">
        <span className="text-xs text-text-faint">
          {settings.updatedAt && settings.updatedAt !== new Date(0).toISOString()
            ? `Last saved ${new Date(settings.updatedAt).toLocaleString()}`
            : "Not saved yet"}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-[var(--color-menu-yellow)] px-5 py-2 text-sm font-bold text-black hover:opacity-90 disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saving ? "Saving…" : saved ? "Saved!" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
