import { Bone, SkeletonRoot } from "./Skeleton";

/** Matches src/app/blog/[slug]/page.tsx: breadcrumb trail, cover image,
 * tag pills, title, author/date line, then a glass card of article-body
 * paragraph bones. Used by src/app/blog/[slug]/loading.tsx. */
export function BlogPostSkeleton() {
  return (
    <SkeletonRoot>
      <div className="flex flex-col gap-6 px-4 md:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
          {/* Breadcrumbs: Home / Blog / Post title */}
          <div className="flex items-center gap-1.5">
            <Bone className="h-3 w-10" />
            <Bone className="h-3 w-3" />
            <Bone className="h-3 w-10" />
            <Bone className="h-3 w-3" />
            <Bone className="h-3 w-24" />
          </div>

          {/* Cover image */}
          <Bone className="h-56 w-full rounded-2xl sm:h-72" />

          <div>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <Bone className="h-4 w-14 rounded-full" />
              <Bone className="h-4 w-10 rounded-full" />
            </div>
            <Bone className="h-8 w-full sm:h-9" />
            <Bone className="mt-2 h-8 w-2/3 sm:h-9" />
            <Bone className="mt-2.5 h-3 w-40" />
          </div>

          {/* Article body */}
          <div className="glass flex flex-col gap-4 rounded-2xl p-6 sm:p-8">
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-11/12" />
            <Bone className="h-3 w-4/5" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-3/4" />
            <Bone className="mt-3 h-40 w-full rounded-xl" />
            <Bone className="mt-3 h-3 w-full" />
            <Bone className="h-3 w-5/6" />
            <Bone className="h-3 w-2/3" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-3/5" />
          </div>
        </div>
      </div>
    </SkeletonRoot>
  );
}
