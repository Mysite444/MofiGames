import { NextResponse } from "next/server";
import { requireAdmin, publicClient } from "@/lib/supabase/route-auth";
import { languageInputSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** GET /api/admin/localization/languages — list every language, enabled or
 * not. No admin gate: the public language switcher reads enabled languages
 * straight from this table too (RLS: select true), and the admin form
 * needs the full list including disabled ones on load. */
export async function GET() {
  const supabase = await publicClient();
  const { data, error } = await supabase
    .from("languages")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Could not load languages." }, { status: 500 });
  }
  return NextResponse.json({ languages: data });
}

/** POST /api/admin/localization/languages — add a supported language. */
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

  const parsed = languageInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase.from("languages").insert(parsed.data).select().single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That language code is already supported." }, { status: 409 });
    }
    return apiError(error);
  }

  return NextResponse.json({ language: data }, { status: 201 });
}
