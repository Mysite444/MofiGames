import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { listTranslationsQuerySchema, translationUpsertSchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** GET /api/admin/localization/translations — list translation rows,
 * optionally filtered by namespace, language, and a search term over the
 * key/value. Admin only (the public site reads its strings through a
 * server-side helper, not this listing endpoint). */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const url = new URL(request.url);
  const parsed = listTranslationsQuerySchema.safeParse({
    namespace: url.searchParams.get("namespace") ?? undefined,
    languageCode: url.searchParams.get("languageCode") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  let query = supabase.from("translations").select("*").order("key", { ascending: true });
  if (parsed.data.namespace) query = query.eq("namespace", parsed.data.namespace);
  if (parsed.data.languageCode) query = query.eq("language_code", parsed.data.languageCode);
  if (parsed.data.q) query = query.or(`key.ilike.%${parsed.data.q}%,value.ilike.%${parsed.data.q}%`);

  const { data, error } = await query;
  if (error) {
    return apiError(error);
  }
  return NextResponse.json({ translations: data });
}

/** POST /api/admin/localization/translations — upsert a single (namespace,
 * key, language) value. Used both to add a brand new key (called once per
 * enabled language, or just for the default language, from the client) and
 * to edit an existing translation. */
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

  const parsed = translationUpsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("translations")
    .upsert(parsed.data, { onConflict: "namespace,key,language_code" })
    .select()
    .single();

  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ translation: data });
}

const deleteQuerySchema = z.object({
  namespace: z.enum(["ui", "menu", "page", "email", "error"]),
  key: z.string().trim().min(1).max(200),
});

/** DELETE /api/admin/localization/translations?namespace=ui&key=foo —
 * removes a key across every language at once (a key without any language
 * value left is just clutter in the report and the editor). */
export async function DELETE(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const url = new URL(request.url);
  const parsed = deleteQuerySchema.safeParse({
    namespace: url.searchParams.get("namespace"),
    key: url.searchParams.get("key"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { error } = await supabase
    .from("translations")
    .delete()
    .eq("namespace", parsed.data.namespace)
    .eq("key", parsed.data.key);

  if (error) {
    return apiError(error);
  }

  return NextResponse.json({ ok: true });
}
