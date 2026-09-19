import { Bone, CircleBone, SkeletonRoot } from "./Skeleton";
import { SquareGameCardSkeleton } from "./GameTileSkeleton";

function StatTileSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-6">
      <Bone className="h-4 w-4 rounded" />
      <Bone className="h-6 w-12" />
      <Bone className="h-2.5 w-16" />
    </div>
  );
}

function GameSectionSkeleton() {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <Bone className="h-4 w-32" />
        <Bone className="h-3 w-14 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:gap-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <SquareGameCardSkeleton key={i} />
        ))}
      </div>
    </section>
  );
}

/** Matches ProfilePageClient's signed-in state: gradient hero with avatar,
 * a 4-tile stats band, then "Continue Playing" and "Favorites" grids. */
export function ProfilePageSkeleton() {
  return (
    <SkeletonRoot>
      <div className="flex flex-col gap-6 px-4 pb-10 md:gap-8 md:px-6">
        <section className="glass relative overflow-hidden rounded-2xl p-6 sm:p-8">
          <div className="relative flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <CircleBone size={64} />
              <div className="flex flex-col gap-2">
                <Bone className="h-6 w-32" />
                <Bone className="h-3 w-44" />
                <Bone className="h-2.5 w-36" />
              </div>
            </div>
            <Bone className="h-9 w-28 rounded-full" />
          </div>
        </section>

        <section className="glass overflow-hidden rounded-2xl">
          <div className="grid grid-cols-2 gap-px sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <StatTileSkeleton key={i} />
            ))}
          </div>
        </section>

        <GameSectionSkeleton />
        <GameSectionSkeleton />
      </div>
    </SkeletonRoot>
  );
}
