"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, X, Loader2, Power } from "lucide-react";
import {
  fetchAllRedirectsAdmin,
  createRedirect,
  updateRedirect,
  deleteRedirect,
  type AdminRedirect,
  type RedirectInput,
} from "@/lib/supabase/admin-content";

const emptyForm: RedirectInput = {
  source_path: "",
  destination_path: "",
  redirect_type: 301,
  is_active: true,
};

/** Admin → SEO Management → Redirects. Backed by seo_redirects (RLS:
 * publicly readable) and applied on every request by the Next.js
 * middleware (src/middleware.ts) — a rule saved here takes effect on the
 * very next request, no redeploy. */
export function SeoRedirectsAdminClient() {
  const [redirects, setRedirects] = useState<AdminRedirect[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<RedirectInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setRedirects(await fetchAllRedirectsAdmin());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load redirects.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setForm(emptyForm);
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.source_path.trim()) {
      setFormError("Source path is required.");
      return;
    }
    if (form.redirect_type !== 410 && !form.destination_path?.trim()) {
      setFormError("A destination is required unless this is a 410 Gone.");
      return;
    }
    setSaving(true);
    try {
      await createRedirect(form);
      await load();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(r: AdminRedirect) {
    setRedirects((rs) => rs?.map((x) => (x.id === r.id ? { ...x, is_active: !x.is_active } : x)) ?? rs);
    try {
      await updateRedirect(r.id, { is_active: !r.is_active });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to update.");
      await load();
    }
  }

  async function handleDelete(r: AdminRedirect) {
    if (!confirm(`Delete the redirect for "${r.source_path}"?`)) return;
    try {
      await deleteRedirect(r.id);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">SEO — Redirects</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            301/302/307/308 redirects and 410 Gone rules, applied on every request.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={16} />
          Add redirect
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Destination</th>
              <th className="px-4 py-3 font-semibold">Type</th>
              <th className="px-4 py-3 font-semibold">Hits</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {redirects === null && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {redirects?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  No redirects yet.
                </td>
              </tr>
            )}
            {redirects?.map((r) => (
              <tr key={r.id} className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-mono text-xs text-white/90">{r.source_path}</td>
                <td className="px-4 py-3 font-mono text-xs text-white/70">{r.destination_path ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-bold text-white/80">
                    {r.redirect_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/70">{r.hit_count}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleToggleActive(r)}
                      aria-label={r.is_active ? "Deactivate" : "Activate"}
                      title={r.is_active ? "Active — click to disable" : "Disabled — click to enable"}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 ${
                        r.is_active ? "text-emerald-400" : "text-white/40"
                      }`}
                    >
                      <Power size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r)}
                      aria-label={`Delete redirect for ${r.source_path}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-hot/15 hover:text-hot"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setFormOpen(false)}>
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="glass-opaque flex h-full w-full max-w-md flex-col border-l border-[var(--color-surface-border)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-surface-border)] px-5 pb-4 pt-5">
              <h2 className="font-display text-lg font-bold text-white">Add redirect</h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X size={18} className="text-white/70" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
            {formError && (
              <p className="mb-4 rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{formError}</p>
            )}

            <div className="flex flex-col gap-4">
              <Field label="Source path">
                <input
                  value={form.source_path}
                  onChange={(e) => setForm((f) => ({ ...f, source_path: e.target.value }))}
                  placeholder="/old-game-slug"
                  className="admin-input font-mono"
                  required
                />
              </Field>
              <Field label="Redirect type">
                <select
                  value={form.redirect_type}
                  onChange={(e) => setForm((f) => ({ ...f, redirect_type: Number(e.target.value) as RedirectInput["redirect_type"] }))}
                  className="admin-input"
                >
                  <option value={301}>301 — Permanent</option>
                  <option value={302}>302 — Temporary</option>
                  <option value={307}>307 — Temporary (preserve method)</option>
                  <option value={308}>308 — Permanent (preserve method)</option>
                  <option value={410}>410 — Gone</option>
                </select>
              </Field>
              {form.redirect_type !== 410 && (
                <Field label="Destination path or URL">
                  <input
                    value={form.destination_path ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, destination_path: e.target.value }))}
                    placeholder="/game/new-slug"
                    className="admin-input font-mono"
                  />
                </Field>
              )}
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Active
              </label>
            </div>

            </div>

            <div className="flex shrink-0 gap-2 border-t border-[var(--color-surface-border)] bg-[var(--color-menu-bg)] p-4">
              <button
                type="submit"
                disabled={saving}
                className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                Create redirect
              </button>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      {children}
    </label>
  );
}
