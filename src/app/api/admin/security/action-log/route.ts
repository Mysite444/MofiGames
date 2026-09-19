import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { listAdminActionLogQuerySchema, firstIssueMessage } from "@/lib/validation";

const PAGE_SIZE = 50;

/** GET /api/admin/security/action-log?page=&action=&q= — Admin →
 * Security → Action Log. The site-wide trail of admin actions that don't
 * already have a dedicated log elsewhere (security settings, access
 * rules, API keys, backups, the role/permission matrix, site identity,
 * destructive content changes). See
 * supabase/migrations/0060_admin_action_log.sql. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listAdminActionLogQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    action: request.nextUrl.searchParams.get("action") ?? undefined,
    q: request.nextUrl.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, action, q } = parsed.data;

  let query = supabase
    .from("admin_action_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false });

  if (action) query = query.eq("action", action);
  if (q) query = query.or(`summary.ilike.%${q}%,actor_email.ilike.%${q}%`);

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load the admin action log." }, { status: 500 });
  }

  return NextResponse.json({ entries: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
