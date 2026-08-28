import { PageHeaderSkeleton } from "./PageHeaderSkeleton";
import { FeaturedBannerSkeleton } from "./GameTileSkeleton";
import { Bone, SkeletonRoot } from "./Skeleton";

function RankedRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
      <Bone className="h-4 w-5 shrink-0 sm:w-7" />
      <Bone className="h-12 w-12 shrink-0 rounded-lg sm:h-14 sm:w-14" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Bone className="h-3.5 w-1/2" />
        <Bone className="h-2.5 w-1/4" />
      </div>
      <Bone className="hidden h-3.5 w-8 sm:block" />
      <Bone className="h-3 w-14 shrink-0 sm:w-20" />
    </div>
  );
}

/** Matches /leaderboard: header, top-3 as featured banners on mobile, then
 * everyone else as a divided list of ranked rows on every breakpoint. */
export function LeaderboardSkeleton() {
  return (
    <SkeletonRoot>
      {/* Mobile / iOS / Android */}
      <div className="flex flex-col gap-5 lg:hidden">
        <div className="px-4">
          <PageHeaderSkeleton />
        </div>
        <div className="flex flex-col gap-3 px-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <FeaturedBannerSkeleton key={i} />
          ))}
        </div>
        <div className="px-4">
          <div className="glass flex flex-col divide-y divide-white/10 overflow-hidden rounded-2xl">
            {Array.from({ length: 10 }).map((_, i) => (
              <RankedRowSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Desktop / laptop */}
      <div className="hidden flex-col gap-6 px-4 md:px-6 lg:flex">
        <PageHeaderSkeleton />
        <div className="glass flex flex-col divide-y divide-white/10 overflow-hidden rounded-2xl">
          {Array.from({ length: 14 }).map((_, i) => (
            <RankedRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </SkeletonRoot>
  );
}
