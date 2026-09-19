import { Bone, CircleBone, SkeletonRoot } from "./Skeleton";

/** One post-card row skeleton. Matches the real <Link> card in
 * src/app/blog/page.tsx: cover image left (stacks on top on mobile),
 * tag pills, title, two-line excerpt, author/date line. */
function PostCardSkeleton() {
  return (
    <div className="glass flex flex-col gap-3 rounded-2xl p-5 sm:flex-row sm:items-center">
      <Bone className="h-40 w-full shrink-0 rounded-xl sm:h-24 sm:w-40" />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          <Bone className="h-4 w-14 rounded-full" />
          <Bone className="h-4 w-10 rounded-full" />
        </div>
        <Bone className="h-5 w-4/5" />
        <div className="mt-2 flex flex-col gap-1.5">
          <Bone className="h-3 w-full" />
          <Bone className="h-3 w-2/3" />
        </div>
        <Bone className="mt-2.5 h-3 w-36" />
      </div>
    </div>
  );
}

/** Matches src/app/blog/page.tsx: icon badge + title/subtitle header
 * (same shape as StaticPageSkeleton's header, max-w-3xl to match), then a
 * stack of post cards. Used by src/app/blog/loading.tsx. */
export function BlogIndexSkeleton({ count = 6 }: { count?: number }) {
  return (
    <SkeletonRoot>
      <div className="flex flex-col gap-6 px-4 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div className="flex items-center gap-3">
            <CircleBone size={44} className="rounded-xl" />
            <div className="flex flex-col gap-2">
              <Bone className="h-6 w-36" />
              <Bone className="h-3 w-56" />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {Array.from({ length: count }).map((_, i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </SkeletonRoot>
  );
}
