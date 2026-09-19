import { NextResponse, type NextRequest } from "next/server";
import { requireStaff } from "@/lib/supabase/route-auth";
import { listUsersAdminQuerySchema, firstIssueMessage } from "@/lib/validation";
import { getViewerCapabilities, enrichWithAuthData } from "@/lib/supabase/user-admin-helpers";

const PAGE_SIZE = 20;

/** GET /api/admin/users?page=&q=&role=&status= — every player account,
 * newest first, with search + role/status filters. Requires any staff
 * role (admin/editor/moderator) — everyone on staff can see the roster;
 * individual actions (ban, verify, role change) are gated separately, per
 * viewer capability, embedded in the response. */
export async function GET(request: NextRequest) {
  const auth = await requireStaff();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const parsed = listUsersAdminQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
    role: request.nextUrl.searchParams.get("role") ?? undefined,
    status: request.nextUrl.searchParams.get("status") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, q, role, status } = parsed.data;

  let query = supabase
    .from("profiles")
    .select(
      "id, name, role, is_admin, is_banned, ban_reason, banned_at, ban_expires_at, is_verified, verified_at, created_at",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (q) {
    const safeQ = q.replace(/[,%]/g, "").trim();
    if (safeQ) query = query.ilike("name", `%${safeQ}%`);
  }
  if (role) query = query.eq("role", role);
  if (status === "banned") query = query.eq("is_banned", true);
  if (status === "verified") query = query.eq("is_verified", true);
  if (status === "unverified") query = query.eq("is_verified", false);

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
  }

  const authData = await enrichWithAuthData((data ?? []).map((row) => row.id));

  const users = (data ?? []).map((row) => ({
    ...row,
    auth: authData.get(row.id) ?? null,
  }));

  const capabilities = await getViewerCapabilities(supabase, user.id);

  return NextResponse.json({ users, total: count ?? 0, page, pageSize: PAGE_SIZE, capabilities });
}
