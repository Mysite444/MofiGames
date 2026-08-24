"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, X, Loader2 } from "lucide-react";
import {
  fetchAllTagsAdmin,
  createTag,
  updateTag,
  deleteTag,
  type AdminTag,
  type TagInput,
} from "@/lib/supabase/admin-content";
import { slugify } from "@/lib/prng";

const emptyForm: TagInput = {
  slug: "",
  name: "",
  color: "#ffd60a",
  seo_title: "",
  seo_description: "",
  seo_canonical_url: null,
  seo_h1_title: "",
  seo_index: true,
};

export function TagsAdminClient() {
  const [tags, setTags] = useState<AdminTag[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TagInput>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setTags(await fetchAllTagsAdmin());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load tags.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(tag: AdminTag) {
    setEditingId(tag.id);
    setForm({
      slug: tag.slug,
      name: tag.name,
      color: tag.color,
      seo_title: tag.seo_title,
      seo_description: tag.seo_description,
      seo_canonical_url: tag.seo_canonical_url,
      seo_h1_title: tag.seo_h1_title,
      seo_index: tag.seo_index,
    });
    setSlugTouched(true);
    setFormError(null);
    setFormOpen(true);
  }

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.slug.trim()) {
      setFormError("Name and slug are required.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateTag(editingId, form);
      } else {
        await createTag(form);
      }
      await load();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(tag: AdminTag) {
    if (!confirm(`Delete the "${tag.name}" tag? It will be removed from any posts using it.`)) return;
    try {
      await deleteTag(tag.id);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Tags</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Used to label Blog/News posts — pick which tags show on a post from its edit form.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={16} />
          Add Tag
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">Tag</th>
              <th className="px-4 py-3 font-semibold">Slug</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {tags === null && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {tags?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-text-faint">
                  No tags yet — click &quot;Add Tag&quot; to create the first one.
                </td>
              </tr>
            )}
            {tags?.map((tag) => (
              <tr
                key={tag.id}
                className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3">
                  <span
                    className="inline-block rounded-full px-2.5 py-1 text-xs font-bold text-black"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-white/80">{tag.slug}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(tag)}
                      aria-label={`Edit ${tag.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(tag)}
                      aria-label={`Delete ${tag.name}`}
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
            className="glass-opaque flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--color-surface-border)] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">
                {editingId ? "Edit Tag" : "Add Tag"}
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

            {formError && (
              <p className="mb-4 rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{formError}</p>
            )}

            <div className="flex flex-col gap-4">
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="admin-input"
                  required
                />
              </Field>

              <Field label="Slug">
                <input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
                  }}
                  className="admin-input"
                  required
                />
              </Field>

              <Field label="Color">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="admin-input h-10 p-1"
                />
              </Field>

              <h3 className="-mb-1 mt-2 border-t border-[var(--color-surface-border)] pt-4 text-xs font-bold uppercase tracking-wide text-text-faint">
                SEO
              </h3>

              <Field label="SEO title">
                <input
                  value={form.seo_title}
                  onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))}
                  placeholder="Falls back to the tag name"
                  maxLength={70}
                  className="admin-input"
                />
              </Field>
              <Field label="SEO description">
                <textarea
                  value={form.seo_description}
                  onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))}
                  rows={2}
                  maxLength={300}
                  className="admin-input resize-none"
                />
              </Field>
              <Field label="H1 title">
                <input
                  value={form.seo_h1_title}
                  onChange={(e) => setForm((f) => ({ ...f, seo_h1_title: e.target.value }))}
                  placeholder="Falls back to the tag name"
                  className="admin-input"
                />
              </Field>
              <Field label="Canonical URL">
                <input
                  value={form.seo_canonical_url ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, seo_canonical_url: e.target.value || null }))}
                  placeholder="Auto-generated if left blank"
                  className="admin-input"
                />
              </Field>
              <label className="flex items-center gap-2 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={form.seo_index ?? true}
                  onChange={(e) => setForm((f) => ({ ...f, seo_index: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Index this tag page in search
              </label>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editingId ? "Save changes" : "Create tag"}
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
