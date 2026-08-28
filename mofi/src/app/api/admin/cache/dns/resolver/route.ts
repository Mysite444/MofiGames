import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { dnsResolverActionSchema } from "@/lib/validation-dns-cache";
import {
  resolveWithCache,
  clearResolverCache,
  getResolverCacheStats,
  getResolverCacheEntries,
  type ResolverCacheConfig,
} from "@/lib/resolver-cache";

interface RawResolverConfigRow {
  resolver_cache_enabled: boolean;
  resolver_cache_min_ttl_seconds: number;
  resolver_cache_max_ttl_seconds: number;
  resolver_cache_max_entries: number;
}

async function loadConfig(supabase: SupabaseClient): Promise<ResolverCacheConfig> {
  const { data } = await supabase
    .from("dns_cache_settings")
    .select("resolver_cache_enabled, resolver_cache_min_ttl_seconds, resolver_cache_max_ttl_seconds, resolver_cache_max_entries")
    .eq("id", true)
    .maybeSingle();
  const row = (data as RawResolverConfigRow | null) ?? null;
  return {
    enabled: row?.resolver_cache_enabled ?? true,
    minTtlSeconds: row?.resolver_cache_min_ttl_seconds ?? 30,
    maxTtlSeconds: row?.resolver_cache_max_ttl_seconds ?? 3600,
    maxEntries: row?.resolver_cache_max_entries ?? 500,
  };
}

/** GET /api/admin/cache/dns/resolver — Admin → Cache → DNS Cache →
 * Resolver Cache. Admin-only. Returns live stats + a snapshot of every
 * entry currently cached in this server instance's in-memory resolver
 * cache (src/lib/resolver-cache.ts) — not a database read, since the
 * cache itself is deliberately never persisted. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  return NextResponse.json({ stats: getResolverCacheStats(), entries: getResolverCacheEntries() });
}

/** POST /api/admin/cache/dns/resolver — Admin-only. Two actions:
 *   "test"  → resolve a hostname (through the cache, honouring the
 *             admin-configured TTL clamps) and report whether it was a
 *             hit or a fresh lookup, with timing.
 *   "clear" → drop every cached entry and record when that happened. */
export async function POST(req: NextRequest) {
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

  const parsed = dnsResolverActionSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json({ error: firstIssue?.message ?? "Validation error." }, { status: 422 });
  }

  if (parsed.data.action === "clear") {
    const cleared = clearResolverCache();
    const now = new Date().toISOString();
    await supabase.from("dns_cache_settings").update({ resolver_cache_last_cleared_at: now, updated_by: user.id }).eq("id", true);
    return NextResponse.json({ cleared, clearedAt: now, stats: getResolverCacheStats(), entries: getResolverCacheEntries() });
  }

  // action === "test"
  const config = await loadConfig(supabase);
  const result = await resolveWithCache(parsed.data.hostname!, config);
  return NextResponse.json({ result, stats: getResolverCacheStats(), entries: getResolverCacheEntries() });
}
