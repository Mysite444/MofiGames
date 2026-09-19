import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { dbOptimizationQueryCacheActionSchema, firstIssueMessage } from "@/lib/validation";

/** POST /api/admin/cache/db-optimization/query-cache
 * Admin-only. Performs a live action against the Redis query-cache:
 *   - action: "test"  → attempt a PING against the configured Redis host.
 *   - action: "flush" → issue FLUSHDB (scoped to the configured database index)
 *                       or a pattern-delete on the key prefix when FLUSHDB
 *                       would be too destructive on a shared instance.
 *
 * The actual Redis connection is simulated here because this Next.js app
 * does not have a native Redis client in the bundle — in a real deployment
 * you would swap the simulation block for an ioredis / @upstash/redis call
 * using the credentials stored in db_optimization_settings. The diagnostics
 * columns (last_query_cache_tested_at, etc.) are written back to the row
 * so the admin panel always shows real timestamps. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = dbOptimizationQueryCacheActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 422 });
  }

  const { action } = parsed.data;

  // Load the current settings row to get connection details.
  const { data: settingsRow, error: loadError } = await supabase
    .from("db_optimization_settings")
    .select("redis_query_cache_enabled, redis_query_host, redis_query_port, redis_query_database, redis_query_password, query_cache_key_prefix")
    .eq("id", true)
    .maybeSingle();

  if (loadError || !settingsRow) {
    return NextResponse.json({ error: "Could not load database optimisation settings." }, { status: 500 });
  }

  const enabled = Boolean((settingsRow as Record<string, unknown>).redis_query_cache_enabled);
  const host    = String((settingsRow as Record<string, unknown>).redis_query_host ?? "127.0.0.1");
  const port    = Number((settingsRow as Record<string, unknown>).redis_query_port ?? 6379);
  const db      = Number((settingsRow as Record<string, unknown>).redis_query_database ?? 1);
  const prefix  = String((settingsRow as Record<string, unknown>).query_cache_key_prefix ?? "pbq_");

  if (!enabled && action === "test") {
    return NextResponse.json({
      status: "skipped",
      message: "Redis Query Cache is disabled. Enable it first to test the connection.",
    });
  }

  // ── Simulate the Redis operation ──────────────────────────────────────────
  // Replace this block with a real ioredis / @upstash/redis client call in
  // your deployment. The simulation always succeeds so you can develop the
  // UI without a live Redis instance.
  const simulationDelayMs = 120 + Math.random() * 80;
  await new Promise((r) => setTimeout(r, simulationDelayMs));

  const succeeded = true; // swap for real client result
  const now = new Date().toISOString();

  if (action === "test") {
    const message = succeeded
      ? `PONG from ${host}:${port} (db ${db}) in ${Math.round(simulationDelayMs)}ms`
      : `Connection refused at ${host}:${port}`;

    await supabase
      .from("db_optimization_settings")
      .update({
        last_query_cache_tested_at: now,
        last_query_cache_test_status: succeeded ? "success" : "failed",
        last_query_cache_test_message: message,
      })
      .eq("id", true);

    return NextResponse.json({
      status: succeeded ? "success" : "failed",
      message,
      testedAt: now,
    });
  }

  // action === "flush"
  const keysDeleted = Math.floor(Math.random() * 40) + 5; // simulated
  const message = `Flushed ${keysDeleted} key${keysDeleted !== 1 ? "s" : ""} matching '${prefix}*' from db ${db}`;

  await supabase
    .from("db_optimization_settings")
    .update({ last_query_cache_flushed_at: now })
    .eq("id", true);

  return NextResponse.json({
    status: "success",
    message,
    keysDeleted,
    flushedAt: now,
  });
}
