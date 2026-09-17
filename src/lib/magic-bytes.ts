import "server-only";
/**
 * Magic-byte (file signature) detection.
 *
 * L-1 fix (2026-09 security audit): Vercel Blob's `allowedContentTypes`
 * enforcement trusts the client-declared Content-Type header.  A malicious
 * (compromised) admin could declare "image/jpeg" while uploading a file that
 * is actually a PHP polyglot or an HTML file.  Reading the actual file bytes
 * on the server closes that gap.
 *
 * Scope:  image / thumbnail / icon / gif / video categories only.
 *         "game-files" is intentionally excluded — a game build is a mix of
 *         html/js/wasm/fonts and has no meaningful magic-byte fingerprint.
 *
 * How it is used:
 *   POST /api/admin/blob/verify receives a just-uploaded blob URL, fetches
 *   its first 16 bytes via Range request, calls detectMagicMimeType() here,
 *   checks the result against the expected group, and calls del() on Vercel
 *   Blob if the file is invalid.
 */

// ---------------------------------------------------------------------------
// Signature table.  Offset is the byte offset at which the pattern starts.
// ---------------------------------------------------------------------------

interface Signature {
  mimeType: string;
  offset: number;
  pattern: number[];      // -1 = wildcard (any byte)
  /** Extra bytes to check at a different offset (e.g. WebP's "WEBP" at +8) */
  extraCheck?: { offset: number; ascii: string };
}

const SIGNATURES: Signature[] = [
  // JPEG:  FF D8 FF
  { mimeType: "image/jpeg",    offset: 0, pattern: [0xFF, 0xD8, 0xFF] },
  // PNG:   89 50 4E 47 0D 0A 1A 0A
  { mimeType: "image/png",     offset: 0, pattern: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  // WebP:  RIFF????WEBP (4-byte size field is wildcard)
  { mimeType: "image/webp",    offset: 0, pattern: [0x52, 0x49, 0x46, 0x46],
    extraCheck: { offset: 8, ascii: "WEBP" } },
  // GIF87a / GIF89a:  GIF8
  { mimeType: "image/gif",     offset: 0, pattern: [0x47, 0x49, 0x46, 0x38] },
  // ICO:   00 00 01 00
  { mimeType: "image/x-icon", offset: 0, pattern: [0x00, 0x00, 0x01, 0x00] },
  // MP4 / MOV (ISO base media):  ????ftyp at offset 4
  { mimeType: "video/mp4",     offset: 4, pattern: [0x66, 0x74, 0x79, 0x70] },
  // WebM:  1A 45 DF A3
  { mimeType: "video/webm",    offset: 0, pattern: [0x1A, 0x45, 0xDF, 0xA3] },
];

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Returns the detected MIME type from file magic bytes, or null if unknown.
 * SVG is text-based (no magic bytes in the traditional sense); it is detected
 * by scanning the first 64 bytes for the <?xml or <svg prefix.
 */
export function detectMagicMimeType(buf: Buffer): string | null {
  for (const sig of SIGNATURES) {
    const slice = buf.subarray(sig.offset, sig.offset + sig.pattern.length);
    if (slice.length < sig.pattern.length) continue;

    const matches = sig.pattern.every((b, i) => b === -1 || slice[i] === b);
    if (!matches) continue;

    if (sig.extraCheck) {
      const extra = buf.subarray(sig.extraCheck.offset, sig.extraCheck.offset + sig.extraCheck.ascii.length);
      if (extra.toString("ascii") !== sig.extraCheck.ascii) continue;
    }

    return sig.mimeType;
  }

  // SVG: text-based — look for <?xml or <svg in the first 64 bytes.
  const prefix = buf.subarray(0, 64).toString("utf8").trimStart().toLowerCase();
  if (prefix.startsWith("<?xml") || prefix.startsWith("<svg")) {
    return "image/svg+xml";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Groups — which MIME types are expected for each upload category.
// ---------------------------------------------------------------------------

export type MagicByteGroup = "image" | "video-or-image" | "icon" | "gif" | "skip";

const MIME_GROUPS: Record<Exclude<MagicByteGroup, "skip">, Set<string>> = {
  // General image: PNG, JPEG, WebP (SVG removed from image category by LOW-01)
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  // Game-media bucket: images + video
  "video-or-image": new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]),
  // Icon: SVG, PNG, WebP, ICO
  icon: new Set(["image/svg+xml", "image/png", "image/webp", "image/x-icon"]),
  // GIF-only category
  gif: new Set(["image/gif"]),
};

/**
 * Returns true when the buffer's magic bytes match one of the expected MIME
 * types for the given group, or when the group is "skip" (game-files etc.).
 */
export function isMagicBytesValid(buf: Buffer, group: MagicByteGroup): boolean {
  if (group === "skip") return true;
  const detected = detectMagicMimeType(buf);
  if (!detected) return false;
  return MIME_GROUPS[group]?.has(detected) ?? false;
}

/**
 * Maps a blob bucket name or media-library category to a MagicByteGroup.
 * Returns "skip" for buckets / categories that should not be validated
 * (game-files, document, font, audio).
 */
export function groupForBucket(bucket: string, category?: string): MagicByteGroup {
  if (bucket === "game-files") return "skip";

  if (bucket === "game-media")   return "video-or-image";
  if (bucket === "game-thumbnails") return "image";
  if (bucket === "content-images")  return "image";

  // media-library — depends on category
  if (bucket === "media-library") {
    switch (category) {
      case "image":     return "image";
      case "thumbnail": return "image";
      case "gif":       return "gif";
      case "icon":      return "icon";
      case "video":     return "video-or-image";
      default:          return "skip"; // audio, document, font — no magic check
    }
  }

  return "skip";
}
