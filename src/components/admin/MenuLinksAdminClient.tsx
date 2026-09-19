"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, X, Loader2, ExternalLink, ArrowUp, ArrowDown } from "lucide-react";
import {
  fetchAllMenuLinksAdmin,
  createMenuLink,
  updateMenuLink,
  deleteMenuLink,
  type AdminMenuLink,
  type MenuLinkInput,
} from "@/lib/supabase/admin-content";

const emptyForm: MenuLinkInput = {
  label: "",
  url: "",
  open_in_new_tab: false,
  sort_order: 0,
  is_active: true,
};

/** Admin → Site Settings → Menu Links. Custom nav links an admin can
 * add/edit/remove/reorder — no code changes needed. Rendered in the
 * "Custom Links" section of the sidebar/drawer menu (see NavList.tsx). */
export function MenuLinksAdminClient() {
  const [links, setLinks] = useState<AdminMenuLink[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuLinkInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setLinks(await fetchAllMenuLinksAdmin());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load menu links.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, sort_order: (links?.length ?? 0) * 10 });
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(link: AdminMenuLink) {
    setEditingId(link.id);
    setForm({
      label: link.label,
      url: link.url,
      open_in_new_tab: link.open_in_new_tab,
      sort_order: link.sort_order,
      is_active: link.is_active,
    });
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.label.trim() || !form.url.trim()) {
      setFormError("Label and URL are required.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateMenuLink(editingId, form);
      } else {
        await createMenuLink(form);
      }
      await load();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(link: AdminMenuLink) {
    if (!confirm(`Delete the "${link.label}" menu link? This can't be undone.`)) return;
    try {
      await deleteMenuLink(link.id);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  async function handleMove(link: AdminMenuLink, direction: "up" | "down") {
    if (!links) return;
    const index = links.findIndex((l) => l.id === link.id);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= links.length) return;
    const other = links[swapIndex];

    setReorderingId(link.id);
    try {
      await Promise.all([
        updateMenuLink(link.id, { sort_order: other.sort_order }),
        updateMenuLink(other.id, { sort_order: link.sort_order }),
      ]);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to reorder.");
    } finally {
      setReorderingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Menu Links</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Custom links shown in the sidebar/drawer menu&apos;s &quot;Custom Links&quot; section — add your
            own links anywhere on or off the site, no code changes needed.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={16} />
          Add Link
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">Label</th>
              <th className="px-4 py-3 font-semibold">URL</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {links === null && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {links?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-text-faint">
                  No custom menu links yet — click &quot;Add Link&quot; to create the first one.
                </td>
              </tr>
            )}
            {links?.map((link, index) => (
              <tr
                key={link.id}
                className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3 font-semibold text-white">{link.label}</td>
                <td className="px-4 py-3 text-white/80">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-white hover:underline"
                  >
                    {link.url}
                    <ExternalLink size={12} />
                  </a>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      link.is_active ? "bg-white/10 text-white" : "bg-white/5 text-text-faint"
                    }`}
                  >
                    {link.is_active ? "Active" : "Hidden"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleMove(link, "up")}
                      disabled={index === 0 || reorderingId !== null}
                      aria-label={`Move ${link.label} up`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(link, "down")}
                      disabled={index === links.length - 1 || reorderingId !== null}
                      aria-label={`Move ${link.label} down`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-30"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(link)}
                      aria-label={`Edit ${link.label}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(link)}
                      aria-label={`Delete ${link.label}`}
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
              <h2 className="font-display text-lg font-bold text-white">
                {editingId ? "Edit Link" : "Add Link"}
              </h2>
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
              <Field label="Label">
                <input
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  className="admin-input"
                  maxLength={60}
                  required
                />
              </Field>

              <Field label="URL">
                <input
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  className="admin-input"
                  placeholder="https://example.com or /page-slug"
                  required
                />
              </Field>

              <label className="flex items-center gap-2 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={form.open_in_new_tab}
                  onChange={(e) => setForm((f) => ({ ...f, open_in_new_tab: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Open in a new tab
              </label>

              <label className="flex items-center gap-2 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Active (shown in the menu)
              </label>
            </div>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-[var(--color-surface-border)] bg-[var(--color-menu-bg)] p-4">
              <button
                type="submit"
                disabled={saving}
                className="glow-yellow-button flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : null}
                {editingId ? "Save changes" : "Add link"}
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
