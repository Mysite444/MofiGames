import "server-only";
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
 * This version uses isomorphic-dompurify (backed by jsdom on the server,
 * the native DOM in the browser) with the same allow-lists as before, so
 * no product behaviour changes — only the parsing engine does.
 *
 * The "server-only" import above prevents this module from being bundled
 * into any client component — isomorphic-dompurify's jsdom dependency is
 * server-only weight and should never reach the browser bundle.
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

import DOMPurify from "isomorphic-dompurify";

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
// DOMPurify hooks — registered once at module initialisation time.
// isomorphic-dompurify exposes a singleton, so hooks persist across calls.
// ---------------------------------------------------------------------------

// Hook 1: Per-element attribute restrictions + iframe YouTube enforcement.
DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
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
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName === "IFRAME" && !node.getAttribute("src")) {
    node.parentNode?.removeChild(node);
  }
});

// ---------------------------------------------------------------------------
// Public API — drop-in replacement for the old regex-based version.
// ---------------------------------------------------------------------------

export function sanitizeContentHtml(html: string): string {
  if (!html) return "";

  return DOMPurify.sanitize(html, {
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
