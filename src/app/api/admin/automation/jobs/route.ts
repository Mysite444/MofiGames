import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiError } from "@/lib/api-error";

/** GET /api/admin/automation/jobs — every automation job and its current
 * settings/last-run status, for the Automation dashboard. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("automation_jobs").select("*").order("category").order("name");
  if (error) {
    return apiError(error);
  }
  return NextResponse.json({ jobs: data });
}
