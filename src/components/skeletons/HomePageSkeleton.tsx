import { Bone, CircleBone, SkeletonRoot } from "./Skeleton";
import { RailSkeleton } from "./RailSkeleton";
import { FeaturedBannerSkeleton, SquareGameCardSkeleton } from "./GameTileSkeleton";

/** Mobile / iOS / Android home: featured banner, a row of square cards,
 * then a couple of horizontally-scrolling rails — a representative slice
 * of MobileHome rather than every single section. */
function MobileHomeSkeleton() {
  return (
    <div className="flex flex-col gap-6 lg:hidden">
      <div className="px-4">
        <FeaturedBannerSkeleton />
      </div>
      <div className="flex flex-col gap-3 px-4">
        <Bone className="h-4 w-28" />
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SquareGameCardSkeleton key={i} />
          ))}
        </div>
      </div>
      <RailSkeleton count={5} />
      <RailSkeleton count={5} />
    </div>
  );
}

/** Desktop / laptop home: continue-playing thumb, top-picks unit, then the
 * long stack of genre rails, a stats band, and the leaderboard panel —
 * mirrors the real page's rhythm of sections without enumerating every
 * single category row. */
function DesktopHomeSkeleton() {
  return (
    <div className="hidden flex-col gap-5 lg:flex">
      {/* Continue playing */}
      <section className="px-4 md:px-6">
        <Bone className="mb-3 h-4 w-36" />
        <Bone className="h-[88px] w-[88px] rounded-xl" />
      </section>

      {/* Top picks: big banner + 2x2 small grid, repeated */}
      <section className="px-4 md:px-6">
        <div className="mb-3">
          <Bone className="h-3.5 w-32" />
        </div>
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex h-[208px] shrink-0 gap-2 xl:h-[232px]">
              <Bone className="aspect-[16/9] h-full rounded-xl" />
              <div className="grid w-[326px] grid-cols-2 grid-rows-2 gap-2 xl:w-[366px]">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Bone key={j} className="h-full w-full rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <RailSkeleton count={7} />
      <RailSkeleton count={7} />

      {/* Originals: taller 2:3 tiles */}
      <RailSkeleton tileWidth={202} tileHeight={304} count={5} />

      <RailSkeleton count={7} />
      <RailSkeleton count={7} />
      <RailSkeleton count={7} />

      {/* Leaderboard panel */}
      <section className="px-4 md:px-6">
        <CircleBone size={40} className="rounded-xl" />
        <div className="mt-3 mb-4 flex items-center justify-between">
          <Bone className="h-5 w-40" />
          <Bone className="h-3 w-20" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SquareGameCardSkeleton key={i} />
          ))}
        </div>
      </section>

      <RailSkeleton count={7} />
      <RailSkeleton count={7} />
    </div>
  );
}

export function HomePageSkeleton() {
  return (
    <SkeletonRoot>
      <MobileHomeSkeleton />
      <DesktopHomeSkeleton />
    </SkeletonRoot>
  );
}
