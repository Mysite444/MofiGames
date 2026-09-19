"use client";

import { useEffect, useRef } from "react";
import { getYoutubeVideoId, getYoutubeEmbedUrl } from "@/lib/youtube";

/**
 * Renders a game's silent, looping hover-preview clip from `previewVideoUrl`
 * — either a directly hosted MP4/WebM (native <video>) or a YouTube URL
 * (chromeless iframe embed). Used by every card that shows a preview on
 * hover (GameCard, BrowseGameCard, CategoryPageCard, GenreGameCard,
 * SidebarPlayNextCard), so the YouTube-vs-file branching lives in one
 * place instead of five near-identical copies.
 *
 * MP4/WebM: stays mounted the whole time; `active` just toggles opacity
 * and play/pause via a ref, exactly like the original per-card code did.
 *
 * YouTube: the iframe is only mounted while `active` is true — mounting/
 * unmounting is what starts/stops playback (no postMessage handshake
 * needed for a one-shot decorative loop), so idle grid cards never load an
 * iframe at all. There's no equivalent of the MP4 case's instant frame +
 * opacity fade here: the iframe has to actually load before anything is
 * visible, so a brief blank beat on first hover is expected, not a bug.
 *
 * The iframe is `pointer-events-none` — it's purely decorative on top of a
 * card that's a <Link> to the game page. Without this, a click during
 * hover would land on YouTube's iframe instead of navigating to the game,
 * and YouTube's branding corner could even carry the click away to
 * youtube.com.
 */
export function HoverPreviewVideo({
  src,
  active,
  className = "",
  onError,
}: {
  src: string;
  active: boolean;
  className?: string;
  /** Fires if the underlying <video> fails to load (bad URL, unsupported
   * codec, network error, etc.). Optional — existing call sites that don't
   * pass it are unaffected. Callers use this to fall back to the static
   * cover image instead of leaving a black box on screen (see
   * MobileGamePage's hero, which is the first consumer). Has no effect on
   * the YouTube-embed branch, which doesn't surface a comparable error. */
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const youtubeId = getYoutubeVideoId(src);

  useEffect(() => {
    if (youtubeId) return; // iframe mount/unmount handles start/stop instead
    const el = videoRef.current;
    if (!el) return;
    if (active) {
      el.play().catch(() => {
        // Autoplay can be blocked in rare cases even when muted — fine,
        // the static thumbnail just stays visible underneath.
      });
    } else {
      el.pause();
      el.currentTime = 0;
    }
  }, [active, youtubeId]);

  if (youtubeId) {
    if (!active) return null;
    return (
      <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
        {/* Oversized + centered, cropped by the overflow-hidden wrapper
           above: iframes don't reliably honor object-fit the way
           <video>/<img> do, so this approximates object-cover instead. */}
        <iframe
          key={youtubeId}
          src={getYoutubeEmbedUrl(youtubeId, "loop")}
          title=""
          allow="autoplay; encrypted-media"
          tabIndex={-1}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "300%",
            height: "300%",
            transform: "translate(-50%, -50%)",
            border: 0,
          }}
        />
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      loop
      playsInline
      preload="none"
      onError={onError}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-100 ${
        active ? "opacity-100" : "pointer-events-none opacity-0"
      } ${className}`}
    />
  );
}
