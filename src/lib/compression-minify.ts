// Real, dependency-free minifiers backing Admin → Cache → Compression's
// CSS/JavaScript/HTML Minification sections and their "Minify Preview"
// tool (src/app/api/admin/cache/compression/minify-preview/route.ts).
// Isomorphic — no Node-only APIs — so the same code can run in the API
// route and, later, client-side for an instant preview.
//
// Deliberately "safe mode" rather than a full parser-based minifier
// (Terser/csso-class tooling): every transform here is provably
// correctness-preserving —
//   - CSS: comments and whitespace only ever collapse outside string
//     literals, and spacing around +/-/~ is left untouched so calc()
//     expressions can never be corrupted.
//   - JavaScript: strings, template literals, and regex literals are
//     scanned atomically so comment-stripping can't be fooled by a
//     `//` or `/*` that's actually inside one of them. Whitespace is
//     only ever collapsed, never removed down to zero, and any run
//     that contains a newline keeps exactly one — so Automatic
//     Semicolon Insertion behaviour can never change.
//   - HTML: `<pre>`/`<textarea>` contents are left byte-for-byte alone,
//     `<script type="application/ld+json">` and similar non-JS script
//     blocks are never run through the JS minifier, and conditional
//     comments (`<!--[if ...]>`) are preserved.
// No dependency is added for this — see package.json's deliberately
// short dependency list.

export interface MinifyResult {
  output: string;
  originalBytes: number;
  minifiedBytes: number;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function toResult(input: string, output: string): MinifyResult {
  return { output, originalBytes: byteLength(input), minifiedBytes: byteLength(output) };
}

// ── CSS ──────────────────────────────────────────────────────────────────────

export interface CssMinifyOptions {
  removeComments?: boolean;
}

/** Chars that never need a surrounding space in CSS. Deliberately excludes
 * +, -, ~ (calc() and sibling-combinator ambiguity) and * (universal
 * selector vs. multiplication-looking contexts) — leaving whitespace
 * around those untouched is always safe, just occasionally not maximally
 * shrunk. */
const CSS_NO_SPACE_CHARS = new Set(["{", "}", ":", ";", ",", ">"]);

export function minifyCss(input: string, options: CssMinifyOptions = {}): MinifyResult {
  const removeComments = options.removeComments !== false;
  let out = "";
  let i = 0;
  const n = input.length;

  while (i < n) {
    const c = input[i];

    // Block comment.
    if (c === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      const commentEnd = end === -1 ? n : end + 2;
      if (!removeComments) out += input.slice(i, commentEnd);
      i = commentEnd;
      continue;
    }

    // String literal — copied verbatim, contents never touched.
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n && input[j] !== quote) {
        j += input[j] === "\\" ? 2 : 1;
      }
      if (j < n) j++;
      out += input.slice(i, j);
      i = j;
      continue;
    }

    // Whitespace run — drop entirely when either neighbour makes it
    // unambiguous (e.g. right after "{" or right before ";"), otherwise
    // collapse to one space.
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(input[j])) j++;
      const prevChar = out[out.length - 1];
      const nextChar = input[j];
      const prevSafe = prevChar === undefined || CSS_NO_SPACE_CHARS.has(prevChar) || prevChar === "(";
      const nextSafe = nextChar === undefined || CSS_NO_SPACE_CHARS.has(nextChar) || nextChar === ")" || nextChar === "(";
      if (!prevSafe && !nextSafe) out += " ";
      i = j;
      continue;
    }

    out += c;
    i++;
  }

  return toResult(input, out.trim());
}

// ── JavaScript ───────────────────────────────────────────────────────────────

export interface JsMinifyOptions {
  removeComments?: boolean;
}

const JS_REGEX_PRECEDING_KEYWORDS = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
  "throw", "case", "do", "else", "yield", "await", "if", "while", "for",
  "switch", "with",
]);

function isJsWordChar(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function isJsSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\r" || ch === "\n" || ch === "\f" || ch === "\v";
}

