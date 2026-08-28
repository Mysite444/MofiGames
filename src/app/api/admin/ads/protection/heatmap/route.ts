import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

const DAY_MS = 24 * 60 * 60 * 1000;
const GRID_SIZE = 10; // 10x10 buckets, each covering 10% x 10% of the slot.

/** GET /api/admin/ads/protection/heatmap?placement=sidebar — Admin → Ad
 * Protection → Click Heatmap. Buckets every click's relative (x_pct,
 * y_pct) position within its ad slot (see src/lib/ad-tracking.ts) into a
 * GRID_SIZE × GRID_SIZE grid, last 30 days, for whichever placement has
 * the most recorded clicks unless one is requested explicitly. */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { searchParams } = new URL(request.url);
  const requestedPlacement = searchParams.get("placement");

  const since30d = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const { data: allPlacements } = await supabase
    .from("ad_events")
    .select("placement")
    .eq("event_type", "click")
    .gte("created_at", since30d)
    .limit(20000);

  const placementCounts = new Map<string, number>();
  for (const row of allPlacements ?? []) {
    placementCounts.set(row.placement, (placementCounts.get(row.placement) ?? 0) + 1);
  }
  const placements = Array.from(placementCounts.keys()).sort((a, b) => (placementCounts.get(b) ?? 0) - (placementCounts.get(a) ?? 0));

  const placement = requestedPlacement ?? placements[0] ?? null;
  if (!placement) {
    return NextResponse.json({ placement: null, placements: [], grid: [], totalClicks: 0 });
  }

  const { data: clicks, error } = await supabase
    .from("ad_events")
    .select("x_pct, y_pct, blocked")
    .eq("event_type", "click")
    .eq("placement", placement)
    .gte("created_at", since30d)
    .not("x_pct", "is", null)
    .not("y_pct", "is", null)
    .limit(20000);

  if (error) {
    return NextResponse.json({ error: "Failed to load click heatmap." }, { status: 500 });
  }

  const grid: number[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
  let plotted = 0;
  for (const c of clicks ?? []) {
    if (c.x_pct == null || c.y_pct == null) continue;
    const col = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor((c.x_pct / 100) * GRID_SIZE)));
    const row = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor((c.y_pct / 100) * GRID_SIZE)));
    grid[row][col] += 1;
    plotted += 1;
  }

  return NextResponse.json({
    placement,
    placements,
    grid,
    totalClicks: plotted,
  });
}
