import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/supabase/route-auth";

const paramsSchema = z.object({ id: z.string().uuid() });

/** PATCH /api/admin/comments/:id — approve or revoke a comment.
 *
 * Body: { approved: boolean }
 *
 * Requires moderate_comments permission. The only column ever touched is
 * `is_approved` — we build the UPDATE payload here rather than passing
 * arbitrary fields from the client, so there's no risk of comment body /
 * author data being silently overwritten via this route.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid comment id." }, { status: 400 });
  }

  const auth = await requirePermission("moderate_comments");
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

  if (
    typeof json !== "object" ||
    json === null ||
    typeof (json as { approved?: unknown }).approved !== "boolean"
  ) {
    return NextResponse.json(
      { error: "Body must be { approved: boolean }." },
      { status: 400 }
    );
  }

  const { approved } = json as { approved: boolean };

  const { data, error } = await supabase
    .from("comments")
    .update({ is_approved: approved })
    .eq("id", parsed.data.id)
    .select("id, is_approved")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to update comment." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, id: data.id, isApproved: data.is_approved });
}
