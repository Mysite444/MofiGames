import { NextResponse, type NextRequest } from "next/server";
import { requirePermission } from "@/lib/supabase/route-auth";
import { listActivityAdminQuerySchema, firstIssueMessage } from "@/lib/validation";

const PAGE_SIZE = 50;

/** GET /api/admin/activity?page=&userId=&activityType= — the site-wide
 * activity trail (logins, role changes, bans, verifications), newest
 * first. Requires view_activity_logs (admins always have it). */
export async function GET(request: NextRequest) {
  const auth = await requirePermission("view_activity_logs");
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listActivityAdminQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    userId: request.nextUrl.searchParams.get("userId") ?? undefined,
    activityType: request.nextUrl.searchParams.get("activityType") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, userId, activityType } = parsed.data;

  let query = supabase
    .from("user_activity_logs")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (userId) query = query.eq("user_id", userId);
  if (activityType) query = query.eq("activity_type", activityType);

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load activity." }, { status: 500 });
  }

  const logs = data ?? [];
  const userIds = [...new Set(logs.map((l) => l.user_id).filter(Boolean))];
  const { data: profiles } = await supabase.from("profiles").select("id, name").in("id", userIds);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const enriched = logs.map((l) => ({ ...l, user_name: nameById.get(l.user_id) ?? "Deleted user" }));

  return NextResponse.json({ activity: enriched, total: count ?? 0, page, pageSize: PAGE_SIZE });
}
