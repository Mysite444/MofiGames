import { PageHeaderSkeleton } from "./PageHeaderSkeleton";
import { FeaturedBannerSkeleton, GameTileSkeleton, CategoryPageCardSkeleton } from "./GameTileSkeleton";
import { SkeletonRoot } from "./Skeleton";

// Legacy auto-fill constants — still used by popular/latest/updated pages.
const GRID_COLS = "grid-cols-[repeat(auto-fill,minmax(202px,1fr))]";
const TILE_ASPECT = "aspect-[202/114]";

/**
 * Shared skeleton for every "gradient header + game grid" browse page.
 * Mirrors the real layout so there's no shift once data loads.
 *
 * `desktopColumns`
 *   "auto"  (default) — legacy auto-fill minmax(202px, 1fr) grid used by
 *            popular-games, latest-games, updated-games, etc.
 *   "6"     — fixed 6-column grid with CategoryPageCardSkeleton, used by
 *            category/[slug] to match the new CategoryPageCard layout.
 */
export function BrowsePageSkeleton({
  bannerCount = 6,
  gridCount = 18,
  desktopColumns = "auto",
}: {
  bannerCount?: number;
  gridCount?: number;
  desktopColumns?: "auto" | "6";
}) {
  return (
    <SkeletonRoot>
      {/* ── Mobile / iOS / Android ── unchanged regardless of desktopColumns */}
      <div className="flex flex-col gap-5 lg:hidden">
        <div className="px-4">
          <PageHeaderSkeleton />
        </div>
        <div className="flex flex-col gap-3 px-4">
          {Array.from({ length: bannerCount }).map((_, i) => (
            <FeaturedBannerSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* ── Desktop / laptop ── */}
      <div className="hidden flex-col gap-6 px-4 md:px-6 lg:flex">
        <PageHeaderSkeleton />

        {desktopColumns === "6" ? (
          /* 6-column CategoryPageCard skeleton — aspect-video tile only, 17px gap to match the real grid */
          <div className="grid grid-cols-6 gap-[17px]">
            {Array.from({ length: gridCount }).map((_, i) => (
              <CategoryPageCardSkeleton key={i} />
            ))}
          </div>
        ) : (
          /* Legacy auto-fill 202px-min grid skeleton */
          <div className={`grid gap-2 ${GRID_COLS}`}>
            {Array.from({ length: gridCount }).map((_, i) => (
              <div key={i} className={TILE_ASPECT}>
                <GameTileSkeleton />
              </div>
            ))}
          </div>
        )}
      </div>
    </SkeletonRoot>
  );
}
