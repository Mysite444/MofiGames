"use client";

import { useState, useEffect } from "react";
import {
  Loader2,
  Save,
  Check,
  X,
  Plus,
  Minimize2,
  Zap,
  Archive,
  FileCode2,
  Braces,
  FileText,
  TestTube2,
  Code2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
  Play,
  Wand2,
} from "lucide-react";
import {
  mapCompressionCacheRow,
  fetchCompressionCacheSettings,
  generateNginxSnippet,
  generateVercelJsonSnippet,
  savingsPercent,
  formatBytes,
  BROTLI_QUALITY_LIMITS,
  GZIP_LEVEL_LIMITS,
  MIN_SIZE_LIMITS,
  type CompressionCacheSettings,
  type BrotliCompressionConfig,
  type GzipCompressionConfig,
  type MinifyConfig,
  type HtmlMinifyConfig,
  type CompressionTestProbe,
} from "@/lib/compression-cache-settings";

// ── Shared building blocks (mirrors CacheDbOptimizationAdminClient's /
// CacheObjectAdminClient's pattern — collapsible Section, ToggleField,
// NumberField, ChipListField, CodeBlock, StatusBadge, ActionButton) ────────

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

function RangeField({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={`flex flex-col gap-1 ${disabled ? "opacity-50" : ""}`}>
      <span className="text-sm font-semibold text-white">
        {label} — <span className="text-[var(--color-menu-yellow)]">{value}</span>
      </span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 accent-[var(--color-menu-yellow)] disabled:cursor-not-allowed"
      />
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
          <span
            key={v}
            className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80"
          >
            <code>{v}</code>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemove(v)}
              className="text-white/40 hover:text-white disabled:cursor-not-allowed"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-xs text-text-faint">None configured.</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          className="admin-input flex-1 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={commit}
          className="flex shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {label && <p className="mb-1 text-xs font-semibold text-text-faint">{label}</p>}
      <pre className="glass overflow-x-auto rounded-xl p-4 text-xs leading-relaxed text-white/80 font-mono whitespace-pre-wrap">
        {code}
      </pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        className="absolute right-3 top-3 glass rounded-lg p-1.5 text-text-faint hover:text-white"
      >
        {copied ? <ClipboardCheck size={13} /> : <ClipboardCopy size={13} />}
      </button>
    </div>
  );
}

