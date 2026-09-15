import type { NextConfig } from "next";
import { CACHE_CONTROL } from "./src/lib/cache-config";

// Content-Security-Policy is deliberately permissive on frame-src,
// img-src, and media-src: this site's core feature is embedding
// third-party game builds in an <iframe> (see PlayFrame.tsx) whose
// origins aren't known ahead of time, so those directives can't be
// locked to an allowlist without breaking gameplay. What IS locked
// down: no other site can frame *us* (frame-ancestors), no plugins
// (object-src), no injecting a <base> tag to hijack relative URLs
// (base-uri), and our own forms can only submit to ourselves
// (form-action). script-src/style-src allow 'unsafe-inline' rather than
// a nonce, because a nonce-based CSP requires every page to render
// dynamically (no static generation/ISR), which would be a poor trade
// for a mostly-static content site — see
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md
// for the stricter nonce-based alternative if that trade ever changes.
//
// 'unsafe-eval' is added to script-src ONLY in development. Next's dev
// server (Turbopack) evaluates client chunks via eval() for HMR/Fast
// Refresh and React's dev-mode debugging helpers — with a CSP that omits
// 'unsafe-eval', the browser silently throws "eval() is not supported in
// this environment" for every one of those chunks. That's not just a
// benign console warning: it can abort execution partway through a chunk,
// which is why interactivity (e.g. the mobile menu) can end up flaky/
// dead in a plain tab yet "start working" once DevTools is open and
// timing/caching shifts enough for the chunk to finish. Production never
// gets 'unsafe-eval' — a real build doesn't use eval() and this keeps the
// CSP strict where it matters.
//
// frame-src: https: only (http: removed). Game iframes that only serve
// over plain HTTP are a mixed-content risk — the browser blocks them on
// an HTTPS page in modern agents anyway, and allowing http: in the CSP
// only suppresses the console warning without fixing the underlying
// problem. Operators should migrate game hosts to HTTPS; until then,
// add specific origins to an explicit allowlist here rather than opening
// http: globally (e.g. frame-src https: http://legacy-host.example.com;).
//
// upgrade-insecure-requests: instructs the browser to silently rewrite
// any remaining http: sub-resource requests (images, scripts, XHR) to
// https: before sending. Belt-and-suspenders for legacy asset URLs; has
// no effect on requests that are already https:.
const isDev = process.env.NODE_ENV !== "production";

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval'" : ""} https://www.googletagmanager.com https://www.clarity.ms;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https:;
  media-src 'self' https:;
  font-src 'self' data:;
  connect-src 'self' https: wss:${isDev ? " ws:" : ""};
  frame-src https:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'self';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, " ")
  .trim();

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspHeader },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Deliberately NOT setting Cross-Origin-Embedder-Policy: require-corp
  // would break every cross-origin game iframe whose host doesn't send
  // a matching CORP/CORS header — which is most of them, since we don't
  // control those servers.
  { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
];

