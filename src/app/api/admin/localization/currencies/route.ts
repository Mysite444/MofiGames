import { NextResponse } from "next/server";
import { requireAdmin, publicClient } from "@/lib/supabase/route-auth";
import { currencyInputSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** GET /api/admin/localization/currencies — list every currency, enabled
 * or not. No admin gate: price formatting on public pages reads enabled
 * currencies from this table too (RLS: select true). */
export async function GET() {
  const supabase = await publicClient();
  const { data, error } = await supabase
    .from("currencies")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Could not load currencies." }, { status: 500 });
  }
  return NextResponse.json({ currencies: data });
}

/** POST /api/admin/localization/currencies — add a supported currency. */
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

  const parsed = currencyInputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase.from("currencies").insert(parsed.data).select().single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That currency code is already supported." }, { status: 409 });
    }
    return apiError(error);
  }

  return NextResponse.json({ currency: data }, { status: 201 });
}
