import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { tagInputSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** POST /api/admin/tags — create a tag. Admin only. */
export async function POST(request: Request) {
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

  const parsed = tagInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase.from("tags").insert(parsed.data).select().single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A tag with that slug already exists." }, { status: 409 });
    }
    return apiError(error);
  }

  return NextResponse.json({ tag: data }, { status: 201 });
}
