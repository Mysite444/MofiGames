import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** GET /api/admin/automation/notifications — recent job-failure
 * notifications, newest first. ?unreadOnly=1 to filter. */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const url = new URL(request.url);
  let query = supabase.from("automation_notifications").select("*").order("created_at", { ascending: false }).limit(50);
  if (url.searchParams.get("unreadOnly") === "1") {
    query = query.eq("is_read", false);
  }

  const { data, error } = await query;
  if (error) {
    return apiError(error);
  }
  return NextResponse.json({ notifications: data });
}

const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});

/** PATCH /api/admin/automation/notifications — mark the given
 * notification ids as read. */
export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = markReadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { error } = await supabase.from("automation_notifications").update({ is_read: true }).in("id", parsed.data.ids);
  if (error) {
    return apiError(error);
  }
  return NextResponse.json({ ok: true });
}
