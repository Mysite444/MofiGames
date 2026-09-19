import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";

/** GET /api/admin/localization/translations/missing-report — for every
 * (namespace, key) that exists in at least one language, lists which
 * *enabled* languages don't yet have a non-empty value for it. Computed
 * in-process rather than in SQL: the translation table is small (UI/menu/
 * page/email/error strings, not user content) and this keeps the logic
 * readable — a pivot-and-diff is awkward to express as a single query. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const [{ data: languages, error: langError }, { data: translations, error: transError }] = await Promise.all([
    supabase.from("languages").select("code").eq("is_enabled", true),
    supabase.from("translations").select("namespace, key, language_code, value"),
  ]);

  if (langError || transError) {
    return NextResponse.json({ error: "Could not compute the missing translation report." }, { status: 500 });
  }

  const enabledCodes = (languages ?? []).map((l) => l.code);
  const byKey = new Map<string, { namespace: string; key: string; present: Set<string> }>();

  for (const row of translations ?? []) {
    const mapKey = `${row.namespace}::${row.key}`;
    if (!byKey.has(mapKey)) {
      byKey.set(mapKey, { namespace: row.namespace, key: row.key, present: new Set() });
    }
    if (row.value && row.value.trim().length > 0) {
      byKey.get(mapKey)!.present.add(row.language_code);
    }
  }

  const missing = Array.from(byKey.values())
    .map((entry) => ({
      namespace: entry.namespace,
      key: entry.key,
      missingLanguages: enabledCodes.filter((code) => !entry.present.has(code)),
    }))
    .filter((entry) => entry.missingLanguages.length > 0)
    .sort((a, b) => a.namespace.localeCompare(b.namespace) || a.key.localeCompare(b.key));

  return NextResponse.json({ missing });
}
