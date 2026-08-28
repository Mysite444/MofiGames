import { NextResponse, type NextRequest } from "next/server";
import { requirePermission, requireAdmin } from "@/lib/supabase/route-auth";
import { listReportCategoriesQuerySchema, createReportCategorySchema, firstIssueMessage } from "@/lib/validation";
import { apiError } from "@/lib/api-error";

/** GET /api/admin/report-categories?group= — Admin → Reports → Report
 * Categories. Readable by anyone with manage_reports or manage_copyright
 * (they need the list to filter/tag reports); only admins can create or
 * edit categories (POST here, PATCH/DELETE on the [id] route). */
export async function GET(request: NextRequest) {
  const auth = await requirePermission("manage_reports").then(async (r) =>
    r.ok ? r : requirePermission("manage_copyright")
  );
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const parsed = listReportCategoriesQuerySchema.safeParse({
    group: request.nextUrl.searchParams.get("group") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  let query = supabase.from("report_categories").select("*").order("sort_order", { ascending: true });
  if (parsed.data.group !== "all") query = query.eq("group", parsed.data.group);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load report categories." }, { status: 500 });
  }

  return NextResponse.json({ categories: data ?? [] });
}

/** POST /api/admin/report-categories — admin-only. Creating a category
 * only organizes/tags reports going forward; it never changes what
 * `reason`/`kind` values are accepted (those stay fixed check constraints
 * in migration 0015) — so a new category is safe to add without a schema
 * change, but only meaningfully filters reports that get tagged with it. */
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

  const parsed = createReportCategorySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("report_categories")
    .insert({
      key: parsed.data.key,
      label: parsed.data.label,
      group: parsed.data.group,
      description: parsed.data.description,
      sort_order: parsed.data.sortOrder,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A category with that key already exists." }, { status: 409 });
    }
    return apiError(error);
  }

  return NextResponse.json({ category: data }, { status: 201 });
}
