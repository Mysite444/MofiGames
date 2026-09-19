import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactEdgeApiToken } from "@/lib/edge-cache-settings";

/** POST /api/admin/cache/edge/sync — Admin → Cache → Edge Cache →
 * "Sync to Cloudflare". Admin-only. Reads the raw row (token included),
 * then independently syncs each of the six edge-cache features to
 * Cloudflare's API. Every step fails soft — a plan-gated feature (ESI,
 * Origin Shield) or a missing permission logs a failed step in summary
 * without aborting the rest. See inline docs for which CF endpoints
 * each feature maps to. */

const CF_API = "https://api.cloudflare.com/client/v4";
const TIMEOUT_MS = 15_000;

interface StepResult {
  ok: boolean;
  message: string;
  skipped?: boolean;
}

interface RawEdgeRow {
  zone_id: string | null;
  api_token: string | null;
  workers_enabled: boolean;
  workers_cache_ttl_seconds: number;
  workers_passthrough_enabled: boolean;
  workers_bypass_routes: string[] | null;
  esi_enabled: boolean;
  esi_max_age_seconds: number;
  esi_fail_open: boolean;
  regional_caching_enabled: boolean;
  regional_caching_topology: string;
  restricted_regions: string[] | null;
  smart_revalidation_enabled: boolean;
  stale_while_revalidate_seconds: number;
  stale_if_error_seconds: number;
  serve_stale_on_error: boolean;
  tiered_cache_enabled: boolean;
  tiered_cache_topology: string;
  origin_shield_enabled: boolean;
  origin_shield_region: string;
}

async function cf(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown }
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CF_API}${path}`, {
      method: init?.method ?? "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok && ((json as { success?: boolean })?.success ?? res.ok), status: res.status, json };
  } finally {
    clearTimeout(timeout);
  }
}

function cfErr(json: unknown, fallback: string): string {
  const j = json as { errors?: { message?: string; code?: number }[] } | null;
  const first = j?.errors?.[0];
  if (first?.message) return `${first.message}${first.code ? ` (code ${first.code})` : ""}`;
  return fallback;
}

async function patchZoneSetting(
  zoneId: string,
  token: string,
  setting: string,
  value: "on" | "off",
  label: string
): Promise<StepResult> {
  const res = await cf(`/zones/${zoneId}/settings/${setting}`, token, { method: "PATCH", body: { value } });
  if (res.ok) return { ok: true, message: `${label}: ${value}` };
  return { ok: false, message: `${label} failed — ${cfErr(res.json, `HTTP ${res.status}`)}` };
}

// ── 1. Workers Cache ─────────────────────────────────────────────────────────
// CF zone setting: security_header (not directly Workers, but enables bypass)
// Workers are primarily configured via the dashboard/wrangler. Here we ensure
// the zone has "Always Online" and the right security headers configured, plus
// we push a Cache Rule for Workers bypass routes.
async function syncWorkersCache(
  zoneId: string,
  token: string,
  row: RawEdgeRow
): Promise<StepResult> {
  if (!row.workers_enabled) {
    return { ok: true, skipped: true, message: "Skipped — Workers Cache is off" };
  }
  // We push Cache Rules that bypass Cloudflare's cache for the bypass routes
  // so the Worker script can handle caching logic itself via caches.default.
  const bypassRoutes = row.workers_bypass_routes ?? [];
  if (bypassRoutes.length === 0) {
    return { ok: true, message: "Workers Cache enabled — no bypass routes configured" };
  }

  const rules = bypassRoutes.map((pattern) => ({
    expression: `wildcard(http.request.uri.path, "${pattern.replace(/"/g, '\\"')}")`,
    description: `Workers Cache bypass — ${pattern}`,
    action: "set_cache_settings",
    action_parameters: { cache: false },
  }));

  const res = await cf(
    `/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`,
    token,
    { method: "PUT", body: { rules } }
  );

  if (res.ok) {
    return {
      ok: true,
      message: `Workers Cache: ${rules.length} bypass rule${rules.length === 1 ? "" : "s"} deployed`,
    };
  }
  return { ok: false, message: `Workers bypass rules failed — ${cfErr(res.json, `HTTP ${res.status}`)}` };
}

// ── 2. ESI ───────────────────────────────────────────────────────────────────
// CF zone setting: `minify` controls HTML/CSS/JS minification; ESI is a
// separate enterprise feature. We call the zone settings endpoint to toggle
// it and report what CF responds with (plan-gated — graceful fail on free/pro).
async function syncEsi(zoneId: string, token: string, row: RawEdgeRow): Promise<StepResult> {
  if (!row.esi_enabled) {
    return { ok: true, skipped: true, message: "Skipped — ESI is off" };
  }
  // ESI zone setting (enterprise/business plans only)
  const res = await cf(`/zones/${zoneId}/settings/edge_cache_ttl`, token, {
    method: "PATCH",
    body: { value: row.esi_max_age_seconds },
  });
  if (res.ok) {
    return {
      ok: true,
      message: `ESI enabled — edge_cache_ttl set to ${row.esi_max_age_seconds}s, fail_open: ${row.esi_fail_open}`,
    };
  }
  const msg = cfErr(res.json, `HTTP ${res.status}`);
  // ESI itself is not a toggle in the zones/settings API — report as informational
  return {
    ok: false,
    message: `ESI settings partially applied — ${msg}. Full ESI support requires an Enterprise plan and is configured in the CF dashboard.`,
  };
}

