"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { fetchSeoSettings, updateSeoSettings, type AdminSeoSettings } from "@/lib/supabase/admin-content";

const SITEMAPS = [
  { key: "sitemap_games_enabled" as const, label: "Games", path: "/sitemaps/games.xml" },
  { key: "sitemap_categories_enabled" as const, label: "Categories", path: "/sitemaps/categories.xml" },
  { key: "sitemap_tags_enabled" as const, label: "Tags", path: "/sitemaps/tags.xml" },
  { key: "sitemap_blog_enabled" as const, label: "Blog / News", path: "/sitemaps/blog.xml" },
  { key: "sitemap_pages_enabled" as const, label: "Static pages", path: "/sitemaps/pages.xml" },
  { key: "sitemap_images_enabled" as const, label: "Images (game artwork)", path: "/sitemaps/images.xml" },
];

/** Admin → SEO Management → Sitemaps. Every sitemap is generated live at
 * request time (src/app/sitemaps/*.xml) straight from the database —
 * there's no "regenerate" step or stale cache to worry about, so this
 * page is just the on/off switches plus direct links to view each one. */
export function SeoSitemapsAdminClient() {
  const [settings, setSettings] = useState<AdminSeoSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setSettings(await fetchSeoSettings());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(key: (typeof SITEMAPS)[number]["key"]) {
    if (!settings) return;
    const next = !settings[key];
    setSaving(key);
    setSettings({ ...settings, [key]: next });
    try {
      await updateSeoSettings({ [key]: next });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save.");
      setSettings((s) => (s ? { ...s, [key]: !next } : s));
    } finally {
      setSaving(null);
    }
  }

  if (loadError && !settings) {
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
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">SEO — Sitemaps</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          Every sitemap below is generated live from the database — turning one off removes it from the sitemap
          index immediately, no rebuild needed.
        </p>
      </div>

      {loadError && (
        <div className="mb-4 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <a
        href="/sitemap.xml"
        target="_blank"
        rel="noreferrer"
        className="glass mb-4 flex items-center justify-between rounded-2xl p-5 transition-colors hover:bg-white/[0.06]"
      >
        <div>
          <p className="font-display text-base font-bold text-white">Sitemap index</p>
          <p className="text-xs text-text-faint">/sitemap.xml — submit this one URL to Google Search Console &amp; Bing Webmaster Tools.</p>
        </div>
        <ExternalLink size={16} className="shrink-0 text-white/60" />
      </a>

      <div className="glass divide-y divide-[var(--color-surface-border)] overflow-hidden rounded-2xl">
        {SITEMAPS.map(({ key, label, path }) => (
          <div key={key} className="flex items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="font-semibold text-white">{label}</p>
              <a
                href={path}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-text-faint hover:text-white"
              >
                {path}
                <ExternalLink size={11} />
              </a>
            </div>
            <button
              type="button"
              onClick={() => toggle(key)}
              disabled={saving === key}
              role="switch"
              aria-checked={settings[key]}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                settings[key] ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  settings[key] ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
