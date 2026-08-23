import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { listAutomationRunsQuerySchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

const PAGE_SIZE = 30;

/** GET /api/admin/automation/runs — Task Queue & Job Logs. Also doubles
 * as Import Logs/History/Error Reports when called with
 * ?jobKey=auto_import_games. */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const url = new URL(request.url);
  const parsed = listAutomationRunsQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    jobKey: url.searchParams.get("jobKey") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, jobKey, status } = parsed.data;

  let query = supabase.from("automation_job_runs").select("*", { count: "exact" });
  if (jobKey) query = query.eq("job_key", jobKey);
  if (status) query = query.eq("status", status);

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.order("started_at", { ascending: false }).range(from, from + PAGE_SIZE - 1);

  if (error) {
    return apiError(error);
  }
  return NextResponse.json({ runs: data, total: count ?? 0, page, pageSize: PAGE_SIZE });
}
