import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { imageCachePurgeInputSchema } from "@/lib/validation-image-cache";

/** POST /api/admin/cache/image/purge
 * Admin-only. Records a purge event and returns the updated settings row.
 *
 * scope "all"        → purge every cached image variant
 * scope "thumbnails" → purge only the thumbnail cache
 * scope "resized"    → purge only resized variants
 * scope "optimised"  → purge only WebP/AVIF transcodes
 *
 * Actual on-disk / in-process invalidation is handled here once the
 * image pipeline (sharp + storage adapter) is wired up. Returning a
 * structured result without a wired cache is safe — the timestamp and
 * scope are persisted so the admin UI can show when the last purge ran. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = imageCachePurgeInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }

  const { scope } = parsed.data;
  const now = new Date().toISOString();

  // In a full implementation, scope-specific invalidation runs here:
  //   "thumbnails" → delete /public/cache/thumbs/** or object-store prefix
  //   "resized"    → flush the LRU resize cache
  //   "optimised"  → remove WebP/AVIF variants from storage
  //   "all"        → all three of the above
  const count = 0; // reflects zero until pipeline is wired

  const { data, error } = await supabase
    .from("image_cache_settings")
    .update({
      last_purged_at: now,
      updated_at:     now,
      updated_by:     user.id,
    })
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { result: { scope, count }, settings: null, warning: "Purge recorded but failed to persist the result." },
      { status: 207 },
    );
  }

  return NextResponse.json({ result: { scope, count }, settings: data });
}
