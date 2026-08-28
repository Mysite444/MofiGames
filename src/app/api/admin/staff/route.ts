import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/route-auth";

/** GET /api/admin/staff — lightweight id/name/role list of every admin,
 * moderator, and editor, for the Assign Moderator picker on a report.
 * Deliberately not the full /api/admin/users payload (auth info, ban
 * status, pagination) — this is only ever rendered as a `<select>`. */
export async function GET() {
  const auth = await requirePermission("manage_reports").then(async (r) =>
    r.ok ? r : requirePermission("manage_copyright")
  );
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role")
    .in("role", ["admin", "moderator", "editor"])
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load staff." }, { status: 500 });
  }

  return NextResponse.json({ staff: data ?? [] });
}
