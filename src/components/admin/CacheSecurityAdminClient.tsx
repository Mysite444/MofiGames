"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ClipboardCheck,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  RefreshCcw,
  Save,
  ShieldAlert,
  ShieldOff,
  X,
  XCircle,
  Plus,
  Fingerprint,
} from "lucide-react";
import {
  mapSecurityCacheSettingsRow,
  DEFAULT_SECURITY_CACHE_SETTINGS,
  FIXED_BYPASS_PATHS,
  type SecurityCacheSettings,
} from "@/lib/security-cache-settings";

// ── Local sub-components ────────────────────────────────────────────────────
// Same visual conventions as CacheFullPageAdminClient — this page lives one
// click away from it in the same Cache section, so it should look like the
// same product.

function Section({
  title,
  hint,
  children,
  defaultOpen = true,
}: {
  title: string;
  hint?: React.ReactNode;
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
          <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">{title}</h2>
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
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
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
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
          className="glass w-32 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
        />
        {suffix && <span className="text-xs text-text-faint">{suffix}</span>}
      </div>
    </div>
  );
}

function TextField({
  label,
  hint,
  value,
  placeholder,
  mono,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
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
        onChange={(e) => onChange(e.target.value)}
        className={`admin-input ${mono ? "font-mono text-xs" : ""}`}
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
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-[var(--color-menu-yellow)] hover:underline"
          >
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
              placeholder={keySet ? "Enter new secret to replace…" : "Enter signing secret (16+ characters)…"}
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
            disabled={draft.trim().length < 16}
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
  fixed,
  onAdd,
  onRemove,
}: {
  values: string[];
  placeholder: string;
  fixed?: readonly string[];
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
        {fixed?.map((v) => (
          <span
            key={`fixed-${v}`}
            className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/40"
            title="Always enforced — cannot be removed"
          >
            <code>{v}</code>
            <ShieldAlert size={10} className="text-white/30" />
          </span>
        ))}
        {values
          .filter((v) => !fixed?.includes(v))
          .map((v) => (
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
        {values.filter((v) => !fixed?.includes(v)).length === 0 && !fixed?.length && (
          <span className="text-xs text-text-faint">None configured.</span>
        )}
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        });
      }}
      className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-white/15"
    >
      {copied ? <ClipboardCheck size={12} /> : <ClipboardCopy size={12} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ── Live header inspector ────────────────────────────────────────────────────

interface InspectRow {
  label: string;
  status: number | null;
  headers: { cacheControl: string | null; vary: string | null; xCacheSecurity: string | null } | null;
  error?: string;
}
interface InspectResponse {
  path: string;
  checkedAt: string;
  results: InspectRow[];
}

function InspectRowCard({ row }: { row: InspectRow }) {
  const bypass = row.headers?.xCacheSecurity?.startsWith("bypass") || row.headers?.xCacheSecurity === "signed-invalid";
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white/5 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-white">{row.label}</span>
        {row.headers ? (
          bypass ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              <ShieldOff size={10} /> Not cacheable
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">
              <CheckCircle2 size={10} /> Cacheable
            </span>
          )
        ) : (
          <span className="flex items-center gap-1 rounded-full bg-hot/15 px-2 py-0.5 text-[10px] font-bold text-hot">
            <XCircle size={10} /> Unreachable
          </span>
        )}
      </div>
      {row.headers ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-text-faint">Status</dt>
          <dd className="font-mono text-white/80">{row.status}</dd>
          <dt className="text-text-faint">Cache-Control</dt>
          <dd className="font-mono text-white/80">{row.headers.cacheControl ?? "(not set)"}</dd>
          <dt className="text-text-faint">Vary</dt>
          <dd className="font-mono text-white/80">{row.headers.vary ?? "(not set)"}</dd>
          <dt className="text-text-faint">X-Cache-Security</dt>
          <dd className="font-mono text-white/80">{row.headers.xCacheSecurity ?? "(not set)"}</dd>
        </dl>
      ) : (
        <p className="text-xs text-hot">{row.error ?? "Request failed."}</p>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

/** Admin → Cache → Security. Unlike the rest of the Cache section, this
 * page's settings are enforced live by this app's own middleware.ts on
 * every request (see applySecurityCacheHeaders there) — there's no server
 * config to paste anywhere else. Five toggle-driven sections plus one
 * optional advanced one:
 *   1. Do Not Cache Authenticated Pages
 *   2. Separate Guest and Logged-in User Caches
 *   3. CSRF-Safe Caching
 *   4. Cookie-Aware Cache Rules
 *   5. Cache Bypass for Admin, Login, and User Account Pages
 *   6. Signed URLs / Signed Cookies (optional) — plus a "Generate test
 *      signature" tool and a live guest-vs-authenticated header check so
 *      the admin can see the enforcement working, not just trust it. */
export function CacheSecurityAdminClient() {
  const [settings, setSettings] = useState<SecurityCacheSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Signing secret handled out-of-band, same convention as the Varnish
  // purge key in Full Page Cache — never round-tripped through settings
  // state, only sent on an explicit Set/Clear.
  const [pendingSigningSecret, setPendingSigningSecret] = useState("");
  const [clearSigningSecret, setClearSigningSecret] = useState(false);

  // Signed URL / cookie test tool
  const [signPath, setSignPath] = useState("/downloads/example.zip");
  const [signKind, setSignKind] = useState<"url" | "cookie">("url");
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [signResult, setSignResult] = useState<Record<string, unknown> | null>(null);

  // Live header inspector
  const [inspectPath, setInspectPath] = useState("/");
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectResponse | null>(null);

  const load = () =>
    fetch("/api/admin/cache/security/settings")
      .then((r) => r.json())
      .then((data) => setSettings(mapSecurityCacheSettingsRow(data.settings)))
      .catch(() => setSettings(DEFAULT_SECURITY_CACHE_SETTINGS));

  useEffect(() => {
    load();
  }, []);

  function patch(p: Partial<SecurityCacheSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        doNotCacheAuthenticated: settings.doNotCacheAuthenticated,
        authCookieNames: settings.authCookieNames,
        separateGuestLoggedInCache: settings.separateGuestLoggedInCache,
        sendVaryCookieHeader: settings.sendVaryCookieHeader,
        csrfSafeCachingEnabled: settings.csrfSafeCachingEnabled,
        cookieAwareRulesEnabled: settings.cookieAwareRulesEnabled,
        bypassCookieNames: settings.bypassCookieNames,
        bypassQueryParams: settings.bypassQueryParams,
        bypassPaths: settings.bypassPaths,
        signedUrlsEnabled: settings.signedUrlsEnabled,
        signedCookiesEnabled: settings.signedCookiesEnabled,
        signedUrlTtlSeconds: settings.signedUrlTtlSeconds,
        signedUrlParamName: settings.signedUrlParamName,
        signedUrlExpiresParamName: settings.signedUrlExpiresParamName,
        signedCookieName: settings.signedCookieName,
        signedProtectedPaths: settings.signedProtectedPaths,
      };
      if (clearSigningSecret) body.clearSigningSecret = true;
      else if (pendingSigningSecret) body.signingSecret = pendingSigningSecret;

      const res = await fetch("/api/admin/cache/security/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");

      setSettings(mapSecurityCacheSettingsRow(data.settings));
      setPendingSigningSecret("");
      setClearSigningSecret(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function runSignTest() {
    setSigning(true);
    setSignError(null);
    setSignResult(null);
    try {
      const res = await fetch("/api/admin/cache/security/sign-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: signPath, kind: signKind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate a signature.");
      setSignResult(data);
    } catch (err) {
      setSignError(err instanceof Error ? err.message : "Failed to generate a signature.");
    } finally {
      setSigning(false);
    }
  }

  async function runInspect() {
    setInspecting(true);
    setInspectError(null);
    try {
      const res = await fetch(`/api/admin/cache/security/inspect?path=${encodeURIComponent(inspectPath)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed.");
      setInspectResult(data);
    } catch (err) {
      setInspectError(err instanceof Error ? err.message : "Check failed.");
    } finally {
      setInspecting(false);
    }
  }

  if (!settings) {
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
          <h1 className="font-display text-2xl font-bold text-white">Security-Aware Caching</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Enforced live by this app on every request — not a config generator like Full Page Cache or CDN. Makes
            sure nothing sensitive ever ends up in a shared cache.
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

      {/* ── 1. Do Not Cache Authenticated Pages ─────────────────────────────── */}
      <Section
        title="1 · Do Not Cache Authenticated Pages"
        hint="Any request carrying one of these cookie names gets Cache-Control: private, no-store, max-age=0 — regardless of what Full Page Cache, the CDN, or the browser would otherwise do."
      >
        <ToggleField
          label="Force no-store for authenticated requests"
          hint="Turning this off lets logged-in responses be cached — only do this if every page is already fully user-agnostic, or Separate Guest and Logged-in Caches (below) is on."
          checked={settings.doNotCacheAuthenticated}
          onChange={(v) => patch({ doNotCacheAuthenticated: v })}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-white">Session cookie names</span>
          <span className="text-xs text-text-faint">
            Presence of any of these marks a request as authenticated. Supabase SSR cookies are included by default.
          </span>
          <ChipListField
            values={settings.authCookieNames}
            placeholder="my-custom-session-cookie"
            onAdd={(v) => patch({ authCookieNames: [...settings.authCookieNames, v] })}
            onRemove={(v) => patch({ authCookieNames: settings.authCookieNames.filter((c) => c !== v) })}
          />
        </div>
      </Section>

      {/* ── 2. Separate Guest and Logged-in User Caches ─────────────────────── */}
      <Section
        title="2 · Separate Guest and Logged-in User Caches"
        hint="When a response IS cacheable, tell any shared cache (browser, CDN, reverse proxy) to keep guest and logged-in variants apart instead of mixing them."
      >
        <ToggleField
          label="Vary cached responses by cookie"
          hint="Sends Vary: Cookie on cacheable responses so guest and authenticated visitors are never served each other's cached copy."
          checked={settings.separateGuestLoggedInCache}
          onChange={(v) => patch({ separateGuestLoggedInCache: v })}
        />
        <ToggleField
          label="Actually emit the Vary header"
          hint="Turn off only if something in front of this app already sends a broader Vary of its own — leaving both on is harmless but redundant."
          checked={settings.sendVaryCookieHeader}
          disabled={!settings.separateGuestLoggedInCache}
          onChange={(v) => patch({ sendVaryCookieHeader: v })}
        />
      </Section>

      {/* ── 3. CSRF-Safe Caching ─────────────────────────────────────────────── */}
      <Section
        title="3 · CSRF-Safe Caching"
        hint="State-changing requests (POST/PUT/PATCH/DELETE) are never cacheable — caching a response to one could let a cached mutation be replayed or leak one visitor's result to another. The same-origin check on state-changing /api requests (see middleware.ts) is the complementary CSRF defense on the write side."
      >
        <ToggleField
          label="Enable CSRF-safe caching"
          hint="Master switch for this section."
          checked={settings.csrfSafeCachingEnabled}
          onChange={(v) => patch({ csrfSafeCachingEnabled: v })}
        />
        <ToggleField
          label="Block caching of state-changing methods"
          hint="Always on per RFC 9111 — only GET/HEAD responses are ever eligible for a positive cache. Shown here so this isn't a silent, undocumented behavior."
          checked={settings.blockStateChangingMethods}
          disabled
          onChange={() => {}}
        />
      </Section>

      {/* ── 4. Cookie-Aware Cache Rules ──────────────────────────────────────── */}
      <Section
        title="4 · Cookie-Aware Cache Rules"
        hint="Broader than the session cookies above — any of these cookies or query params present forces a bypass, regardless of path or auth state. Useful for admin impersonation, preview, or debug cookies that must never leak into a shared cache."
        defaultOpen={false}
      >
        <ToggleField
          label="Enable cookie-aware bypass rules"
          checked={settings.cookieAwareRulesEnabled}
          onChange={(v) => patch({ cookieAwareRulesEnabled: v })}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-white">Bypass cookie names</span>
          <ChipListField
            values={settings.bypassCookieNames}
            placeholder="impersonate_user"
            onAdd={(v) => patch({ bypassCookieNames: [...settings.bypassCookieNames, v] })}
            onRemove={(v) => patch({ bypassCookieNames: settings.bypassCookieNames.filter((c) => c !== v) })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-white">Bypass query params</span>
          <span className="text-xs text-text-faint">
            e.g. <code>?preview=1</code>, <code>?nocache</code>.
          </span>
          <ChipListField
            values={settings.bypassQueryParams}
            placeholder="preview"
            onAdd={(v) => patch({ bypassQueryParams: [...settings.bypassQueryParams, v] })}
            onRemove={(v) => patch({ bypassQueryParams: settings.bypassQueryParams.filter((p) => p !== v) })}
          />
        </div>
      </Section>

      {/* ── 5. Cache Bypass for Admin, Login, and User Account Pages ───────── */}
      <Section
        title="5 · Cache Bypass for Admin, Login, and User Account Pages"
        hint="These path prefixes always get Cache-Control: private, no-store — independent of cookies, auth state, or any other rule on this page."
      >
        <div className="flex items-center gap-2">
          <Lock size={14} className="text-[var(--color-menu-yellow)]" />
          <span className="text-sm font-semibold text-white">Always-bypassed paths</span>
        </div>
        <span className="text-xs text-text-faint">
          <code>/admin/*</code>, <code>/api/admin/*</code>, <code>/login</code>, <code>/auth/*</code>, and{" "}
          <code>/account/*</code> are always enforced and cannot be removed.
        </span>
        <ChipListField
          values={settings.bypassPaths}
          placeholder="/checkout/*"
          fixed={FIXED_BYPASS_PATHS}
          onAdd={(v) => patch({ bypassPaths: [...settings.bypassPaths, v] })}
          onRemove={(v) =>
            patch({
              bypassPaths: settings.bypassPaths.filter((p) => p !== v && !(FIXED_BYPASS_PATHS as readonly string[]).includes(p)),
            })
          }
        />
      </Section>

      {/* ── 6. Signed URLs / Signed Cookies ─────────────────────────────────── */}
      <Section
        title="6 · Signed URLs / Signed Cookies (optional)"
        hint="Opt-in, path by path. Any path listed under Protected paths is only treated as cacheable when the request carries a valid HMAC-SHA256 signature — otherwise it's forced private/no-store. Verification happens entirely in Postgres; the signing secret is never sent to the browser or read by edge middleware."
        defaultOpen={false}
      >
        <ToggleField
          label="Signed URLs"
          hint="Require ?sig=&exp= query params on protected paths."
          checked={settings.signedUrlsEnabled}
          onChange={(v) => patch({ signedUrlsEnabled: v })}
        />
        <ToggleField
          label="Signed cookies"
          hint="Also accept a signed cookie in place of the query params."
          checked={settings.signedCookiesEnabled}
          onChange={(v) => patch({ signedCookiesEnabled: v })}
        />

        <SecretField
          label="Signing secret"
          hint="HMAC-SHA256 key. At least 16 characters. Rotating this immediately invalidates every previously issued signed URL/cookie."
          keySet={settings.signingSecretSet}
          preview={settings.signingSecretPreview}
          onSet={(v) => {
            setPendingSigningSecret(v);
            setClearSigningSecret(false);
          }}
          onClear={() => {
            setClearSigningSecret(true);
            setPendingSigningSecret("");
            patch({ signedUrlsEnabled: false, signedCookiesEnabled: false });
          }}
        />
        {(pendingSigningSecret || clearSigningSecret) && (
          <p className="flex items-center gap-1.5 text-xs text-amber-300">
            <AlertTriangle size={12} />
            {clearSigningSecret ? "Secret will be cleared" : "New secret pending"} — click{" "}
            <span className="font-bold">Save changes</span> above to apply.
          </p>
        )}

        <NumberField
          label="Signature lifetime"
          hint="How long a freshly generated signed URL/cookie stays valid."
          value={settings.signedUrlTtlSeconds}
          min={60}
          max={604800}
          suffix="seconds"
          onChange={(v) => patch({ signedUrlTtlSeconds: v })}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField
            label="Signature param"
            value={settings.signedUrlParamName}
            mono
            onChange={(v) => patch({ signedUrlParamName: v })}
          />
          <TextField
            label="Expiry param"
            value={settings.signedUrlExpiresParamName}
            mono
            onChange={(v) => patch({ signedUrlExpiresParamName: v })}
          />
          <TextField
            label="Signed cookie name"
            value={settings.signedCookieName}
            mono
            onChange={(v) => patch({ signedCookieName: v })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-white">Protected paths</span>
          <span className="text-xs text-text-faint">
            Empty by default — nothing is gated until a path is added here.
          </span>
          <ChipListField
            values={settings.signedProtectedPaths}
            placeholder="/downloads/*"
            onAdd={(v) => patch({ signedProtectedPaths: [...settings.signedProtectedPaths, v] })}
            onRemove={(v) => patch({ signedProtectedPaths: settings.signedProtectedPaths.filter((p) => p !== v) })}
          />
        </div>

        {/* Test tool */}
        <div className="flex flex-col gap-3 rounded-xl bg-white/5 p-4">
          <div className="flex items-center gap-2">
            <Fingerprint size={14} className="text-[var(--color-menu-yellow)]" />
            <span className="text-sm font-bold text-white">Generate a test signature</span>
          </div>
          <p className="text-xs text-text-faint">
            Uses the currently saved secret — save any pending secret change above first.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              value={signPath}
              onChange={(e) => setSignPath(e.target.value)}
              placeholder="/downloads/example.zip"
              className="admin-input flex-1 font-mono text-xs"
            />
            <div className="flex shrink-0 gap-1 rounded-xl bg-white/5 p-1">
              {(["url", "cookie"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSignKind(k)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    signKind === k ? "bg-[var(--color-menu-yellow)]/20 text-white" : "text-text-faint hover:text-white"
                  }`}
                >
                  {k === "url" ? "URL" : "Cookie"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={runSignTest}
              disabled={signing || !settings.signingSecretSet}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
            >
              {signing ? <Loader2 size={13} className="animate-spin" /> : <Fingerprint size={13} />}
              Generate
            </button>
          </div>
          {!settings.signingSecretSet && (
            <p className="text-xs text-text-faint">Set a signing secret above to use this tool.</p>
          )}
          {signError && <p className="text-xs text-hot">{signError}</p>}
          {signResult && (
            <div className="flex flex-col gap-2 rounded-lg bg-black/20 p-3">
              {signResult.kind === "url" ? (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">Signed URL</span>
                    <CopyButton text={String(signResult.url)} />
                  </div>
                  <code className="break-all text-xs text-white/80">{String(signResult.url)}</code>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">
                      Set-Cookie example
                    </span>
                    <CopyButton text={String(signResult.setCookieExample)} />
                  </div>
                  <code className="break-all text-xs text-white/80">{String(signResult.setCookieExample)}</code>
                </>
              )}
              <span className="text-[11px] text-text-faint">Expires {String(signResult.expiresAtIso)}</span>
            </div>
          )}
        </div>
      </Section>

      {/* ── Live header check ────────────────────────────────────────────────── */}
      <div className="glass flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Live Header Check</h2>
            <p className="mt-1 text-xs text-text-faint">
              Makes two real requests to this app for the path below — one with no cookies, one with a fake
              authenticated-session cookie — and shows exactly which Cache-Control, Vary, and X-Cache-Security
              headers came back, so you can confirm enforcement instead of trusting the settings above.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            value={inspectPath}
            onChange={(e) => setInspectPath(e.target.value)}
            placeholder="/"
            className="admin-input flex-1 font-mono text-xs"
          />
          <button
            type="button"
            onClick={runInspect}
            disabled={inspecting}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {inspecting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            {inspecting ? "Checking…" : "Run check"}
          </button>
        </div>

        {inspectError && <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{inspectError}</div>}
        {inspectResult && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {inspectResult.results.map((row) => (
              <InspectRowCard key={row.label} row={row} />
            ))}
          </div>
        )}
        {!inspectResult && !inspecting && (
          <p className="text-sm text-text-faint">No check has been run yet this session.</p>
        )}
      </div>
    </div>
  );
}
