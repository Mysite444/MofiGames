import { PageHeaderSkeleton } from "./PageHeaderSkeleton";
import { Bone, CircleBone, SkeletonRoot } from "./Skeleton";

function CategoryCardSkeleton({ tall = false }: { tall?: boolean }) {
  if (tall) {
    // Mobile: horizontal row card
    return (
      <div className="glass flex items-center gap-4 rounded-2xl p-4">
        <CircleBone size={48} className="rounded-xl" />
        <div className="min-w-0 flex-1 space-y-2">
          <Bone className="h-4 w-2/3" />
          <Bone className="h-2.5 w-1/2" />
        </div>
        <Bone className="h-5 w-8 shrink-0 rounded-full" />
      </div>
    );
  }
  // Desktop: square-ish tile card
  return (
    <div className="glass flex flex-col gap-4 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-2">
        <CircleBone size={44} className="rounded-xl" />
        <Bone className="h-5 w-16 rounded-full" />
      </div>
      <div className="space-y-2">
        <Bone className="h-4 w-2/3" />
        <Bone className="h-2.5 w-4/5" />
      </div>
    </div>
  );
}

/** Matches /categories: gradient header, then a grid of per-genre cards
 * (a stacked list on mobile, a 2–4 column grid on desktop). */
export function CategoriesPageSkeleton() {
  return (
    <SkeletonRoot>
      {/* Mobile / iOS / Android */}
      <div className="flex flex-col gap-5 lg:hidden">
        <div className="px-4">
          <PageHeaderSkeleton />
        </div>
        <div className="flex flex-col gap-3 px-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <CategoryCardSkeleton key={i} tall />
          ))}
        </div>
      </div>

      {/* Desktop / laptop */}
      <div className="hidden flex-col gap-6 px-4 md:px-6 lg:flex">
        <PageHeaderSkeleton />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <CategoryCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </SkeletonRoot>
  );
}
