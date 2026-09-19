import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

const VALID_FILTERS = new Set(["all", "blocked", "bot", "vpn", "datacenter", "blacklisted"]);

/** GET /api/admin/ads/protection/reports?filter=all — Admin → Ad
 * Protection → Invalid Traffic Reports. Recent flagged ad_events plus the
 * ad_protection_actions audit log (what Auto Ad Disable / Auto IP
 * Blocking actually did on its own). */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "all";
  if (!VALID_FILTERS.has(filter)) {
    return NextResponse.json({ error: "Invalid filter." }, { status: 400 });
  }

  let query = supabase
    .from("ad_events")
    .select("id, event_type, placement, path, ip, country, device_type, browser, os, is_bot, bot_reasons, is_vpn, is_datacenter, rule_match, risk_score, blocked, block_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filter === "blocked") query = query.eq("blocked", true);
  else if (filter === "bot") query = query.eq("is_bot", true);
  else if (filter === "vpn") query = query.eq("is_vpn", true);
  else if (filter === "datacenter") query = query.eq("is_datacenter", true);
  else if (filter === "blacklisted") query = query.eq("rule_match", "blacklist");
  else query = query.gt("risk_score", 0);

  const [eventsResult, actionsResult] = await Promise.all([
    query,
    supabase.from("ad_protection_actions").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  if (eventsResult.error) {
    return NextResponse.json({ error: "Failed to load invalid traffic report." }, { status: 500 });
  }

  return NextResponse.json({
    events: eventsResult.data ?? [],
    actions: actionsResult.data ?? [],
  });
}
