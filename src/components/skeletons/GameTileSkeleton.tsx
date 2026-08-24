import { Bone } from "./Skeleton";

/** Matches GenreGameCard's fixed-aspect rounded-lg tile used in every
 * desktop rail (202x114, ~16:9). Parent controls the actual size. */
export function GameTileSkeleton({ className = "" }: { className?: string }) {
  return <Bone className={`h-full w-full rounded-lg ${className}`} />;
}

/**
 * Matches CategoryPageCard — the PC-only 6-column category grid card.
 * Just the 16:9 thumbnail — the title is an overlay inside the card now
 * (hover-reveal, like the reference), not a separate line below it, so
 * there's nothing extra to skeleton-out there.
 */
export function CategoryPageCardSkeleton() {
  return <Bone className="aspect-video w-full rounded-xl" />;
}

/** Matches GameCard — square thumbnail + a caption line underneath, used in
 * the "Continue Playing" / "Favorites" grids on the profile page and the
 * mobile home screen. */
export function SquareGameCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Bone className="aspect-square w-full rounded-2xl" />
      <Bone className="h-3 w-4/5" />
    </div>
  );
}

/** Matches FeaturedBanner — the big aspect-[16/9] mobile banner with a
 * thumbnail + title sitting at the bottom. */
export function FeaturedBannerSkeleton() {
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl ring-1 ring-white/10">
      <Bone className="absolute inset-0 h-full w-full rounded-2xl" />
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2.5">
        <Bone className="h-12 w-12 shrink-0 rounded-xl bg-white/15" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Bone className="h-4 w-2/3 bg-white/15" />
          <Bone className="h-2.5 w-1/3 bg-white/15" />
        </div>
      </div>
    </div>
  );
}
