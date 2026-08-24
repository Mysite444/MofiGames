/**
 * Plain-text sanitization for user-generated content — comments, display
 * names, profile bios, game reviews. All of it, and the primary defense
 * against XSS: every one of those fields is rendered as a React text node
 * ({value}, never dangerouslySetInnerHTML), and JSX escapes text nodes
 * automatically. See src/lib/sanitize-html.ts for the *separate* concern
 * of admin-authored rich HTML (Pages/Blog), which is trusted-author
 * content that's allowed a safe subset of markup — nothing in this file
 * is meant to handle that case.
 *
 * This module exists as defense-in-depth on top of that, for two reasons:
 *  1. A payload that never makes it into the database can't leak out
 *     through some *other* surface later that isn't React-escaped — an
 *     admin table skimmed by a human, a future export/API field, an RSS
 *     item, an email digest, etc. — without every future consumer having
 *     to remember to escape it correctly itself.
 *  2. It keeps obviously-hostile input (raw <script> tags, event-handler
 *     attributes, control/zero-width characters used to obfuscate a
 *     payload or spoof text) out of the database entirely, rather than
 *     relying solely on every render site getting escaping right forever.
 *
 * Every write path for these fields runs input through here via a zod
 * `.transform()` in src/lib/validation.ts before it ever reaches Supabase.
 */

/** Strips HTML tags, neutralizes javascript: URIs, and removes control /
 * zero-width characters, while preserving intentional newlines — safe for
 * multi-line fields like comments, bios, and review text. */
export function sanitizePlainText(input: string): string {
  return (
    input
      // Strip a whole tag (open, close, or self-closing) rather than just
      // the angle brackets, so "<script>alert(1)</script>" doesn't decay
      // into the still-readable "alert(1)" — and a bare "<"/">" used in
      // ordinary prose (e.g. "5 < 10") is left alone.
      .replace(/<\/?[a-zA-Z!][^>]*>/g, "")
      // Neutralize javascript: URIs in case this text is ever used as a
      // link target somewhere downstream.
      .replace(/javascript:/gi, "")
      // Strip control characters (except \n and \t) and zero-width /
      // bidi-override characters sometimes used to obfuscate payloads or
      // spoof displayed text.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u2028\u2029\uFEFF]/g, "")
      // Collapse runs of horizontal whitespace (keeps intentional newlines
      // in multi-line fields intact) and trim the ends.
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** Same as sanitizePlainText, but also collapses newlines to spaces — for
 * single-line fields like display names, where a pasted multi-line string
 * should become one line rather than silently keep a hidden line break. */
export function sanitizeSingleLineText(input: string): string {
  return sanitizePlainText(input).replace(/\s+/g, " ").trim();
}
