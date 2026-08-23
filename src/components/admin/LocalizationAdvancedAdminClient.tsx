"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Save, Languages, Coins, MapPinned } from "lucide-react";
import {
  fetchLocalizationSettings,
  updateLocalizationSettings,
  type AdminLocalizationSettings,
} from "@/lib/supabase/admin-content";

/** Admin → Localization → Advanced. Surfaces the three auto-detection
 * toggles (Auto Language Detection, Auto Currency Detection, Geo-IP Based
 * Region Detection) together in one place, even though they live on the
 * same localization_settings row as Region Settings — grouped here to
 * match the spec's own "Advanced" section and because detection behavior
 * is conceptually one decision, not three separate ones. */
export function LocalizationAdvancedAdminClient() {
  const [settings, setSettings] = useState<AdminLocalizationSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setSettings(await fetchLocalizationSettings());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load settings.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setFormError(null);
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateLocalizationSettings({
        auto_language_detection: settings.auto_language_detection,
        auto_currency_detection: settings.auto_currency_detection,
        geo_ip_region_detection: settings.geo_ip_region_detection,
      });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
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
    <form onSubmit={handleSave} className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Localization — Advanced</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Automatic detection of a visitor&apos;s language, currency, and region.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saved ? "Saved!" : "Save changes"}
        </button>
      </div>

      {formError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{formError}</div>
      )}

      <div className="glass flex flex-col divide-y divide-[var(--color-surface-border)] rounded-2xl">
        <Toggle
          icon={<Languages size={18} />}
          title="Auto Language Detection"
          description="Detect the visitor's browser language and preselect a matching enabled language."
          checked={settings.auto_language_detection}
          onChange={(v) => setSettings((s) => (s ? { ...s, auto_language_detection: v } : s))}
        />
        <Toggle
          icon={<Coins size={18} />}
          title="Auto Currency Detection"
          description="Detect the visitor's likely currency (via IP or locale) and preselect it."
          checked={settings.auto_currency_detection}
          onChange={(v) => setSettings((s) => (s ? { ...s, auto_currency_detection: v } : s))}
        />
        <Toggle
          icon={<MapPinned size={18} />}
          title="Geo-IP Based Region Detection"
          description="Look up the visitor's country/region from their IP address for defaults, restrictions, and redirects."
          checked={settings.geo_ip_region_detection}
          onChange={(v) => setSettings((s) => (s ? { ...s, geo_ip_region_detection: v } : s))}
        />
      </div>
    </form>
  );
}

function Toggle({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-4 p-5">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/80">
        {icon}
      </span>
      <span className="flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-xs text-text-faint">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded"
      />
    </label>
  );
}
