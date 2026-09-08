"use client";

import { getYoutubeVideoId, getYoutubeEmbedUrl } from "@/lib/youtube";

/**
 * Renders a muted, looped, auto-playing YouTube video as a full-bleed
 * background iframe inside any relatively-positioned container.
 *
 * Where to paste the URL:
 *   Admin -> Edit Game -> "Video Trailer" field  (videoTrailerUrl)
 *
 * Accepts any standard YouTube URL (watch, youtu.be, shorts, embed).
 * Returns null silently when no URL is given or it is not a YouTube link.
 * The parent container's background gradient acts as the visual fallback.
 *
 * Sizing strategy:
 *   aspect-video (16:9) + min-h-full + min-w-full forces "cover" behaviour:
 *   - Tall containers (4:3 mobile hero): height fills, width overflows -> sides clip
 *   - Wide containers (16:9 desktop):   width fills, height overflows -> top/bottom clip
 */
export function YouTubeBackground({ url }: { url?: string | null }) {
  if (!url) return null;

  const videoId = getYoutubeVideoId(url);
  if (!videoId) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <iframe
        src={getYoutubeEmbedUrl(videoId, "loop")}
        allow="autoplay; encrypted-media"
        className="absolute left-1/2 top-1/2 aspect-video -translate-x-1/2 -translate-y-1/2 min-h-full min-w-full"
        style={{ border: 0 }}
        title=""
      />
    </div>
  );
}
