import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

type Status = "pass" | "warn" | "fail";
interface CheckResult {
  id: string;
  label: string;
  status: Status;
  detail: string;
}

/** GET /api/admin/ads/protection/placement-check — Admin → Ad Protection
 * → Ad Placement Validation. A configuration/policy checklist derived
 * from the current ad_settings (migration 0023) and ad_protection_settings
 * (migration 0024) — no external ad-network review API involved, this is
 * self-review against widely-known ad policy norms (Google's Better Ads
 * Standards: dismissible anchors, reasonable interstitial frequency, no
 * empty/broken slots) plus this app's own protection coverage. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const [adSettingsResult, protectionSettingsResult] = await Promise.all([
    supabase.from("ad_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("ad_protection_settings").select("*").eq("id", true).maybeSingle(),
  ]);

  const adRaw = adSettingsResult.data;
  const protection = protectionSettingsResult.data;

  if (!adRaw || !protection) {
    return NextResponse.json({ error: "Ad settings not found." }, { status: 500 });
  }
  const ad = adRaw as Record<string, unknown> & {
    adsense_enabled: boolean;
    adsense_client_id: string | null;
    adsense_auto_ads: boolean;
    custom_html_ads_enabled: boolean;
    custom_html_ads_code: string | null;
    sticky_ads_enabled: boolean;
    sticky_ads_dismissible: boolean;
    ingame_ads_enabled: boolean;
    ingame_ads_frequency: number;
    header_ads_enabled: boolean;
    sidebar_ads_enabled: boolean;
    footer_ads_enabled: boolean;
    reward_ads_enabled: boolean;
  };

  const checks: CheckResult[] = [];

  const check = (id: string, label: string, status: Status, detail: string) => checks.push({ id, label, status, detail });

  // --- Empty/broken slot checks -------------------------------------
  if (ad.adsense_enabled && !ad.adsense_client_id) {
    check("adsense-client-id", "AdSense client ID", "fail", "AdSense is enabled but no client ID is set — auto ads won't render.");
  } else if (ad.adsense_enabled) {
    check("adsense-client-id", "AdSense client ID", "pass", "AdSense client ID is set.");
  }

  const slotChecks: { key: string; slotKey: string; codeKey: string; label: string }[] = [
    { key: "header_ads_enabled", slotKey: "header_ads_slot_id", codeKey: "header_ads_code", label: "Header ad" },
    { key: "sidebar_ads_enabled", slotKey: "sidebar_ads_slot_id", codeKey: "sidebar_ads_code", label: "Sidebar ad" },
    { key: "ingame_ads_enabled", slotKey: "ingame_ads_slot_id", codeKey: "ingame_ads_code", label: "In-game ad" },
    { key: "footer_ads_enabled", slotKey: "footer_ads_slot_id", codeKey: "footer_ads_code", label: "Footer ad" },
    { key: "sticky_ads_enabled", slotKey: "sticky_ads_slot_id", codeKey: "sticky_ads_code", label: "Sticky ad" },
    { key: "reward_ads_enabled", slotKey: "reward_ads_slot_id", codeKey: "reward_ads_code", label: "Reward ad" },
  ];
  for (const s of slotChecks) {
    if (ad[s.key] && !ad[s.slotKey] && !ad[s.codeKey] && !ad.adsense_auto_ads) {
      check(`${s.key}-empty`, `${s.label} placement`, "warn", `${s.label} is enabled but has no slot ID, custom code, or AdSense auto ads — it may render an empty container.`);
    }
  }
  if (ad.custom_html_ads_enabled && !ad.custom_html_ads_code) {
    check("custom-html-empty", "Custom HTML ad", "fail", "Custom HTML ads are enabled but no code is set.");
  }

  // --- Better Ads Standards-style checks -----------------------------
  if (ad.sticky_ads_enabled && !ad.sticky_ads_dismissible) {
    check("sticky-dismissible", "Sticky ad dismissible", "warn", "Sticky/anchor ads should let visitors dismiss them — non-dismissible anchors are a common ad-experience complaint.");
  } else if (ad.sticky_ads_enabled) {
    check("sticky-dismissible", "Sticky ad dismissible", "pass", "Sticky ad can be dismissed.");
  }

  if (ad.ingame_ads_enabled && ad.ingame_ads_frequency < 2) {
    check("ingame-frequency", "In-game ad frequency", "warn", `Showing an interstitial every ${ad.ingame_ads_frequency} play(s) is aggressive — raises both UX complaints and accidental-click risk.`);
  } else if (ad.ingame_ads_enabled) {
    check("ingame-frequency", "In-game ad frequency", "pass", `Interstitial every ${ad.ingame_ads_frequency} plays is a reasonable cadence.`);
  }

  const enabledPlacementCount = [
    ad.header_ads_enabled,
    ad.sidebar_ads_enabled,
    ad.ingame_ads_enabled,
    ad.footer_ads_enabled,
    ad.sticky_ads_enabled,
    ad.reward_ads_enabled,
    ad.custom_html_ads_enabled,
  ].filter(Boolean).length;
  if (enabledPlacementCount >= 6) {
    check("ad-density", "Overall ad density", "warn", `${enabledPlacementCount} of 7 possible placements are enabled at once — dense ad layouts risk violating "ads density" policies on some networks.`);
  } else {
    check("ad-density", "Overall ad density", "pass", `${enabledPlacementCount} of 7 possible placements enabled.`);
  }

  // --- Protection coverage checks -------------------------------------
  const anyAdsEnabled = enabledPlacementCount > 0 || ad.adsense_enabled;
  if (anyAdsEnabled && !protection.invalid_click_detection_enabled) {
    check("invalid-click-coverage", "Invalid Click Detection", "warn", "Ads are running but Invalid Click Detection is off — consider enabling it to reduce the risk of invalid-traffic account penalties.");
  } else if (anyAdsEnabled) {
    check("invalid-click-coverage", "Invalid Click Detection", "pass", "Invalid Click Detection is active.");
  }

  if (protection.auto_ip_blocking_enabled && !protection.bot_detection_enabled && !protection.vpn_proxy_detection_enabled && !protection.datacenter_ip_detection_enabled) {
    check("auto-block-coverage", "Auto IP Blocking coverage", "warn", "Auto IP Blocking is on, but every signal that could feed it (bot, VPN/proxy, datacenter detection) is off — it will never actually trigger.");
  }

  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;

  return NextResponse.json({
    checks,
    summary: { failCount, warnCount, passCount: checks.length - failCount - warnCount },
  });
}
