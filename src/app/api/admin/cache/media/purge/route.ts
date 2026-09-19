import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mediaCachePurgeInputSchema, firstIssueMessage, type MediaPurgeScope } from "@/lib/validation-media-cache";

/** POST /api/admin/cache/media/purge
 * Admin-only. Records a scoped purge event and returns the updated settings row.
 *
 * scope "all"            → purge every media cache pillar
 * scope "videos"         → purge only video cache
 * scope "audio"          → purge only audio cache
 * scope "previews"       → purge only game preview cache
 * scope "loading-screens"→ purge only loading screen cache
 * scope "screenshots"    → purge only screenshot cache
 *
 * Each scope updates its own *_last_purged_at timestamp. Scope "all" also
 * updates the top-level last_purged_at column. Actual CDN/storage
 * invalidation is handled here once the delivery pipeline is wired. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = mediaCachePurgeInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }

  const { scope } = parsed.data as { scope: MediaPurgeScope };
  const now = new Date().toISOString();

  // Build the column patch based on scope.
  // count reflects zero until the CDN/storage adapter is wired.
  const patch: Record<string, unknown> = {
    updated_at: now,
    updated_by: user.id,
  };

  if (scope === "all" || scope === "videos")          patch.videos_last_purged_at         = now;
  if (scope === "all" || scope === "audio")           patch.audio_last_purged_at          = now;
  if (scope === "all" || scope === "previews")        patch.previews_last_purged_at       = now;
  if (scope === "all" || scope === "loading-screens") patch.loading_screens_last_purged_at = now;
  if (scope === "all" || scope === "screenshots")     patch.screenshots_last_purged_at    = now;
  if (scope === "all")                                patch.last_purged_at                = now;

  const { data, error } = await supabase
    .from("media_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { result: { scope, count: 0 }, settings: null, warning: "Purge recorded but failed to persist the result." },
      { status: 207 },
    );
  }

  return NextResponse.json({ result: { scope, count: 0 }, settings: data });
}
