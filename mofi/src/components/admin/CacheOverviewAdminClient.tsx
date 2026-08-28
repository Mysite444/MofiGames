"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, Gauge, Server, Globe, Boxes, Layers, Layers3, Cpu, Code2, ImageIcon, FileCode, Network, Zap, Lock, Search, Braces, BarChart3, Rss, Film, Rocket, ArrowRight, CircleCheck, CircleDashed, Loader2, Minimize2, Fingerprint, Activity } from "lucide-react";
import { mapCacheSettingsRow, DEFAULT_CACHE_SETTINGS, type CacheSettings } from "@/lib/cache-settings";

interface RoadmapPhase {
  key: string;
  title: string;
  description: string;
  bullets: string[];
  icon: React.ReactNode;
  href?: string;
  available: boolean;
}

const PHASES: RoadmapPhase[] = [
  {
    key: "browser",
    title: "Browser Cache",
    description: "What the visitor's own browser is told to keep, and for how long.",
    bullets: ["Cache-Control", "ETag / Last-Modified", "Immutable & versioned assets", "Service Worker"],
    icon: <Gauge size={20} />,
    href: "/admin/cache/browser",
    available: true,
  },
  {
    key: "full-page",
    title: "Full Page Cache",
    description: "Server-level cache in front of Node.js — serves complete responses without ever invoking the app.",
    bullets: [
      "LiteSpeed Cache",
      "Nginx FastCGI Cache",
      "Varnish Cache",
      "Cloudflare APO (WordPress)",
      "Static HTML Cache",
      "Guest Page Cache",
      "Logged-in User Cache",
    ],
    icon: <Server size={20} />,
    href: "/admin/cache/full-page",
    available: true,
  },
  {
    key: "cdn",
    title: "CDN / Edge Cache",
    description: "What Cloudflare, sitting in front of the app, is allowed to keep at the edge.",
    bullets: [
      "Cloudflare CDN",
      "Edge Caching",
      "Smart Cache Rules",
      "Cache Everything (where appropriate)",
      "Cache by Device",
      "Cache by Query String",
      "Image CDN",
      "Brotli Compression",
      "HTTP/3",
      "Early Hints (103)",
    ],
    icon: <Globe size={20} />,
    href: "/admin/cache/cdn",
    available: true,
  },
  {
    key: "object",
    title: "Object Cache",
    description: "A persistent key-value store in front of expensive computations — separate from whole-page caching.",
    bullets: [
      "Redis",
      "Memcached",
      "WordPress Object Cache",
      "Persistent Object Cache",
      "Cache Groups",
      "Selective Object Invalidation",
    ],
    icon: <Layers size={20} />,
    href: "/admin/cache/object",
    available: true,
  },
  {
    key: "php-opcode",
    title: "PHP OPcache",
    description: "Stores compiled PHP bytecode in shared memory. JIT compiles hot paths to native code. Preloading warms classes at FPM startup. Interned Strings de-duplicates immutable string literals.",
    bullets: [
      "OPcache",
      "JIT Compilation (PHP 8+)",
      "PHP Preloading",
      "Interned Strings",
    ],
    icon: <Cpu size={20} />,
    href: "/admin/cache/php-opcode",
    available: true,
  },
  {
    key: "fragment",
    title: "Fragment Cache",
    description:
      "Caches only expensive page sections — not whole pages, not a generic store — each with its own TTL, served from this app's own process.",
    bullets: [
      "Trending Games",
      "Featured Games",
      "Related Games",
      "Navigation Menus",
      "Footer Widgets",
      "Sidebars",
      "Game Cards",
      "Homepage Sections",
    ],
    icon: <Layers3 size={20} />,
    href: "/admin/cache/fragment",
    available: true,
  },
  {
    key: "api-cache",
    title: "API Cache",
    description:
      "REST, GraphQL, and JSON response caching for this app's own API routes — Cache-Control headers, per-endpoint TTL rules, ETag and Last-Modified conditional requests.",
    bullets: [
      "REST API Caching",
      "GraphQL Caching",
      "JSON Response Cache",
      "Endpoint TTL Rules",
      "ETag",
      "Last-Modified",
      "Conditional Requests (304)",
    ],
    icon: <Code2 size={20} />,
    href: "/admin/cache/api-cache",
    available: true,
  },
  {
    key: "image",
    title: "Image Cache",
    description:
      "Next-gen format transcoding, responsive srcset generation, per-variant caching, and lazy-load configuration for every image on the site.",
    bullets: [
      "WebP Generation",
      "AVIF Generation",
      "Responsive Images",
      "Thumbnail Cache",
      "Lazy Loading",
      "Image Optimisation Cache",
      "Image Resizing Cache",
    ],
    icon: <ImageIcon size={20} />,
    href: "/admin/cache/image",
    available: true,
  },
  {
    key: "static-assets",
    title: "Static Asset Cache",
    description:
      "Per-asset-type Cache-Control — distinct from the always-immutable Next.js build output and from Browser Cache's versioned upload buckets.",
    bullets: ["CSS", "JavaScript", "Fonts", "SVG", "Icons", "Videos", "Audio"],
    icon: <FileCode size={20} />,
    href: "/admin/cache/static-assets",
    available: true,
  },
  {
    key: "server",
    title: "App-Level Cache",
    description: "What this app itself caches — rendered pages, fetch results, computed data.",
    bullets: ["Full route / data cache", "Revalidation (time & on-demand)", "React cache()"],
    icon: <Boxes size={20} />,
    available: false,
  },
  {
    key: "database",
    title: "Database Optimisation",
    description: "Redis query cache, cached query result slots, prepared-statement limits, slow-query logging, and index recommendations.",
    bullets: [
      "Redis Query Cache",
      "Cached Query Results",
      "Prepared Statements",
      "Query Optimisation",
      "Index Optimisation",
    ],
    icon: <Database size={20} />,
    href: "/admin/cache/db-optimization",
    available: true,
  },
  {
    key: "dns",
    title: "DNS Cache",
    description:
      "Four different owners between a visitor typing this site's name and a byte leaving Cloudflare's edge — the zone's authoritative records, the visitor's browser, their OS, and this app's own outbound resolver.",
    bullets: ["Cloudflare DNS", "Browser DNS Cache", "Operating System DNS Cache", "Resolver Cache"],
    icon: <Network size={20} />,
    href: "/admin/cache/dns",
    available: true,
  },
  {
    key: "edge",
    title: "Edge Cache",
    description:
      "Six advanced Cloudflare edge-layer features — Workers Cache, ESI fragment assembly, regional PoP topology, stale-while-revalidate revalidation, Argo Tiered Cache, and an optional Origin Shield.",
    bullets: [
      "Cloudflare Workers Cache",
      "Edge Side Includes (ESI)",
      "Regional Caching",
      "Smart Edge Revalidation",
      "Tiered Cache",
      "Origin Shield",
    ],
    icon: <Zap size={20} />,
    href: "/admin/cache/edge",
    available: true,
  },
  {
    key: "session",
    title: "Session Cache",
    description:
      "Where session data lives and how it stays fast, durable, and safe across more than one running instance.",
    bullets: ["Redis Sessions", "Database Sessions", "Secure Session Storage", "Session Replication"],
    icon: <Lock size={20} />,
    href: "/admin/cache/session",
    available: true,
  },
  {
    key: "search",
    title: "Search Cache",
    description:
      "Suggestions, the popular-searches leaderboard, filtered-listing cache keys, autocomplete, and which backend actually answers a search.",
    bullets: ["Search Suggestions", "Popular Searches", "Filter Results", "Autocomplete", "Search Indexes"],
    icon: <Search size={20} />,
    href: "/admin/cache/search",
    available: true,
  },
  {
    key: "metadata",
    title: "Metadata Cache",
    description:
      "Lookup-shaped caches for individual records — distinct from Fragment Cache's listing/grid caches — plus the computed Developers/Publishers leaderboards and resolved SEO output.",
    bullets: ["Categories", "Tags", "Developers", "Publishers", "Game Metadata", "SEO Metadata"],
    icon: <Braces size={20} />,
    href: "/admin/cache/metadata",
    available: true,
  },
  {
    key: "analytics",
    title: "Analytics Cache",
    description:
      "Five analytics data-caching pillars — Dashboard Statistics, Visitor Counts, Popular Games, Reports, and Aggregated Metrics — each with its own TTL, resolution, and independent purge scope.",
    bullets: [
      "Dashboard Statistics",
      "Visitor Counts",
      "Popular Games",
      "Reports",
      "Aggregated Metrics",
    ],
    icon: <BarChart3 size={20} />,
    href: "/admin/cache/analytics",
    available: true,
  },
  {
    key: "feed",
    title: "Feed Cache",
    description:
      "Four outbound formats built from one shared content list — RSS and Atom read the same posts (and, optionally, new games) as JSON Feeds, while XML Sitemaps gets its own admin-configurable Cache-Control instead of a hardcoded one.",
    bullets: ["RSS Feeds", "XML Sitemaps", "JSON Feeds", "Atom Feeds"],
    icon: <Rss size={20} />,
    href: "/admin/cache/feed",
    available: true,
  },
  {
    key: "media",
    title: "Media Cache",
    description:
      "Five media-caching pillars — Videos, Audio, Game Previews, Loading Screens, and Screenshots — each with its own TTL, stale-while-revalidate, CDN offload toggle, and independent purge scope.",
    bullets: ["Videos", "Audio", "Game Previews", "Loading Screens", "Screenshots"],
    icon: <Film size={20} />,
    href: "/admin/cache/media",
    available: true,
  },
  {
    key: "preloading",
    title: "Preloading & Prefetching",
    description:
      "Six ways to get ahead of a visitor's next request. DNS Prefetch and Preconnect already live under DNS Cache and are cross-linked here rather than duplicated.",
    bullets: ["Cache Preloading", "Link Prefetch", "DNS Prefetch", "Preconnect", "Resource Hints", "Speculative Loading"],
    icon: <Rocket size={20} />,
    href: "/admin/cache/preloading",
    available: true,
  },
  {
    key: "compression",
    title: "Compression",
    description:
      "Response-body encoding and payload shrinking — Brotli and Gzip content-encoding negotiation, plus real CSS/JavaScript/HTML minification with a live before/after preview, distinct from Static Asset Cache's TTLs and CDN's own edge-level Brotli toggle.",
    bullets: ["Brotli Compression", "Gzip Compression", "CSS Minification", "JavaScript Minification", "HTML Minification"],
    icon: <Minimize2 size={20} />,
    href: "/admin/cache/compression",
    available: true,
  },
  {
    key: "monitoring",
    title: "Monitoring & Observability",
    description:
      "Cross-layer visibility into what is stored, how much space it occupies, and when it was last cleared. Per-layer TTL defaults, manual purge controls (all or selected layers), a full purge-log audit trail, and scheduled automatic cache cleanup.",
    bullets: [
      "Cache Storage Usage",
      "Cache Status & Type",
      "Cache Size",
      "Last Cache Purge",
      "Purge All Cache",
      "Purge Selected Cache",
      "Cache TTL (Expiration Time)",
      "Cache Purge Logs",
      "Automatic Cache Cleanup",
    ],
    icon: <Activity size={20} />,
    href: "/admin/cache/monitoring",
    available: true,
  },
  {
    key: "security",
    title: "Security-Aware Caching",
    description:
      "The one cache page enforced live, on every request, by this app's own middleware — not a config generator like Full Page Cache or CDN. Keeps authenticated, CSRF-sensitive, and admin/login/account content out of shared caches, and optionally gates specific paths behind signed URLs or cookies.",
    bullets: [
      "No-Cache Authenticated Pages",
      "Guest vs Logged-in Cache Split",
      "CSRF-Safe Caching",
      "Cookie-Aware Rules",
      "Admin/Login/Account Bypass",
      "Signed URLs / Cookies",
    ],
    icon: <Fingerprint size={20} />,
    href: "/admin/cache/security",
    available: true,
  },
];

