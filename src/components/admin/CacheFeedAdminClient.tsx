"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Save,
  Check,
  RefreshCcw,
  ExternalLink,
  Rss,
  Map,
  Braces,
  Waves,
  Trash2,
} from "lucide-react";
import {
  mapFeedCacheRow,
  DEFAULT_FEED_CACHE_SETTINGS,
  type FeedCacheSettings,
  FEED_MAX_ITEMS_LIMITS,
  RSS_TTL_LIMITS,
  SITEMAP_TTL_LIMITS,
  SITEMAP_SWR_LIMITS,
  JSON_FEED_TTL_LIMITS,
  ATOM_TTL_LIMITS,
} from "@/lib/feed-cache-settings";

// ── Shared building blocks (mirrors CacheDnsAdminClient's pattern) ─────────

function Section({ title, hint, children }: { title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="glass mb-4 flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-faint">{title}</h2>
        {hint && <p className="mt-1 text-xs text-text-faint">{hint}</p>}
      </div>
      {children}
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

function LiveLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex w-fit items-center gap-1 text-xs font-semibold text-[var(--color-menu-yellow)] hover:underline"
    >
      {label} <ExternalLink size={11} />
    </a>
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
  return iso ? new Date(iso).toLocaleString() : "Never generated";
}

interface RegenerateResult {
  itemCount: number;
  preview: { title: string; link: string; publishedAt: string }[];
}

interface SitemapPurgeResult {
  games: number;
  categories: number;
  tags: number;
  blog: number;
  pages: number;
  images: number;
}

/** Admin → Cache → Feed Cache. Four formats, one shared content list:
 *   1. RSS Feeds     — real, generated live at GET /feed.xml.
 *   2. XML Sitemaps  — the sitemaps at /sitemaps/*.xml already exist
 *      (Admin → SEO → Sitemaps controls what's in them); this section
 *      owns *how long* a CDN/browser may hold onto that XML, which used
 *      to be a hardcoded constant.
 *   3. JSON Feeds     — real, generated live at GET /feed.json.
 *   4. Atom Feeds     — real, generated live at GET /atom.xml.
 * RSS/JSON Feed/Atom share one content config (which sources, how many
 * items) since they're three envelopes around the same item list — see
 * migration 0047_feed_cache.sql — so "Regenerate" refreshes all three at
 * once from a single real query rather than three separate fake ones.
 */
export function CacheFeedAdminClient() {
  const [feed, setFeed] = useState<FeedCacheSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [regenerating, setRegenerating] = useState(false);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  const [regenerateResult, setRegenerateResult] = useState<RegenerateResult | null>(null);

  const [purging, setPurging] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [purgeResult, setPurgeResult] = useState<SitemapPurgeResult | null>(null);

  function load() {
    fetch("/api/admin/cache/feed/settings")
      .then((res) => res.json())
      .then((data) => setFeed(mapFeedCacheRow(data.settings)))
      .catch(() => setFeed(DEFAULT_FEED_CACHE_SETTINGS));
  }

  useEffect(() => {
    load();
  }, []);

  function patch(p: Partial<FeedCacheSettings>) {
    setFeed((prev) => (prev ? { ...prev, ...p } : prev));
    setSaved(false);
  }

  async function save() {
    if (!feed) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        feedIncludeBlogPosts: feed.feedIncludeBlogPosts,
        feedIncludeNewGames: feed.feedIncludeNewGames,
        feedMaxItems: feed.feedMaxItems,
        feedTitleOverride: feed.feedTitleOverride,
        feedDescription: feed.feedDescription,
        rssEnabled: feed.rssEnabled,
        rssCacheTtlSeconds: feed.rssCacheTtlSeconds,
        sitemapCacheTtlSeconds: feed.sitemapCacheTtlSeconds,
        sitemapStaleWhileRevalidateSeconds: feed.sitemapStaleWhileRevalidateSeconds,
        jsonFeedEnabled: feed.jsonFeedEnabled,
        jsonFeedCacheTtlSeconds: feed.jsonFeedCacheTtlSeconds,
        atomEnabled: feed.atomEnabled,
        atomCacheTtlSeconds: feed.atomCacheTtlSeconds,
      };
      const res = await fetch("/api/admin/cache/feed/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save Feed Cache settings.");
      setFeed(mapFeedCacheRow(data.settings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    setRegenerating(true);
    setRegenerateError(null);
    try {
      const res = await fetch("/api/admin/cache/feed/regenerate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Regenerate failed.");
      setRegenerateResult(data.result ? { itemCount: data.result.itemCount, preview: data.preview ?? [] } : null);
      if (data.settings) setFeed(mapFeedCacheRow(data.settings));
      if (data.warning) setRegenerateError(data.warning);
    } catch (err) {
      setRegenerateError(err instanceof Error ? err.message : "Regenerate failed.");
    } finally {
      setRegenerating(false);
    }
  }

  async function purgeSitemaps() {
    setPurging(true);
    setPurgeError(null);
    try {
      const res = await fetch("/api/admin/cache/feed/purge-sitemaps", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Purge failed.");
      setPurgeResult(data.summary ?? null);
      if (data.settings) setFeed(mapFeedCacheRow(data.settings));
      if (data.warning) setPurgeError(data.warning);
    } catch (err) {
      setPurgeError(err instanceof Error ? err.message : "Purge failed.");
    } finally {
      setPurging(false);
    }
  }

  if (!feed) {
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
          <h1 className="font-display text-2xl font-bold text-white">Feed Cache</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Four outbound formats built from one shared content list — RSS, JSON Feed, and Atom are three envelopes
            around the same items, so their content settings live in one place while each keeps its own cache TTL.
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

      {/* ══════════════════════ 1. RSS Feeds ══════════════════════ */}
      <h2 className="mb-2 mt-2 flex items-center gap-2 text-sm font-bold text-white">
        <Rss size={15} className="text-[var(--color-menu-yellow)]" /> 1. RSS Feeds
      </h2>

      <Section
        title="Feed content"
        hint="Shared by RSS, JSON Feed, and Atom below — they're three formats of the same item list, not three separate feeds to configure."
      >
        <ToggleField
          label="Include blog posts"
          hint="Published, indexable posts from Admin → Content Management → Blog."
          checked={feed.feedIncludeBlogPosts}
          onChange={(v) => patch({ feedIncludeBlogPosts: v })}
        />
        <ToggleField
          label="Include newly published games"
          hint="Off by default — most feed readers expect articles, not a firehose of every new game."
          checked={feed.feedIncludeNewGames}
          onChange={(v) => patch({ feedIncludeNewGames: v })}
        />
        <NumberField
          label="Max items per feed"
          value={feed.feedMaxItems}
          min={FEED_MAX_ITEMS_LIMITS.min}
          max={FEED_MAX_ITEMS_LIMITS.max}
          suffix="items"
          onChange={(v) => patch({ feedMaxItems: v })}
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-white">Feed title override</span>
          <span className="text-xs text-text-faint">Blank falls back to the site name from Global SEO Settings.</span>
          <input
            value={feed.feedTitleOverride}
            onChange={(e) => patch({ feedTitleOverride: e.target.value })}
            placeholder="(uses site name)"
            className="admin-input"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-white">Feed description</span>
          <input
            value={feed.feedDescription}
            onChange={(e) => patch({ feedDescription: e.target.value })}
            className="admin-input"
          />
        </label>
      </Section>

      <Section title="RSS 2.0" hint="Served live at /feed.xml. Turning this off returns an empty channel rather than a 404, so existing subscribers don't start erroring.">
        <ToggleField label="Enable RSS Feed" checked={feed.rssEnabled} onChange={(v) => patch({ rssEnabled: v })} />
        <NumberField
          label="Cache TTL"
          hint="How long a CDN/browser may serve a cached copy before re-checking."
          value={feed.rssCacheTtlSeconds}
          min={RSS_TTL_LIMITS.min}
          max={RSS_TTL_LIMITS.max}
          suffix="seconds"
          disabled={!feed.rssEnabled}
          onChange={(v) => patch({ rssCacheTtlSeconds: v })}
        />
        <LiveLink href="/feed.xml" label="View /feed.xml" />
        <div className="flex flex-col gap-1.5 rounded-xl bg-white/5 px-4 py-3">
          <StatRow label="Last regenerated" value={formatWhen(feed.rssLastGeneratedAt)} />
          <StatRow label="Items last time" value={feed.rssLastItemCount} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
          <p className="text-xs text-text-faint">
            Runs one real query against the content above and refreshes the stats for RSS, JSON Feed, and Atom together.
          </p>
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {regenerating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCcw size={14} />}
            {regenerating ? "Regenerating…" : "Regenerate now"}
          </button>
        </div>
        {regenerateError && <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{regenerateError}</div>}
        {regenerateResult && (
          <div className="flex flex-col gap-2 rounded-xl bg-white/5 px-4 py-3">
            <p className="text-xs font-semibold text-white/80">
              {regenerateResult.itemCount} item{regenerateResult.itemCount === 1 ? "" : "s"} across all three formats. Latest:
            </p>
            {regenerateResult.preview.map((item) => (
              <p key={item.link} className="truncate text-xs text-text-faint">
                <span className="text-white/70">{item.title}</span> — {new Date(item.publishedAt).toLocaleDateString()}
              </p>
            ))}
            {regenerateResult.preview.length === 0 && <p className="text-xs text-text-faint">No eligible items yet.</p>}
          </div>
        )}
      </Section>

      {/* ══════════════════════ 2. XML Sitemaps ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Map size={15} className="text-[var(--color-menu-yellow)]" /> 2. XML Sitemaps
      </h2>

      <Section
        title="Sitemap caching"
        hint="What's included in each sitemap (games, blog, categories, tags, pages, images) is controlled from Admin → SEO Management → Sitemaps — this section only owns how long a CDN/browser may cache the generated XML before re-checking."
      >
        <NumberField
          label="Cache TTL"
          value={feed.sitemapCacheTtlSeconds}
          min={SITEMAP_TTL_LIMITS.min}
          max={SITEMAP_TTL_LIMITS.max}
          suffix="seconds"
          onChange={(v) => patch({ sitemapCacheTtlSeconds: v })}
        />
        <NumberField
          label="Stale-while-revalidate"
          hint="How much longer a stale copy may be served while a fresh one is fetched in the background — keeps a slow regeneration from ever fully blocking a crawler."
          value={feed.sitemapStaleWhileRevalidateSeconds}
          min={SITEMAP_SWR_LIMITS.min}
          max={SITEMAP_SWR_LIMITS.max}
          suffix="seconds"
          onChange={(v) => patch({ sitemapStaleWhileRevalidateSeconds: v })}
        />
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <LiveLink href="/sitemap.xml" label="View /sitemap.xml" />
          <LiveLink href="/sitemaps/games.xml" label="View /sitemaps/games.xml" />
        </div>
      </Section>

      <Section
        title="Purge"
        hint="Sitemaps are generated live from the database on every request — there's no server-side copy to actually flush. This records a real per-type count and timestamps it, as a signal for when a CDN in front of this app was last told to re-check."
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-text-faint">Last purged: {formatWhen(feed.sitemapLastPurgedAt)}</p>
          <button
            type="button"
            onClick={purgeSitemaps}
            disabled={purging}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-60"
          >
            {purging ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {purging ? "Purging…" : "Purge sitemap cache"}
          </button>
        </div>
        {purgeError && <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{purgeError}</div>}
        {(purgeResult ?? feed.sitemapLastPurgeSummary) && (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/5 px-4 py-3 sm:grid-cols-3">
            {Object.entries(purgeResult ?? feed.sitemapLastPurgeSummary!).map(([key, value]) => (
              <StatRow key={key} label={key} value={value as number} />
            ))}
          </div>
        )}
      </Section>

      {/* ══════════════════════ 3. JSON Feeds ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Braces size={15} className="text-[var(--color-menu-yellow)]" /> 3. JSON Feeds
      </h2>

      <Section
        title="JSON Feed 1.1"
        hint="Served live at /feed.json (jsonfeed.org/version/1.1) — same content as RSS Feeds above, just JSON instead of XML."
      >
        <ToggleField label="Enable JSON Feed" checked={feed.jsonFeedEnabled} onChange={(v) => patch({ jsonFeedEnabled: v })} />
        <NumberField
          label="Cache TTL"
          value={feed.jsonFeedCacheTtlSeconds}
          min={JSON_FEED_TTL_LIMITS.min}
          max={JSON_FEED_TTL_LIMITS.max}
          suffix="seconds"
          disabled={!feed.jsonFeedEnabled}
          onChange={(v) => patch({ jsonFeedCacheTtlSeconds: v })}
        />
        <LiveLink href="/feed.json" label="View /feed.json" />
        <div className="flex flex-col gap-1.5 rounded-xl bg-white/5 px-4 py-3">
          <StatRow label="Last regenerated" value={formatWhen(feed.jsonFeedLastGeneratedAt)} />
          <StatRow label="Items last time" value={feed.jsonFeedLastItemCount} />
        </div>
        <p className="text-xs text-text-faint">Regenerated together with RSS Feeds — use the button in section 1.</p>
      </Section>

      {/* ══════════════════════ 4. Atom Feeds ══════════════════════ */}
      <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-bold text-white">
        <Waves size={15} className="text-[var(--color-menu-yellow)]" /> 4. Atom Feeds
      </h2>

      <Section
        title="Atom 1.0"
        hint="Served live at /atom.xml (RFC 4287) — same content as RSS Feeds above, in Atom's stricter envelope."
      >
        <ToggleField label="Enable Atom Feed" checked={feed.atomEnabled} onChange={(v) => patch({ atomEnabled: v })} />
        <NumberField
          label="Cache TTL"
          value={feed.atomCacheTtlSeconds}
          min={ATOM_TTL_LIMITS.min}
          max={ATOM_TTL_LIMITS.max}
          suffix="seconds"
          disabled={!feed.atomEnabled}
          onChange={(v) => patch({ atomCacheTtlSeconds: v })}
        />
        <LiveLink href="/atom.xml" label="View /atom.xml" />
        <div className="flex flex-col gap-1.5 rounded-xl bg-white/5 px-4 py-3">
          <StatRow label="Last regenerated" value={formatWhen(feed.atomLastGeneratedAt)} />
          <StatRow label="Items last time" value={feed.atomLastItemCount} />
        </div>
        <p className="text-xs text-text-faint">Regenerated together with RSS Feeds — use the button in section 1.</p>
      </Section>
    </div>
  );
}
