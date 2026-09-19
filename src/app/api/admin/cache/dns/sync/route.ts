import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactDnsApiToken } from "@/lib/dns-cache-settings";

/** POST /api/admin/cache/dns/sync — Admin → Cache → DNS Cache →
 * "Sync to Cloudflare". Admin-only. Reads the stored dns_zone_id/
 * dns_api_token straight off the table (not through the redacted
 * mapper — this route is the one place the raw token is actually used),
 * then:
 *
 *   1. Verifies the credentials by fetching the zone itself.
 *   2. PATCHes DNSSEC on/off for the zone.
 *      https://developers.cloudflare.com/api/operations/dns-dnssec-details
 *   3. PATCHes the cname_flattening zone setting.
 *      https://developers.cloudflare.com/dns/cname-flattening/
 *
 * Every step fails soft and independently — a bad credential or an
 * unusual zone state (e.g. DNSSEC already mid-rotation) becomes a
 * "failed" entry in the summary, not a 500 for the whole request. */

const CF_API = "https://api.cloudflare.com/client/v4";
const FETCH_TIMEOUT_MS = 15000;
const DNSSEC_DOCS = "https://developers.cloudflare.com/dns/dnssec/";

interface StepResult {
  ok: boolean;
  message: string;
}

interface RawDnsRow {
  dns_zone_id: string | null;
  dns_api_token: string | null;
  dnssec_enabled: boolean;
  cname_flattening_mode: "flatten_at_root" | "flatten_all";
}

async function cf(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: boolean; status: number; json: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${CF_API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok && (json?.success ?? res.ok), status: res.status, json };
  } finally {
    clearTimeout(timeout);
  }
}

function cfErrorMessage(json: any, fallback: string): string {
  const first = json?.errors?.[0];
  if (first?.message) return `${first.message}${first.code ? ` (code ${first.code})` : ""}`;
  return fallback;
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data, error } = await supabase.from("dns_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to load DNS cache settings." }, { status: 500 });
  }
  const row = data as unknown as RawDnsRow;

  if (!row.dns_zone_id || !row.dns_api_token) {
    return NextResponse.json(
      { error: "Connect a Cloudflare Zone ID and API Token first, then sync." },
      { status: 400 }
    );
  }
  const { dns_zone_id: zoneId, dns_api_token: token } = row;

  const summary: Record<string, StepResult> = {} as Record<string, StepResult>;
  let zoneName: string | null = null;

  // 1. Verify credentials against the zone itself before touching anything.
  const zoneCheck = await cf(`/zones/${zoneId}`, token);
  if (!zoneCheck.ok) {
    const message = cfErrorMessage(zoneCheck.json, `HTTP ${zoneCheck.status}`);
    await supabase
      .from("dns_cache_settings")
      .update({
        dns_last_synced_at: new Date().toISOString(),
        dns_last_sync_status: "failed",
        dns_last_sync_summary: { zone: { ok: false, message } },
        updated_by: user.id,
      })
      .eq("id", true);
    return NextResponse.json({ error: `Could not verify this zone with Cloudflare — ${message}` }, { status: 400 });
  }
  zoneName = zoneCheck.json?.result?.name ?? null;
  summary.zone = { ok: true, message: zoneName ? `Connected to ${zoneName}` : "Zone verified" };

  // 2. DNSSEC.
  const dnssecRes = await cf(`/zones/${zoneId}/dnssec`, token, {
    method: "PATCH",
    body: { status: row.dnssec_enabled ? "active" : "disabled" },
  });
  summary.dnssec = dnssecRes.ok
    ? { ok: true, message: `DNSSEC: ${row.dnssec_enabled ? "active" : "disabled"}` }
    : { ok: false, message: `DNSSEC update failed — ${cfErrorMessage(dnssecRes.json, `HTTP ${dnssecRes.status}`)}` };

  // 3. CNAME Flattening.
  const flatteningRes = await cf(`/zones/${zoneId}/settings/cname_flattening`, token, {
    method: "PATCH",
    body: { value: row.cname_flattening_mode },
  });
  summary.cnameFlattening = flatteningRes.ok
    ? { ok: true, message: `CNAME Flattening: ${row.cname_flattening_mode}` }
    : {
        ok: false,
        message: `CNAME Flattening update failed — ${cfErrorMessage(flatteningRes.json, `HTTP ${flatteningRes.status}`)}`,
      };

  const results = Object.values(summary);
  const overall = results.every((r) => r.ok) ? "success" : results.some((r) => r.ok) ? "partial" : "failed";

  await supabase
    .from("dns_cache_settings")
    .update({
      dns_last_synced_at: new Date().toISOString(),
      dns_last_sync_status: overall,
      dns_last_sync_summary: summary,
      dns_connected_zone_name: zoneName,
      updated_by: user.id,
    })
    .eq("id", true);

  const { data: updated } = await supabase.from("dns_cache_settings").select("*").eq("id", true).maybeSingle();
  const { dns_api_token: _omit, ...rest } = (updated ?? {}) as Record<string, unknown> & { dns_api_token?: string | null };
  const redacted = redactDnsApiToken(row.dns_api_token);

  return NextResponse.json({
    status: overall,
    summary,
    docs: DNSSEC_DOCS,
    settings: { ...rest, api_token_set: redacted.apiTokenSet, api_token_preview: redacted.apiTokenPreview },
  });
}
