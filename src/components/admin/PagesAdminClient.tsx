"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, X, Loader2, ExternalLink } from "lucide-react";
import {
  fetchAllPagesAdmin,
  createPage,
  updatePage,
  deletePage,
  type AdminPage,
  type PageInput,
} from "@/lib/supabase/admin-content";
import { slugify } from "@/lib/prng";
import { RichTextEditor } from "./RichTextEditor";

const emptyForm: PageInput = {
  slug: "",
  title: "",
  content: "",
  meta_description: "",
  show_in_nav: true,
  sort_order: 0,
  is_published: true,
  seo_title: "",
  seo_canonical_url: null,
  seo_h1_title: "",
  seo_index: true,
  og_image_url: null,
};

export function PagesAdminClient() {
  const [pages, setPages] = useState<AdminPage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PageInput>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setPages(await fetchAllPagesAdmin());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load pages.");
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

  function openEdit(page: AdminPage) {
    setEditingId(page.id);
    setForm({
      slug: page.slug,
      title: page.title,
      content: page.content,
      meta_description: page.meta_description,
      show_in_nav: page.show_in_nav,
      sort_order: page.sort_order,
      is_published: page.is_published,
      seo_title: page.seo_title,
      seo_canonical_url: page.seo_canonical_url,
      seo_h1_title: page.seo_h1_title,
      seo_index: page.seo_index,
      og_image_url: page.og_image_url,
    });
    setSlugTouched(true);
    setFormError(null);
    setFormOpen(true);
  }

  function handleTitleChange(title: string) {
    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.title.trim() || !form.slug.trim()) {
      setFormError("Title and slug are required.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updatePage(editingId, form);
      } else {
        await createPage(form);
      }
      await load();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(page: AdminPage) {
    if (!confirm(`Delete the "${page.title}" page? This can't be undone.`)) return;
    try {
      await deletePage(page.id);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Pages</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Custom pages like FAQ, Careers, or Press — each goes live at mofigames.com/its-slug. About
            Us, Contact Us, Privacy Policy, Disclaimer, Terms and Conditions, Kids Message, and Parents
            Info are also edited right here — look for them in the list below by title. My Profile and
            Blog &amp; News are app features, not content pages, so they aren&apos;t managed here.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={16} />
          Add Page
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">URL</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {pages === null && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {pages?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-text-faint">
                  No custom pages yet — click &quot;Add Page&quot; to create the first one.
                </td>
              </tr>
            )}
            {pages?.map((page) => (
              <tr
                key={page.id}
                className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3 font-semibold text-white">{page.title}</td>
                <td className="px-4 py-3 text-white/80">
                  <a
                    href={`/${page.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-white hover:underline"
                  >
                    /{page.slug}
                    <ExternalLink size={12} />
                  </a>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      page.is_published ? "bg-white/10 text-white" : "bg-white/5 text-text-faint"
                    }`}
                  >
                    {page.is_published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(page)}
                      aria-label={`Edit ${page.title}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(page)}
                      aria-label={`Delete ${page.title}`}
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
            className="glass-opaque flex h-full w-full max-w-xl flex-col border-l border-[var(--color-surface-border)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-surface-border)] px-5 pb-4 pt-5">
              <h2 className="font-display text-lg font-bold text-white">
                {editingId ? "Edit Page" : "Add Page"}
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
              <Field label="Title">
                <input
                  value={form.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className="admin-input"
                  required
                />
              </Field>

              <Field label="Slug (URL)">
                <input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((f) => ({ ...f, slug: slugify(e.target.value) }));
                  }}
                  className="admin-input"
                  required
                />
                <p className="mt-1 text-[11px] text-text-faint">
                  Page will live at mofigames.com/{form.slug || "your-slug"}
                </p>
              </Field>

              <Field label="Content">
                <RichTextEditor
                  value={form.content}
                  onChange={(content) => setForm((f) => ({ ...f, content }))}
                  placeholder="Write the page content…"
                />
              </Field>

              <Field label="Meta description (SEO, optional)">
                <textarea
                  value={form.meta_description}
                  onChange={(e) => setForm((f) => ({ ...f, meta_description: e.target.value }))}
                  rows={2}
                  className="admin-input resize-none"
                />
              </Field>

              <Field label="Sort order (position among Pages in the menu)">
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="admin-input"
                />
              </Field>

              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 text-sm text-white">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Published
                </label>
                <label className="flex items-center gap-2 text-sm text-white">
                  <input
                    type="checkbox"
                    checked={form.show_in_nav}
                    onChange={(e) => setForm((f) => ({ ...f, show_in_nav: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Show in menu
                </label>
              </div>

              <h3 className="-mb-1 mt-2 border-t border-[var(--color-surface-border)] pt-4 text-xs font-bold uppercase tracking-wide text-text-faint">
                SEO
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="SEO title">
                  <input
                    value={form.seo_title}
                    onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))}
                    placeholder="Falls back to the page title"
                    maxLength={70}
                    className="admin-input"
                  />
                </Field>
                <Field label="H1 title">
                  <input
                    value={form.seo_h1_title}
                    onChange={(e) => setForm((f) => ({ ...f, seo_h1_title: e.target.value }))}
                    placeholder="Falls back to the page title"
                    className="admin-input"
                  />
                </Field>
              </div>
              <Field label="Canonical URL">
                <input
                  value={form.seo_canonical_url ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, seo_canonical_url: e.target.value || null }))}
                  placeholder="Auto-generated if left blank"
                  className="admin-input"
                />
              </Field>
              <Field label="Social share image URL">
                <input
                  value={form.og_image_url ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, og_image_url: e.target.value || null }))}
                  placeholder="Falls back to the site default social image"
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
                Index this page in search
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
                {editingId ? "Save changes" : "Create page"}
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
