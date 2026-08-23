"use client";

import { ExternalLink } from "lucide-react";

const SCHEMAS = [
  {
    type: "Organization",
    scope: "Every page (site-wide)",
    status: "Active",
    note: "Configured in SEO → Global Settings → Organization schema.",
  },
  {
    type: "WebSite",
    scope: "Every page (site-wide)",
    status: "Active",
    note: "Includes a SearchAction so Google can show a sitelinks search box.",
  },
  {
    type: "VideoGame",
    scope: "Game pages",
    status: "Active",
    note: "Toggle per-game in Admin → Games → edit a game → SEO → Structured data.",
  },
  {
    type: "SoftwareApplication",
    scope: "Game pages",
    status: "Active",
    note: "Toggle per-game in Admin → Games → edit a game → SEO → Structured data.",
  },
  {
    type: "Review / AggregateRating",
    scope: "Game pages (optional)",
    status: "Off by default",
    note: "Enable per-game once real reviews exist — avoid using it with only placeholder ratings.",
  },
  {
    type: "BreadcrumbList",
    scope: "Game, category, blog, tag pages",
    status: "Active",
    note: "Mirrors the visible breadcrumb trail on each page exactly — never customize one without the other.",
  },
  {
    type: "CollectionPage",
    scope: "Category pages",
    status: "Active",
    note: "Toggle per-category in Admin → Categories → edit a category → SEO.",
  },
  {
    type: "Article",
    scope: "Blog posts",
    status: "Active",
    note: "Generated automatically from each post's title, excerpt, author, and cover image.",
  },
] as const;

/** Admin → SEO Management → Structured Data. A read-only catalog of every
 * JSON-LD schema the site emits and where it's controlled — per-item
 * toggles live on the Games/Categories/Posts edit forms themselves (right
 * next to the content they describe), so this page is deliberately just
 * an index plus validator links rather than a duplicate control surface. */
export function SeoStructuredDataAdminClient() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">SEO — Structured Data</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          Every JSON-LD schema currently emitted across the site, and where to control it.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <a
          href="https://search.google.com/test/rich-results"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
        >
          Google Rich Results Test
          <ExternalLink size={12} />
        </a>
        <a
          href="https://validator.schema.org/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20"
        >
          Schema.org Validator
          <ExternalLink size={12} />
        </a>
      </div>

      <div className="glass divide-y divide-[var(--color-surface-border)] overflow-hidden rounded-2xl">
        {SCHEMAS.map((s) => (
          <div key={s.type} className="flex flex-col gap-1 px-5 py-4">
            <div className="flex items-center gap-2">
              <p className="font-display text-sm font-bold text-white">{s.type}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  s.status === "Active" ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/60"
                }`}
              >
                {s.status}
              </span>
            </div>
            <p className="text-xs text-text-faint">{s.scope}</p>
            <p className="text-xs text-text-muted">{s.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
