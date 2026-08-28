import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { languageUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ code: z.string().trim().min(1).max(15) });

/** PATCH /api/admin/localization/languages/:code — partial update
 * (rename, enable/disable, toggle RTL, set as default, reorder). */
export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid language code." }, { status: 400 });
  }

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

  const parsedBody = languageUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }
  if (Object.keys(parsedBody.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }
  if (parsedBody.data.is_default === false) {
    return NextResponse.json(
      { error: "Set a different language as default instead of unsetting this one." },
      { status: 400 }
    );
  }
  if (parsedBody.data.is_enabled === false && parsedBody.data.is_default !== true) {
    // Disallow disabling the current default — check below via a fresh read.
    const { data: current } = await supabase
      .from("languages")
      .select("is_default")
      .eq("code", parsedParams.data.code)
      .maybeSingle();
    if (current?.is_default) {
      return NextResponse.json({ error: "The default language can't be disabled." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("languages")
    .update(parsedBody.data)
    .eq("code", parsedParams.data.code)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Language not found." }, { status: 404 });
    }
    return apiError(error);
  }

  return NextResponse.json({ language: data });
}

/** DELETE /api/admin/localization/languages/:code */
export async function DELETE(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid language code." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data: current } = await supabase
    .from("languages")
    .select("is_default")
    .eq("code", parsedParams.data.code)
    .maybeSingle();
  if (current?.is_default) {
    return NextResponse.json(
      { error: "Can't delete the default language. Set another language as default first." },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("languages").delete().eq("code", parsedParams.data.code);
  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ ok: true });
}
