import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiCacheSettingsInputSchema } from "@/lib/validation-api-cache";

/** GET /api/admin/cache/api-cache/settings
 * Admin-only read of the singleton api_cache_settings row.
 * Unlike browser/fragment cache settings, this row is admin-only on reads
 * too — it describes internal architectural bypass and ETag behaviour that
 * doesn't need to be visible on the public request path. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("api_cache_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load API Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? null });
}

/** PUT /api/admin/cache/api-cache/settings
 * Admin-only. Validates and applies a partial update to the singleton row.
 * All fields are optional so the client can send only what changed. */
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = apiCacheSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }

  const input = parsed.data;

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    updated_by: user.id,
  };

  if (input.enabled !== undefined)                       patch.enabled = input.enabled;
  if (input.restEnabled !== undefined)                   patch.rest_enabled = input.restEnabled;
  if (input.graphqlEnabled !== undefined)                patch.graphql_enabled = input.graphqlEnabled;
  if (input.jsonResponseEnabled !== undefined)           patch.json_response_enabled = input.jsonResponseEnabled;
  if (input.defaultTtlSeconds !== undefined)             patch.default_ttl_seconds = input.defaultTtlSeconds;
  if (input.staleWhileRevalidateSeconds !== undefined)   patch.stale_while_revalidate_seconds = input.staleWhileRevalidateSeconds;
  if (input.bypassAuthenticated !== undefined)           patch.bypass_authenticated = input.bypassAuthenticated;
  if (input.bypassQueryString !== undefined)             patch.bypass_query_string = input.bypassQueryString;
  if (input.varyByAccept !== undefined)                  patch.vary_by_accept = input.varyByAccept;
  if (input.varyByOrigin !== undefined)                  patch.vary_by_origin = input.varyByOrigin;
  if (input.varyByAcceptEncoding !== undefined)          patch.vary_by_accept_encoding = input.varyByAcceptEncoding;
  if (input.endpointRules !== undefined)                 patch.endpoint_rules = input.endpointRules;
  if (input.conditionalRequestsEnabled !== undefined)    patch.conditional_requests_enabled = input.conditionalRequestsEnabled;
  if (input.etagEnabled !== undefined)                   patch.etag_enabled = input.etagEnabled;
  if (input.etagAlgorithm !== undefined)                 patch.etag_algorithm = input.etagAlgorithm;
  if (input.etagWeak !== undefined)                      patch.etag_weak = input.etagWeak;
  if (input.lastModifiedEnabled !== undefined)           patch.last_modified_enabled = input.lastModifiedEnabled;
  if (input.lastModifiedGranularitySeconds !== undefined)
    patch.last_modified_granularity_seconds = input.lastModifiedGranularitySeconds;

  const { data, error } = await supabase
    .from("api_cache_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to save API Cache settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