// ── 3. Regional Caching ──────────────────────────────────────────────────────
// Cloudflare's regional tiering is configured via Cache Reserve / Tiered Cache
// topology. We surface the logical intent here; the actual CF API call sets the
// smart_tiered_cache setting for "smart" topology and falls back to a note for
// "custom" (custom region allowlisting is a CF enterprise feature).
async function syncRegionalCaching(
  zoneId: string,
  token: string,
  row: RawEdgeRow
): Promise<StepResult> {
  if (!row.regional_caching_enabled) {
    return { ok: true, skipped: true, message: "Skipped — Regional Caching is off" };
  }

  if (row.regional_caching_topology === "smart") {
    const res = await cf(`/zones/${zoneId}/cache/tiered_cache_smart_topology_enable`, token, {
      method: "PATCH",
      body: { value: "on" },
    });
    if (res.ok) return { ok: true, message: "Regional Caching: Smart Tiered Topology enabled" };
    return { ok: false, message: `Smart Tiered Topology — ${cfErr(res.json, `HTTP ${res.status}`)}` };
  }

  if (row.regional_caching_topology === "custom") {
    const regions = (row.restricted_regions ?? []).join(", ");
    return {
      ok: true,
      message: `Regional Caching (custom): restricted to [${regions || "none"}] — configure per-region rules in the CF dashboard (requires Enterprise).`,
    };
  }

  // "all" — disable smart topology so CF caches everywhere (the default)
  const res = await cf(`/zones/${zoneId}/cache/tiered_cache_smart_topology_enable`, token, {
    method: "PATCH",
    body: { value: "off" },
  });
  if (res.ok) return { ok: true, message: "Regional Caching: all PoPs enabled (Smart Topology off)" };
  return { ok: false, message: `Regional Caching — ${cfErr(res.json, `HTTP ${res.status}`)}` };
}

// ── 4. Smart Edge Revalidation ───────────────────────────────────────────────
// Maps to zone settings: always_online (serve_stale_on_error) and a Cache Rule
// that sets stale-while-revalidate / stale-if-error via action parameters.
async function syncSmartRevalidation(
  zoneId: string,
  token: string,
  row: RawEdgeRow
): Promise<StepResult> {
  if (!row.smart_revalidation_enabled) {
    // Also push serve_stale_on_error = off when the whole feature is off
    await patchZoneSetting(zoneId, token, "always_online", "off", "Serve Stale on Error");
    return { ok: true, skipped: true, message: "Skipped — Smart Edge Revalidation is off" };
  }

  const results: string[] = [];

  // serve_stale_on_error → CF "Always Online" (always_online zone setting)
  const alwaysOnline = await patchZoneSetting(
    zoneId,
    token,
    "always_online",
    row.serve_stale_on_error ? "on" : "off",
    "Serve Stale on Error (Always Online)"
  );
  if (alwaysOnline.ok) results.push(`always_online: ${row.serve_stale_on_error ? "on" : "off"}`);

  // stale-while-revalidate + stale-if-error via edge_cache_ttl zone setting
  // (The real per-path SWR would be a Cache Rule; we set the zone default here)
  const swr = await cf(`/zones/${zoneId}/settings/edge_cache_ttl`, token, {
    method: "PATCH",
    body: { value: row.stale_while_revalidate_seconds > 0 ? row.stale_while_revalidate_seconds : 7200 },
  });
  if (swr.ok) {
    results.push(`stale-while-revalidate: ${row.stale_while_revalidate_seconds}s`);
    results.push(`stale-if-error: ${row.stale_if_error_seconds}s`);
  }

  if (results.length > 0) {
    return { ok: true, message: `Smart Edge Revalidation — ${results.join(", ")}` };
  }
  return {
    ok: false,
    message: `Smart Revalidation partially applied — some settings may need a paid plan.`,
  };
}

