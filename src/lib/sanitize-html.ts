/**
 * HTML sanitizer for content produced by the admin panel's RichTextEditor.
 *
 * M-2 fix (2026-09 security audit): the previous implementation used
 * sequential regex passes on the raw HTML string.  Regex-only HTML
 * sanitization is a documented anti-pattern (OWASP XSS Filter Evasion
 * Cheat Sheet) because it cannot correctly model nested or malformed
 * markup, and is susceptible to encoding-based bypasses — e.g. an
 * HTML-entity-broken `javascript:` scheme in an href that doesn't match a
 * literal-string regex but does get decoded by the browser's URL parser.
 *
 * This version uses isomorphic-dompurify which ships two builds:
 *   • dist/index.js   — Node.js server path, backed by jsdom
 *   • dist/browser.js — Browser path, backed by the native DOM API
 * The correct build is selected automatically via the package's "browser"
 * field in package.json, so no jsdom code ever reaches the client bundle.
 * This makes the module safe to import from both Server Components and
 * Client Components (GameDetailsSection is "use client").
 *
 * Allowed elements (unchanged from the original allow-list):
 *   Headings: h1 h2 h3 h4 h5 h6
 *   Text:     p strong em s del u b i code pre blockquote br hr
 *   Lists:    ul ol li
 *   Links:    a (href, target, rel, title — no javascript:)
 *   Images:   img (src, alt, width, height, style, class, loading, decoding)
 *   Media:    video (controls, src …), source, figure, figcaption
 *   Tables:   table thead tbody tr th td caption (style for basic borders)
 *   Embeds:   iframe only from youtube-nocookie.com / youtube.com
 *   Layout:   div, span (for text-color/highlight spans)
 *   Misc:     sup, sub
 *
 * Blocked regardless of source (enforced by DOMPurify + hooks below):
 *   <script>  <style>  <object>  <embed>  <form>  <input>
 *   Event handlers (on*)
 *   javascript: / data: hrefs and srcs
 *   Non-YouTube iframes
 *   CSS expression() / url() in style attributes
 */

import type DOMPurifyType from "isomorphic-dompurify";

type Purifier = typeof DOMPurifyType;

// ---------------------------------------------------------------------------
// Allow-lists — identical to the previous regex version so content already
// in the database renders identically after this change.
// ---------------------------------------------------------------------------

const ALLOWED_TAGS = [
  "h1","h2","h3","h4","h5","h6",
  "p","strong","em","s","del","u","b","i","code","pre","blockquote","br","hr",
  "ul","ol","li",
  "a","img","video","source","figure","figcaption",
  "table","thead","tbody","tr","th","td","caption",
  "iframe",
  "div","span",
  "sup","sub",
];

// Flat attribute allow-list — DOMPurify's ALLOWED_ATTR is global across tags.
// Per-element restrictions (e.g. only <a> gets href) are enforced via the
// uponSanitizeAttribute hook below.
const ALLOWED_ATTR = [
  "href","target","rel","title",
  "src","alt","width","height","style","class","loading","decoding",
  "controls","poster","preload","type",
  "frameborder","allowfullscreen","allow",
  "colspan","rowspan","scope",
  "cite",
];

// Attributes that are only valid on specific elements.  Any other element
// that tries to carry one of these has the attribute stripped.
const ATTR_ELEMENT_MAP: Record<string, Set<string>> = {
  href:        new Set(["a"]),
  target:      new Set(["a"]),
  rel:         new Set(["a"]),
  controls:    new Set(["video"]),
  poster:      new Set(["video"]),
  preload:     new Set(["video"]),
  frameborder: new Set(["iframe"]),
  allowfullscreen: new Set(["iframe"]),
  allow:       new Set(["iframe"]),
  scope:       new Set(["th"]),
  colspan:     new Set(["th","td"]),
  rowspan:     new Set(["th","td"]),
  cite:        new Set(["blockquote"]),
  type:        new Set(["source","video"]),
};

// Only these YouTube domains are permitted in iframe src attributes.
const YOUTUBE_SRC = /^https:\/\/(www\.)?youtube(?:-nocookie)?\.com\/embed\//;

