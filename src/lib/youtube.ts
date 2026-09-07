/**
 * Shared YouTube URL helpers.
 *
 * A native <video> element can only play a direct media file — it cannot
 * load a youtube.com/youtu.be *page* URL, because YouTube doesn't expose a
 * raw file at that address; playback requires YouTube's iframe embed
 * player. Every place in this codebase that accepts a "preview video" or
 * "trailer" URL (game cards, the mobile hero, the game page trailer) needs
 * to tell the two apart and branch to an <iframe> instead of a <video> when
 * the URL is a YouTube link. This file is the single place that parsing
 * lives, so it isn't reimplemented (and re-drifted) in five components.
 */

/**
 * Extracts the 11-character video ID from any common YouTube URL shape, or
 * returns null if `url` isn't a YouTube link (e.g. it's a direct .mp4).
 *
 * Handles:
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/embed/ID
 *   https://www.youtube.com/shorts/ID
 *   https://m.youtube.com/watch?v=ID
 * — with or without "www.", extra query params (&t=, &list=…), or a
 * scheme.
 */
export function getYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    // Falls back to a dummy base so scheme-less input ("youtu.be/xyz")
    // still parses instead of throwing.
    parsed = new URL(url.trim(), "https://placeholder.invalid");
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const isYoutubeHost = host === "youtube.com" || host === "youtube-nocookie.com" || host === "youtu.be";
  if (!isYoutubeHost) return null;

  let id: string | null = null;
  if (host === "youtu.be") {
    id = parsed.pathname.slice(1).split("/")[0] || null;
  } else if (parsed.pathname.startsWith("/watch")) {
    id = parsed.searchParams.get("v");
  } else if (parsed.pathname.startsWith("/embed/")) {
    id = parsed.pathname.split("/embed/")[1]?.split("/")[0] || null;
  } else if (parsed.pathname.startsWith("/shorts/")) {
    id = parsed.pathname.split("/shorts/")[1]?.split("/")[0] || null;
  }

  if (!id) return null;
  // Real YouTube IDs are always exactly 11 URL-safe characters — guards
  // against accidentally treating a malformed/garbage path as an ID.
  return /^[\w-]{11}$/.test(id) ? id : null;
}

export function isYoutubeUrl(url: string | null | undefined): boolean {
  return getYoutubeVideoId(url) !== null;
}

/** Static JPEG thumbnail, no API key required — used as the trailer's
 *  click-to-play poster so the heavy YouTube iframe only loads on demand. */
export function getYoutubeThumbnailUrl(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
}

/**
 * Builds a privacy-enhanced (youtube-nocookie.com) embed URL.
 *   mode "loop"  — muted, looping, chromeless — silent hover/hero previews.
 *   mode "watch" — controls on, unmuted, single play — deliberate trailer viewing.
 */
export function getYoutubeEmbedUrl(id: string, mode: "loop" | "watch"): string {
  const params = new URLSearchParams({
    autoplay: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
  });
  if (mode === "loop") {
    params.set("mute", "1");
    params.set("loop", "1");
    params.set("controls", "0");
    params.set("disablekb", "1");
    // YouTube only honors loop=1 on a single (non-playlist) video when
    // `playlist` is set to that same video's ID — an API quirk, not a typo.
    params.set("playlist", id);
  } else {
    params.set("mute", "0");
  }
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}
