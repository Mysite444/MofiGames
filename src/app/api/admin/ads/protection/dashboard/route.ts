import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

const DAY_MS = 24 * 60 * 60 * 1000;

interface AdEventRow {
  event_type: "impression" | "click";
  placement: string;
  is_bot: boolean;
  is_vpn: boolean;
  is_datacenter: boolean;
  blocked: boolean;
  risk_score: number;
  rule_match: string | null;
  created_at: string;
}

/** GET /api/admin/ads/protection/dashboard — Admin → Ad Protection →
 * Traffic Quality Dashboard. CTR Monitoring, per-placement breakdowns, a
 * 14-day trend, and top invalid-traffic reasons — all computed fresh from
 * ad_events (migration 0024), same "fetch raw rows, aggregate in JS"
 * approach as /api/admin/analytics/overview. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const now = Date.now();
  const since30d = new Date(now - 30 * DAY_MS).toISOString();

  const [eventsResult, settingsResult] = await Promise.all([
    supabase
      .from("ad_events")
      .select("event_type, placement, is_bot, is_vpn, is_datacenter, blocked, risk_score, rule_match, created_at")
      .gte("created_at", since30d)
      .limit(50000)
      .returns<AdEventRow[]>(),
    supabase.from("ad_protection_settings").select("ctr_alert_threshold_pct").eq("id", true).maybeSingle(),
  ]);

  const events = eventsResult.data ?? [];
  const ctrAlertThreshold = settingsResult.data?.ctr_alert_threshold_pct ?? 0.5;

  const impressions = events.filter((e) => e.event_type === "impression");
  const clicks = events.filter((e) => e.event_type === "click");
  const blockedCount = events.filter((e) => e.blocked).length;
  const botCount = events.filter((e) => e.is_bot).length;
  const vpnCount = events.filter((e) => e.is_vpn).length;
  const datacenterCount = events.filter((e) => e.is_datacenter).length;
  const blacklistedCount = events.filter((e) => e.rule_match === "blacklist").length;

  const ctr = impressions.length > 0 ? (clicks.length / impressions.length) * 100 : 0;
  const validEvents = events.length - blockedCount;
  const trafficQualityScore = events.length > 0 ? Math.round((validEvents / events.length) * 100) : 100;

  // Per-placement breakdown.
  const placements = new Map<string, { impressions: number; clicks: number; blocked: number }>();
  for (const e of events) {
    if (!placements.has(e.placement)) placements.set(e.placement, { impressions: 0, clicks: 0, blocked: 0 });
    const bucket = placements.get(e.placement)!;
    if (e.event_type === "impression") bucket.impressions += 1;
    else bucket.clicks += 1;
    if (e.blocked) bucket.blocked += 1;
  }
  const placementBreakdown = Array.from(placements.entries())
    .map(([placement, v]) => ({
      placement,
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: v.impressions > 0 ? Number(((v.clicks / v.impressions) * 100).toFixed(2)) : 0,
      blocked: v.blocked,
    }))
    .sort((a, b) => b.impressions - a.impressions);

  // 14-day trend: impressions, clicks, and flagged (bot/vpn/datacenter/blocked) events per day.
  const dayBuckets = new Map<string, { impressions: number; clicks: number; flagged: number }>();
  for (const e of events) {
    const day = e.created_at.slice(0, 10);
    if (!dayBuckets.has(day)) dayBuckets.set(day, { impressions: 0, clicks: 0, flagged: 0 });
    const bucket = dayBuckets.get(day)!;
    if (e.event_type === "impression") bucket.impressions += 1;
    else bucket.clicks += 1;
    if (e.blocked || e.is_bot || e.is_vpn || e.is_datacenter) bucket.flagged += 1;
  }
  const trend: { date: string; impressions: number; clicks: number; flagged: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    const bucket = dayBuckets.get(date) ?? { impressions: 0, clicks: 0, flagged: 0 };
    trend.push({ date, ...bucket });
  }

  // Today's CTR, for the CTR Monitoring alert.
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const todayImpressions = impressions.filter((e) => e.created_at.slice(0, 10) === todayStr).length;
  const todayClicks = clicks.filter((e) => e.created_at.slice(0, 10) === todayStr).length;
  const todayCtr = todayImpressions > 0 ? (todayClicks / todayImpressions) * 100 : 0;
  const ctrAlert = todayImpressions >= 20 && todayCtr > ctrAlertThreshold * 3;

  return NextResponse.json({
    overview: {
      totalImpressions: impressions.length,
      totalClicks: clicks.length,
      ctr: Number(ctr.toFixed(2)),
      trafficQualityScore,
      blockedCount,
      botCount,
      vpnCount,
      datacenterCount,
      blacklistedCount,
    },
    ctrMonitoring: {
      todayImpressions,
      todayClicks,
      todayCtr: Number(todayCtr.toFixed(2)),
      alertThresholdPct: ctrAlertThreshold,
      alert: ctrAlert,
    },
    placementBreakdown,
    trend,
  });
}