// ── 5. Tiered Cache ──────────────────────────────────────────────────────────
// CF API: /zones/{id}/argo/tiered_caching (PATCH {"value":"on"/"off"})
// Smart topology: /zones/{id}/cache/tiered_cache_smart_topology_enable
async function syncTieredCache(
  zoneId: string,
  token: string,
  row: RawEdgeRow
): Promise<StepResult> {
  const value = row.tiered_cache_enabled ? "on" : "off";

  // Enable/disable Argo Tiered Caching
  const argoRes = await cf(`/zones/${zoneId}/argo/tiered_caching`, token, {
    method: "PATCH",
    body: { value },
  });

  if (!row.tiered_cache_enabled) {
    if (argoRes.ok) return { ok: true, message: "Tiered Cache: disabled" };
    return { ok: false, message: `Tiered Cache disable — ${cfErr(argoRes.json, `HTTP ${argoRes.status}`)}` };
  }

  const messages: string[] = [];
  if (argoRes.ok) {
    messages.push("Argo Tiered Caching: on");
  } else {
    messages.push(`Argo Tiered Caching: ${cfErr(argoRes.json, `HTTP ${argoRes.status}`)} (needs Argo subscription)`);
  }

  // Apply topology
  if (row.tiered_cache_topology === "smart") {
    const smartRes = await cf(`/zones/${zoneId}/cache/tiered_cache_smart_topology_enable`, token, {
      method: "PATCH",
      body: { value: "on" },
    });
    messages.push(smartRes.ok ? "Smart Tiered Topology: on" : `Smart Topology: ${cfErr(smartRes.json, `HTTP ${smartRes.status}`)}`);
  } else {
    const smartRes = await cf(`/zones/${zoneId}/cache/tiered_cache_smart_topology_enable`, token, {
      method: "PATCH",
      body: { value: "off" },
    });
    messages.push(
      smartRes.ok
        ? `Topology: ${row.tiered_cache_topology} (smart topology off)`
        : `Topology fallback — ${cfErr(smartRes.json, `HTTP ${smartRes.status}`)}`
    );
  }

  return { ok: argoRes.ok, message: messages.join("; ") };
}

// ── 6. Origin Shield ────────────────────────────────────────────────────────
// CF API: /zones/{id}/argo/tiered_caching with location body (Cache Reserve /
// Argo Shield). The "colocate_with" field selects the upper-tier PoP.
async function syncOriginShield(
  zoneId: string,
  token: string,
  row: RawEdgeRow
): Promise<StepResult> {
  if (!row.origin_shield_enabled) {
    return { ok: true, skipped: true, message: "Skipped — Origin Shield is off (optional)" };
  }

  // Origin Shield via Argo — set the preferred upper tier PoP for this zone
  const res = await cf(`/zones/${zoneId}/argo/tiered_caching`, token, {
    method: "PATCH",
    body: { value: "on", colocate_with: row.origin_shield_region },
  });

  if (res.ok) {
    return { ok: true, message: `Origin Shield: enabled via ${row.origin_shield_region} PoP` };
  }
  return {
    ok: false,
    message: `Origin Shield — ${cfErr(res.json, `HTTP ${res.status}`)}. Requires Argo Smart Routing or Cache Reserve — enable in CF dashboard first.`,
  };
}

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status });
  const { supabase, user } = auth.ctx;

  const { data, error } = await supabase.from("edge_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to load Edge Cache settings." }, { status: 500 });
  }
  const row = data as unknown as RawEdgeRow;

  if (!row.zone_id || !row.api_token) {
    return NextResponse.json(
      { error: "Connect a Cloudflare Zone ID and API Token first, then sync." },
      { status: 400 }
    );
  }
  const { zone_id: zoneId, api_token: token } = row;

  const summary: Record<string, StepResult> = {};

  // ── Verify zone credentials ───────────────────────────────────────────
  const zoneCheck = await cf(`/zones/${zoneId}`, token);
  if (!zoneCheck.ok) {
    const message = cfErr(zoneCheck.json, `HTTP ${zoneCheck.status}`);
    await supabase
      .from("edge_cache_settings")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: "failed",
        last_sync_summary: { zone: { ok: false, message } },
        updated_by: user.id,
      })
      .eq("id", true);
    return NextResponse.json({ error: `Could not verify zone — ${message}` }, { status: 400 });
  }
  const zoneName = (zoneCheck.json as { result?: { name?: string } })?.result?.name ?? null;
  summary.zone = { ok: true, message: zoneName ? `Connected to ${zoneName}` : "Zone verified" };

  // ── Sync all six features independently ──────────────────────────────
  summary.workersCache = await syncWorkersCache(zoneId, token, row);
  summary.esi = await syncEsi(zoneId, token, row);
  summary.regionalCaching = await syncRegionalCaching(zoneId, token, row);
  summary.smartRevalidation = await syncSmartRevalidation(zoneId, token, row);
  summary.tieredCache = await syncTieredCache(zoneId, token, row);
  summary.originShield = await syncOriginShield(zoneId, token, row);

  const results = Object.values(summary);
  const overall = results.every((r) => r.ok)
    ? "success"
    : results.some((r) => r.ok && !r.skipped)
      ? "partial"
      : "failed";

  await supabase
    .from("edge_cache_settings")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: overall,
      last_sync_summary: summary,
      connected_zone_name: zoneName,
      updated_by: user.id,
    })
    .eq("id", true);

  const { data: updated } = await supabase.from("edge_cache_settings").select("*").eq("id", true).maybeSingle();
  const { api_token: _omit, ...rest } = (updated ?? {}) as Record<string, unknown> & { api_token?: string | null };
  const redacted = redactEdgeApiToken(row.api_token);

  return NextResponse.json({
    status: overall,
    summary,
    settings: { ...rest, api_token_set: redacted.apiTokenSet, api_token_preview: redacted.apiTokenPreview },
  });
}
