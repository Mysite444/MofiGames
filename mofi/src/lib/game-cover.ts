/**
 * game-cover.ts — Single source of truth for picking the right cover image
 * for a given card layout variant.
 *
 * The three cover variants map to the card shapes used across MofiGames:
 *
 *   'landscape' (16:9) — GenreGameCard, FeaturedBanner, large homepage
 *                         cards: Your Games, Trending, Featured, Popular,
 *                         Today's Best, large card rows.
 *
 *   'square'    (1:1)  — GameCard, ContinuePlayingCard, Favorites, Saved
 *                         Games, compact square grids.
 *
 *   'portrait'  (2:3)  — OriginalsGameCard, MobileGameRow PortraitCard,
 *                         portrait grids, mobile portrait layouts.
 *
 * Fallback order for each variant (existing games without the new covers
 * keep working automatically):
 *
 *   landscape  → landscapeCoverUrl → thumbnailUrl → coverImageUrl → undefined
 *   square     → squareCoverUrl    → thumbnailUrl → coverImageUrl → undefined
 *   portrait   → portraitCoverUrl  → thumbnailUrl → coverImageUrl → undefined
 *
 * The caller is responsible for rendering a gradient placeholder when the
 * return value is undefined (all three are unset and no thumbnailUrl either),
 * exactly as every existing card component already does via <GameThumbnail>.
 */

import type { Game } from "./types";

export type CoverVariant = "landscape" | "square" | "portrait";

/**
 * Returns the most appropriate image URL for `game` given the `variant`
 * of card that will display it, following the fallback chain above.
 *
 * Returns `undefined` when no image of any kind is available — the caller
 * should render a gradient placeholder (GameThumbnail) in that case.
 */
export function getGameCover(game: Game, variant: CoverVariant): string | undefined {
  switch (variant) {
    case "landscape":
      return game.landscapeCoverUrl ?? game.thumbnailUrl ?? game.coverImageUrl ?? undefined;
    case "square":
      return game.squareCoverUrl ?? game.thumbnailUrl ?? game.coverImageUrl ?? undefined;
    case "portrait":
      return game.portraitCoverUrl ?? game.thumbnailUrl ?? game.coverImageUrl ?? undefined;
  }
}
