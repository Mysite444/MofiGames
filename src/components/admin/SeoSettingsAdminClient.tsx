"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Save } from "lucide-react";
import { fetchSeoSettings, updateSeoSettings, type AdminSeoSettings, type SeoSettingsInput } from "@/lib/supabase/admin-content";
import { applyTitleTemplate } from "@/lib/seo";

/** Admin → SEO Management → Global Settings. Everything from the Advanced
 * SEO Module spec that isn't specific to one game/category/post/page:
 * General site-wide defaults, Search Appearance (title template),
 * Search Engine Verification, Home Page SEO, Social Media defaults,
 * Organization schema, and global Indexing Controls. Sitemap on/off
 * toggles live on their own page (Admin → SEO Management → Sitemaps)
 * since that page also shows live sitemap links; robots.txt content has
 * its own page too, for the same reason. */
export function SeoSettingsAdminClient() {
  const [settings, setSettings] = useState<AdminSeoSettings | null>(null);
  const [form, setForm] = useState<SeoSettingsInput>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchSeoSettings();
      setSettings(data);
      setForm(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load SEO settings.");
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
      const updated = await updateSeoSettings(form);
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
    <form onSubmit={handleSave} className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">SEO — Global Settings</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Site-wide SEO defaults. Any game, category, tag, blog post, or page can still override these individually.
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

      <div className="glass flex flex-col gap-4 rounded-2xl p-6">
        <SectionHeading>General</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Site name">
            <input
              value={form.site_name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, site_name: e.target.value }))}
              className="admin-input"
            />
          </Field>
          <Field label="Title template">
            <input
              value={form.title_template ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, title_template: e.target.value }))}
              placeholder="%title% — %site_name%"
              className="admin-input"
            />
          </Field>
        </div>
        <p className="-mt-2 text-[11px] text-text-faint">
          Variables: <code className="rounded bg-white/10 px-1">%title%</code>{" "}
          <code className="rounded bg-white/10 px-1">%category%</code>{" "}
          <code className="rounded bg-white/10 px-1">%site_name%</code>
        </p>
        <TitleTemplatePreview template={form.title_template} siteName={form.site_name} />
        <Field label="Default meta description">
          <textarea
            value={form.default_meta_description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, default_meta_description: e.target.value }))}
            rows={2}
            className="admin-input resize-none"
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default author">
            <input
              value={form.default_author ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, default_author: e.target.value }))}
              className="admin-input"
            />
          </Field>
          <Field label="Default language (ISO 639-1)">
            <input
              value={form.default_language ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, default_language: e.target.value }))}
              placeholder="en"
              className="admin-input"
            />
          </Field>
          <Field label="Default region (ISO 3166-1)">
            <input
              value={form.default_region ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, default_region: e.target.value }))}
              placeholder="US"
              className="admin-input"
            />
          </Field>
          <Field label="Canonical domain">
            <select
              value={form.canonical_domain ?? "non-www"}
              onChange={(e) => setForm((f) => ({ ...f, canonical_domain: e.target.value as "www" | "non-www" }))}
              className="admin-input"
            >
              <option value="non-www">non-www (mofigames.com)</option>
              <option value="www">www (www.mofigames.com)</option>
            </select>
          </Field>
          <Field label="Trailing slash">
            <select
              value={form.trailing_slash ?? "remove"}
              onChange={(e) => setForm((f) => ({ ...f, trailing_slash: e.target.value as "add" | "remove" | "ignore" }))}
              className="admin-input"
            >
              <option value="remove">Remove (/game/foo)</option>
              <option value="add">Add (/game/foo/)</option>
              <option value="ignore">Leave as-is</option>
            </select>
          </Field>
        </div>

        <SectionHeading>Search engine verification</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Google Search Console">
            <input
              value={form.google_site_verification ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, google_site_verification: e.target.value }))}
              placeholder="Verification code (not the full meta tag)"
              className="admin-input"
            />
          </Field>
          <Field label="Bing Webmaster Tools">
            <input
              value={form.bing_site_verification ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, bing_site_verification: e.target.value }))}
              className="admin-input"
            />
          </Field>
          <Field label="Yandex Webmaster">
            <input
              value={form.yandex_site_verification ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, yandex_site_verification: e.target.value }))}
              className="admin-input"
            />
          </Field>
          <Field label="Baidu Webmaster">
            <input
              value={form.baidu_site_verification ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, baidu_site_verification: e.target.value }))}
              className="admin-input"
            />
          </Field>
        </div>

        <SectionHeading>Home page SEO</SectionHeading>
        <Field label="Home page SEO title">
          <input
            value={form.home_seo_title ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, home_seo_title: e.target.value }))}
            placeholder="Falls back to the title template"
            className="admin-input"
          />
        </Field>
        <Field label="Home page meta description">
          <textarea
            value={form.home_meta_description ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, home_meta_description: e.target.value }))}
            rows={2}
            placeholder="Falls back to the default meta description"
            className="admin-input resize-none"
          />
        </Field>

        <SectionHeading>Social media defaults</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default social share image URL">
            <input
              value={form.default_og_image_url ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, default_og_image_url: e.target.value || null }))}
              className="admin-input"
            />
          </Field>
          <Field label="Default image alt text">
            <input
              value={form.default_og_image_alt ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, default_og_image_alt: e.target.value }))}
              className="admin-input"
            />
          </Field>
          <Field label="Twitter/X @site handle">
            <input
              value={form.twitter_site ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, twitter_site: e.target.value }))}
              placeholder="@mofigames"
              className="admin-input"
            />
          </Field>
          <Field label="Twitter/X @creator handle">
            <input
              value={form.twitter_creator ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, twitter_creator: e.target.value }))}
              className="admin-input"
            />
          </Field>
          <Field label="Default card type">
            <select
              value={form.twitter_card_type ?? "summary_large_image"}
              onChange={(e) =>
                setForm((f) => ({ ...f, twitter_card_type: e.target.value as AdminSeoSettings["twitter_card_type"] }))
              }
              className="admin-input"
            >
              <option value="summary_large_image">Summary large image</option>
              <option value="summary">Summary</option>
            </select>
          </Field>
        </div>

        <SectionHeading>Organization schema</SectionHeading>
        <p className="-mt-2 text-[11px] text-text-faint">
          Powers the site-wide Organization + WebSite JSON-LD rendered on every page.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Organization name">
            <input
              value={form.org_name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, org_name: e.target.value }))}
              className="admin-input"
            />
          </Field>
          <Field label="Logo URL">
            <input
              value={form.org_logo_url ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, org_logo_url: e.target.value || null }))}
              className="admin-input"
            />
          </Field>
        </div>
        <Field label="Social profile URLs (one per line — sameAs)">
          <textarea
            value={(form.org_same_as ?? []).join("\n")}
            onChange={(e) =>
              setForm((f) => ({ ...f, org_same_as: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) }))
            }
            rows={3}
            placeholder={"https://twitter.com/mofigames\nhttps://facebook.com/mofigames"}
            className="admin-input resize-none"
          />
        </Field>

        <SectionHeading>Indexing controls</SectionHeading>
        <p className="-mt-2 text-[11px] text-text-faint">
          Global on/off per content type. A per-item &quot;noindex&quot; always wins over these.
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          {(
            [
              ["index_games", "Games"],
              ["index_categories", "Categories"],
              ["index_tags", "Tags"],
              ["index_blog", "Blog posts"],
              ["index_pages", "Static pages"],
              ["index_search_pages", "Search results pages"],
              ["index_author_pages", "Author pages"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={Boolean(form[key])}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                className="h-4 w-4 rounded"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </form>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="-mb-1 mt-2 border-t border-[var(--color-surface-border)] pt-4 text-xs font-bold uppercase tracking-wide text-text-faint first:mt-0 first:border-0 first:pt-0">
      {children}
    </h3>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      {children}
    </label>
  );
}

const TITLE_TEMPLATE_PLACEHOLDERS = ["title", "category", "site_name"];

/** Catches the exact typo class that produces a title like
 * "MofiGames — Sports Games — MofiGamesite_name%" in search results: a
 * placeholder typed without both surrounding percent signs (e.g. a stray
 * "site_name%" or "%site_name" left over from an edit) never gets
 * substituted by applyTitleTemplate(), so it shows up as literal text on
 * every single page that uses this template. */
function findUnwrappedPlaceholders(template: string): string[] {
  return TITLE_TEMPLATE_PLACEHOLDERS.filter((name) => {
    const withoutWrappedOccurrences = template.split(`%${name}%`).join("");
    return withoutWrappedOccurrences.includes(name);
  });
}

/** Live preview shown right under the Title Template field so a typo like
 * a missing "%" is visible immediately, on this page, instead of only
 * showing up later in Google search results. */
function TitleTemplatePreview({ template, siteName }: { template?: string; siteName?: string }) {
  const tpl = (template ?? "").trim();
  if (!tpl) return null;

  const resolvedSiteName = siteName?.trim() || "MofiGames";
  const gamePageTitle = applyTitleTemplate(tpl, {
    title: "Example Game",
    category: "Adventure",
    site_name: resolvedSiteName,
  });
  const categoryPageTitle = applyTitleTemplate(tpl, {
    title: "Adventure Games",
    category: "Adventure",
    site_name: resolvedSiteName,
  });
  const broken = findUnwrappedPlaceholders(tpl);

  return (
    <div className="-mt-1 flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-faint">
        Live preview — what this looks like on a real page
      </p>
      <p className="truncate text-sm text-white">
        Game page: <span className="text-text-muted">{gamePageTitle}</span>
      </p>
      <p className="truncate text-sm text-white">
        Category page: <span className="text-text-muted">{categoryPageTitle}</span>
      </p>
      {broken.length > 0 && (
        <p className="text-xs font-medium text-hot">
          This looks broken: {broken.map((name) => `%${name}%`).join(", ")} is missing a percent sign somewhere, so
          it won&apos;t get replaced — it&apos;ll show up as literal text on every page using this template, exactly
          like above.
        </p>
      )}
    </div>
  );
}
