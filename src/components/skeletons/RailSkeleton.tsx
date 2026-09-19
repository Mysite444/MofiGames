import { Bone, CircleBone } from "./Skeleton";
import { GameTileSkeleton } from "./GameTileSkeleton";

/** Matches CategoryRow: icon badge + title/description on the left, "See
 * all" on the right, then a horizontally-scrolling row of fixed-size tiles
 * underneath. Used for every genre rail on the home page. */
export function RailSkeleton({
  tileWidth = 202,
  tileHeight = 114,
  count = 7,
}: {
  tileWidth?: number;
  tileHeight?: number;
  count?: number;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2.5">
          <CircleBone size={32} className="rounded-lg" />
          <div className="flex flex-col gap-1.5">
            <Bone className="h-3.5 w-28" />
            <Bone className="hidden h-2.5 w-36 sm:block" />
          </div>
        </div>
        <Bone className="h-6 w-16 rounded-full" />
      </div>
      <div className="flex gap-2 overflow-hidden px-4 md:px-6">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="shrink-0" style={{ width: tileWidth, height: tileHeight }}>
            <GameTileSkeleton />
          </div>
        ))}
      </div>
    </section>
  );
}
