"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Save, Check } from "lucide-react";
import { fetchRolePermissionsAdmin, updateRolePermissionsAdmin } from "@/lib/supabase/admin-content";
import { PERMISSIONS, PERMISSION_LABELS, CONFIGURABLE_ROLES } from "@/lib/permissions";

/** Admin → User Management → Roles & Permissions. The default permission
 * matrix for moderator/editor — admin always has everything and isn't
 * shown here since there's nothing to configure. Per-user overrides on
 * top of these defaults live on each user's own detail drawer (Users →
 * click a user → Permissions tab). */
export function RolesPermissionsAdminClient() {
  const [matrix, setMatrix] = useState<Record<string, string[]> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [savedRole, setSavedRole] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const result = await fetchRolePermissionsAdmin();
      setMatrix(result.matrix);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load role permissions.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(role: string, permission: string) {
    if (!matrix) return;
    const current = matrix[role] ?? [];
    const next = current.includes(permission)
      ? current.filter((p) => p !== permission)
      : [...current, permission];

    setMatrix({ ...matrix, [role]: next });
    setSaving(role);
    setSavedRole(null);
    try {
      await updateRolePermissionsAdmin(role, next);
      setSavedRole(role);
      setTimeout(() => setSavedRole(null), 2000);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save.");
      await load();
    } finally {
      setSaving(null);
    }
  }

  if (loadError) {
    return <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>;
  }
  if (!matrix) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold text-white">Roles & Permissions</h1>
        <p className="mt-0.5 text-sm text-text-faint">
          What Moderators and Editors can do by default. Admin has every permission always. Individual
          users can be granted or denied a permission on top of this from their profile in Users.
        </p>
      </div>

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">Permission</th>
              {CONFIGURABLE_ROLES.map((r) => (
                <th key={r} className="px-4 py-3 text-center font-semibold capitalize">
                  {r}
                  {saving === r && <Loader2 size={12} className="ml-1.5 inline animate-spin" />}
                  {savedRole === r && <Check size={12} className="ml-1.5 inline text-emerald-400" />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSIONS.map((perm) => (
              <tr key={perm} className="border-b border-[var(--color-surface-border)] last:border-0">
                <td className="px-4 py-3">
                  <p className="font-semibold text-white">{PERMISSION_LABELS[perm].label}</p>
                  <p className="text-xs text-text-faint">{PERMISSION_LABELS[perm].description}</p>
                </td>
                {CONFIGURABLE_ROLES.map((r) => (
                  <td key={r} className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={(matrix[r] ?? []).includes(perm)}
                      onChange={() => toggle(r, perm)}
                      disabled={saving === r}
                      className="h-4 w-4 accent-[var(--color-menu-yellow)]"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-text-faint">
        <Save size={12} />
        Changes save immediately per checkbox.
      </p>
    </div>
  );
}
