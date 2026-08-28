import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { mapPurgeLogRow } from "@/lib/monitoring-cache-settings";

/** GET /api/admin/cache/monitoring/purge-logs?limit=50&offset=0
 * Admin-only. Returns a paginated list of cache_purge_logs rows,
 * newest first, with the triggering user's email joined in. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0));

  // Supabase doesn't support joins to auth.users from the client
  // directly, so we pull the log rows first and then batch-fetch the
  // triggering email from auth.users using the admin API in one call.
  const { data: rows, error, count } = await supabase
    .from("cache_purge_logs")
    .select("*", { count: "exact" })
    .order("triggered_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load cache purge logs." },
      { status: 500 },
    );
  }

  // Batch-resolve user emails. The admin API is only available server-side
  // and returns a paginated result, so we limit to the set of unique user
  // IDs from this page.
  const userIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => r.triggered_by as string | null)
        .filter((id): id is string => id !== null),
    ),
  ];

  const emailMap = new Map<string, string>();

  if (userIds.length > 0) {
    try {
      const { data: usersData } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      if (usersData?.users) {
        for (const u of usersData.users) {
          if (u.email) emailMap.set(u.id, u.email);
        }
      }
    } catch {
      // If the admin API call fails, emails just stay blank.
    }
  }

  const logs = (rows ?? []).map((row) => {
    const email =
      typeof row.triggered_by === "string"
        ? (emailMap.get(row.triggered_by) ?? null)
        : null;
    return mapPurgeLogRow({ ...row, triggered_by_email: email });
  });

  return NextResponse.json({ logs, total: count ?? 0, limit, offset });
}