function StatusBadge({ status, message }: { status: "success" | "failed" | null; message?: string | null }) {
  if (!status) return null;
  const isOk = status === "success";
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
        isOk
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-red-500/30 bg-red-500/10 text-red-400"
      }`}
    >
      {isOk ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      <span className="font-semibold">{isOk ? "Success" : "Attention"}:</span>
      <span>{message}</span>
    </div>
  );
}

function ActionButton({
  onClick,
  loading,
  label,
  loadingLabel,
  icon,
  disabled,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
  loadingLabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-white/15 disabled:opacity-50"
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : icon}
      {loading ? (loadingLabel ?? label) : label}
    </button>
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
  return iso ? new Date(iso).toLocaleString() : "Never run";
}

function encodingLabel(e: CompressionTestProbe["encoding"]): string {
  return e === "br" ? "Brotli (br)" : e === "gzip" ? "Gzip" : "Identity (uncompressed)";
}

// ── Minify Preview ───────────────────────────────────────────────────────────

interface MinifyPreviewResult {
  output: string;
  originalBytes: number;
  minifiedBytes: number;
}

function MinifyPreview({ onSettingsUpdate }: {
  onSettingsUpdate: (s: CompressionCacheSettings) => void;
}) {
  const [type, setType] = useState<"css" | "js" | "html">("css");
  const [input, setInput] = useState("");
  const [result, setResult] = useState<MinifyPreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!input.trim()) {
      setError("Paste some code first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cache/compression/minify-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, code: input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Minify failed.");
      setResult(data.result);
      if (data.settings) onSettingsUpdate(mapCompressionCacheRow(data.settings));
      if (data.warning) setError(data.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Minify failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      title="Minify Preview"
      icon={<Wand2 size={16} />}
      defaultOpen={false}
      hint="Paste real CSS, JavaScript, or HTML and run it through the actual minifier above — not a mockup. Also records the before/after byte counts as that feature's last-run stats, same as a real build step would."
    >
      <div className="flex flex-wrap gap-2">
        {(["css", "js", "html"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setType(t);
              setResult(null);
            }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              type === t ? "bg-[var(--color-menu-yellow)] text-black" : "bg-white/10 text-text-faint hover:bg-white/15"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={
          type === "css"
            ? "/* paste CSS here */\n.card {\n  color: red;\n}"
            : type === "js"
              ? "// paste JavaScript here\nfunction greet() {\n  return 'hi';\n}"
              : "<!-- paste HTML here -->\n<div>\n  <p>Hello</p>\n</div>"
        }
        rows={8}
        className="admin-input font-mono text-xs leading-relaxed"
      />

      <ActionButton onClick={run} loading={loading} label="Minify" loadingLabel="Minifying…" icon={<Play size={13} />} />

      {error && <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-white/5 px-4 py-3">
            <StatRow label="Original" value={formatBytes(result.originalBytes)} />
            <StatRow label="Minified" value={formatBytes(result.minifiedBytes)} />
            <StatRow label="Savings" value={`${savingsPercent(result.originalBytes, result.minifiedBytes)}%`} />
          </div>
          <CodeBlock code={result.output} label="Minified output" />
        </div>
      )}

      <p className="text-xs text-text-faint">
        Uses the &ldquo;Remove comments&rdquo; setting from the {type.toUpperCase()} Minification section above. This
        is safe-mode minification — comments and redundant whitespace only. It never reorders code, renames anything,
        or collapses lines in a way that could change behaviour (no ASI hazards, no corrupted regex literals, no
        touched calc() spacing).
      </p>
    </Section>
  );
}

/** Admin → Cache → Compression. Five features:
 *   1. Brotli Compression      — quality, minimum size floor, MIME allowlist.
 *   2. Gzip Compression        — level, minimum size floor, MIME allowlist.
 *   3. CSS Minification        — real minifier (comments + whitespace, string-aware).
 *   4. JavaScript Minification — real minifier (comments + whitespace, string/regex/template-aware, ASI-safe).
 *   5. HTML Minification       — real minifier (comments + whitespace, pre/textarea-safe, JSON-LD-safe).
 * Plus a live Test Compression diagnostic (real Accept-Encoding probes
 * against this deployment) and generated Nginx/next.config snippets —
 * this app doesn't sit in front of its own traffic as a reverse proxy,
 * so actual on-the-wire compression is applied by whatever does
 * (Vercel's edge network, Nginx, a CDN); this section is that
 * infrastructure's config plus live visibility into what it's actually
 * doing, the same "declarative config for infra this app doesn't run
 * itself" shape as PHP OPcache and Database Optimization.
 */
export function CacheCompressionAdminClient() {
  const [settings, setSettings] = useState<CompressionCacheSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [testPath, setTestPath] = useState("/");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testProbes, setTestProbes] = useState<CompressionTestProbe[] | null>(null);

  useEffect(() => {
    fetchCompressionCacheSettings().then(setSettings);
  }, []);

  function patch(p: Partial<CompressionCacheSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }
  function patchBrotli(p: Partial<BrotliCompressionConfig>) {
    setSettings((prev) => (prev ? { ...prev, brotli: { ...prev.brotli, ...p } } : prev));
    setSaved(false);
  }
  function patchGzip(p: Partial<GzipCompressionConfig>) {
    setSettings((prev) => (prev ? { ...prev, gzip: { ...prev.gzip, ...p } } : prev));
    setSaved(false);
  }
  function patchCssMinify(p: Partial<MinifyConfig>) {
    setSettings((prev) => (prev ? { ...prev, cssMinify: { ...prev.cssMinify, ...p } } : prev));
    setSaved(false);
  }
  function patchJsMinify(p: Partial<MinifyConfig>) {
    setSettings((prev) => (prev ? { ...prev, jsMinify: { ...prev.jsMinify, ...p } } : prev));
    setSaved(false);
  }
  function patchHtmlMinify(p: Partial<HtmlMinifyConfig>) {
    setSettings((prev) => (prev ? { ...prev, htmlMinify: { ...prev.htmlMinify, ...p } } : prev));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        enabled: settings.enabled,
        brotli: {
          enabled: settings.brotli.enabled,
          quality: settings.brotli.quality,
          minSizeBytes: settings.brotli.minSizeBytes,
          mimeTypes: settings.brotli.mimeTypes,
        },
        gzip: {
          enabled: settings.gzip.enabled,
          level: settings.gzip.level,
          minSizeBytes: settings.gzip.minSizeBytes,
          mimeTypes: settings.gzip.mimeTypes,
        },
        cssMinify: {
          enabled: settings.cssMinify.enabled,
          removeComments: settings.cssMinify.removeComments,
          combineFiles: settings.cssMinify.combineFiles,
          excludePatterns: settings.cssMinify.excludePatterns,
        },
        jsMinify: {
          enabled: settings.jsMinify.enabled,
          removeComments: settings.jsMinify.removeComments,
          combineFiles: settings.jsMinify.combineFiles,
          excludePatterns: settings.jsMinify.excludePatterns,
        },
        htmlMinify: {
          enabled: settings.htmlMinify.enabled,
          removeComments: settings.htmlMinify.removeComments,
          collapseWhitespace: settings.htmlMinify.collapseWhitespace,
          minifyInlineCssJs: settings.htmlMinify.minifyInlineCssJs,
        },
      };
      const res = await fetch("/api/admin/cache/compression/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save Compression settings.");
      setSettings(mapCompressionCacheRow(data.settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestError(null);
    try {
      const res = await fetch("/api/admin/cache/compression/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: testPath || "/" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed.");
      setTestProbes(data.result?.probes ?? null);
      if (data.settings) setSettings(mapCompressionCacheRow(data.settings));
      if (data.warning) setTestError(data.warning);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Test failed.");
    } finally {
      setTesting(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  const totalOriginal =
    settings.cssMinify.lastOriginalBytes + settings.jsMinify.lastOriginalBytes + settings.htmlMinify.lastOriginalBytes;
  const totalMinified =
    settings.cssMinify.lastMinifiedBytes + settings.jsMinify.lastMinifiedBytes + settings.htmlMinify.lastMinifiedBytes;

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Compression</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Response-body encoding and payload shrinking — Brotli and Gzip content-encoding, plus real CSS/JavaScript/
            HTML minification. Distinct from Static Asset Cache (how long files are cached) and CDN&apos;s own Brotli
            toggle (Cloudflare&apos;s edge zone setting).
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

      <Section title="Overview" icon={<Minimize2 size={16} />}>
        <ToggleField
          label="Enable Compression"
          hint="Master switch for all five features below. Turning this off doesn't discard their individual configuration."
          checked={settings.enabled}
          onChange={(v) => patch({ enabled: v })}
        />
        <div className="grid grid-cols-1 gap-2 rounded-xl bg-white/5 px-4 py-3 sm:grid-cols-3">
          <StatRow label="Minification savings (last runs)" value={`${savingsPercent(totalOriginal, totalMinified)}%`} />
          <StatRow label="Bytes before → after" value={totalOriginal > 0 ? `${formatBytes(totalOriginal)} → ${formatBytes(totalMinified)}` : "No runs yet"} />
          <StatRow label="Last compression test" value={formatWhen(settings.lastTestedAt)} />
        </div>
        {settings.lastTestStatus && <StatusBadge status={settings.lastTestStatus} message={settings.lastTestMessage} />}
      </Section>

      {/* ══════════════════════ 1. Brotli Compression ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Zap size={15} className="text-[var(--color-menu-yellow)]" /> 1. Brotli Compression
      </h2>
      <Section
        title="Brotli"
        hint="The smallest encoding for text-based responses when both sides support it (all modern browsers do). Preferred over Gzip whenever a client offers both."
      >
        <ToggleField
          label="Enable Brotli"
          checked={settings.brotli.enabled}
          onChange={(v) => patchBrotli({ enabled: v })}
        />
        <RangeField
          label="Quality"
          hint="0 = fastest / largest output, 11 = smallest / slowest. 11 is safe as a default for cacheable responses — the cost is paid once, not per request, wherever the compressor caches its own output."
          value={settings.brotli.quality}
          min={BROTLI_QUALITY_LIMITS.min}
          max={BROTLI_QUALITY_LIMITS.max}
          disabled={!settings.brotli.enabled}
          onChange={(v) => patchBrotli({ quality: v })}
        />
        <NumberField
          label="Minimum size"
          hint="Responses smaller than this are sent uncompressed — brotli's own framing overhead can exceed the savings below this floor."
          value={settings.brotli.minSizeBytes}
          min={MIN_SIZE_LIMITS.min}
          max={MIN_SIZE_LIMITS.max}
          suffix="bytes"
          disabled={!settings.brotli.enabled}
          onChange={(v) => patchBrotli({ minSizeBytes: v })}
        />
        <div className={`flex flex-col gap-1.5 ${!settings.brotli.enabled ? "opacity-50" : ""}`}>
          <span className="text-sm font-semibold text-white">MIME types</span>
          <span className="text-xs text-text-faint">Only these content types are eligible for Brotli encoding.</span>
          <ChipListField
            values={settings.brotli.mimeTypes}
            placeholder="e.g. application/wasm"
            disabled={!settings.brotli.enabled}
            onAdd={(v) => patchBrotli({ mimeTypes: [...settings.brotli.mimeTypes, v] })}
            onRemove={(v) => patchBrotli({ mimeTypes: settings.brotli.mimeTypes.filter((x) => x !== v) })}
          />
        </div>
      </Section>

      {/* ══════════════════════ 2. Gzip Compression ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Archive size={15} className="text-[var(--color-menu-yellow)]" /> 2. Gzip Compression
      </h2>
      <Section
        title="Gzip"
        hint="The universal fallback for the (now rare) clients and proxies that don't negotiate Brotli. Same shape as Brotli above, with gzip's own 1–9 level scale."
      >
        <ToggleField label="Enable Gzip" checked={settings.gzip.enabled} onChange={(v) => patchGzip({ enabled: v })} />
        <RangeField
          label="Level"
          hint="1 = fastest / largest output, 9 = smallest / slowest. 6 is zlib's own default and a good general-purpose choice."
          value={settings.gzip.level}
          min={GZIP_LEVEL_LIMITS.min}
          max={GZIP_LEVEL_LIMITS.max}
          disabled={!settings.gzip.enabled}
          onChange={(v) => patchGzip({ level: v })}
        />
        <NumberField
          label="Minimum size"
          value={settings.gzip.minSizeBytes}
          min={MIN_SIZE_LIMITS.min}
          max={MIN_SIZE_LIMITS.max}
          suffix="bytes"
          disabled={!settings.gzip.enabled}
          onChange={(v) => patchGzip({ minSizeBytes: v })}
        />
        <div className={`flex flex-col gap-1.5 ${!settings.gzip.enabled ? "opacity-50" : ""}`}>
          <span className="text-sm font-semibold text-white">MIME types</span>
          <span className="text-xs text-text-faint">Only these content types are eligible for Gzip encoding.</span>
          <ChipListField
            values={settings.gzip.mimeTypes}
            placeholder="e.g. application/wasm"
            disabled={!settings.gzip.enabled}
            onAdd={(v) => patchGzip({ mimeTypes: [...settings.gzip.mimeTypes, v] })}
            onRemove={(v) => patchGzip({ mimeTypes: settings.gzip.mimeTypes.filter((x) => x !== v) })}
          />
        </div>
      </Section>

      {/* ══════════════════════ 3. CSS Minification ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <FileCode2 size={15} className="text-[var(--color-menu-yellow)]" /> 3. CSS Minification
      </h2>
      <Section
        title="CSS Minification"
        hint="Strips comments and collapses redundant whitespace — never touches spacing around +, -, or ~ so calc() expressions can't be corrupted. Try it live in Minify Preview below."
      >
        <ToggleField
          label="Enable CSS Minification"
          checked={settings.cssMinify.enabled}
          onChange={(v) => patchCssMinify({ enabled: v })}
        />
        <ToggleField
          label="Remove comments"
          checked={settings.cssMinify.removeComments}
          disabled={!settings.cssMinify.enabled}
          onChange={(v) => patchCssMinify({ removeComments: v })}
        />
        <ToggleField
          label="Combine files"
          hint="Bundle multiple stylesheet requests into one before minifying."
          checked={settings.cssMinify.combineFiles}
          disabled={!settings.cssMinify.enabled}
          onChange={(v) => patchCssMinify({ combineFiles: v })}
        />
        <div className={`flex flex-col gap-1.5 ${!settings.cssMinify.enabled ? "opacity-50" : ""}`}>
          <span className="text-sm font-semibold text-white">Exclude patterns</span>
          <span className="text-xs text-text-faint">Path or glob patterns to skip — e.g. vendor CSS that&apos;s already minified.</span>
          <ChipListField
            values={settings.cssMinify.excludePatterns}
            placeholder="e.g. /vendor/*.css"
            disabled={!settings.cssMinify.enabled}
            onAdd={(v) => patchCssMinify({ excludePatterns: [...settings.cssMinify.excludePatterns, v] })}
            onRemove={(v) => patchCssMinify({ excludePatterns: settings.cssMinify.excludePatterns.filter((x) => x !== v) })}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 rounded-xl bg-white/5 px-4 py-3 sm:grid-cols-3">
          <StatRow label="Last run" value={formatWhen(settings.cssMinify.lastRunAt)} />
          <StatRow
            label="Bytes before → after"
            value={
              settings.cssMinify.lastOriginalBytes > 0
                ? `${formatBytes(settings.cssMinify.lastOriginalBytes)} → ${formatBytes(settings.cssMinify.lastMinifiedBytes)}`
                : "—"
            }
          />
          <StatRow
            label="Savings"
            value={`${savingsPercent(settings.cssMinify.lastOriginalBytes, settings.cssMinify.lastMinifiedBytes)}%`}
          />
        </div>
      </Section>

      {/* ══════════════════════ 4. JavaScript Minification ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Braces size={15} className="text-[var(--color-menu-yellow)]" /> 4. JavaScript Minification
      </h2>
      <Section
        title="JavaScript Minification"
        hint="Strips comments and collapses whitespace without ever merging tokens or changing Automatic Semicolon Insertion behaviour — safe-mode, not a full parser-based minifier. Try it live in Minify Preview below."
      >
        <ToggleField
          label="Enable JavaScript Minification"
          checked={settings.jsMinify.enabled}
          onChange={(v) => patchJsMinify({ enabled: v })}
        />
        <ToggleField
          label="Remove comments"
          checked={settings.jsMinify.removeComments}
          disabled={!settings.jsMinify.enabled}
          onChange={(v) => patchJsMinify({ removeComments: v })}
        />
        <ToggleField
          label="Combine files"
          hint="Bundle multiple script requests into one before minifying."
          checked={settings.jsMinify.combineFiles}
          disabled={!settings.jsMinify.enabled}
          onChange={(v) => patchJsMinify({ combineFiles: v })}
        />
        <div className={`flex flex-col gap-1.5 ${!settings.jsMinify.enabled ? "opacity-50" : ""}`}>
          <span className="text-sm font-semibold text-white">Exclude patterns</span>
          <span className="text-xs text-text-faint">Path or glob patterns to skip — e.g. already-minified vendor bundles.</span>
          <ChipListField
            values={settings.jsMinify.excludePatterns}
            placeholder="e.g. /vendor/*.min.js"
            disabled={!settings.jsMinify.enabled}
            onAdd={(v) => patchJsMinify({ excludePatterns: [...settings.jsMinify.excludePatterns, v] })}
            onRemove={(v) => patchJsMinify({ excludePatterns: settings.jsMinify.excludePatterns.filter((x) => x !== v) })}
          />
        </div>
        <div className="grid grid-cols-1 gap-2 rounded-xl bg-white/5 px-4 py-3 sm:grid-cols-3">
          <StatRow label="Last run" value={formatWhen(settings.jsMinify.lastRunAt)} />
          <StatRow
            label="Bytes before → after"
            value={
              settings.jsMinify.lastOriginalBytes > 0
                ? `${formatBytes(settings.jsMinify.lastOriginalBytes)} → ${formatBytes(settings.jsMinify.lastMinifiedBytes)}`
                : "—"
            }
          />
          <StatRow
            label="Savings"
            value={`${savingsPercent(settings.jsMinify.lastOriginalBytes, settings.jsMinify.lastMinifiedBytes)}%`}
          />
        </div>
      </Section>

      {/* ══════════════════════ 5. HTML Minification ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <FileText size={15} className="text-[var(--color-menu-yellow)]" /> 5. HTML Minification
      </h2>
      <Section
        title="HTML Minification"
        hint="Strips comments (preserving IE conditional comments) and collapses whitespace between tags. Leaves <pre>/<textarea> untouched, and never runs a non-JS <script> block (e.g. JSON-LD structured data) through the JS minifier."
      >
        <ToggleField
          label="Enable HTML Minification"
          checked={settings.htmlMinify.enabled}
          onChange={(v) => patchHtmlMinify({ enabled: v })}
        />
        <ToggleField
          label="Remove comments"
          checked={settings.htmlMinify.removeComments}
          disabled={!settings.htmlMinify.enabled}
          onChange={(v) => patchHtmlMinify({ removeComments: v })}
        />
        <ToggleField
          label="Collapse whitespace"
          checked={settings.htmlMinify.collapseWhitespace}
          disabled={!settings.htmlMinify.enabled}
          onChange={(v) => patchHtmlMinify({ collapseWhitespace: v })}
        />
        <ToggleField
          label="Minify inline CSS/JS"
          hint="Cascade into the CSS/JavaScript minifiers above for inline <style> and <script> blocks."
          checked={settings.htmlMinify.minifyInlineCssJs}
          disabled={!settings.htmlMinify.enabled}
          onChange={(v) => patchHtmlMinify({ minifyInlineCssJs: v })}
        />
        <div className="grid grid-cols-1 gap-2 rounded-xl bg-white/5 px-4 py-3 sm:grid-cols-3">
          <StatRow label="Last run" value={formatWhen(settings.htmlMinify.lastRunAt)} />
          <StatRow
            label="Bytes before → after"
            value={
              settings.htmlMinify.lastOriginalBytes > 0
                ? `${formatBytes(settings.htmlMinify.lastOriginalBytes)} → ${formatBytes(settings.htmlMinify.lastMinifiedBytes)}`
                : "—"
            }
          />
          <StatRow
            label="Savings"
            value={`${savingsPercent(settings.htmlMinify.lastOriginalBytes, settings.htmlMinify.lastMinifiedBytes)}%`}
          />
        </div>
      </Section>

      {/* ══════════════════════ Diagnostics ══════════════════════ */}
      <Section
        title="Test Compression"
        icon={<TestTube2 size={16} />}
        defaultOpen={false}
        hint="Makes three real requests to a path on this deployment — Accept-Encoding: br, gzip, and identity — and reports exactly what came back. This is live, not simulated: it's checking whatever's actually in front of this app right now (Vercel's edge network, Nginx, a CDN), not the settings above."
      >
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-white">Path to test</span>
          <div className="flex gap-2">
            <input
              value={testPath}
              onChange={(e) => setTestPath(e.target.value)}
              placeholder="/"
              className="admin-input flex-1"
            />
            <ActionButton onClick={runTest} loading={testing} label="Run test" loadingLabel="Testing…" icon={<Play size={13} />} />
          </div>
          <span className="text-xs text-text-faint">Must be a site-relative path, e.g. /, /blog, /games/some-game.</span>
        </div>

        {testError && <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{testError}</div>}

        {testProbes && (
          <div className="flex flex-col gap-2">
            {testProbes.map((p) => (
              <div key={p.encoding} className="rounded-xl bg-white/5 px-4 py-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">{encodingLabel(p.encoding)}</span>
                  {p.ok ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 size={12} /> As expected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-semibold text-amber-400">
                      <XCircle size={12} /> Unexpected
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-faint">{p.message}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <MinifyPreview onSettingsUpdate={setSettings} />

      {/* ══════════════════════ Config Snippets ══════════════════════ */}
      <Section
        title="Config Snippets"
        icon={<Code2 size={16} />}
        defaultOpen={false}
        hint="This app isn't itself a reverse proxy — actual on-the-wire compression is applied by whatever sits in front of it. These snippets translate the settings above into config for the two most common fronts, generated live from your current (unsaved) changes."
      >
        <CodeBlock code={generateNginxSnippet(settings)} label="nginx.conf" />
        <CodeBlock code={generateVercelJsonSnippet(settings)} label="next.config.ts (self-hosted `next start` only)" />
      </Section>
    </div>
  );
}
