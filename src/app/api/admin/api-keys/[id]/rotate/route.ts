import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { generateApiKey } from "@/lib/api-keys";

const paramsSchema = z.object({ id: z.string().uuid() });

/** POST /api/admin/api-keys/:id/rotate — revokes the current key and
 * mints a fresh one with the same label/scopes/rate limit/expiry offset
 * in a single step (Secret & API Key Rotation). The new raw key is
 * returned exactly once, same as creation. Anything using the old key
 * stops working the moment this returns — there's no overlap window. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid key id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  const { data: existing, error: fetchError } = await supabase
    .from("api_keys")
    .select("label, scopes, rate_limit_per_hour, expires_at")
    .eq("id", parsedParams.data.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "API key not found." }, { status: 404 });
  }

  const { error: revokeError } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsedParams.data.id);
  if (revokeError) {
    return NextResponse.json({ error: "Failed to rotate API key." }, { status: 500 });
  }

  const generated = generateApiKey();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      label: existing.label,
      key_prefix: generated.prefix,
      key_hash: generated.hash,
      scopes: existing.scopes,
      rate_limit_per_hour: existing.rate_limit_per_hour,
      expires_at: existing.expires_at,
      created_by: user.id,
    })
    .select("id, label, key_prefix, scopes, rate_limit_per_hour, created_at, expires_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Old key was revoked, but creating the replacement failed." }, { status: 500 });
  }

  return NextResponse.json({ key: data, rawKey: generated.raw }, { status: 201 });
}
