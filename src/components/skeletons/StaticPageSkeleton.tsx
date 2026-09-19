import { Bone, CircleBone, SkeletonRoot } from "./Skeleton";

/** Matches components/StaticPage.tsx — icon badge + title/subtitle, then a
 * glass card of paragraph lines. Used by about, contact, terms,
 * privacy-policy, disclaimer, parents-info, and kids-message. */
export function StaticPageSkeleton() {
  return (
    <SkeletonRoot>
      <div className="flex flex-col gap-6 px-4 md:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <div className="flex items-center gap-3">
            <CircleBone size={44} className="rounded-xl" />
            <div className="flex flex-col gap-2">
              <Bone className="h-6 w-44" />
              <Bone className="h-3 w-56" />
            </div>
          </div>

          <div className="glass flex flex-col gap-4 rounded-2xl p-6 sm:p-8">
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-11/12" />
            <Bone className="h-3 w-4/5" />
            <Bone className="mt-3 h-4 w-1/3" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-3/4" />
            <Bone className="mt-3 h-4 w-1/4" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-5/6" />
            <Bone className="h-3 w-2/3" />
          </div>
        </div>
      </div>
    </SkeletonRoot>
  );
}