// CSS property patterns that can load external content or execute JavaScript.
const DANGEROUS_CSS = /expression\s*\(|url\s*\(/i;

// ---------------------------------------------------------------------------
// Lazy, fail-closed loading of DOMPurify.
//
// WHY THIS IS NOT A TOP-LEVEL `import DOMPurify from "isomorphic-dompurify"`:
//   On the server isomorphic-dompurify is backed by jsdom, and jsdom 30
//   (pulled in by isomorphic-dompurify >= 4.x) needs Node ^22.22.2 / ^24.15 /
//   >=26. On an older runtime it does not merely misbehave — it THROWS WHILE
//   THE MODULE IS BEING LOADED:
//     Node 22.11 → ERR_REQUIRE_ESM (@exodus/bytes is ESM-only)
//     Node 20.x  → TypeError: webidl.util.markAsUncloneable is not a function
//   A throw at import time is not catchable by any React error boundary. For
//   a route that is statically generated (ISR), it fails the whole on-demand
//   render, and Next serves its built-in static "500: This page couldn't
//   load" page. Pages that were prerendered at build time keep working (they
//   never execute this code at request time), so the site looks healthy until
//   the first time an admin publishes a NEW game/page — which is the symptom
//   this fixes.
//
// BEHAVIOUR NOW:
//   • Runtime is fine  → identical output to before (same allow-lists/hooks).
//   • Runtime too old  → the failure is caught once, logged loudly, and
//     content is rendered as ESCAPED PLAIN TEXT (see toSafePlainText). It is
//     never emitted as raw HTML, so this fails CLOSED — the page still
//     renders, just without rich formatting, instead of returning a 500.
//
// `require` (not `import()`) is deliberate: sanitizeContentHtml() is
// synchronous and is called from components that are also bundled into the
// client (GameDetailsSection / MobileGamePage are "use client"), so it
// cannot become async.
// ---------------------------------------------------------------------------

// undefined = not attempted yet, null = attempted and unavailable.
let purifier: Purifier | null | undefined;

function registerHooks(purify: Purifier): void {
  // Hook 1: Per-element attribute restrictions + iframe YouTube enforcement.
  purify.addHook("uponSanitizeAttribute", (node, data) => {
    const tag = node.nodeName.toLowerCase();
    const attr = data.attrName;
    const val  = data.attrValue;

    // Enforce per-element allow-list.
    const allowedElements = ATTR_ELEMENT_MAP[attr];
    if (allowedElements && !allowedElements.has(tag)) {
      data.keepAttr = false;
      return;
    }

    // Strip javascript: / data: from src and href (DOMPurify already does
    // this for most cases, but belt-and-suspenders for entity-encoded variants
    // is exactly the point of switching from regex).
    if ((attr === "src" || attr === "href") && /^\s*(javascript|data):/i.test(val)) {
      data.keepAttr = false;
      return;
    }

    // Enforce YouTube-only iframe src.
    if (tag === "iframe" && attr === "src") {
      if (!YOUTUBE_SRC.test(val)) {
        data.keepAttr = false; // src stripped → the afterSanitizeAttributes hook removes the element
      }
      return;
    }

    // Strip CSS that loads external content or executes JS.
    if (attr === "style" && DANGEROUS_CSS.test(val)) {
      data.keepAttr = false;
    }
  });

  // Hook 2: Remove <iframe> elements that had their src stripped by hook 1.
  purify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName === "IFRAME" && !node.getAttribute("src")) {
      node.parentNode?.removeChild(node);
    }
  });
}

function loadPurifier(): Purifier | null {
  if (purifier !== undefined) return purifier;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("isomorphic-dompurify") as Purifier & { default?: Purifier };
    const instance = typeof mod.sanitize === "function" ? mod : mod.default;
    if (!instance || typeof instance.sanitize !== "function") {
      throw new Error("isomorphic-dompurify did not expose sanitize()");
    }
    registerHooks(instance);
    purifier = instance;
  } catch (err) {
    console.error(
      "[sanitize-html] isomorphic-dompurify could not be loaded on this runtime " +
        `(node ${typeof process !== "undefined" ? process.version : "unknown"}). ` +
        "Rich HTML content will be rendered as escaped plain text until the Node " +
        "version is upgraded (needs ^22.22.2 or ^24.15). Cause:",
      err
    );
    purifier = null;
  }
  return purifier;
}

/** Fail-closed fallback. Turns arbitrary HTML into paragraphs of ESCAPED
 * text. The tag-stripping regexes below are only for readability of the
 * result — safety does not depend on them: every "<", ">", "&", quote is
 * escaped afterwards, so the output can never contain a tag or an entity
 * that a browser would interpret as markup. */
function toSafePlainText(html: string): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr|table|ul|ol)\s*>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "");
  const escape = (t: string) =>
    t
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${escape(line)}</p>`)
    .join("");
}

// ---------------------------------------------------------------------------
// Public API — drop-in replacement for the old regex-based version.
// ---------------------------------------------------------------------------

export function sanitizeContentHtml(html: string): string {
  if (!html) return "";

  const purify = loadPurifier();
  if (!purify) return toSafePlainText(html);

  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // FORCE_BODY wraps the fragment in a <body> so DOMPurify sees a
    // complete document context; prevents certain parser-edge bypasses.
    FORCE_BODY: true,
    // Never allow data-* attributes — they can carry script payloads for
    // frameworks that hydrate from them (Alpine.js, Vue, etc.).
    ALLOW_DATA_ATTR: false,
    // Return a string, not a DOM node.
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
  });
}
