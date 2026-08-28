import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactDnsApiToken } from "@/lib/dns-cache-settings";
import { dnsCacheSettingsInputSchema } from "@/lib/validation-dns-cache";

/** GET /api/admin/cache/dns/settings — Admin → Cache → DNS Cache.
 * Admin-only (unlike /api/dns-prefetch/settings): this row can hold a
 * live Cloudflare API token, so it never gets the "publicly readable"
 * treatment dns_prefetch_settings has. The token itself never leaves
 * this route — it's redacted to a boolean + short preview first. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("dns_cache_settings").select("*").eq("id", true).maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load DNS cache settings." }, { status: 500 });
  }

  const { dns_api_token, ...rest } = (data ?? {}) as Record<string, unknown> & { dns_api_token?: string | null };
  const redacted = redactDnsApiToken(dns_api_token ?? null);

  return NextResponse.json({
    settings: data ? { ...rest, api_token_set: redacted.apiTokenSet, api_token_preview: redacted.apiTokenPreview } : null,
  });
}

/** PUT /api/admin/cache/dns/settings — Admin → Cache → DNS Cache.
 * Admin-only. apiToken blank/omitted leaves the stored token untouched
 * (so re-saving other fields never accidentally wipes it); the only way
 * to actually clear zoneId/apiToken is clearCredentials: true. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = dnsCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }
  const input = parsed.data;

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };

  if (input.clearCredentials) {
    patch.dns_zone_id = null;
    patch.dns_api_token = null;
    patch.dns_connected_zone_name = null;
    patch.dns_last_synced_at = null;
    patch.dns_last_sync_status = null;
    patch.dns_last_sync_summary = null;
  } else {
    if (input.zoneId !== undefined) patch.dns_zone_id = input.zoneId || null;
    if (input.apiToken) patch.dns_api_token = input.apiToken; // blank/omitted → unchanged
  }

  if (input.dnssecEnabled !== undefined) patch.dnssec_enabled = input.dnssecEnabled;
  if (input.cnameFlatteningMode !== undefined) patch.cname_flattening_mode = input.cnameFlatteningMode;

  if (input.resolverCacheEnabled !== undefined) patch.resolver_cache_enabled = input.resolverCacheEnabled;
  if (input.resolverCacheMinTtlSeconds !== undefined) patch.resolver_cache_min_ttl_seconds = input.resolverCacheMinTtlSeconds;
  if (input.resolverCacheMaxTtlSeconds !== undefined) patch.resolver_cache_max_ttl_seconds = input.resolverCacheMaxTtlSeconds;
  if (input.resolverCacheMaxEntries !== undefined) patch.resolver_cache_max_entries = input.resolverCacheMaxEntries;

  if (input.osDnsRunbookNotes !== undefined) patch.os_dns_runbook_notes = input.osDnsRunbookNotes;

  const { data, error } = await supabase
    .from("dns_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update DNS cache settings." }, { status: 500 });
  }

  const { dns_api_token, ...rest } = data as Record<string, unknown> & { dns_api_token?: string | null };
  const redacted = redactDnsApiToken(dns_api_token ?? null);

  return NextResponse.json({
    settings: { ...rest, api_token_set: redacted.apiTokenSet, api_token_preview: redacted.apiTokenPreview },
  });
}