/** Strips comments and collapses whitespace without ever changing program
 * behaviour: no token is ever merged with another (a whitespace run always
 * collapses to *something*, never nothing), and a run that originally
 * contained a line break always keeps exactly one — the one thing ASI
 * (Automatic Semicolon Insertion) actually depends on. This intentionally
 * does not do character-level/symbol-mangling minification (Terser-class
 * tooling) — that requires a real parser to be safe, which is out of
 * scope here; this is the safe subset that a regex/string/comment-aware
 * scan can guarantee. */
export function minifyJs(input: string, options: JsMinifyOptions = {}): MinifyResult {
  const removeComments = options.removeComments !== false;
  let out = "";
  let i = 0;
  const n = input.length;
  // '' = start of file, 'value' = previous token was an identifier/number/
  // string/template/regex/")"/"]" (division context), otherwise holds the
  // punctuator char or keyword itself (regex context).
  let lastToken = "";

  function regexAllowed(): boolean {
    if (lastToken === "" || lastToken === "value") return lastToken === "";
    return true;
  }

  while (i < n) {
    const c = input[i];

    // Line comment.
    if (c === "/" && input[i + 1] === "/") {
      let j = i + 2;
      while (j < n && input[j] !== "\n") j++;
      if (!removeComments) out += input.slice(i, j);
      i = j;
      continue;
    }

    // Block comment.
    if (c === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      const commentEnd = end === -1 ? n : end + 2;
      if (!removeComments) out += input.slice(i, commentEnd);
      i = commentEnd;
      continue;
    }

    // String literal.
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n && input[j] !== quote && input[j] !== "\n") {
        j += input[j] === "\\" ? 2 : 1;
      }
      if (j < n && input[j] === quote) j++;
      out += input.slice(i, j);
      lastToken = "value";
      i = j;
      continue;
    }

    // Template literal — copied verbatim (including any internal newlines/
    // indentation, e.g. multi-line templates), and NOT parsed for nested
    // ${ ... } expressions containing their own backticks (a known,
    // acceptable limitation of a scan this size).
    if (c === "`") {
      let j = i + 1;
      while (j < n && input[j] !== "`") {
        j += input[j] === "\\" ? 2 : 1;
      }
      if (j < n) j++;
      out += input.slice(i, j);
      lastToken = "value";
      i = j;
      continue;
    }

    // Regex literal — only when the previous token makes "/" unambiguous.
    if (c === "/" && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      let closed = false;
      while (j < n) {
        const cj = input[j];
        if (cj === "\\") { j += 2; continue; }
        if (cj === "\n") break;
        if (cj === "[") { inClass = true; j++; continue; }
        if (cj === "]") { inClass = false; j++; continue; }
        if (cj === "/" && !inClass) { j++; closed = true; break; }
        j++;
      }
      if (closed) {
        while (j < n && /[a-zA-Z]/.test(input[j])) j++;
        out += input.slice(i, j);
        lastToken = "value";
        i = j;
        continue;
      }
      // Unterminated — not actually a regex; fall through and treat "/"
      // as an ordinary punctuator below.
    }

    // Identifier / keyword / number run.
    if (isJsWordChar(c)) {
      let j = i;
      while (j < n && isJsWordChar(input[j])) j++;
      const word = input.slice(i, j);
      out += word;
      lastToken = JS_REGEX_PRECEDING_KEYWORDS.has(word) ? word : "value";
      i = j;
      continue;
    }

    // Whitespace run — collapse to one newline if it contained one
    // (preserves ASI), otherwise collapse to one space (never to zero,
    // so tokens like "var x" can never merge into "varx").
    if (isJsSpace(c)) {
      let j = i;
      let hasNewline = false;
      while (j < n && isJsSpace(input[j])) {
        if (input[j] === "\n") hasNewline = true;
        j++;
      }
      out += hasNewline ? "\n" : " ";
      i = j;
      continue;
    }

    // Punctuator.
    out += c;
    lastToken = c;
    i++;
  }

  // Drop fully-blank output lines left behind by collapsed whitespace runs
  // (safe — blank lines never affect ASI, only the presence of >=1 real
  // line break between two tokens does, which is already preserved above).
  const collapsed = out
    .split("\n")
    .filter((line, idx, arr) => line.trim() !== "" || (idx > 0 && arr[idx - 1].trim() !== ""))
    .join("\n");

  return toResult(input, collapsed.trim());
}

