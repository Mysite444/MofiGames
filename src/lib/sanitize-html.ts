/** Minimal sanitizer for HTML produced by the admin panel's RichTextEditor.
 * Content only ever comes from an authenticated admin (writes are RLS-
 * gated to admins), so this isn't defending against a hostile author —
 * it's a cheap safety net against stray script tags or event-handler
 * attributes ending up in content that gets rendered site-wide. Not a
 * substitute for a real sanitizer (e.g. DOMPurify) if this app ever
 * accepts content from untrusted authors. */
export function sanitizeContentHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("javascript:[^"]*"|'javascript:[^']*')/gi, '$1="#"');
}
