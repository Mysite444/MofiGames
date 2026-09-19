import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/route-auth";
import { fileReportSchema, firstIssueMessage } from "@/lib/validation";
import { checkRateLimit } from "@/lib/rate-limit";

/** POST /api/reports — any signed-in user (including guests) can report
 * another user for abuse. RLS backs this up (a banned user can't file a
 * report either — see migration 0012), this route just returns a clean
 * error message instead of a raw RLS rejection. */
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const underLimit = await checkRateLimit(supabase, `report:${user.id}`, 3600, 10);
  if (!underLimit) {
    return NextResponse.json({ error: "Too many reports filed recently. Try again later." }, { status: 429 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = fileReportSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  if (parsed.data.reportedUserId === user.id) {
    return NextResponse.json({ error: "You can't report yourself." }, { status: 400 });
  }

  const { error } = await supabase.from("user_reports").insert({
    reporter_id: user.id,
    reported_user_id: parsed.data.reportedUserId,
    reason: parsed.data.reason,
    details: parsed.data.details,
    context_game_slug: parsed.data.contextGameSlug ?? null,
    context_comment_id: parsed.data.contextCommentId ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to file report." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
