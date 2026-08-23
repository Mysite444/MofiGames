"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, X, Loader2, ExternalLink, ImagePlus, Sparkles } from "lucide-react";
import {
  fetchAllPostsAdmin,
  createPost,
  updatePost,
  deletePost,
  uploadContentImage,
  fetchAllTagsAdmin,
  generateSeoWithAi,
  type AdminPost,
  type AdminTag,
  type PostInput,
} from "@/lib/supabase/admin-content";
import { slugify } from "@/lib/prng";
import { RichTextEditor } from "./RichTextEditor";

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyForm(): PostInput {
  return {
    slug: "",
    title: "",
    excerpt: "",
    content: "",
    cover_image_url: null,
    author_name: "MofiGames Team",
    is_published: true,
    published_at: new Date().toISOString(),
    tagIds: [],
    seo_title: "",
    seo_description: "",
    seo_canonical_url: null,
    seo_focus_keyword: "",
    seo_secondary_keywords: [],
    seo_h1_title: "",
    seo_index: true,
    og_title: "",
    og_description: "",
    og_image_url: null,
    og_image_alt: "",
    twitter_card: "summary_large_image",
  };
}

export function PostsAdminClient() {
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PostInput>(emptyForm());
  const [publishedAtLocal, setPublishedAtLocal] = useState(toLocalDateTimeInput(new Date().toISOString()));
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [p, t] = await Promise.all([fetchAllPostsAdmin(), fetchAllTagsAdmin()]);
      setPosts(p);
      setTags(t);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load posts.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);

  function openCreate() {
    setEditingId(null);
    const base = emptyForm();
    setForm(base);
    setPublishedAtLocal(toLocalDateTimeInput(base.published_at!));
    setSlugTouched(false);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(post: AdminPost) {
    setEditingId(post.id);
    setForm({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      content: post.content,
      cover_image_url: post.cover_image_url,
      author_name: post.author_name,
      is_published: post.is_published,
      published_at: post.published_at,
      tagIds: post.tagIds,
      seo_title: post.seo_title,
      seo_description: post.seo_description,
      seo_canonical_url: post.seo_canonical_url,
      seo_focus_keyword: post.seo_focus_keyword,
      seo_secondary_keywords: post.seo_secondary_keywords,
      seo_h1_title: post.seo_h1_title,
      seo_index: post.seo_index,
      og_title: post.og_title,
      og_description: post.og_description,
      og_image_url: post.og_image_url,
      og_image_alt: post.og_image_alt,
      twitter_card: post.twitter_card,
    });
    setPublishedAtLocal(toLocalDateTimeInput(post.published_at));
    setSlugTouched(true);
    setFormError(null);
    setFormOpen(true);
  }

  function handleTitleChange(title: string) {
    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
  }

  async function handleAiGeneratePostSeo() {
    if (!form.title) return;
    setAiLoading(true);
    setFormError(null);
    try {
      const result = await generateSeoWithAi({
        itemType: "post",
        title: form.title,
        description: form.excerpt,
        fields: ["seo_title", "meta_description", "focus_keyword", "secondary_keywords", "og_description"],
      });
      setForm((f) => ({
        ...f,
        seo_title: typeof result.seo_title === "string" ? result.seo_title : f.seo_title,
        seo_description: typeof result.meta_description === "string" ? result.meta_description : f.seo_description,
        seo_focus_keyword: typeof result.focus_keyword === "string" ? result.focus_keyword : f.seo_focus_keyword,
        seo_secondary_keywords: Array.isArray(result.secondary_keywords)
          ? result.secondary_keywords
          : f.seo_secondary_keywords,
        og_description: typeof result.og_description === "string" ? result.og_description : f.og_description,
      }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "AI generation failed.");
    } finally {
      setAiLoading(false);
    }
  }

  function toggleTag(tagId: string) {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(tagId) ? f.tagIds.filter((id) => id !== tagId) : [...f.tagIds, tagId],
    }));
  }

  async function handleCoverUpload(file: File) {
    setUploading(true);
    try {
      const url = await uploadContentImage(form.slug || "post", file);
      setForm((f) => ({ ...f, cover_image_url: url }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
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
      const payload: PostInput = {
        ...form,
        published_at: new Date(publishedAtLocal).toISOString(),
      };
      if (editingId) {
        await updatePost(editingId, payload);
      } else {
        await createPost(payload);
      }
      await load();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(post: AdminPost) {
    if (!confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    try {
      await deletePost(post.id);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Blog / News</h1>
          <p className="mt-0.5 text-sm text-text-faint">Posts shown at mofigames.com/blog</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={16} />
          New Post
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
              <th className="px-4 py-3 font-semibold">Tags</th>
              <th className="px-4 py-3 font-semibold">Published</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {posts === null && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {posts?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  No posts yet — click &quot;New Post&quot; to write the first one.
                </td>
              </tr>
            )}
            {posts?.map((post) => (
              <tr
                key={post.id}
                className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3 font-semibold text-white">
                  <div className="flex items-center gap-1.5">
                    {post.title}
                    <a
                      href={`/blog/${post.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-text-faint hover:text-white"
                      aria-label="View post"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {post.tagIds.map((id) => {
                      const tag = tagsById.get(id);
                      if (!tag) return null;
                      return (
                        <span
                          key={id}
                          className="rounded-full px-2 py-0.5 text-[10px] font-bold text-black"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </span>
                      );
                    })}
                  </div>
                </td>
                <td className="px-4 py-3 text-white/80">
                  {new Date(post.published_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      post.is_published ? "bg-white/10 text-white" : "bg-white/5 text-text-faint"
                    }`}
                  >
                    {post.is_published ? "Published" : "Draft"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(post)}
                      aria-label={`Edit ${post.title}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(post)}
                      aria-label={`Delete ${post.title}`}
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
            className="glass-opaque flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-[var(--color-surface-border)] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">
                {editingId ? "Edit Post" : "New Post"}
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
                  Post will live at mofigames.com/blog/{form.slug || "your-slug"}
                </p>
              </Field>

              <Field label="Cover image (optional)">
                <div className="flex items-center gap-3">
                  {form.cover_image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.cover_image_url}
                      alt=""
                      className="h-14 w-20 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <label className="glass flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
                    {form.cover_image_url ? "Replace image" : "Upload image"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleCoverUpload(e.target.files[0])}
                    />
                  </label>
                  {form.cover_image_url && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, cover_image_url: null }))}
                      className="text-xs font-semibold text-text-faint hover:text-hot"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </Field>

              <Field label="Excerpt (short summary shown on the blog list)">
                <textarea
                  value={form.excerpt}
                  onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
                  rows={2}
                  className="admin-input resize-none"
                />
              </Field>

              <Field label="Content">
                <RichTextEditor
                  value={form.content}
                  onChange={(content) => setForm((f) => ({ ...f, content }))}
                  placeholder="Write the post…"
                />
              </Field>

              {tags.length > 0 && (
                <Field label="Tags">
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((tag) => {
                      const active = form.tagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleTag(tag.id)}
                          className="rounded-full px-2.5 py-1 text-xs font-bold transition-opacity"
                          style={{
                            backgroundColor: tag.color,
                            color: "#000",
                            opacity: active ? 1 : 0.35,
                          }}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Author name">
                  <input
                    value={form.author_name}
                    onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
                    className="admin-input"
                  />
                </Field>
                <Field label="Published date">
                  <input
                    type="datetime-local"
                    value={publishedAtLocal}
                    onChange={(e) => setPublishedAtLocal(e.target.value)}
                    className="admin-input"
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Published
              </label>

              <h3 className="-mb-1 mt-2 border-t border-[var(--color-surface-border)] pt-4 text-xs font-bold uppercase tracking-wide text-text-faint">
                SEO
              </h3>

              <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <p className="text-xs text-text-faint">Draft SEO title, description &amp; keywords from the post title/excerpt.</p>
                <button
                  type="button"
                  disabled={aiLoading || !form.title}
                  onClick={handleAiGeneratePostSeo}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Generate with AI
                </button>
              </div>

              <Field label={`SEO title (${(form.seo_title ?? "").length}/70)`}>
                <input
                  value={form.seo_title}
                  onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))}
                  placeholder="Falls back to the post title"
                  maxLength={70}
                  className="admin-input"
                />
              </Field>
              <Field label={`SEO description (${(form.seo_description ?? "").length}/300)`}>
                <textarea
                  value={form.seo_description}
                  onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))}
                  rows={2}
                  maxLength={300}
                  placeholder="Falls back to the excerpt"
                  className="admin-input resize-none"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Focus keyword">
                  <input
                    value={form.seo_focus_keyword}
                    onChange={(e) => setForm((f) => ({ ...f, seo_focus_keyword: e.target.value }))}
                    className="admin-input"
                  />
                </Field>
                <Field label="H1 title">
                  <input
                    value={form.seo_h1_title}
                    onChange={(e) => setForm((f) => ({ ...f, seo_h1_title: e.target.value }))}
                    placeholder="Falls back to the post title"
                    className="admin-input"
                  />
                </Field>
              </div>
              <Field label="Secondary keywords (comma-separated)">
                <input
                  value={(form.seo_secondary_keywords ?? []).join(", ")}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      seo_secondary_keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean),
                    }))
                  }
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
              <div className="grid grid-cols-2 gap-3">
                <Field label="OG title">
                  <input
                    value={form.og_title}
                    onChange={(e) => setForm((f) => ({ ...f, og_title: e.target.value }))}
                    placeholder="Falls back to the SEO title"
                    className="admin-input"
                  />
                </Field>
                <Field label="Twitter card type">
                  <select
                    value={form.twitter_card}
                    onChange={(e) => setForm((f) => ({ ...f, twitter_card: e.target.value as PostInput["twitter_card"] }))}
                    className="admin-input"
                  >
                    <option value="summary_large_image">Summary large image</option>
                    <option value="summary">Summary</option>
                  </select>
                </Field>
              </div>
              <Field label="OG description">
                <textarea
                  value={form.og_description}
                  onChange={(e) => setForm((f) => ({ ...f, og_description: e.target.value }))}
                  rows={2}
                  className="admin-input resize-none"
                />
              </Field>
              <label className="flex items-center gap-2 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={form.seo_index ?? true}
                  onChange={(e) => setForm((f) => ({ ...f, seo_index: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Index this post in search
              </label>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editingId ? "Save changes" : "Create post"}
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
