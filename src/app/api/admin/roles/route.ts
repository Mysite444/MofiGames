import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { updateRolePermissionsSchema, firstIssueMessage } from "@/lib/validation";
import { PERMISSIONS, CONFIGURABLE_ROLES } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";
import { logAdminAction } from "@/lib/supabase/admin-action-log";

/** GET /api/admin/roles — the full default permission matrix (which of
 * the 5 permissions moderator/editor get by default). Admin only. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data, error } = await supabase.from("role_permissions").select("role, permission");
  if (error) {
    return NextResponse.json({ error: "Failed to load role permissions." }, { status: 500 });
  }

  const matrix: Record<string, string[]> = { moderator: [], editor: [] };
  for (const row of data ?? []) {
    matrix[row.role]?.push(row.permission);
  }

  return NextResponse.json({ matrix, roles: CONFIGURABLE_ROLES, permissions: PERMISSIONS });
}

/** PUT /api/admin/roles — replaces the full permission set for one role
 * (moderator or editor) with the given list. Admin only. */
export async function PUT(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase, user } = auth.ctx;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = updateRolePermissionsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const { role, permissions } = parsed.data;

  const { error: deleteError } = await supabase.from("role_permissions").delete().eq("role", role);
  if (deleteError) {
    return apiError(deleteError);
  }

  if (permissions.length > 0) {
    const { error: insertError } = await supabase
      .from("role_permissions")
      .insert(permissions.map((permission) => ({ role, permission })));
    if (insertError) {
      return apiError(insertError);
    }
  }

  await logAdminAction(supabase, user, {
    action: "role_permissions_updated",
    targetType: "role",
    targetId: role,
    summary: `Set ${role} permissions to: ${permissions.join(", ") || "none"}.`,
    metadata: { role, permissions },
  });

  return NextResponse.json({ ok: true });
}
