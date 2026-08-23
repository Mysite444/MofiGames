import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

const MAINTENANCE_JOB_KEYS = ["security_health_check", "dependency_security_check", "system_integrity_check"];

/** GET /api/admin/security/maintenance — Admin → Security → Maintenance.
 * These three checks are ordinary automation jobs (see
 * src/lib/automation/maintenance-executors.ts and migration
 * 0021_maintenance.sql) — this route is just a scoped view over
 * automation_jobs for the three of them, the same relationship the
 * dedicated Backups page has to the generic Automation Jobs list. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("automation_jobs")
    .select("*")
    .in("key", MAINTENANCE_JOB_KEYS);

  if (error) {
    return NextResponse.json({ error: "Failed to load maintenance checks." }, { status: 500 });
  }

  // Keep a fixed, deliberate order rather than whatever the query returns.
  const jobs = MAINTENANCE_JOB_KEYS.map((key) => (data ?? []).find((j) => j.key === key)).filter(Boolean);

  return NextResponse.json({ jobs });
}
