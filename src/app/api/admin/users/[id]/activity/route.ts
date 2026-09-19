import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/supabase/route-auth";

const paramsSchema = z.object({ id: z.string().uuid() });
const PAGE_SIZE = 30;

/** GET /api/admin/users/:id/activity?page= — one user's activity trail,
 * newest first. Any staff role can view (RLS also permits the user
 * themself, but this route is under /admin so it's staff-only in
 * practice). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
  const from = (page - 1) * PAGE_SIZE;

  const { data, error, count } = await supabase
    .from("user_activity_logs")
    .select("*", { count: "exact" })
    .eq("user_id", parsedParams.data.id)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load activity." }, { status: 500 });
  }

  return NextResponse.json({ activity: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
