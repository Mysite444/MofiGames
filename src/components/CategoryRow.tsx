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
      <div className="mb-1 flex items-center justify-between px-4 md:px-6">
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
          className="carousel-arrow rail-arrow absolute left-2 top-1/2 z-10 -translate-y-1/2 md:left-4"
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
            short of this box's actual edge. px-7/py-6 (plus the md: bump)
            below were sized for exactly that, verified in a real browser —
            don't shrink them without re-checking the hover effect still
            shows on all 4 sides, especially the first/last card in a row. */}
        <div
          ref={scrollerRef}
          className="snap-rail scrollbar-hide flex gap-2 overflow-x-auto px-7 py-6 md:px-8"
          style={{ scrollPaddingLeft: "1rem" }}
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
          className="carousel-arrow rail-arrow absolute right-2 top-1/2 z-10 -translate-y-1/2 md:right-4"
        >
          <ChevronRight size={26} />
        </button>
      </div>
    </section>
  );
}