const nextConfig: NextConfig = {
  // Removes the "X-Powered-By: Next.js" response header. It's not a
  // vulnerability by itself, but there's no upside to telling every
  // visitor (and every scanner) which framework and, indirectly, which
  // version fingerprint to go looking for known CVEs against.
  poweredByHeader: false,
  // Complete Site Migration (Admin → Backup & Migration) reads the
  // project's own source files from disk at runtime (to zip them into
  // the downloadable migration package) rather than `import`ing them.
  // Next's automatic serverless file-tracing only bundles files it can
  // see in the actual module dependency graph — a plain `fs.readFile`
  // call on an untraced path works locally (the whole repo is on disk)
  // but silently 404s in a deployed serverless function, since only
  // traced files ship with it. This explicitly tells the trace to
  // include everything that route needs to read. See
  // node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md
  // and src/lib/backup/migration-export.ts.
  outputFileTracingIncludes: {
    "/api/admin/backup/migration/export": [
      "./src/**/*",
      "./public/**/*",
      "./scripts/**/*",
      "./supabase/migrations/**/*",
      "./package.json",
      "./package-lock.json",
      "./next.config.ts",
      "./tsconfig.json",
      "./postcss.config.mjs",
      "./eslint.config.mjs",
      "./next-env.d.ts",
      "./vercel.json",
      "./.env.example",
      "./README.md",
      "./AGENTS.md",
      "./CLAUDE.md",
      "./ADVANCED_SEO_README.md",
      "./AUTOMATION_SETUP.md",
      "./RESILIENCE.md",
      "./SECURITY_HANDOFF.md",
    ],
    // Only needs to read migration *filenames* (to report the current
    // database schema version for comparison against an uploaded
    // package) — not the full source tree like the export route above.
    "/api/admin/backup/migration/validate": ["./supabase/migrations/**/*"],
  },
  // Permanent redirects for the old prefixed URL patterns.
  // /game/{slug}     → /{slug}
  // /category/{slug} → /{slug}
  // /tag/{slug}      → /{slug}
  //
  // These were the previous internal URL structure. All internal links
  // have been updated to the new root-level format, but external links,
  // bookmarks, and previously-indexed pages still use the old paths.
  // A 301 preserves link equity and avoids 404s for anything already crawled.
  async redirects() {
    return [
      { source: "/game/:slug", destination: "/:slug", permanent: true },
      { source: "/category/:slug", destination: "/:slug", permanent: true },
      { source: "/tag/:slug", destination: "/:slug", permanent: true },
    ];
  },
  async headers() {
    return [
      // Security headers on every response.
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // Prevent crawlers from indexing admin pages or API responses.
      // Belt-and-suspenders alongside robots.txt: robots.txt is a
      // convention that well-behaved bots honour; X-Robots-Tag is enforced
      // by Google and Bing even when the URL was discovered via a link and
      // not a crawl, so it covers cases robots.txt can't.
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          // Ensure admin UI pages are never stored in a shared/CDN cache.
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          // API responses must never be served from a shared cache — they
          // contain user-specific or sensitive data.  Individual routes can
          // opt back in with an explicit Cache-Control if they serve public
          // read-only data (e.g. public game listings), but the default
          // must be private/no-store.
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
        ],
      },
      // ----------------------------------------------------------------
      // Public fragment endpoints — override the blanket /api/** no-store
      // rule for the specific routes that are verified-safe for CDN/browser
      // caching. These routes are:
      //   - non-personalized (identical for every visitor)
      //   - backed by the server-side Fragment Cache (in-process TTL)
      //   - not carrying any session/user data
      //
      // /api/fragments/navigation is fetched client-side on EVERY page
      // load site-wide (NavList.tsx). Without a Cache-Control, that's one
      // live Vercel Function hit per page view. With a short public TTL,
      // the CDN serves repeat requests from edge cache instead. 30s is
      // short enough that an admin changing a nav link is visible within
      // 30s; stale-while-revalidate gives the CDN grace to serve the
      // cached version while revalidating in the background.
      // ----------------------------------------------------------------
      {
        source: "/api/fragments/navigation",
        headers: [
          {
            key: "Cache-Control",
            value: CACHE_CONTROL.NAV_FRAGMENT,
          },
        ],
      },

      // ----------------------------------------------------------------
      // BROWSER-IMMUTABLE ASSET CACHING
      // These rules target files that either (a) are content-addressed
      // (hashed filename = content fingerprint) or (b) are semantically
      // versioned and cannot change without a URL change.  Long max-age +
      // immutable means: browser never revalidates these; CDN caches them
      // for the same period.  Result: zero bytes transferred on reload for
      // any resource the browser has seen before.
      // ----------------------------------------------------------------

      // Next.js build output — content-hashed filenames, truly immutable.
      // Next.js sets this itself; this rule is belt-and-suspenders in case
      // a proxy upstream ever strips it.
      {
        source: "/_next/static/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },

      // Fonts served from /public/fonts/ or any subpath.
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },

      // Web fonts served from /public directly (woff2 — most common).
      {
        source: "/(.*\.woff2)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/(.*\.woff)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/(.*\.ttf)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/(.*\.otf)",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },

      // Static images in /public — long-lived but not immutable (no hash).
      {
        source: "/(.*\.png)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/(.*\.jpg)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/(.*\.jpeg)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/(.*\.gif)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/(.*\.webp)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/(.*\.avif)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/(.*\.svg)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/(.*\.ico)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },

      // Media files.
      {
        source: "/(.*\.mp4)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
      {
        source: "/(.*\.webm)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },

      // Web app manifest.
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=3600" },
        ],
      },

      // robots.txt and sitemaps.
      {
        source: "/robots.txt",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/sitemap.xml",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
      {
        source: "/sitemap-(.*\.xml)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },

      // Service worker — MUST be no-cache so browsers always check for
      // an updated worker file.
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
