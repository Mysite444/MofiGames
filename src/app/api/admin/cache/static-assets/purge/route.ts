import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { staticAssetCachePurgeInputSchema } from "@/lib/validation-static-asset-cache";

/** POST /api/admin/cache/static-assets/purge
 * Admin-only. Records a purge event and returns the updated settings row.
 *
 * scope "all"        → purge every static asset type below
 * scope "css"        → purge cached stylesheets only
 * scope "javascript" → purge cached scripts only
 * scope "fonts"       → purge cached font files only
 * scope "svg"         → purge cached SVGs / sprite sheet only
 * scope "icons"       → purge cached favicons / app icons only
 * scope "videos"      → purge cached video responses only
 * scope "audio"       → purge cached audio responses only
 *
 * Actual CDN-edge / reverse-proxy invalidation is wired up here once the
 * corresponding cache layer (Cloudflare API, etc.) is configured. Returning
 * a structured result without a wired backend is safe — the timestamp and
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

  const parsed = staticAssetCachePurgeInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }

  const { scope } = parsed.data;
  const now = new Date().toISOString();

  // In a full implementation, scope-specific invalidation runs here, e.g.
  // purging the matching path pattern (/**/*.css, /**/*.js, /fonts/**,
  // /**/*.svg, /icons/**, /**/*.mp4|webm, /**/*.mp3|ogg|wav) from whatever
  // CDN sits in front of this app.
  const count = 0; // reflects zero until a CDN purge API is wired

  const { data, error } = await supabase
    .from("static_asset_cache_settings")
    .update({
      last_purged_at: now,
      updated_at: now,
      updated_by: user.id,
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
