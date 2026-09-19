import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/route-auth";

const paramsSchema = z.object({ id: z.string().uuid() });

/** POST /api/comments/:id/like — like a comment as the current user.
 * Idempotent (upsert) — liking twice just leaves one like row. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid comment id." }, { status: 400 });
  }

  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: comment, error: fetchError } = await supabase
    .from("comments")
    .select("id")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (fetchError) {
    return NextResponse.json({ error: "Failed to look up comment." }, { status: 500 });
  }
  if (!comment) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("comment_likes")
    .upsert({ comment_id: parsed.data.id, user_id: user.id }, { onConflict: "comment_id,user_id" });
  if (error) {
    return NextResponse.json({ error: "Failed to like comment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, liked: true });
}

/** DELETE /api/comments/:id/like — unlike a comment as the current user. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid comment id." }, { status: 400 });
  }

  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { error } = await supabase
    .from("comment_likes")
    .delete()
    .eq("comment_id", parsed.data.id)
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "Failed to unlike comment." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, liked: false });
}
