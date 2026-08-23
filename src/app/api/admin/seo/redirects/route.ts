import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { redirectInputSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** GET /api/admin/seo/redirects — list every redirect, newest first.
 * Admin only (this listing includes hit counts / internal management
 * detail that shouldn't be public, unlike the redirects themselves which
 * the middleware reads directly from the DB). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("seo_redirects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return apiError(error);
  }
  return NextResponse.json({ redirects: data });
}

/** POST /api/admin/seo/redirects — create a new redirect rule. */
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

  const parsed = redirectInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase.from("seo_redirects").insert(parsed.data).select().single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A redirect for that source path already exists." }, { status: 409 });
    }
    return apiError(error);
  }

  return NextResponse.json({ redirect: data }, { status: 201 });
}
