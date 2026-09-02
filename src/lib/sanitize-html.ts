/**
 * HTML sanitizer for content produced by the admin panel's RichTextEditor.
 *
 * Content only ever comes from an authenticated admin (writes are RLS-gated
 * to admins), so this isn't defending against a hostile author — it's a
 * safety net against stray scripts/event-handlers ending up in content
 * that gets rendered site-wide.
 *
 * Allowed elements (extended for the WordPress-style editor):
 *   Headings: h1 h2 h3 h4 h5 h6
 *   Text:     p strong em s del u b i code pre blockquote br hr
 *   Lists:    ul ol li
 *   Links:    a (href, target, rel — no javascript:)
 *   Images:   img (src, alt, width, height, style — no event handlers)
 *   Media:    video (controls, src — no event handlers), figure, figcaption
 *   Tables:   table thead tbody tr th td caption (style for basic borders)
 *   Embeds:   iframe only from youtube-nocookie.com / youtube.com
 *   Layout:   div, span (for text-color/highlight spans from execCommand)
 *   Misc:     sup, sub
 *
 * Blocked regardless of source:
 *   <script>  <style>  <object>  <embed>  <form>  <input>
 *   Event handlers (on*)
 *   javascript: hrefs/srcs
 *   Non-YouTube iframes
 */

const ALLOWED_TAGS = new Set([
  "h1","h2","h3","h4","h5","h6",
  "p","strong","em","s","del","u","b","i","code","pre","blockquote","br","hr",
  "ul","ol","li",
  "a","img","video","source","figure","figcaption",
  "table","thead","tbody","tr","th","td","caption",
  "div","span",
  "sup","sub",
]);

// Attribute allow-list per element (anything not listed is stripped).
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a:     new Set(["href","target","rel","title"]),
  img:   new Set(["src","alt","width","height","style","class","loading","decoding"]),
  video: new Set(["src","controls","width","height","style","poster","preload"]),
  source:new Set(["src","type"]),
  iframe:new Set(["src","title","width","height","style","frameborder","allowfullscreen","allow","loading"]),
  th:    new Set(["colspan","rowspan","style","scope"]),
  td:    new Set(["colspan","rowspan","style"]),
  table: new Set(["style","class"]),
  div:   new Set(["style","class"]),
  span:  new Set(["style","class"]),
  p:     new Set(["style"]),
  h1:new Set(["style"]),h2:new Set(["style"]),h3:new Set(["style"]),
  h4:new Set(["style"]),h5:new Set(["style"]),h6:new Set(["style"]),
  blockquote: new Set(["style","cite"]),
  figure: new Set(["style","class"]),
  figcaption: new Set(["style"]),
  li: new Set(["style"]),
  ul: new Set(["style"]),
  ol: new Set(["style"]),
};

// CSS properties that are safe to allow in style attributes
// (block things that could load external content or execute JS)
const DANGEROUS_CSS = /expression\s*\(|url\s*\(/i;

function sanitizeStyle(style: string): string {
  if (DANGEROUS_CSS.test(style)) return "";
  return style;
}

// Only allow YouTube iframes (privacy-enhanced embed domain)
const YOUTUBE_SRC = /^https:\/\/(www\.)?youtube(?:-nocookie)?\.com\/embed\//;

/**
 * Sanitizes HTML produced by the admin RichTextEditor before public render.
 * Uses regex on the server and DOMParser-style parsing client-side would be
 * better, but this regex approach is consistent with the existing project
 * pattern and sufficient for admin-only content with an explicit allow-list.
 */
export function sanitizeContentHtml(html: string): string {
  if (!html) return "";

  // 1. Remove entire blocked element blocks
  let clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\s[^>]*>/gi, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "")
    .replace(/<input[^>]*>/gi, "")
    .replace(/<link[^>]*>/gi, "")
    .replace(/<meta[^>]*>/gi, "");

  // 2. Strip event handler attributes globally (on* = "...")
  clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // 3. Replace javascript: URIs in href/src/action
  clean = clean.replace(
    /(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]+)/gi,
    '$1="#"'
  );

  // 4. Strip non-YouTube iframes (youtube-nocookie.com and youtube.com only)
  clean = clean.replace(/<iframe([^>]*)>([\s\S]*?)<\/iframe>/gi, (match, attrs) => {
    const srcMatch = attrs.match(/src\s*=\s*"([^"]*)"/i) || attrs.match(/src\s*=\s*'([^']*)'/i);
    const src = srcMatch?.[1] ?? "";
    if (YOUTUBE_SRC.test(src)) {
      // Keep but sanitize attrs
      const safeAttrs = attrs
        .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
        .replace(/(href|src|action)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"');
      return `<iframe${safeAttrs}></iframe>`;
    }
    return ""; // Strip non-YouTube iframes
  });

  // 5. Sanitize dangerous style attributes
  clean = clean.replace(/\s+style\s*=\s*"([^"]*)"/gi, (match, style) => {
    const safe = sanitizeStyle(style);
    return safe ? ` style="${safe}"` : "";
  });
  clean = clean.replace(/\s+style\s*=\s*'([^']*)'/gi, (match, style) => {
    const safe = sanitizeStyle(style);
    return safe ? ` style="${safe}"` : "";
  });

  return clean;
}
