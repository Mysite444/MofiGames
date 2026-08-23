import { Bone, CircleBone, SkeletonRoot } from "./Skeleton";
import { GameTileSkeleton } from "./GameTileSkeleton";

function CommentRowSkeleton() {
  return (
    <div className="flex items-start gap-3">
      <CircleBone size={36} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Bone className="h-3 w-32" />
        <Bone className="h-3 w-full" />
        <Bone className="h-3 w-2/3" />
      </div>
    </div>
  );
}

/** Matches the compose box CommentsSection shows a signed-in visitor —
 * avatar + a rounded textarea-shaped block, "Post" button bottom-right. */
function CommentComposeSkeleton() {
  return (
    <div className="flex items-start gap-3">
      <CircleBone size={36} />
      <div className="flex flex-1 flex-col items-end gap-2 rounded-2xl bg-white/5 p-3">
        <Bone className="h-8 w-full rounded-md" />
        <Bone className="h-7 w-16 rounded-full" />
      </div>
    </div>
  );
}

/** Matches CommentsSection's header row: "Comments (N)" + Newest/Top tabs. */
function CommentsHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between">
      <Bone className="h-4 w-28" />
      <Bone className="h-8 w-28 rounded-full" />
    </div>
  );
}

/** Matches SidebarPlayNextGrid — single column of 300×169 tiles (not the
 * old 2-column small-tile grid). */
function PlayNextGridSkeleton({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-3">
      <Bone className="h-3.5 w-20" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ width: "300px", height: "169px" }}>
            <GameTileSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Matches GameDetailsSection's `<dl>` of Released/Developer/Platform/etc
 * rows — a "label: value" line per stat. */
function StatRowSkeleton({ width }: { width: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <Bone className="h-3 w-20 shrink-0" />
      <Bone className={`h-3 ${width}`} />
    </div>
  );
}

/** Matches MobileRelatedGrid / GameCard — square thumbnail + caption,
 * 3-column grid, used under the mobile "More {category}" heading. */
function RelatedGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Bone className="aspect-square w-full rounded-2xl" />
          <Bone className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

/** Matches PlayerActionBar — the bar under the desktop player: site logo
 * on the left, a cluster of like-pill + icon-circle buttons on the right. */
function PlayerActionBarSkeleton() {
  return (
    <div className="flex w-full items-center justify-between gap-2 rounded-lg bg-[var(--color-menu-bg)] px-3 py-2">
      <Bone className="h-5 w-24" />
      <div className="flex shrink-0 items-center gap-1.5">
        <Bone className="h-8 w-16 rounded-full" />
        {Array.from({ length: 7 }).map((_, i) => (
          <CircleBone key={i} size={32} />
        ))}
      </div>
    </div>
  );
}

/** Matches /game/[slug]: MobileGamePage (edge-to-edge 4:3 hero, centered
 * title/rating, two CTA buttons, a 5-icon action row, in-post ad, "More
 * {category}" related grid, comments) on mobile; GamePlayerPanel + action
 * bar + ad, GameDetailsSection (breadcrumb, title, rating, stats + ad,
 * tags, description, how-to-play, controls) and comments in the main
 * column, sidebar ad + single-column "Play next" list on desktop. */
