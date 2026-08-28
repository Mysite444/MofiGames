import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/supabase/route-auth";
import { updateUserPermissionOverridesSchema, firstIssueMessage } from "@/lib/validation";
import { PERMISSIONS } from "@/lib/permissions";
import { apiError } from "@/lib/api-error";

const paramsSchema = z.object({ id: z.string().uuid() });

/** GET /api/admin/users/:id/permissions — this user's role default for
 * each permission plus any per-user override on top of it. Admin only —
 * granting/revoking individual permissions is a privileged action. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  const { supabase } = auth.ctx;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_admin")
    .eq("id", parsedParams.data.id)
    .maybeSingle();

  const role = profile?.is_admin ? "admin" : profile?.role ?? "user";

  const [{ data: roleDefaults }, { data: overrides }] = await Promise.all([
    supabase.from("role_permissions").select("permission").eq("role", role),
    supabase.from("user_permission_overrides").select("permission, granted").eq("user_id", parsedParams.data.id),
  ]);

  const defaultSet = new Set((roleDefaults ?? []).map((r) => r.permission));
  const overrideMap = new Map((overrides ?? []).map((o) => [o.permission, o.granted]));

  const permissions = PERMISSIONS.map((perm) => ({
    permission: perm,
    roleDefault: role === "admin" ? true : defaultSet.has(perm),
    override: overrideMap.has(perm) ? overrideMap.get(perm) : null,
    effective: role === "admin" ? true : overrideMap.has(perm) ? overrideMap.get(perm) : defaultSet.has(perm),
  }));

  return NextResponse.json({ role, permissions });
}

/** PUT /api/admin/users/:id/permissions — sets or clears per-user
 * overrides. Passing `granted: null` for a permission removes the
 * override (falls back to the role default). Admin only. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
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

  const parsed = updateUserPermissionOverridesSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssueMessage(parsed.error) }, { status: 400 });
  }

  const toDelete = parsed.data.overrides.filter((o) => o.granted === null).map((o) => o.permission);
  const toUpsert = parsed.data.overrides.filter(
    (o): o is { permission: (typeof parsed.data.overrides)[number]["permission"]; granted: boolean } =>
      o.granted !== null
  );

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", parsedParams.data.id)
      .in("permission", toDelete);
    if (error) return apiError(error);
  }

  if (toUpsert.length > 0) {
    const { error } = await supabase
      .from("user_permission_overrides")
      .upsert(
        toUpsert.map((o) => ({ user_id: parsedParams.data.id, permission: o.permission, granted: o.granted })),
        { onConflict: "user_id,permission" }
      );
    if (error) return apiError(error);
  }

  return NextResponse.json({ ok: true });
}
