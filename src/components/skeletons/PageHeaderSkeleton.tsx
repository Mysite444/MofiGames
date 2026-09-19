import { Bone, CircleBone } from "./Skeleton";

/**
 * Stand-in for the gradient hero banner used at the top of every "browse"
 * page (category/[slug], leaderboard, latest/popular/updated-games,
 * favorites, recently-played). Same padding/sizing as the real
 * `<section className="relative overflow-hidden rounded-2xl p-6 sm:p-8" ...>`
 * header so nothing shifts when real content swaps in.
 */
export function PageHeaderSkeleton() {
  return (
    <section className="glass relative overflow-hidden rounded-2xl p-6 sm:p-8">
      <div className="relative flex items-center gap-3">
        <CircleBone size={48} className="rounded-xl" />
        <div className="flex flex-col gap-2">
          <Bone className="h-6 w-40 sm:h-7 sm:w-56" />
          <Bone className="h-3.5 w-48 sm:w-64" />
        </div>
      </div>
      <Bone className="relative mt-5 h-3 w-32" />
    </section>
  );
}