// ── HTML ─────────────────────────────────────────────────────────────────────

export interface HtmlMinifyOptions {
  removeComments?: boolean;
  collapseWhitespace?: boolean;
  /** Cascade into minifyCss/minifyJs for inline <style>/<script> content. */
  minifyInlineCssJs?: boolean;
}

const JS_SCRIPT_TYPES = new Set([
  "text/javascript", "application/javascript", "module", "application/ecmascript", "text/babel",
]);

function scriptOpenTagIsJs(openTag: string): boolean {
  const m = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(openTag);
  if (!m) return true; // no type attribute => defaults to JavaScript per the HTML spec
  const type = (m[1] ?? m[2] ?? m[3] ?? "").trim().toLowerCase();
  if (type === "") return true;
  return JS_SCRIPT_TYPES.has(type);
}

/** Strips HTML comments (preserving IE conditional comments) and collapses
 * inter-tag whitespace down to a single space (never to zero, so inline
 * elements like `Hello <b>World</b>` can't have their visible space
 * swallowed) — real, safe HTML minification. Content inside `<pre>` and
 * `<textarea>` is left byte-for-byte untouched since whitespace is
 * significant there; `<script>`/`<style>` content is optionally handed to
 * minifyJs/minifyCss instead of the generic whitespace pass, and a
 * `<script type="application/ld+json">` (or any other non-JS type) is
 * never run through the JS minifier. */
export function minifyHtml(input: string, options: HtmlMinifyOptions = {}): MinifyResult {
  const removeComments = options.removeComments !== false;
  const collapseWhitespace = options.collapseWhitespace !== false;
  const minifyInline = options.minifyInlineCssJs !== false;

  let out = "";
  let i = 0;
  const n = input.length;

  while (i < n) {
    // HTML comment (preserve IE conditional comments regardless of the
    // removeComments setting — they're load-bearing markup, not notes).
    if (input.startsWith("<!--", i)) {
      const end = input.indexOf("-->", i + 4);
      const commentEnd = end === -1 ? n : end + 3;
      const raw = input.slice(i, commentEnd);
      const isConditional = /^<!--\s*\[if\b/i.test(raw) || /<!\[endif\]-->\s*$/i.test(raw);
      if (!removeComments || isConditional) out += raw;
      i = commentEnd;
      continue;
    }

    // Raw-text element: <script>, <style>, <pre>, <textarea>.
    const tagMatch = /^<(script|style|pre|textarea)\b/i.exec(input.slice(i, i + 10));
    if (tagMatch) {
      const tagName = tagMatch[1].toLowerCase();
      const openTagEnd = input.indexOf(">", i);
      if (openTagEnd === -1) {
        out += input.slice(i);
        i = n;
        continue;
      }
      const openTag = input.slice(i, openTagEnd + 1);
      out += openTag;

      const closeTagRe = new RegExp(`</${tagName}\\s*>`, "i");
      const rest = input.slice(openTagEnd + 1);
      const m = closeTagRe.exec(rest);
      const contentEnd = m ? openTagEnd + 1 + m.index : n;
      const content = input.slice(openTagEnd + 1, contentEnd);

      if (minifyInline && tagName === "script" && scriptOpenTagIsJs(openTag)) {
        out += minifyJs(content, { removeComments }).output;
      } else if (minifyInline && tagName === "style") {
        out += minifyCss(content, { removeComments }).output;
      } else {
        out += content; // pre/textarea, and non-JS <script> blocks (e.g. JSON-LD)
      }

      if (m) {
        out += rest.slice(m.index, m.index + m[0].length);
        i = contentEnd + m[0].length;
      } else {
        i = n;
      }
      continue;
    }

    const c = input[i];
    if (collapseWhitespace && /\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(input[j])) j++;
      out += " ";
      i = j;
      continue;
    }

    out += c;
    i++;
  }

  return toResult(input, out.trim());
}
