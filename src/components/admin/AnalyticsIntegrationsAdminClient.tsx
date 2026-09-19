"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Save, CheckCircle2, ExternalLink } from "lucide-react";
import {
  fetchAnalyticsSettings,
  updateAnalyticsSettings,
  type AdminAnalyticsSettings,
  type AnalyticsSettingsInput,
} from "@/lib/supabase/admin-content";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-white/70">{label}</span>
      {children}
      {hint && <span className="text-xs text-text-faint">{hint}</span>}
    </label>
  );
}

function ConnectionBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <span className="flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
      <CheckCircle2 size={12} />
      Connected
    </span>
  ) : (
    <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-bold text-white/60">Not connected</span>
  );
}

/** Admin → Analytics → Connect Integrations. This app never talks to the
 * GA4/GSC/Clarity reporting APIs directly (that needs OAuth credentials
 * only the site owner can create in each of those consoles) — it just
 * stores the public IDs needed to turn tracking on, and injects the
 * scripts site-wide once they're set (see AnalyticsScripts in the root
 * layout). Search Console verification already lives in
 * Admin → SEO Management → Global Settings, so it isn't duplicated here. */
export function AnalyticsIntegrationsAdminClient() {
  const [settings, setSettings] = useState<AdminAnalyticsSettings | null>(null);
  const [form, setForm] = useState<AnalyticsSettingsInput>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchAnalyticsSettings();
      setSettings(data);
      setForm(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load integration settings.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateAnalyticsSettings(form);
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
          <h1 className="font-display text-2xl font-bold text-white">Connect Integrations</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Paste in your own IDs — you connect the accounts, this just wires the tracking up site-wide.
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

      <div className="flex flex-col gap-4">
        <div className="glass flex flex-col gap-4 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-faint">Google Analytics 4</h2>
            <ConnectionBadge connected={Boolean(settings.ga4_measurement_id)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Measurement ID" hint="From GA4 → Admin → Data streams. Looks like G-XXXXXXXXXX.">
              <input
                value={form.ga4_measurement_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, ga4_measurement_id: e.target.value }))}
                placeholder="G-XXXXXXXXXX"
                className="admin-input"
              />
            </Field>
            <Field label="Property ID" hint="Optional — for future reporting-API features.">
              <input
                value={form.ga4_property_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, ga4_property_id: e.target.value }))}
                placeholder="123456789"
                className="admin-input"
              />
            </Field>
          </div>
          <a
            href="https://analytics.google.com/"
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
          >
            Open Google Analytics <ExternalLink size={11} />
          </a>
        </div>

        <div className="glass flex flex-col gap-4 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-faint">Google Search Console</h2>
            <ConnectionBadge connected={Boolean(settings.gsc_site_url)} />
          </div>
          <p className="text-sm text-text-faint">
            Site verification already lives in{" "}
            <Link href="/admin/seo" className="font-semibold text-[var(--color-menu-yellow)] hover:underline">
              SEO Management → Global Settings
            </Link>{" "}
            — this just records which property to link to from here.
          </p>
          <Field label="Verified site URL">
            <input
              value={form.gsc_site_url ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, gsc_site_url: e.target.value }))}
              placeholder="https://www.mofigames.com"
              className="admin-input"
            />
          </Field>
          <a
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
          >
            Open Search Console <ExternalLink size={11} />
          </a>
        </div>

        <div className="glass flex flex-col gap-4 rounded-2xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text-faint">Microsoft Clarity</h2>
            <ConnectionBadge connected={Boolean(settings.clarity_project_id)} />
          </div>
          <Field label="Project ID" hint="From Clarity → Settings → Setup. A short alphanumeric code.">
            <input
              value={form.clarity_project_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, clarity_project_id: e.target.value }))}
              placeholder="abcd1234ef"
              className="admin-input"
            />
          </Field>
          <a
            href="https://clarity.microsoft.com/"
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
          >
            Open Microsoft Clarity <ExternalLink size={11} />
          </a>
        </div>
      </div>
    </form>
  );
}
