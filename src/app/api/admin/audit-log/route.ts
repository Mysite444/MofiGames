import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/supabase/route-auth";
import { listAuditLogQuerySchema, firstIssueMessage } from "@/lib/validation";

const PAGE_SIZE = 50;

/** GET /api/admin/audit-log?page=&reportId= — Admin → Reports →
 * Administration → Audit Log. The site-wide trail of every reports/
 * moderation change (status, assignment, priority, category, notes,
 * actions taken, case creation), across every report kind. */
export async function GET(request: NextRequest) {
  const auth = await requirePermission("manage_reports").then(async (r) =>
    r.ok ? r : requirePermission("manage_copyright")
  );
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listAuditLogQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    reportId: request.nextUrl.searchParams.get("reportId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, reportId } = parsed.data;

  let query = supabase
    .from("report_audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });
  if (reportId) query = query.eq("report_id", reportId);

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load audit log." }, { status: 500 });
  }

  const actorIds = [...new Set((data ?? []).map((e) => e.actor_id).filter(Boolean))];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, name").in("id", actorIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const entries = (data ?? []).map((e) => ({ ...e, actor_name: e.actor_id ? nameById.get(e.actor_id) ?? "Unknown" : "System" }));

  return NextResponse.json({ entries, total: count ?? 0, page, pageSize: PAGE_SIZE });
}