function StatChip({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "neutral" }) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-500/15 text-emerald-400"
      : tone === "amber"
        ? "bg-amber-500/15 text-amber-400"
        : "bg-white/10 text-text-faint";
  return (
    <div className="glass flex flex-col gap-1 rounded-xl px-4 py-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-text-faint">{label}</span>
      <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-bold ${toneClass}`}>
        {value}
      </span>
    </div>
  );
}

/** Admin → Cache → Overview. A roadmap/status landing page — the actual
 * settings live one level down per phase (currently just
 * /admin/cache/browser). Pulls the live cache_settings row so the
 * headline stats are real, not just copy. */
export function CacheOverviewAdminClient() {
  const [settings, setSettings] = useState<CacheSettings | null>(null);

  useEffect(() => {
    fetch("/api/cache/settings")
      .then((res) => res.json())
      .then((data) => setSettings(mapCacheSettingsRow(data.settings)))
      .catch(() => setSettings(DEFAULT_CACHE_SETTINGS));
  }, []);

  const versionedBucketAges = settings
    ? [settings.contentImagesMaxAge, settings.gameThumbnailsMaxAge, settings.gameMediaMaxAge, settings.mediaLibraryMaxAge]
    : [];
  const longCacheCount = versionedBucketAges.filter((s) => s >= 2592000).length;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Cache</h1>
        <p className="mt-1 max-w-2xl text-sm text-text-faint">
          Everything that decides how long a response — a page, a script, an uploaded thumbnail — gets to sit
          somewhere before it's fetched fresh again. Built out one layer at a time; Browser Cache, Full Page Cache,
          CDN / Edge Cache, Object Cache, and Database Optimisation are all live.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {!settings ? (
          <div className="col-span-4 flex items-center gap-2 py-4 text-sm text-text-faint">
            <Loader2 size={16} className="animate-spin" /> Loading live status…
          </div>
        ) : (
          <>
            <StatChip
              label="Service Worker"
              value={settings.serviceWorkerEnabled ? "Enabled" : "Disabled"}
              tone={settings.serviceWorkerEnabled ? "emerald" : "neutral"}
            />
            <StatChip label="SW cache version" value={`v${settings.serviceWorkerCacheVersion}`} tone="neutral" />
            <StatChip
              label="Long-cache buckets"
              value={`${longCacheCount} of 4`}
              tone={longCacheCount === 4 ? "emerald" : "amber"}
            />
            <StatChip
              label="Game files ceiling"
              value={`${Math.round(settings.gameFilesMaxAge / 60)}m`}
              tone="neutral"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PHASES.map((phase) => {
          const card = (
            <div
              className={`glass flex h-full flex-col gap-3 rounded-2xl p-5 transition-colors ${
                phase.available ? "hover:bg-white/10" : "opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                    {phase.icon}
                  </span>
                  <h2 className="font-display text-base font-bold text-white">{phase.title}</h2>
                </div>
                {phase.available ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-400">
                    <CircleCheck size={12} /> Available
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold text-text-faint">
                    <CircleDashed size={12} /> Planned
                  </span>
                )}
              </div>
              <p className="text-sm text-text-faint">{phase.description}</p>
              <ul className="mt-auto flex flex-wrap gap-1.5">
                {phase.bullets.map((b) => (
                  <li key={b} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/70">
                    {b}
                  </li>
                ))}
              </ul>
              {phase.available && (
                <span className="flex items-center gap-1 text-xs font-bold text-[var(--color-menu-yellow)]">
                  Configure <ArrowRight size={13} />
                </span>
              )}
            </div>
          );

          return phase.href ? (
            <Link key={phase.key} href={phase.href}>
              {card}
            </Link>
          ) : (
            <div key={phase.key}>{card}</div>
          );
        })}
      </div>

      <div className="glass mt-4 flex items-center justify-between gap-4 rounded-2xl p-5">
        <div>
          <h2 className="text-sm font-bold text-white">Related: scheduled purges</h2>
          <p className="mt-0.5 text-xs text-text-faint">
            "Auto Cache Purge" and "Auto CDN Cache Purge" already run on a schedule under Admin → Automation → Infra —
            this section controls what gets cached, that one controls when it gets cleared.
          </p>
        </div>
        <Link
          href="/admin/automation"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/15"
        >
          Open Automation <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
