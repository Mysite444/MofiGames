"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, RotateCcw, Save } from "lucide-react";
import { fetchSeoSettings, updateSeoSettings, type AdminSeoSettings } from "@/lib/supabase/admin-content";

/** Admin → SEO Management → Robots.txt. Editing and saving here writes
 * `robots_txt_override`; leaving it blank makes /robots.txt fall back to
 * the sensible generated default (see src/app/robots.txt/route.ts) —
 * "Reset to default" just clears the override rather than trying to
 * regenerate and re-populate the field, so the always-current default
 * never goes stale in this editor. */
export function SeoRobotsAdminClient() {
  const [settings, setSettings] = useState<AdminSeoSettings | null>(null);
  const [value, setValue] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchSeoSettings();
      setSettings(data);
      setValue(data.robots_txt_override ?? "");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setLoadError(null);
    try {
      const updated = await updateSeoSettings({ robots_txt_override: value.trim() || null });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setValue("");
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
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">SEO — Robots.txt</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Leave blank to serve the auto-generated default (blocks /admin, /api, auth pages; points at the sitemap
            index).
          </p>
        </div>
        <a
          href="/robots.txt"
          target="_blank"
          rel="noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
        >
          Live view
          <ExternalLink size={13} />
        </a>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass rounded-2xl p-6">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={14}
          placeholder={"User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: https://www.mofigames.com/sitemap.xml"}
          className="admin-input w-full resize-y font-mono text-xs"
        />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saved ? "Saved!" : "Save"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="glass flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white/80 hover:text-white"
          >
            <RotateCcw size={14} />
            Reset to default
          </button>
        </div>
      </div>
    </div>
  );
}
