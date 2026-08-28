import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { listLoginAttemptsQuerySchema, firstIssueMessage } from "@/lib/validation";

const PAGE_SIZE = 50;

/** GET /api/admin/security/logs?page=&email=&outcome= — Admin → Security
 * → Login Logs. Every login attempt, success or failure, newest first. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listLoginAttemptsQuerySchema.safeParse({
    page: request.nextUrl.searchParams.get("page") ?? undefined,
    email: request.nextUrl.searchParams.get("email") ?? undefined,
    outcome: request.nextUrl.searchParams.get("outcome") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }
  const { page, email, outcome } = parsed.data;

  let query = supabase.from("login_attempts").select("*", { count: "exact" }).order("created_at", {
    ascending: false,
  });
  if (email) query = query.ilike("email", `%${email}%`);
  if (outcome) query = query.eq("success", outcome === "success");

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

  if (error) {
    return NextResponse.json({ error: "Failed to load login logs." }, { status: 500 });
  }

  return NextResponse.json({ attempts: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
}
