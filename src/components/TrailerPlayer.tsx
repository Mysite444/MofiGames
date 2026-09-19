"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { getYoutubeVideoId, getYoutubeThumbnailUrl, getYoutubeEmbedUrl } from "@/lib/youtube";

/**
 * Renders a game's trailer from `videoTrailerUrl`. The admin field's own
 * sublabel says "YouTube / MP4 URL", so this handles both:
 *
 *  - YouTube link → a "lite embed": a static thumbnail (YouTube's own CDN,
 *    no API key) with a play button on top. The real iframe — YouTube's
 *    player is several hundred KB of JS — is only created once the person
 *    actually clicks, instead of loading on every single game-page visit
 *    whether or not anyone watches. Same facade pattern as the popular
 *    lite-youtube-embed library.
 *  - Direct .mp4/.webm → a plain <video controls>, since a trailer is
 *    watched deliberately (unlike the silent/muted hover-preview clip), so
 *    unlike HoverPreviewVideo it keeps native controls and sound.
 */
export function TrailerPlayer({ url, posterFallback }: { url: string; posterFallback?: string }) {
  const [playing, setPlaying] = useState(false);
  const youtubeId = getYoutubeVideoId(url);

  if (youtubeId) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
        {playing ? (
          <iframe
            src={getYoutubeEmbedUrl(youtubeId, "watch")}
            title="Game trailer"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            className="group absolute inset-0 flex h-full w-full items-center justify-center"
            aria-label="Play trailer"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getYoutubeThumbnailUrl(youtubeId)}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/40" aria-hidden />
            <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-110">
              <Play size={26} className="ml-1 fill-black text-black" strokeWidth={0} />
            </span>
          </button>
        )}
      </div>
    );
  }

  // Not a YouTube link — treat it as a direct file and let the browser's
  // native controls handle play/pause/volume/fullscreen.
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-black">
      <video
        src={url}
        controls
        playsInline
        preload="none"
        poster={posterFallback}
        className="absolute inset-0 h-full w-full"
      />
    </div>
  );
}
