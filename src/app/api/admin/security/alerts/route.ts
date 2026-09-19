import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { listSecurityAlertsQuerySchema, firstIssueMessage } from "@/lib/validation";

const PAGE_SIZE = 50;

/** GET /api/admin/security/alerts?page=&resolved= — Admin → Security →
 * Alerts. Account lockouts, new-location logins, and password/MFA
 * changes, newest first. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listSecurityAlertsQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    resolved: request.nextUrl.searchParams.get("resolved") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, resolved } = parsed.data;

  let query = supabase.from("security_alerts").select("*", { count: "exact" }).order("created_at", {
    ascending: false,
  });
  if (resolved !== undefined) query = query.eq("resolved", resolved);

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load security alerts." }, { status: 500 });
  }

  return NextResponse.json({ alerts: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
