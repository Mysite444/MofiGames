import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiError } from "@/lib/api-error";

const SOURCES: { category: "vpn_or_proxy" | "datacenter"; url: string }[] = [
  // output/vpn: known VPN provider ranges. output/datacenter: VPNs +
  // datacenters — anything that isn't an "eyeball" (residential/mobile)
  // network. See https://github.com/X4BNet/lists_vpn for details/caveats.
  { category: "vpn_or_proxy", url: "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt" },
  { category: "datacenter", url: "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt" },
];

const CIDR_LINE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const BATCH_SIZE = 2000;

/** POST /api/admin/ads/protection/sync-ip-ranges — Admin → Ad Protection
 * → "Sync IP ranges". Fetches the current X4BNet/lists_vpn snapshot (a
 * free, no-API-key public list) and replaces ip_intel_ranges with it.
 * This is a heuristic, not a paid lookup service — expect decent but
 * imperfect coverage, and re-run this periodically since the upstream
 * list changes daily. */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let totalRanges = 0;
  const results: { category: string; count: number }[] = [];

  try {
    for (const source of SOURCES) {
      const res = await fetch(source.url, { cache: "no-store" });
      if (!res.ok) {
        return NextResponse.json({ error: `Failed to fetch ${source.category} list (HTTP ${res.status}).` }, { status: 502 });
      }
      const text = await res.text();
      const ranges = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => CIDR_LINE.test(line));

      if (ranges.length === 0) {
        return NextResponse.json({ error: `The ${source.category} list came back empty — aborting sync.` }, { status: 502 });
      }

      // Replace this category's rows wholesale rather than trying to
      // diff against tens of thousands of existing entries.
      const { error: deleteError } = await supabase.from("ip_intel_ranges").delete().eq("category", source.category);
      if (deleteError) {
        return NextResponse.json({ error: `Failed to clear old ${source.category} ranges.` }, { status: 500 });
      }

      for (let i = 0; i < ranges.length; i += BATCH_SIZE) {
        const batch = ranges.slice(i, i + BATCH_SIZE).map((range) => ({ category: source.category, range, source: "x4bnet" }));
        const { error: insertError } = await supabase.from("ip_intel_ranges").insert(batch);
        if (insertError) {
          return apiError(insertError, "Failed inserting ranges.");
        }
      }

      totalRanges += ranges.length;
      results.push({ category: source.category, count: ranges.length });
    }

    const { data: settings, error: settingsError } = await supabase
      .from("ad_protection_settings")
      .update({ ip_ranges_last_synced_at: new Date().toISOString(), ip_ranges_count: totalRanges })
      .eq("id", true)
      .select()
      .single();

    if (settingsError) {
      return NextResponse.json({ error: "Ranges synced, but failed to update settings status." }, { status: 500 });
    }

    return NextResponse.json({ results, totalRanges, settings });
  } catch {
    return NextResponse.json({ error: "Failed to sync IP intelligence ranges." }, { status: 500 });
  }
}