export function GamePageSkeleton() {
  return (
    <SkeletonRoot>
      {/* Mobile / iOS / Android */}
      <div className="flex flex-col gap-4 px-0 lg:hidden">
        <Bone className="aspect-[4/3] w-full" style={{ borderRadius: 0 }} />

        <div className="flex flex-col gap-4 px-4">
          {/* Centered title block */}
          <div className="flex flex-col items-center gap-1.5">
            <Bone className="h-6 w-2/3" />
            <Bone className="h-3 w-24" />
            <Bone className="h-3.5 w-40" />
          </div>

          {/* Play now / Play with friends */}
          <div className="flex flex-col gap-2.5">
            <Bone className="h-11 w-full rounded-full" />
            <Bone className="h-11 w-full rounded-full" />
          </div>

          {/* Like / dislike / favorite / share / feedback */}
          <div className="flex items-center gap-2">
            <Bone className="h-9 w-16 shrink-0 rounded-full" />
            <CircleBone size={36} />
            <CircleBone size={36} />
            <CircleBone size={36} />
            <CircleBone size={36} />
          </div>

          {/* In-post ad slot (300x250) */}
          <div className="flex justify-center">
            <Bone
              className="border border-dashed border-white/15 bg-white/[0.03]"
              style={{ width: "300px", height: "250px" }}
            />
          </div>

          {/* Expand/collapse details toggle */}
          <div className="flex justify-center py-1">
            <Bone className="h-5 w-5 rounded-full" />
          </div>

          <div className="flex flex-col gap-3">
            <Bone className="h-4 w-32" />
            <RelatedGridSkeleton count={6} />
          </div>

          <div className="flex flex-col gap-4">
            <CommentsHeaderSkeleton />
            <CommentComposeSkeleton />
            {Array.from({ length: 3 }).map((_, i) => (
              <CommentRowSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Desktop / laptop */}
      <div className="hidden flex-col gap-8 px-4 md:px-6 lg:flex">
        <div className="relative">
          <div className="flex flex-col gap-8 lg:pr-[324px]">
            <div className="flex flex-col gap-2">
              <Bone className="aspect-video w-full" style={{ borderRadius: 0 }} />
              <PlayerActionBarSkeleton />
              <Bone
                className="mx-auto mt-2 w-full max-w-[728px] border border-dashed border-white/15 bg-white/[0.03]"
                style={{ height: "90px" }}
              />
            </div>

            <div className="flex flex-col gap-5">
              <Bone className="h-3 w-64" />

              <div className="flex flex-col gap-3">
                <Bone className="h-8 w-72" />
                <div className="flex items-center gap-3">
                  <Bone className="h-9 w-24 rounded-full" />
                  <Bone className="h-3.5 w-28" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Bone key={i} className="h-4 w-4 rounded-sm" />
                ))}
                <Bone className="ml-1 h-3.5 w-24" />
              </div>

              <div className="flex items-start justify-between gap-6">
                <div className="flex flex-1 flex-col gap-2.5">
                  <StatRowSkeleton width="w-40" />
                  <StatRowSkeleton width="w-32" />
                  <StatRowSkeleton width="w-36" />
                  <StatRowSkeleton width="w-28" />
                  <StatRowSkeleton width="w-44" />
                  <StatRowSkeleton width="w-24" />
                </div>
                <Bone
                  className="hidden shrink-0 border border-dashed border-white/15 bg-white/[0.03] sm:block"
                  style={{ width: "300px", height: "250px" }}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Bone className="h-7 w-20 rounded-full" />
                <Bone className="h-7 w-28 rounded-full" />
                <Bone className="h-7 w-24 rounded-full" />
                <Bone className="h-7 w-20 rounded-full" />
              </div>

              <div className="flex flex-col gap-2">
                <Bone className="h-3.5 w-full max-w-md" />
                <Bone className="h-3.5 w-full max-w-sm" />
                <Bone className="h-3.5 w-full max-w-xs" />
              </div>

              <div className="flex flex-col gap-2">
                <Bone className="h-4 w-28" />
                <Bone className="h-3.5 w-full max-w-md" />
                <Bone className="h-3.5 w-full max-w-sm" />
              </div>

              <div className="flex flex-col gap-2">
                <Bone className="h-4 w-20" />
                <Bone className="h-3 w-56" />
                <Bone className="h-3 w-48" />
                <Bone className="h-3 w-52" />
                <Bone className="h-3 w-40" />
                <Bone className="h-3 w-44" />
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <CommentsHeaderSkeleton />
              <CommentComposeSkeleton />
              {Array.from({ length: 4 }).map((_, i) => (
                <CommentRowSkeleton key={i} />
              ))}
            </div>
          </div>

          <aside className="absolute right-0 top-0 hidden w-[300px] flex-col gap-5 lg:flex">
            <Bone
              className="border border-dashed border-white/15 bg-white/[0.03]"
              style={{ width: "300px", height: "250px" }}
            />
            <PlayNextGridSkeleton count={6} />
          </aside>
        </div>
      </div>
    </SkeletonRoot>
  );
}
