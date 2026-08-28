import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";

const paramsSchema = z.object({ id: z.string().uuid() });

/** DELETE /api/admin/ads/protection/rules/:id */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid rule id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { error } = await supabase.from("ad_protection_rules").delete().eq("id", parsedParams.data.id);
  if (error) {
    return NextResponse.json({ error: "Failed to remove rule." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
