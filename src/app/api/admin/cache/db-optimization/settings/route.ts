import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redactSecret } from "@/lib/db-optimization-settings";
import { dbOptimizationSettingsInputSchema, firstIssueMessage } from "@/lib/validation";

/** Redacts redis_query_password before the row reaches the browser — same
 * pattern as object_cache_settings / full_page_cache_settings. */
function redactRow(data: Record<string, unknown>) {
  const { redis_query_password, ...rest } = data as Record<string, unknown> & {
    redis_query_password?: string | null;
  };
  const redacted = redactSecret(redis_query_password ?? null);
  return {
    ...rest,
    redis_query_password_set: redacted.set,
    redis_query_password_preview: redacted.preview,
  };
}

/** GET /api/admin/cache/db-optimization/settings
 * Admin-only. Loads the db_optimization_settings singleton row and
 * redacts the Redis password before responding. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("db_optimization_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load database optimisation settings." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ settings: null });
  }

  return NextResponse.json({ settings: redactRow(data as Record<string, unknown>) });
}

/** PUT /api/admin/cache/db-optimization/settings
 * Admin-only. Validates and merges the incoming partial update into the
 * singleton row. Password field handling mirrors object-cache-settings:
 *   - Omitted → unchanged.
 *   - clearRedisQueryPassword: true → set to null.
 *   - redisQueryPassword present → replace with new value. */
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

  const parsed = dbOptimizationSettingsInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }

  const input = parsed.data;

  // Build the snake_case patch object.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.id };

  if (input.redisQueryCacheEnabled   !== undefined) patch.redis_query_cache_enabled       = input.redisQueryCacheEnabled;
  if (input.redisQueryHost           !== undefined) patch.redis_query_host                = input.redisQueryHost;
  if (input.redisQueryPort           !== undefined) patch.redis_query_port                = input.redisQueryPort;
  if (input.redisQueryDatabase       !== undefined) patch.redis_query_database            = input.redisQueryDatabase;
  if (input.redisQueryTlsEnabled     !== undefined) patch.redis_query_tls_enabled         = input.redisQueryTlsEnabled;
  if (input.redisQueryUsername       !== undefined) patch.redis_query_username             = input.redisQueryUsername;
  if (input.redisQueryConnectTimeoutMs !== undefined) patch.redis_query_connect_timeout_ms = input.redisQueryConnectTimeoutMs;

  // Password handling.
  if (input.clearRedisQueryPassword) {
    patch.redis_query_password = null;
  } else if (input.redisQueryPassword) {
    patch.redis_query_password = input.redisQueryPassword;
  }

  if (input.queryCacheDefaultTtlSeconds !== undefined) patch.query_cache_default_ttl_seconds = input.queryCacheDefaultTtlSeconds;
  if (input.queryCacheKeyPrefix         !== undefined) patch.query_cache_key_prefix           = input.queryCacheKeyPrefix;
  if (input.cachedQuerySlots            !== undefined) patch.cached_query_slots               = input.cachedQuerySlots;

  if (input.preparedStatementsEnabled    !== undefined) patch.prepared_statements_enabled     = input.preparedStatementsEnabled;
  if (input.maxPreparedStatements        !== undefined) patch.max_prepared_statements         = input.maxPreparedStatements;
  if (input.statementTimeoutMs           !== undefined) patch.statement_timeout_ms            = input.statementTimeoutMs;
  if (input.lockTimeoutMs                !== undefined) patch.lock_timeout_ms                 = input.lockTimeoutMs;
  if (input.idleInTransactionTimeoutMs   !== undefined) patch.idle_in_transaction_timeout_ms  = input.idleInTransactionTimeoutMs;

  if (input.slowQueryThresholdMs    !== undefined) patch.slow_query_threshold_ms  = input.slowQueryThresholdMs;
  if (input.workMemKb               !== undefined) patch.work_mem_kb              = input.workMemKb;
  if (input.poolMode                !== undefined) patch.pool_mode                = input.poolMode;
  if (input.poolSize                !== undefined) patch.pool_size                = input.poolSize;
  if (input.explainAnalyzeEnabled   !== undefined) patch.explain_analyze_enabled  = input.explainAnalyzeEnabled;

  if (input.autoAnalyzeEnabled      !== undefined) patch.auto_analyze_enabled     = input.autoAnalyzeEnabled;
  if (input.autoAnalyzeSchedule     !== undefined) patch.auto_analyze_schedule    = input.autoAnalyzeSchedule;
  if (input.pendingReindexRequests  !== undefined) patch.pending_reindex_requests = input.pendingReindexRequests;

  const { data, error } = await supabase
    .from("db_optimization_settings")
    .update(patch)
    .eq("id", true)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to save database optimisation settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: redactRow(data as Record<string, unknown>) });
}
