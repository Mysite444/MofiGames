"use client";

import { useRef, type CSSProperties } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowRight } from "lucide-react";
import { GenreGameCard } from "./GenreGameCard";
import { OriginalsGameCard } from "./OriginalsGameCard";
import type { Game } from "@/lib/types";

// Fixed exact size for every regular genre/category row (the "default"
// variant) — measured pixel-for-pixel off CrazyGames' own regular rows:
// 202px wide x 114px tall (~16:9). Every default row uses this same size,
// so every category looks identical on desktop/laptop. Absolute size on
// purpose — it doesn't scale with the viewport.
const DEFAULT_CARD_SIZE: CSSProperties = { width: "202px", height: "114px" };

// Fixed exact size for the "originals" variant (MofiGames Originals row),
// measured pixel-for-pixel off the CrazyGames Originals screenshot you sent:
// each tile there is 202px wide x 304px tall (a near-exact 2:3 ratio). Using
// those measured px values directly — instead of an inch conversion — so the
// tiles come out the same on-screen size as the reference, not just the same
// ratio. Absolute size on purpose: it doesn't scale with the viewport.
const ORIGINALS_CARD_SIZE: CSSProperties = { width: "202px", height: "304px" };

export function CategoryRow({
  title,
  games,
  href,
  variant = "default",
}: {
  title: string;
  games: Game[];
  href?: string;
  /** "originals" swaps in the larger, caption-less tile used for the MofiGames Originals rail. */
  variant?: "default" | "originals";
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const isOriginals = variant === "originals";

  function scrollByCards(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: "smooth" });
  }

  if (games.length === 0) return null;

  return (
    <section className="rail-group relative">
      <div className="mb-0 flex items-center justify-between pl-5 pr-4 md:pl-5 md:pr-6">
        <h2 className="font-category-fat text-lg leading-tight text-text md:text-xl">
          {title}
        </h2>

        {href && (
          <Link
            href={href}
            className="flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-text-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            See all
            <ArrowRight size={13} />
          </Link>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-label={`Scroll ${title} left`}
          onClick={() => scrollByCards(-1)}
          className="carousel-arrow rail-arrow absolute left-2 top-1/2 z-50 -translate-y-1/2 md:left-4"
        >
          <ChevronLeft size={26} />
        </button>

        {/* IMPORTANT re: the hover-grow effect on GenreGameCard/OriginalsGameCard
            inside this rail — browsers force overflow-y to compute as `auto`
            (i.e. it still clips) whenever overflow-x is `auto` on the same
            element, even if you explicitly write `overflow-y: visible`
            (confirmed against the CSS Overflow spec + tested directly in
            Chrome). So a hovered card's scaled-up ring/glow can NEVER
            render past this element's own padding box, no matter what
            overflow-y is set to — the only real fix is padding: reserve
            enough padding here that the card's growth (computed from its
            fixed size × the hover scale factor in GenreGameCard/
            OriginalsGameCard) always fits *inside* the padding, comfortably
            short of this box's actual edge.
            This row (like TopPicksRow) only ever renders inside page.tsx's
            desktop-only `hidden lg:flex` wrapper, so it's always ≥1024px —
            always past the md: breakpoint — which is why pl-5 (20px) is
            the value that matters, not the base pl-7. 20px is the matching
            "moved left" left inset used on every row now (same as
            TopPicksRow, ContinuePlayingDesktop and LeaderboardPanel's
            desktop rail), and it's still a hair above the worst case here:
            the default variant's GenreGameCard is a fixed 202px wide and
            grows to scale-[1.18] on hover, which needs ~18.2px of clearance
            on its left — pl-5 leaves ~1.8px to spare. Don't shrink it
            further without re-checking the hover ring on the first card.
            pr-7/md:pr-8 on the right is untouched on purpose: that's
            trailing space for the *last* card's hover glow once you scroll
            all the way to the end, and reducing it doesn't help move
            anything left. */}
        {/* scroll-pl-5 matches the pl-5 above exactly (same reasoning as
            px-7/md:px-8 used to need — see above). Without it, CSS
            scroll-snap (scroll-snap-align: start on each .snap-card)
            computes its snap position against the scrollport edge and
            ignores this element's own padding once the row actually has
            enough cards to scroll — silently "eating" the padding we rely
            on to keep the hover-grow ring from clipping on the first card.
            Confirmed by testing scrollLeft on load: without a matching
            scroll-padding, the browser auto-scrolls to exactly cancel out
            the visual padding, even before any user interaction. Keep this
            in lockstep with pl-5 above if it ever changes. */}
        <div
          ref={scrollerRef}
          className="snap-rail scrollbar-hide flex gap-2 overflow-x-auto pl-5 pr-7 pt-3 pb-4 scroll-pl-5 md:pl-5 md:pr-8 md:scroll-pl-5"
        >
          {games.map((game) =>
            isOriginals ? (
              <div key={game.id} className="snap-card relative shrink-0 hover:z-40 focus-within:z-40" style={ORIGINALS_CARD_SIZE}>
                <OriginalsGameCard game={game} />
              </div>
            ) : (
              <div key={game.id} className="snap-card relative shrink-0 hover:z-40 focus-within:z-40" style={DEFAULT_CARD_SIZE}>
                <GenreGameCard game={game} />
              </div>
            )
          )}
        </div>

        <button
          type="button"
          aria-label={`Scroll ${title} right`}
          onClick={() => scrollByCards(1)}
          className="carousel-arrow rail-arrow absolute right-2 top-1/2 z-50 -translate-y-1/2 md:right-4"
        >
          <ChevronRight size={26} />
        </button>
      </div>
    </section>
  );
}
