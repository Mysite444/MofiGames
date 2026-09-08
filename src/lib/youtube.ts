/**
 * YouTube helpers — shared by HoverPreviewVideo and TrailerPlayer.
 *
 * getYoutubeVideoId      — extract the 11-char ID from any YouTube URL
 * getYoutubeEmbedUrl     — build an embed URL for a given mode
 * getYoutubeThumbnailUrl — YouTube CDN thumbnail, no API key needed
 */

/**
 * Extracts the 11-character YouTube video ID from any recognised URL format.
 * Returns null when the URL is empty, undefined, or not a YouTube link.
 *
 * Supports:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/embed/VIDEO_ID
 *   https://www.youtube.com/shorts/VIDEO_ID
 *   https://m.youtube.com/watch?v=VIDEO_ID
 */
export function getYoutubeVideoId(url?: string | null): string | null {
  if (!url?.trim()) return null;
  const patterns: RegExp[] = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/(?:embed|v|shorts)\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

/**
 * Build a YouTube embed URL for a given purpose:
 *
 *   "watch"  — standard player with controls and sound.
 *              Used by TrailerPlayer (user clicks play themselves).
 *
 *   "loop"   — chromeless, muted, autoplaying, looping clip.
 *              Used by HoverPreviewVideo — homepage card hover-preview,
 *              the desktop game-post frame, and the mobile game-page
 *              hero background.
 */
export function getYoutubeEmbedUrl(videoId: string, mode: "watch" | "loop"): string {
  if (mode === "watch") {
    const params = new URLSearchParams({
      autoplay: "1",
      rel: "0",
      modestbranding: "1",
    });
    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  }

  // "loop" — muted background / hover-preview
  const params = new URLSearchParams({
    autoplay:       "1",
    mute:           "1",
    loop:           "1",
    playlist:       videoId,   // required for loop to work
    controls:       "0",
    showinfo:       "0",
    rel:            "0",
    iv_load_policy: "3",
    modestbranding: "1",
    playsinline:    "1",
    disablekb:      "1",
    fs:             "0",
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

/**
 * YouTube CDN thumbnail — no API key needed, always available.
 * hqdefault = 480x360. maxresdefault (1280x720) is not guaranteed to exist.
 */
export function getYoutubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}
