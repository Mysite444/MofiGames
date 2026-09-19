import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactApiToken } from "@/lib/cdn-cache-settings";

/** POST /api/admin/cache/cdn/sync — Admin → Cache → CDN / Edge Cache →
 * "Sync to Cloudflare". Admin-only. Reads the stored zone_id/api_token
 * and feature toggles straight off the table (not through the redacted
 * mapper — this route is the one place the raw token is actually used),
 * then:
 *
 *   1. Verifies the credentials by fetching the zone itself.
 *   2. PATCHes the handful of Cloudflare zone settings that map
 *      one-to-one to a toggle here (Brotli, HTTP/3, Early Hints, Image
 *      Resizing).
 *   3. Replaces the *entire* http_request_cache_settings phase ruleset
 *      for the zone with rules generated from Smart Cache Rules / Cache
 *      Everything / Cache by Device / Cache by Query String. This is a
 *      full PUT, not a merge — if you've hand-built other Cache Rules
 *      for this zone in the Cloudflare dashboard, syncing from here
 *      will overwrite them. That's a deliberate trade-off for keeping
 *      this simple rather than trying to reconcile two sources of
 *      truth; if that's a problem, manage Cache Rules by hand instead
 *      and leave the toggles below off.
 *
 * Every step fails soft and independently — one bad credential or a
 * plan-gated setting (Image Resizing needs a paid add-on on many plans)
 * becomes a "failed" entry in the summary, not a 500 for the whole
 * request. See CACHE_KEY_DOCS / CACHE_RULES_DOCS below for the exact
 * Cloudflare endpoints this hits. */

const CF_API = "https://api.cloudflare.com/client/v4";
const FETCH_TIMEOUT_MS = 15000;
// https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/
const CACHE_RULES_DOCS = "https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/";

interface StepResult {
  ok: boolean;
  message: string;
  skipped?: boolean;
}

