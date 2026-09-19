import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/route-auth";
import { recordAdEventSchema, firstIssueMessage } from "@/lib/validation";
import { parseUserAgent } from "@/lib/user-agent";
import { detectBotSignal, computeRiskScore, extractClientIp } from "@/lib/ad-protection";

interface AdProtectionSettingsRow {
  invalid_click_detection_enabled: boolean;
  click_frequency_limit_enabled: boolean;
  click_frequency_max: number;
  click_frequency_window_seconds: number;
  impression_frequency_limit_enabled: boolean;
  impression_frequency_max: number;
  impression_frequency_window_seconds: number;
  suspicious_user_detection_enabled: boolean;
  bot_detection_enabled: boolean;
  vpn_proxy_detection_enabled: boolean;
  datacenter_ip_detection_enabled: boolean;
  auto_ad_disable_enabled: boolean;
  auto_ad_disable_risk_threshold: number;
  auto_ip_blocking_enabled: boolean;
  auto_ip_blocking_risk_threshold: number;
}

/** POST /api/ads/track — logs one ad impression or click (see
 * src/lib/ad-tracking.ts on the client). No admin gate: every visitor,
 * signed in or not, calls this. Every signal that matters for the
 * decision (IP, User-Agent, Accept-Language) is read from the request
 * itself server-side, never trusted from the JSON body — the body only
 * carries what the client alone knows (which placement, which page, its
 * own visitor-id cookie, and where on the slot a click landed).
 *
 * Fails soft everywhere: a broken or disabled Ad Protection setup should
 * never be the reason an ad slot fails to render or a click goes
 * unrecorded harder than it has to. On any unexpected error this returns
 * `{ blocked: false }` rather than surfacing a 500 to the page. */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = recordAdEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { eventType, placement, path, visitorId, xPct, yPct } = parsed.data;

  const supabase = await publicClient();

  try {
    const { data: settings } = await supabase
      .from("ad_protection_settings")
      .select("*")
      .eq("id", true)
      .maybeSingle<AdProtectionSettingsRow>();

    // No settings row (migration not run yet) — record nothing extra,
    // don't block anything.
    if (!settings) {
      return NextResponse.json({ blocked: false });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const ip = extractClientIp(request.headers);
    const country = request.headers.get("x-vercel-ip-country");
    const { deviceType, browser, os } = parseUserAgent(request.headers.get("user-agent"));
    const botSignal = detectBotSignal(request.headers.get("user-agent"), request.headers.get("accept-language"));

    const ruleMatch = await checkAdRule(supabase, ip, visitorId);

    let overClickFrequency = false;
    let overImpressionFrequency = false;
    if (eventType === "click" && settings.click_frequency_limit_enabled) {
      const underLimit = await hitRateLimit(
        supabase,
        `ad_click:${visitorId}:${placement}`,
        settings.click_frequency_window_seconds,
        settings.click_frequency_max
      );
      overClickFrequency = !underLimit;
    }
    if (eventType === "impression" && settings.impression_frequency_limit_enabled) {
      const underLimit = await hitRateLimit(
        supabase,
        `ad_impression:${visitorId}:${placement}`,
        settings.impression_frequency_window_seconds,
        settings.impression_frequency_max
      );
      overImpressionFrequency = !underLimit;
    }

    // "Invalid Click Detection" gates bot/VPN/datacenter signals on click
    // events; "Suspicious User Detection" is its impression-side
    // counterpart. Both defer to the per-signal toggles underneath.
    const applySignals = eventType === "click" ? settings.invalid_click_detection_enabled : settings.suspicious_user_detection_enabled;

    let isBot = false;
    let isVpn = false;
    let isDatacenter = false;
    const reasons: string[] = [];

    if (applySignals && settings.bot_detection_enabled) {
      isBot = botSignal.isBot;
      reasons.push(...botSignal.reasons);
    }
    if (applySignals && ip && (settings.vpn_proxy_detection_enabled || settings.datacenter_ip_detection_enabled)) {
      const intel = await checkIpIntel(supabase, ip);
      if (settings.vpn_proxy_detection_enabled) isVpn = intel.isVpn;
      if (settings.datacenter_ip_detection_enabled) isDatacenter = intel.isDatacenter;
      if (isVpn) reasons.push("IP matches a known VPN/proxy range");
      if (isDatacenter) reasons.push("IP matches a known datacenter range");
    }
    if (overClickFrequency) reasons.push(`Over ${settings.click_frequency_max} clicks / ${settings.click_frequency_window_seconds}s`);
    if (overImpressionFrequency) reasons.push(`Over ${settings.impression_frequency_max} impressions / ${settings.impression_frequency_window_seconds}s`);

    const riskScore = computeRiskScore({
      isBot,
      isVpn,
      isDatacenter,
      overClickFrequency,
      overImpressionFrequency,
      ruleMatch,
    });

    const blocked = ruleMatch === "blacklist" || (settings.auto_ad_disable_enabled && riskScore >= settings.auto_ad_disable_risk_threshold);
    const blockReason = ruleMatch === "blacklist" ? "Blacklisted" : reasons.length > 0 ? reasons.join("; ") : null;

    const autoBlockIp =
      settings.auto_ip_blocking_enabled && ruleMatch !== "whitelist" && Boolean(ip) && riskScore >= settings.auto_ip_blocking_risk_threshold;

    await supabase.rpc("record_ad_event", {
      p_event_type: eventType,
      p_placement: placement,
      p_path: path,
      p_visitor_id: visitorId,
      p_user_id: user?.id ?? null,
      p_ip: ip,
      p_country: country,
      p_device_type: deviceType,
      p_browser: browser,
      p_os: os,
      p_x_pct: xPct ?? null,
      p_y_pct: yPct ?? null,
      p_is_bot: isBot,
      p_bot_reasons: botSignal.reasons,
      p_is_vpn: isVpn,
      p_is_datacenter: isDatacenter,
      p_rule_match: ruleMatch,
      p_risk_score: riskScore,
      p_blocked: blocked,
      p_block_reason: blockReason,
      p_auto_block_ip: autoBlockIp,
    });

    return NextResponse.json({ blocked, reason: blocked ? blockReason : undefined });
  } catch {
    return NextResponse.json({ blocked: false });
  }
}

async function hitRateLimit(
  supabase: Awaited<ReturnType<typeof publicClient>>,
  key: string,
  windowSeconds: number,
  max: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc("hit_rate_limit", {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  // Fails open (treats as "under limit") on an RPC error — a broken
  // counter should never be why an ad slot disappears.
  if (error || typeof data !== "boolean") return true;
  return data;
}

async function checkAdRule(
  supabase: Awaited<ReturnType<typeof publicClient>>,
  ip: string | null,
  visitorId: string
): Promise<"whitelist" | "blacklist" | null> {
  const { data, error } = await supabase.rpc("check_ad_rule", { p_ip: ip, p_visitor_id: visitorId });
  if (error || (data !== "whitelist" && data !== "blacklist")) return null;
  return data;
}

async function checkIpIntel(
  supabase: Awaited<ReturnType<typeof publicClient>>,
  ip: string
): Promise<{ isVpn: boolean; isDatacenter: boolean }> {
  const { data, error } = await supabase.rpc("check_ip_intel", { p_ip: ip });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return { isVpn: false, isDatacenter: false };
  return { isVpn: Boolean(row.is_vpn), isDatacenter: Boolean(row.is_datacenter) };
}
