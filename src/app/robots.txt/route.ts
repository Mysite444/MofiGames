import { getSeoSettings } from "@/lib/seo-settings";
import { SITE_URL } from "@/lib/seo";

// GET /robots.txt — Robots.txt Manager. Serves the admin override
// (Admin → SEO Management → Robots.txt) verbatim if one is set, otherwise
// a sensible generated default that blocks admin/api/auth routes and
// points crawlers at the sitemap index.
//
// robots.txt is a crawling convention, not a security control — crawlers
// that ignore it can still reach these paths.  The real protection is:
//   • /admin/*  → requireAdmin() on every route + middleware session check
//   • /api/*    → requireUser() / requireAdmin() on every route
//   • /_next/*  → no sensitive data; just Next.js build chunks
//   • .env      → not in public/ so Next.js never serves it
// We disallow them here so they don't appear in search indexes.
function defaultRobotsTxt(settings: { indexSearchPages: boolean }): string {
  const lines = [
    "User-agent: *",
    "Allow: /",

    // ── Auth / account ────────────────────────────────────────────────────
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /account/",
    "Disallow: /profile",

    // ── Admin panel ───────────────────────────────────────────────────────
    "Disallow: /admin/",

    // ── API routes ────────────────────────────────────────────────────────
    "Disallow: /api/",

    // ── Next.js build artifacts ───────────────────────────────────────────
    // /_next/static/ contains compiled JS chunks; no sensitive data, but
    // there's no value in crawlers indexing them and they inflate crawl budget.
    "Disallow: /_next/",

    // ── Common sensitive filename patterns ────────────────────────────────
    // These files are never in public/ so Next.js won't serve them.
    // Blocking them here prevents scanners from treating a 404 as "maybe
    // it exists somewhere else" and adding them to their wordlists.
    "Disallow: /.env",
    "Disallow: /.env.local",
    "Disallow: /.env.production",
    "Disallow: /.git/",
    "Disallow: /backup",
    "Disallow: /*.sql",
    "Disallow: /*.log",
    "Disallow: /*.bak",
    "Disallow: /*.key",
    "Disallow: /*.pem",

    ...(settings.indexSearchPages ? [] : ["Disallow: /search"]),

    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
  ];
  return lines.join("\n");
}

export async function GET() {
  const settings = await getSeoSettings();
  const body = settings.robotsTxtOverride?.trim() || defaultRobotsTxt(settings);

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