interface RawCdnRow {
  zone_id: string | null;
  api_token: string | null;
  edge_caching_enabled: boolean;
  smart_cache_rules_enabled: boolean;
  cache_everything_enabled: boolean;
  cache_everything_paths: string[] | null;
  cache_by_device_enabled: boolean;
  cache_by_query_string_mode: "ignore_all" | "include_all" | "include_list";
  cache_by_query_string_params: string[] | null;
  image_cdn_enabled: boolean;
  brotli_enabled: boolean;
  http3_enabled: boolean;
  early_hints_enabled: boolean;
  edge_ttl_seconds: number;
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

/** One PATCH per simple on/off zone setting. Cloudflare exposes these
 * individually (no bulk endpoint for just this subset), so each is its
 * own request and its own pass/fail. */
async function syncZoneSetting(
  zoneId: string,
  token: string,
  setting: string,
  value: "on" | "off",
  label: string
): Promise<StepResult> {
  const res = await cf(`/zones/${zoneId}/settings/${setting}`, token, { method: "PATCH", body: { value } });
  if (res.ok) return { ok: true, message: `${label}: ${value}` };
  return { ok: false, message: `${label} failed — ${cfErrorMessage(res.json, `HTTP ${res.status}`)}` };
}

/** Builds the http_request_cache_settings phase ruleset from the
 * feature toggles. See CACHE_RULES_DOCS for the shape this mirrors.
 * Returns an empty array when nothing is configured, which — pushed as
 * an empty `rules` PUT — clears any rules this app previously deployed
 * and leaves caching entirely up to Cloudflare's zone-level defaults. */
function buildCacheRules(row: RawCdnRow) {
  const rules: Array<{ expression: string; description: string; action: string; action_parameters: Record<string, unknown> }> = [];

  if (row.smart_cache_rules_enabled) {
    rules.push({
      expression: '(starts_with(http.request.uri.path, "/admin") or starts_with(http.request.uri.path, "/api"))',
      description: "Smart Cache Rules — never cache admin or API routes",
      action: "set_cache_settings",
      action_parameters: { cache: false },
    });
  }

  if (row.cache_everything_enabled) {
    for (const pattern of row.cache_everything_paths ?? []) {
      const trimmed = pattern.trim();
      if (!trimmed) continue;
      rules.push({
        expression: `wildcard(http.request.uri.path, "${trimmed.replace(/"/g, '\\"')}")`,
        description: `Cache Everything — ${trimmed}`,
        action: "set_cache_settings",
        action_parameters: {
          cache: true,
          edge_ttl: { mode: "override_origin", default: row.edge_ttl_seconds },
        },
      });
    }
  }

  const needsCustomKey = row.cache_by_device_enabled || row.cache_by_query_string_mode !== "include_all";
  if (needsCustomKey) {
    const customKey: Record<string, unknown> = {};

    if (row.cache_by_query_string_mode === "ignore_all") {
      customKey.query_string = { exclude: ["*"] };
    } else if (row.cache_by_query_string_mode === "include_list") {
      customKey.query_string = { include: row.cache_by_query_string_params ?? [] };
    }
    // "include_all" needs no override — that's Cloudflare's own default.

    if (row.cache_by_device_enabled) {
      customKey.user = { device_type: true };
    }

    rules.push({
      expression: "true",
      description: "Cache by Device / Cache by Query String — custom cache key",
      action: "set_cache_settings",
      action_parameters: {
        cache_key: { ignore_query_strings_order: true, custom_key: customKey },
      },
    });
  }

  return rules;
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data, error } = await supabase.from("cdn_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to load CDN cache settings." }, { status: 500 });
  }
  const row = data as unknown as RawCdnRow;

  if (!row.zone_id || !row.api_token) {
    return NextResponse.json(
      { error: "Connect a Cloudflare Zone ID and API Token first, then sync." },
      { status: 400 }
    );
  }
  const { zone_id: zoneId, api_token: token } = row;

  const summary: Record<string, StepResult> = {} as Record<string, StepResult>;
  let zoneName: string | null = null;

  // 1. Verify credentials against the zone itself before touching anything.
  const zoneCheck = await cf(`/zones/${zoneId}`, token);
  if (!zoneCheck.ok) {
    const message = cfErrorMessage(zoneCheck.json, `HTTP ${zoneCheck.status}`);
    await supabase
      .from("cdn_cache_settings")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "failed",
        last_sync_summary: { zone: { ok: false, message } },
        updated_by: user.id,
      })
      .eq("id", true);
    return NextResponse.json({ error: `Could not verify this zone with Cloudflare — ${message}` }, { status: 400 });
  }
  zoneName = zoneCheck.json?.result?.name ?? null;
  summary.zone = { ok: true, message: zoneName ? `Connected to ${zoneName}` : "Zone verified" };

  // 2. Simple on/off zone settings.
  if (row.edge_caching_enabled) {
    summary.brotli = await syncZoneSetting(zoneId, token, "brotli", row.brotli_enabled ? "on" : "off", "Brotli Compression");
    summary.http3 = await syncZoneSetting(zoneId, token, "http3", row.http3_enabled ? "on" : "off", "HTTP/3");
    summary.earlyHints = await syncZoneSetting(
      zoneId,
      token,
      "early_hints",
      row.early_hints_enabled ? "on" : "off",
      "Early Hints (103)"
    );
    summary.imageCdn = await syncZoneSetting(
      zoneId,
      token,
      "image_resizing",
      row.image_cdn_enabled ? "on" : "off",
      "Image CDN (Image Resizing)"
    );
  } else {
    summary.brotli = { ok: true, skipped: true, message: "Skipped — Edge Caching is off" };
    summary.http3 = { ok: true, skipped: true, message: "Skipped — Edge Caching is off" };
    summary.earlyHints = { ok: true, skipped: true, message: "Skipped — Edge Caching is off" };
    summary.imageCdn = { ok: true, skipped: true, message: "Skipped — Edge Caching is off" };
  }

  // 3. Cache Rules — full replace of the phase entry point ruleset.
  const rules = row.edge_caching_enabled ? buildCacheRules(row) : [];
  const rulesetRes = await cf(`/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`, token, {
    method: "PUT",
    body: { rules },
  });
  summary.cacheRules = rulesetRes.ok
    ? {
        ok: true,
        message:
          rules.length === 0
            ? "No Cache Rules configured — cleared, falling back to zone defaults"
            : `${rules.length} rule${rules.length === 1 ? "" : "s"} deployed`,
      }
    : { ok: false, message: `Cache Rules deploy failed — ${cfErrorMessage(rulesetRes.json, `HTTP ${rulesetRes.status}`)}` };

  const results = Object.values(summary);
  const overall = results.every((r) => r.ok)
    ? "success"
    : results.some((r) => r.ok && !r.skipped)
      ? "partial"
      : "failed";

  await supabase
    .from("cdn_cache_settings")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: overall,
      last_sync_summary: summary,
      connected_zone_name: zoneName,
      updated_by: user.id,
    })
    .eq("id", true);

  const { data: updated } = await supabase.from("cdn_cache_settings").select("*").eq("id", true).maybeSingle();
  const { api_token: _omit, ...rest } = (updated ?? {}) as Record<string, unknown> & { api_token?: string | null };
  const redacted = redactApiToken(row.api_token);

  return NextResponse.json({
    status: overall,
    summary,
    docs: CACHE_RULES_DOCS,
    settings: { ...rest, api_token_set: redacted.apiTokenSet, api_token_preview: redacted.apiTokenPreview },
  });
}
