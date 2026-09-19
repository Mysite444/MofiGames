import { Bone, SkeletonRoot } from "./Skeleton";

function FieldSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      <Bone className="h-2.5 w-14" />
      <Bone className="h-11 w-full rounded-xl" />
    </div>
  );
}

/** Matches LoginPageClient / SignupPageClient: centered logo + heading,
 * then a glass-strong card of labeled fields and a submit button.
 * `fieldCount` is 2 for login (email, password) and 4 for signup
 * (name, email, password, confirm password). */
export function AuthFormSkeleton({ fieldCount = 2 }: { fieldCount?: number }) {
  return (
    <SkeletonRoot>
      <div className="flex flex-col items-center px-4 py-10 sm:py-14 md:px-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <Bone className="h-7 w-32" />
            <div className="flex flex-col items-center gap-2">
              <Bone className="h-6 w-40" />
              <Bone className="h-3 w-56" />
            </div>
          </div>

          <div className="glass-strong flex flex-col gap-4 rounded-2xl p-6 sm:p-7">
            {Array.from({ length: fieldCount }).map((_, i) => (
              <FieldSkeleton key={i} />
            ))}
            <Bone className="h-11 w-full rounded-full bg-white/15" />
            <Bone className="mx-auto h-3 w-40" />
          </div>
        </div>
      </div>
    </SkeletonRoot>
  );
}
