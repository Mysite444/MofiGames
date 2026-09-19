import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { currencyUpdateSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ code: z.string().trim().length(3) });

/** PATCH /api/admin/localization/currencies/:code — partial update
 * (symbol, position, separators, exchange rate, enable/disable, default). */
export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid currency code." }, { status: 400 });
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

  const parsedBody = currencyUpdateSchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: firstIssueMessage(parsedBody.error) }, { status: 400 });
  }
  if (Object.keys(parsedBody.data).length === 0) {
    return NextResponse.json({ error: "No fields to update." }, { status: 400 });
  }
  if (parsedBody.data.is_default === false) {
    return NextResponse.json(
      { error: "Set a different currency as default instead of unsetting this one." },
      { status: 400 }
    );
  }
  if (parsedBody.data.is_enabled === false) {
    const { data: current } = await supabase
      .from("currencies")
      .select("is_default")
      .eq("code", parsedParams.data.code)
      .maybeSingle();
    if (current?.is_default) {
      return NextResponse.json({ error: "The default currency can't be disabled." }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from("currencies")
    .update(parsedBody.data)
    .eq("code", parsedParams.data.code)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ error: "Currency not found." }, { status: 404 });
    }
    return apiError(error);
  }

  return NextResponse.json({ currency: data });
}

/** DELETE /api/admin/localization/currencies/:code */
export async function DELETE(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid currency code." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data: current } = await supabase
    .from("currencies")
    .select("is_default")
    .eq("code", parsedParams.data.code)
    .maybeSingle();
  if (current?.is_default) {
    return NextResponse.json(
      { error: "Can't delete the default currency. Set another currency as default first." },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("currencies").delete().eq("code", parsedParams.data.code);
  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ ok: true });
}
