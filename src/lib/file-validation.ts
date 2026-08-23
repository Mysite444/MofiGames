import type { MediaCategory } from "./supabase/admin-content";

/** Allowed MIME types and a max size per Media Library category (Admin →
 * Media Library). Checked here client-side before the upload call so a
 * mistaken upload gets a clear error immediately, and again server-side
 * in /api/admin/blob/upload (the same table, see MEDIA_UPLOAD_RULES
 * usage there) via Vercel Blob's `allowedContentTypes`/
 * `maximumSizeInBytes` client-token constraints, which is the actual
 * enforcement point — a client check alone is only ever a UX nicety.
 * Uploads are admin-only already (requireAdmin() on that route), so the
 * risk this guards against is a mistaken upload more than a hostile one,
 * but it's cheap and worth having regardless. */
export const MEDIA_UPLOAD_RULES: Record<MediaCategory, { mimeTypes: string[]; maxBytes: number; label: string }> = {
  image: { mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"], maxBytes: 10 * 1024 * 1024, label: "PNG, JPEG, WebP, or SVG, up to 10MB" },
  thumbnail: { mimeTypes: ["image/png", "image/jpeg", "image/webp"], maxBytes: 5 * 1024 * 1024, label: "PNG, JPEG, or WebP, up to 5MB" },
  // Covers the full favicon/app-icon set (Admin → Site Settings → Site
  // Identity → favicon.ico, favicon-16x16.png, favicon-32x32.png,
  // apple-touch-icon.png, icon-192.png, icon-512.png, favicon.svg) as well
  // as the general Icons media-library category. .ico files show up with
  // either MIME type below depending on OS/browser, so both are allowed.
  icon: {
    mimeTypes: [
      "image/svg+xml",
      "image/png",
      "image/webp",
      "image/x-icon",
      "image/vnd.microsoft.icon",
    ],
    maxBytes: 2 * 1024 * 1024,
    label: "SVG, PNG, WebP, or ICO, up to 2MB",
  },
  video: { mimeTypes: ["video/mp4", "video/webm"], maxBytes: 100 * 1024 * 1024, label: "MP4 or WebM, up to 100MB" },
  gif: { mimeTypes: ["image/gif"], maxBytes: 20 * 1024 * 1024, label: "GIF, up to 20MB" },
};

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateMediaUpload(category: MediaCategory, file: File): FileValidationResult {
  const rule = MEDIA_UPLOAD_RULES[category];
  if (!rule) return { valid: true };

  if (!rule.mimeTypes.includes(file.type)) {
    return { valid: false, error: `That file type isn't allowed here. Expected: ${rule.label}.` };
  }
  if (file.size > rule.maxBytes) {
    return { valid: false, error: `File is too large. Maximum for this category: ${rule.label}.` };
  }
  if (file.size === 0) {
    return { valid: false, error: "That file is empty." };
  }
  return { valid: true };
}

/** Validates a rename in Admin → Media Management → Edit Media. `file_name`
 * is a display label decoupled from the randomized `storage_path` the file
 * actually lives at (see uploadMediaAsset), so a rename never touches
 * storage — this just guards the label itself from being empty, absurdly
 * long, or containing characters that would be confusing in a filename
 * (path separators in particular, since file_name is also used as the
 * suggested download name). */
export function validateMediaFileName(fileName: string): FileValidationResult {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return { valid: false, error: "Filename can't be empty." };
  }
  if (trimmed.length > 255) {
    return { valid: false, error: "Filename is too long (255 characters max)." };
  }
  if (/[/\\]/.test(trimmed)) {
    return { valid: false, error: "Filename can't contain \"/\" or \"\\\"." };
  }
  return { valid: true };
}
