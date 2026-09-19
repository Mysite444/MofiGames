"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Loader2, Save, ShieldAlert, MousePointerClick, Eye, UserSearch, Bot, Globe2, Server, PowerOff, Ban, RefreshCw } from "lucide-react";
import {
  fetchAdProtectionSettings,
  updateAdProtectionSettings,
  syncIpIntelRanges,
  type AdminAdProtectionSettings,
  type AdProtectionSettingsInput,
} from "@/lib/supabase/admin-content";

/** Admin → Monetization → Ad Protection. One settings singleton covering
 * every detection/response feature: invalid click detection, click/
 * impression frequency limiting, suspicious-user + bot detection, VPN/
 * proxy + datacenter IP detection, auto ad disable, and auto IP blocking.
 * Same card-per-feature pattern as Advertisement Management. */
export function AdProtectionSettingsAdminClient() {
  const [settings, setSettings] = useState<AdminAdProtectionSettings | null>(null);
  const [form, setForm] = useState<AdProtectionSettingsInput>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchAdProtectionSettings();
      setSettings(data);
      setForm(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load ad protection settings.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof AdProtectionSettingsInput>(key: K, value: AdProtectionSettingsInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateAdProtectionSettings(form);
      setSettings(updated);
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setSyncMessage(null);
    try {
      const result = await syncIpIntelRanges();
      setSyncMessage(`Synced ${result.totalRanges.toLocaleString()} IP ranges.`);
      await load();
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Failed to sync IP ranges.");
    } finally {
      setSyncing(false);
    }
  }

  if (loadError) {
    return <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>;
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="max-w-3xl pb-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Ad Protection</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Invalid-traffic detection for the placements in Advertisement Management — protects your own traffic-quality
            signals, doesn&apos;t touch click accounting inside a third-party ad network&apos;s own iframe.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="glow-yellow-button sticky top-4 flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saved ? "Saved!" : "Save changes"}
        </button>
      </div>

      {formError && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{formError}</div>}

      <div className="flex flex-col gap-5">
        <ProtectionSection
          icon={<MousePointerClick size={17} />}
          title="Invalid Click Detection"
          description="Applies bot + VPN/proxy + datacenter signals to click events specifically."
          enabled={form.invalid_click_detection_enabled ?? true}
          onToggle={(v) => set("invalid_click_detection_enabled", v)}
        />

        <ProtectionSection
          icon={<ShieldAlert size={17} />}
          title="Click Frequency Limiter"
          description="Flags a visitor once they exceed this many clicks on the same placement in the window below."
          enabled={form.click_frequency_limit_enabled ?? true}
          onToggle={(v) => set("click_frequency_limit_enabled", v)}
        >
          <div className="grid grid-cols-2 gap-4">
            <NumberField label="Max clicks" value={form.click_frequency_max ?? 5} min={1} max={1000} onChange={(v) => set("click_frequency_max", v)} />
            <NumberField
              label="Window (seconds)"
              value={form.click_frequency_window_seconds ?? 60}
              min={5}
              max={86400}
              onChange={(v) => set("click_frequency_window_seconds", v)}
            />
          </div>
        </ProtectionSection>

        <ProtectionSection
          icon={<Eye size={17} />}
          title="Impression Frequency Limiter"
          description="Flags a visitor once they exceed this many impressions on the same placement in the window below."
          enabled={form.impression_frequency_limit_enabled ?? true}
          onToggle={(v) => set("impression_frequency_limit_enabled", v)}
        >
          <div className="grid grid-cols-2 gap-4">
            <NumberField
              label="Max impressions"
              value={form.impression_frequency_max ?? 30}
              min={1}
              max={5000}
              onChange={(v) => set("impression_frequency_max", v)}
            />
            <NumberField
              label="Window (seconds)"
              value={form.impression_frequency_window_seconds ?? 60}
              min={5}
              max={86400}
              onChange={(v) => set("impression_frequency_window_seconds", v)}
            />
          </div>
        </ProtectionSection>

        <ProtectionSection
          icon={<UserSearch size={17} />}
          title="Suspicious User Detection"
          description="Applies bot + VPN/proxy + datacenter signals to impression events specifically."
          enabled={form.suspicious_user_detection_enabled ?? true}
          onToggle={(v) => set("suspicious_user_detection_enabled", v)}
        />

        <ProtectionSection
          icon={<Bot size={17} />}
          title="Bot Detection"
          description="Flags requests with a missing/known-automation User-Agent or missing Accept-Language header. A signal, not proof — a disguised bot can still slip through."
          enabled={form.bot_detection_enabled ?? true}
          onToggle={(v) => set("bot_detection_enabled", v)}
        />

        <ProtectionSection
          icon={<Globe2 size={17} />}
          title="VPN & Proxy Detection"
          description="Matches the visitor's IP against a free, publicly maintained list of known VPN/proxy ranges."
          enabled={form.vpn_proxy_detection_enabled ?? true}
          onToggle={(v) => set("vpn_proxy_detection_enabled", v)}
        >
          <IpRangeSyncStatus
            lastSyncedAt={settings.ip_ranges_last_synced_at}
            count={settings.ip_ranges_count}
            syncing={syncing}
            onSync={handleSync}
            message={syncMessage}
            error={syncError}
          />
        </ProtectionSection>

        <ProtectionSection
          icon={<Server size={17} />}
          title="Datacenter IP Detection"
          description="Matches the visitor's IP against a free, publicly maintained list of known datacenter ranges (uses the same synced list above)."
          enabled={form.datacenter_ip_detection_enabled ?? true}
          onToggle={(v) => set("datacenter_ip_detection_enabled", v)}
        />

        <ProtectionSection
          icon={<PowerOff size={17} />}
          title="Auto Ad Disable"
          description="Stops rendering the ad slot for a session once its risk score reaches this threshold."
          enabled={form.auto_ad_disable_enabled ?? true}
          onToggle={(v) => set("auto_ad_disable_enabled", v)}
        >
          <NumberField
            label="Risk score threshold (0-100)"
            value={form.auto_ad_disable_risk_threshold ?? 70}
            min={1}
            max={100}
            onChange={(v) => set("auto_ad_disable_risk_threshold", v)}
          />
        </ProtectionSection>

        <ProtectionSection
          icon={<Ban size={17} />}
          title="Auto IP Blocking"
          description="Automatically blacklists an IP (ad-serving only, not site-wide) once its risk score reaches this threshold. Off by default — review Invalid Traffic Reports before enabling."
          enabled={form.auto_ip_blocking_enabled ?? false}
          onToggle={(v) => set("auto_ip_blocking_enabled", v)}
        >
          <NumberField
            label="Risk score threshold (0-100)"
            value={form.auto_ip_blocking_risk_threshold ?? 90}
            min={1}
            max={100}
            onChange={(v) => set("auto_ip_blocking_risk_threshold", v)}
          />
        </ProtectionSection>

        <div className="glass rounded-2xl p-6">
          <div className="mb-3 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-menu-yellow)] text-black">
              <ShieldAlert size={17} />
            </span>
            <div>
              <h2 className="font-display text-base font-bold text-white">CTR Monitoring</h2>
              <p className="mt-0.5 text-xs text-text-faint">
                Flags today&apos;s click-through rate on the Traffic Quality Dashboard when it&apos;s more than 3× this
                threshold — an unusually high CTR is one of the clearest signs of click fraud.
              </p>
            </div>
          </div>
          <NumberField
            label="Alert threshold (%)"
            value={form.ctr_alert_threshold_pct ?? 0.5}
            min={0}
            max={100}
            step={0.1}
            onChange={(v) => set("ctr_alert_threshold_pct", v)}
          />
        </div>
      </div>
    </form>
  );
}

function IpRangeSyncStatus({
  lastSyncedAt,
  count,
  syncing,
  onSync,
  message,
  error,
}: {
  lastSyncedAt: string | null;
  count: number;
  syncing: boolean;
  onSync: () => void;
  message: string | null;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white/5 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-white">
            {count > 0 ? `${count.toLocaleString()} ranges synced` : "Not synced yet"}
          </p>
          <p className="text-[11px] text-text-faint">
            {lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : "Source: X4BNet/lists_vpn (free, updates daily upstream)"}
          </p>
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="glass-strong flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-60"
        >
          {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {syncing ? "Syncing…" : "Sync IP ranges"}
        </button>
      </div>
      {message && <p className="text-[11px] font-medium text-emerald-400">{message}</p>}
      {error && <p className="text-[11px] font-medium text-hot">{error}</p>}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="admin-input"
      />
    </label>
  );
}

/** Card wrapper matching AdsAdminClient's AdSection: icon, title,
 * description, and a top-right on/off switch. Children are optional —
 * some features (Invalid Click Detection, Suspicious User Detection, Bot
 * Detection) are pure toggles with no extra fields. */
function ProtectionSection({
  icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className={`flex items-start justify-between gap-3 ${children ? "mb-4" : ""}`}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-menu-yellow)] text-black">
            {icon}
          </span>
          <div>
            <h2 className="font-display text-base font-bold text-white">{title}</h2>
            <p className="mt-0.5 text-xs text-text-faint">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          role="switch"
          aria-checked={enabled}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      {children && (
        <div className={enabled ? "" : "opacity-50"}>
          <fieldset disabled={!enabled} className="contents">
            {children}
          </fieldset>
        </div>
      )}
    </div>
  );
}
