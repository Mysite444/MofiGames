"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, Check } from "lucide-react";
import { mapSecuritySettingsRow, DEFAULT_SECURITY_SETTINGS, type SecuritySettings } from "@/lib/security";

function NumberField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-white">{label}</span>
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))}
        className="glass mt-1 w-40 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
      />
    </label>
  );
}

function ToggleField({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-1">
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        {hint && <span className="block text-xs text-text-faint">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
        }`}
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

function OriginsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState(value.join("\n"));
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-white">API CORS allowed origins</span>
      <span className="text-xs text-text-faint">
        One per line. Use <code>*</code> to allow any origin. Empty means the /api/v1 API is only reachable
        server-to-server with a key, not from a browser page on another site.
      </span>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(
            e.target.value
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean)
          );
        }}
        rows={3}
        placeholder="https://partner-site.com"
        className="glass mt-1 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-white/40"
      />
    </label>
  );
}

/** Admin → Security → Settings. Password policy, account lockout, and
 * session timeout — the single-row `security_settings` table. See
 * supabase/migrations/0017_security_hardening.sql. */
export function SecuritySettingsAdminClient() {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/security/settings")
      .then((res) => res.json())
      .then((data) => setSettings(mapSecuritySettingsRow(data.settings)))
      .catch(() => setSettings(DEFAULT_SECURITY_SETTINGS));
  }, []);

  function patch(p: Partial<SecuritySettings>) {
    setSettings((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/security/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minPasswordLength: settings.minPasswordLength,
          requireUppercase: settings.requireUppercase,
          requireLowercase: settings.requireLowercase,
          requireNumber: settings.requireNumber,
          requireSymbol: settings.requireSymbol,
          maxFailedAttempts: settings.maxFailedAttempts,
          lockoutWindowMinutes: settings.lockoutWindowMinutes,
          sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
          require2faForAdmins: settings.require2faForAdmins,
          apiCorsOrigins: settings.apiCorsOrigins,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save.");
      setSettings(mapSecuritySettingsRow(data.settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
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
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Security Settings</h1>
          <p className="mt-0.5 text-sm text-text-faint">Password policy, account lockout, and session timeout.</p>
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

      <div className="glass flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Password Policy</h2>
        <NumberField
          label="Minimum length"
          value={settings.minPasswordLength}
          min={6}
          max={128}
          onChange={(v) => patch({ minPasswordLength: v })}
        />
        <ToggleField
          label="Require an uppercase letter"
          checked={settings.requireUppercase}
          onChange={(v) => patch({ requireUppercase: v })}
        />
        <ToggleField
          label="Require a lowercase letter"
          checked={settings.requireLowercase}
          onChange={(v) => patch({ requireLowercase: v })}
        />
        <ToggleField
          label="Require a number"
          checked={settings.requireNumber}
          onChange={(v) => patch({ requireNumber: v })}
        />
        <ToggleField
          label="Require a symbol"
          checked={settings.requireSymbol}
          onChange={(v) => patch({ requireSymbol: v })}
        />
      </div>

      <div className="glass mt-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Account Lockout</h2>
        <NumberField
          label="Max failed attempts"
          hint="Failed logins allowed within the window below before an account is temporarily locked."
          value={settings.maxFailedAttempts}
          min={3}
          max={20}
          onChange={(v) => patch({ maxFailedAttempts: v })}
        />
        <NumberField
          label="Lockout window (minutes)"
          hint="Both the window failed attempts are counted in, and roughly how long the lockout lasts."
          value={settings.lockoutWindowMinutes}
          min={1}
          max={1440}
          onChange={(v) => patch({ lockoutWindowMinutes: v })}
        />
      </div>

      <div className="glass mt-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">Sessions</h2>
        <NumberField
          label="Idle session timeout (minutes)"
          hint="Signs a person out automatically after this long with no activity."
          value={settings.sessionTimeoutMinutes}
          min={5}
          max={1440}
          onChange={(v) => patch({ sessionTimeoutMinutes: v })}
        />
        <ToggleField
          label="Require 2FA for admins"
          hint="Informational for now — displayed here so it's tracked, not yet enforced at login."
          checked={settings.require2faForAdmins}
          onChange={(v) => patch({ require2faForAdmins: v })}
        />
      </div>

      <div className="glass mt-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">API</h2>
        <OriginsField value={settings.apiCorsOrigins} onChange={(v) => patch({ apiCorsOrigins: v })} />
      </div>
    </div>
  );
}
