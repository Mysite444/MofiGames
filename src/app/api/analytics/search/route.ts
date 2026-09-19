import { NextResponse, type NextRequest } from "next/server";
import { publicClient } from "@/lib/supabase/route-auth";
import { recordSearchQuerySchema, firstIssueMessage } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request-ip";

/**
 * POST /api/analytics/search — logs one search performed in the site
 * search box (see src/components/SearchBox.tsx).
 *
 * Rate limiting: 60 search logs per minute per IP (generous enough for a
 * real user, tight enough to stop bulk scraping of the search analytics
 * endpoint).  Authenticated users also get a per-user window (same limit)
 * as an additional signal — a single account hammering search from many
 * IPs is still capped.  Both checks fail open so a broken rate-limiter
 * never silently breaks the search box.
 */
export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = recordSearchQuerySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const supabase = await publicClient();

  // ── Rate limiting ──────────────────────────────────────────────────────────
  const ip = clientIp(request);
  if (ip) {
    const underIpLimit = await checkRateLimit(supabase, `search-ip:${ip}`, 60, 60);
    if (!underIpLimit) {
      // Return 200 so the SearchBox silently swallows it — we don't want
      // a rate-limit banner breaking the UX for a real (fast-typing) user.
      return NextResponse.json({ ok: true, ratelimited: true });
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const underUserLimit = await checkRateLimit(supabase, `search-user:${user.id}`, 60, 60);
    if (!underUserLimit) {
      return NextResponse.json({ ok: true, ratelimited: true });
    }
  }
  // ── End rate limiting ──────────────────────────────────────────────────────

  const { error } = await supabase.from("search_queries").insert({
    query: parsed.data.query,
    results_count: parsed.data.resultsCount,
    user_id: user?.id ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to record search." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
