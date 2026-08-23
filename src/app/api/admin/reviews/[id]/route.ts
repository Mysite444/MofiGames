import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { apiError } from "@/lib/api-error";

/** DELETE /api/admin/reviews/:id — hard-delete any review, admin only.
 * RLS (migration 0059) already restricts public DELETEs to the review's
 * own author; this route uses a service-pattern requireAdmin() check and
 * relies on the admin's profile.is_admin for the RLS bypass. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id || typeof id !== "string" || id.length > 100) {
    return NextResponse.json({ error: "Invalid review ID." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { error } = await supabase.from("game_reviews").delete().eq("id", id);
  if (error) {
    return apiError(error, "Failed to delete review.");
  }

  return NextResponse.json({ ok: true });
}
