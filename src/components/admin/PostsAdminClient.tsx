"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Plus, Pencil, Trash2, X, Loader2, ExternalLink, ImagePlus, Sparkles,
  Search, MoreVertical, Copy, RotateCcw, ChevronDown, AlertTriangle, CheckCircle2,
} from "lucide-react";
import {
  fetchPostsAdminList,
  createPost,
  updatePost,
  trashPost,
  restorePost,
  duplicatePost,
  deletePost,
  runPostsBulkAction,
  uploadContentImage,
  fetchAllTagsAdmin,
  generateSeoWithAi,
  type AdminPost,
  type AdminTag,
  type PostInput,
  type PostsAdminStatusFilter,
  type PostsAdminSort,
} from "@/lib/supabase/admin-content";
import { slugify } from "@/lib/prng";
import { RichTextEditor } from "./RichTextEditor";

// ─── Constants ──────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;
const MAX_SELECT = 500;

const STATUS_TABS: { value: PostsAdminStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "trash", label: "Trash" },
];

const SORT_OPTIONS: { value: PostsAdminSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Recently updated" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "title_desc", label: "Title Z–A" },
  { value: "published_date", label: "Published date" },
];

type EditorTab = "general" | "publishing" | "seo" | "social";
const EDITOR_TABS: { value: EditorTab; label: string }[] = [
  { value: "general", label: "General" },
  { value: "publishing", label: "Publishing" },
  { value: "seo", label: "SEO" },
  { value: "social", label: "Social" },
];

// ─── Toast ──────────────────────────────────────────────────────────────────

type ToastKind = "success" | "error";
interface ToastMessage { id: number; kind: ToastKind; text: string }

// ─── Confirm ────────────────────────────────────────────────────────────────

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

// ─── Form ───────────────────────────────────────────────────────────────────

function toLocalDT(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function emptyForm(): PostInput {
  return {
    slug: "",
    title: "",
    excerpt: "",
    content: "",
    cover_image_url: null,
    author_name: "MofiGames Team",
    is_published: false,
    published_at: new Date().toISOString(),
    scheduled_publish_at: null,
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
    twitter_title: "",
    twitter_description: "",
    twitter_image_url: null,
    twitter_image_alt: "",
  };
}

// ─── Status badge ────────────────────────────────────────────────────────────

function PostStatusBadge({ post }: { post: AdminPost }) {
  if (post.deleted_at) {
    return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-400">Trash</span>;
  }
  if (!post.is_published && post.scheduled_publish_at) {
    return <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-300">Scheduled</span>;
  }
  if (post.is_published) {
    return <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-400">Published</span>;
  }
  return <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-text-faint">Draft</span>;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PostsAdminClient() {
  // List state
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<PostsAdminStatusFilter>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [sort, setSort] = useState<PostsAdminSort>("newest");

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkDropOpen, setBulkDropOpen] = useState(false);

  // Editor state
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PostInput>(emptyForm());
  const [editorTab, setEditorTab] = useState<EditorTab>("general");
  const [publishedAtLocal, setPublishedAtLocal] = useState(toLocalDT(new Date().toISOString()));
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Row action dropdown
  const [dropdownPostId, setDropdownPostId] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

  // Toast / Confirm
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastRef = useRef(0);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── Debounced search ──────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { setQ(searchInput); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [result, tagList] = await Promise.all([
        fetchPostsAdminList({ page, pageSize: PAGE_SIZE, q, status, tag: tagFilter || undefined, sort }),
        tags.length === 0 ? fetchAllTagsAdmin() : Promise.resolve(null),
      ]);
      setPosts(result.posts);
      setTotal(result.total);
      if (tagList) setTags(tagList);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load posts.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, q, status, tagFilter, sort]);

  useEffect(() => { load(); }, [load]);

  // Reset page when filters change
  useEffect(() => { setPage(1); setSelected(new Set()); }, [q, status, tagFilter, sort]);

  const tagsById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // ── Toast helpers ─────────────────────────────────────────────────────────
  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = ++toastRef.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  // ── Confirm helper ────────────────────────────────────────────────────────
  const showConfirm = useCallback((cfg: ConfirmState) => setConfirm(cfg), []);

  async function handleConfirm() {
    if (!confirm) return;
    setConfirmLoading(true);
    try {
      await confirm.onConfirm();
    } finally {
      setConfirmLoading(false);
      setConfirm(null);
    }
  }

  // ── Selection helpers ─────────────────────────────────────────────────────
  const pageIds = useMemo(() => (posts ?? []).map((p) => p.id), [posts]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelected((s) => { const n = new Set(s); pageIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelected((s) => {
        const n = new Set(s);
        for (const id of pageIds) {
          if (n.size < MAX_SELECT) n.add(id);
        }
        return n;
      });
    }
  }

  function toggleRow(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.size < MAX_SELECT && n.add(id); return n; });
  }

  // ── Bulk action ───────────────────────────────────────────────────────────
  async function runBulkAction(action: string) {
    if (selected.size === 0) return;
    setBulkLoading(true);
    setBulkDropOpen(false);
    try {
      const result = await runPostsBulkAction({ action: action as Parameters<typeof runPostsBulkAction>[0]["action"], ids: [...selected] });
      const msg = `${result.affected} post${result.affected === 1 ? "" : "s"} updated.`;
      toast("success", result.warning ? `${msg} ${result.warning}` : msg);
      if (result.skipped && result.skipped > 0) {
        toast("error", `${result.skipped} skipped: ${result.skippedReason}`);
      }
      setSelected(new Set());
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Bulk action failed.");
    } finally {
      setBulkLoading(false);
    }
  }

  function confirmBulkAction(action: string, label: string, danger = false) {
    showConfirm({
      title: label,
      description: `Apply "${label}" to ${selected.size} selected post${selected.size === 1 ? "" : "s"}?`,
      confirmLabel: label,
      danger,
      onConfirm: () => runBulkAction(action),
    });
  }

  // ── Row actions ───────────────────────────────────────────────────────────
  function openDropdown(e: React.MouseEvent, postId: string) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDropdownPos({ top: rect.bottom + window.scrollY + 4, right: window.innerWidth - rect.right });
    setDropdownPostId(postId);
  }

  async function handleTrash(post: AdminPost) {
    setDropdownPostId(null);
    showConfirm({
      title: "Move to Trash",
      description: `Move "${post.title}" to the Trash? You can restore it later.`,
      confirmLabel: "Move to Trash",
      danger: true,
      onConfirm: async () => {
        await trashPost(post.id);
        toast("success", `"${post.title}" moved to Trash.`);
        await load();
      },
    });
  }

  async function handleRestore(post: AdminPost) {
    setDropdownPostId(null);
    try {
      await restorePost(post.id);
      toast("success", `"${post.title}" restored.`);
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Restore failed.");
    }
  }

  async function handlePermanentDelete(post: AdminPost) {
    setDropdownPostId(null);
    showConfirm({
      title: "Permanently delete",
      description: `Permanently delete "${post.title}"? This cannot be undone and will remove any associated media.`,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: async () => {
        await deletePost(post.id);
        toast("success", `"${post.title}" permanently deleted.`);
        await load();
      },
    });
  }

  async function handleDuplicate(post: AdminPost) {
    setDropdownPostId(null);
    try {
      const dup = await duplicatePost(post.id);
      toast("success", `Duplicated as "${dup.title}".`);
      await load();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Duplicate failed.");
    }
  }

  // ── Editor ────────────────────────────────────────────────────────────────
  function openCreate() {
    setEditingId(null);
    const base = emptyForm();
    setForm(base);
    setPublishedAtLocal(toLocalDT(base.published_at!));
    setScheduleLocal("");
    setSlugTouched(false);
    setFormError(null);
    setEditorTab("general");
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
      scheduled_publish_at: post.scheduled_publish_at,
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
      twitter_title: post.twitter_title ?? "",
      twitter_description: post.twitter_description ?? "",
      twitter_image_url: post.twitter_image_url ?? null,
      twitter_image_alt: post.twitter_image_alt ?? "",
    });
    setPublishedAtLocal(toLocalDT(post.published_at));
    setScheduleLocal(post.scheduled_publish_at ? toLocalDT(post.scheduled_publish_at) : "");
    setSlugTouched(true);
    setFormError(null);
    setEditorTab("general");
    setFormOpen(true);
  }

  function handleTitleChange(title: string) {
    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
  }

  function toggleTag(tagId: string) {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(tagId) ? f.tagIds.filter((id) => id !== tagId) : [...f.tagIds, tagId],
    }));
  }

  async function handleImageUpload(field: "cover_image_url" | "og_image_url" | "twitter_image_url", file: File) {
    setUploading(field);
    try {
      const url = await uploadContentImage(form.slug || "post", file);
      setForm((f) => ({ ...f, [field]: url }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploading(null);
    }
  }

  async function handleAiGenerateSeo() {
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
        seo_secondary_keywords: Array.isArray(result.secondary_keywords) ? result.secondary_keywords : f.seo_secondary_keywords,
        og_description: typeof result.og_description === "string" ? result.og_description : f.og_description,
      }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "AI generation failed.");
    } finally {
      setAiLoading(false);
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
      const scheduledAt = scheduleLocal ? new Date(scheduleLocal).toISOString() : null;
      const payload: PostInput = {
        ...form,
        published_at: new Date(publishedAtLocal).toISOString(),
        scheduled_publish_at: scheduledAt,
      };
      if (editingId) {
        await updatePost(editingId, payload);
      } else {
        await createPost(payload);
      }
      toast("success", editingId ? "Post updated." : "Post created.");
      await load();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div onClick={() => setDropdownPostId(null)}>
      {/* ── Toast stack ─────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${
              t.kind === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"
            }`}
          >
            {t.kind === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {t.text}
          </div>
        ))}
      </div>

      {/* ── Confirm dialog ──────────────────────────────────────────────── */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="glass-opaque w-full max-w-md rounded-2xl p-6">
            <div className="mb-2 flex items-start gap-3">
              {confirm.danger && <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-400" />}
              <h3 className="font-display text-lg font-bold text-white">{confirm.title}</h3>
            </div>
            <p className="mb-5 text-sm text-text-faint">{confirm.description}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={confirmLoading}
                onClick={handleConfirm}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-60 ${
                  confirm.danger ? "bg-red-500 hover:bg-red-600" : "glow-yellow-button bg-[var(--color-menu-bg)]"
                }`}
              >
                {confirmLoading && <Loader2 size={14} className="animate-spin" />}
                {confirm.confirmLabel}
              </button>
              <button
                type="button"
                disabled={confirmLoading}
                onClick={() => setConfirm(null)}
                className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Blog / News</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {posts !== null ? `${total} post${total === 1 ? "" : "s"} total` : "Loading…"}
          </p>
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
        <div className="mb-4 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      {/* ── Status tabs ─────────────────────────────────────────────────── */}
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => { setStatus(tab.value); setPage(1); setSelected(new Set()); }}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              status === tab.value
                ? "bg-white text-black"
                : "bg-white/10 text-text-faint hover:bg-white/15 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Search + Sort ────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search posts…"
            className="admin-input w-full pl-8"
          />
        </div>
        {tags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
            className="admin-input"
          >
            <option value="">All tags</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        <select
          value={sort}
          onChange={(e) => { setSort(e.target.value as PostsAdminSort); setPage(1); }}
          className="admin-input"
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* ── Bulk toolbar ────────────────────────────────────────────────── */}
      {someSelected && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-white/[0.05] px-4 py-2.5">
          <span className="text-sm font-semibold text-white">
            {selected.size} selected{selected.size >= MAX_SELECT ? ` (max ${MAX_SELECT})` : ""}
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs text-text-faint hover:text-white"
          >
            Clear
          </button>
          {bulkLoading ? (
            <Loader2 size={15} className="animate-spin text-white/60" />
          ) : (
            <div className="relative">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setBulkDropOpen((o) => !o); }}
                className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20"
              >
                Bulk actions <ChevronDown size={12} />
              </button>
              {bulkDropOpen && (
                <div className="glass-opaque absolute right-0 top-full z-40 mt-1 w-44 overflow-hidden rounded-xl py-1 shadow-xl">
                  {status === "trash" ? (
                    <>
                      <DropItem onClick={() => confirmBulkAction("restore", "Restore")}>Restore</DropItem>
                      <DropItem danger onClick={() => confirmBulkAction("delete_permanent", "Permanently delete", true)}>Delete permanently</DropItem>
                    </>
                  ) : (
                    <>
                      <DropItem onClick={() => confirmBulkAction("publish", "Publish")}>Publish</DropItem>
                      <DropItem onClick={() => confirmBulkAction("draft", "Move to Draft")}>Move to Draft</DropItem>
                      <DropItem danger onClick={() => confirmBulkAction("trash", "Move to Trash", true)}>Move to Trash</DropItem>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded"
                  checked={allPageSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="hidden px-4 py-3 font-semibold sm:table-cell">Tags</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Date</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {posts === null && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-faint"><Loader2 size={18} className="mx-auto animate-spin" /></td></tr>
            )}
            {posts?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-faint">
                {q || tagFilter ? "No posts match the current filters." : status === "trash" ? "The Trash is empty." : "No posts yet — click \"New Post\" to write the first one."}
              </td></tr>
            )}
            {posts?.map((post) => (
              <tr
                key={post.id}
                className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded"
                    checked={selected.has(post.id)}
                    onChange={() => toggleRow(post.id)}
                  />
                </td>
                <td className="px-4 py-3 font-semibold text-white">
                  <div className="flex items-center gap-1.5">
                    <span className="line-clamp-1">{post.title}</span>
                    {!post.deleted_at && (
                      <a href={`/blog/${post.slug}`} target="_blank" rel="noreferrer" className="shrink-0 text-text-faint hover:text-white" aria-label="Preview">
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </td>
                <td className="hidden px-4 py-3 sm:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {post.tagIds.slice(0, 3).map((id) => {
                      const tag = tagsById.get(id);
                      if (!tag) return null;
                      return (
                        <span key={id} className="rounded-full px-2 py-0.5 text-[10px] font-bold text-black" style={{ backgroundColor: tag.color }}>
                          {tag.name}
                        </span>
                      );
                    })}
                    {post.tagIds.length > 3 && <span className="text-[10px] text-text-faint">+{post.tagIds.length - 3}</span>}
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-white/60 md:table-cell">
                  {post.deleted_at
                    ? `Trashed ${new Date(post.deleted_at).toLocaleDateString()}`
                    : post.scheduled_publish_at
                    ? `Scheduled ${new Date(post.scheduled_publish_at).toLocaleDateString()}`
                    : new Date(post.published_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3"><PostStatusBadge post={post} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {!post.deleted_at && (
                      <button type="button" onClick={() => openEdit(post)} aria-label="Edit" className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
                        <Pencil size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => openDropdown(e, post.id)}
                      aria-label="More actions"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <MoreVertical size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="glass rounded-full px-4 py-2 text-sm font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-text-faint">Page {page} of {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="glass rounded-full px-4 py-2 text-sm font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Row dropdown ────────────────────────────────────────────────── */}
      {dropdownPostId && (() => {
        const post = posts?.find((p) => p.id === dropdownPostId);
        if (!post) return null;
        return (
          <div
            className="glass-opaque fixed z-50 w-44 overflow-hidden rounded-xl py-1 shadow-xl"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
            onClick={(e) => e.stopPropagation()}
          >
            {post.deleted_at ? (
              <>
                <DropItem onClick={() => handleRestore(post)}><RotateCcw size={13} className="mr-1.5" />Restore</DropItem>
                <DropItem danger onClick={() => handlePermanentDelete(post)}><Trash2 size={13} className="mr-1.5" />Delete permanently</DropItem>
              </>
            ) : (
              <>
                <DropItem onClick={() => { setDropdownPostId(null); openEdit(post); }}><Pencil size={13} className="mr-1.5" />Edit</DropItem>
                <DropItem onClick={() => handleDuplicate(post)}><Copy size={13} className="mr-1.5" />Duplicate</DropItem>
                <DropItem danger onClick={() => handleTrash(post)}><Trash2 size={13} className="mr-1.5" />Move to Trash</DropItem>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Editor panel ────────────────────────────────────────────────── */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setFormOpen(false)}>
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="glass-opaque flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-[var(--color-surface-border)]"
          >
            {/* Panel header */}
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-surface-border)] px-5 py-4">
              <h2 className="font-display text-lg font-bold text-white">{editingId ? "Edit Post" : "New Post"}</h2>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10">
                <X size={18} className="text-white/70" />
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex shrink-0 gap-1 border-b border-[var(--color-surface-border)] px-5 py-2">
              {EDITOR_TABS.map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setEditorTab(tab.value)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    editorTab === tab.value
                      ? "bg-white text-black"
                      : "text-text-faint hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {formError && (
              <p className="mx-5 mt-3 rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{formError}</p>
            )}

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-5">
              {/* ── GENERAL ─── */}
              {editorTab === "general" && (
                <div className="flex flex-col gap-4">
                  <Field label="Title">
                    <input value={form.title} onChange={(e) => handleTitleChange(e.target.value)} className="admin-input" required />
                  </Field>
                  <Field label="Slug (URL)">
                    <input
                      value={form.slug}
                      onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: slugify(e.target.value) })); }}
                      className="admin-input"
                      required
                    />
                    <p className="mt-1 text-[11px] text-text-faint">mofigames.com/blog/{form.slug || "your-slug"}</p>
                  </Field>
                  <Field label="Excerpt">
                    <textarea value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} rows={2} className="admin-input resize-none" />
                  </Field>
                  <Field label="Content">
                    <RichTextEditor value={form.content} onChange={(content) => setForm((f) => ({ ...f, content }))} placeholder="Write the post…" />
                  </Field>
                  <Field label="Cover image">
                    <ImageField
                      url={form.cover_image_url}
                      uploading={uploading === "cover_image_url"}
                      onUpload={(file) => handleImageUpload("cover_image_url", file)}
                      onRemove={() => setForm((f) => ({ ...f, cover_image_url: null }))}
                    />
                  </Field>
                  <Field label="Author">
                    <input value={form.author_name} onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))} className="admin-input" />
                  </Field>
                  {tags.length > 0 && (
                    <Field label="Tags">
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map((tag) => {
                          const active = form.tagIds.includes(tag.id);
                          return (
                            <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} className="rounded-full px-2.5 py-1 text-xs font-bold transition-opacity" style={{ backgroundColor: tag.color, color: "#000", opacity: active ? 1 : 0.35 }}>
                              {tag.name}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  )}
                </div>
              )}

              {/* ── PUBLISHING ─── */}
              {editorTab === "publishing" && (
                <div className="flex flex-col gap-4">
                  <Field label="Status">
                    <select
                      value={form.is_published ? "published" : scheduleLocal ? "scheduled" : "draft"}
                      onChange={(e) => {
                        if (e.target.value === "published") {
                          setForm((f) => ({ ...f, is_published: true, scheduled_publish_at: null }));
                          setScheduleLocal("");
                        } else if (e.target.value === "draft") {
                          setForm((f) => ({ ...f, is_published: false, scheduled_publish_at: null }));
                          setScheduleLocal("");
                        } else {
                          setForm((f) => ({ ...f, is_published: false }));
                        }
                      }}
                      className="admin-input"
                    >
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="published">Published</option>
                    </select>
                  </Field>
                  {!form.is_published && (
                    <Field label="Scheduled publish date">
                      <input
                        type="datetime-local"
                        value={scheduleLocal}
                        onChange={(e) => setScheduleLocal(e.target.value)}
                        className="admin-input"
                      />
                      <p className="mt-1 text-[11px] text-text-faint">Leave blank to save as Draft. The post will go live automatically at this time.</p>
                    </Field>
                  )}
                  <Field label="Published date (display)">
                    <input type="datetime-local" value={publishedAtLocal} onChange={(e) => setPublishedAtLocal(e.target.value)} className="admin-input" />
                  </Field>
                </div>
              )}

              {/* ── SEO ─── */}
              {editorTab === "seo" && (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                    <p className="text-xs text-text-faint">Generate SEO fields from title &amp; excerpt.</p>
                    <button type="button" disabled={aiLoading || !form.title} onClick={handleAiGenerateSeo} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-50">
                      {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      Generate with AI
                    </button>
                  </div>
                  <Field label={`SEO title (${(form.seo_title ?? "").length}/70)`}>
                    <input value={form.seo_title} onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))} placeholder="Falls back to post title" maxLength={70} className="admin-input" />
                  </Field>
                  <Field label={`Meta description (${(form.seo_description ?? "").length}/300)`}>
                    <textarea value={form.seo_description} onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))} rows={2} maxLength={300} placeholder="Falls back to excerpt" className="admin-input resize-none" />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Focus keyword">
                      <input value={form.seo_focus_keyword} onChange={(e) => setForm((f) => ({ ...f, seo_focus_keyword: e.target.value }))} className="admin-input" />
                    </Field>
                    <Field label="H1 title">
                      <input value={form.seo_h1_title} onChange={(e) => setForm((f) => ({ ...f, seo_h1_title: e.target.value }))} placeholder="Falls back to title" className="admin-input" />
                    </Field>
                  </div>
                  <Field label="Secondary keywords (comma-separated)">
                    <input
                      value={(form.seo_secondary_keywords ?? []).join(", ")}
                      onChange={(e) => setForm((f) => ({ ...f, seo_secondary_keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) }))}
                      className="admin-input"
                    />
                  </Field>
                  <Field label="Canonical URL">
                    <input value={form.seo_canonical_url ?? ""} onChange={(e) => setForm((f) => ({ ...f, seo_canonical_url: e.target.value || null }))} placeholder="Auto-generated if blank" className="admin-input" />
                  </Field>
                  <label className="flex items-center gap-2 text-xs text-text-muted">
                    <input type="checkbox" checked={form.seo_index ?? true} onChange={(e) => setForm((f) => ({ ...f, seo_index: e.target.checked }))} className="h-4 w-4 rounded" />
                    Index this post in search engines
                  </label>
                </div>
              )}

              {/* ── SOCIAL ─── */}
              {editorTab === "social" && (
                <div className="flex flex-col gap-4">
                  <SectionHeading>Open Graph</SectionHeading>
                  <Field label="OG title">
                    <input value={form.og_title} onChange={(e) => setForm((f) => ({ ...f, og_title: e.target.value }))} placeholder="Falls back to SEO title" className="admin-input" />
                  </Field>
                  <Field label="OG description">
                    <textarea value={form.og_description} onChange={(e) => setForm((f) => ({ ...f, og_description: e.target.value }))} rows={2} className="admin-input resize-none" />
                  </Field>
                  <Field label="OG image">
                    <ImageField
                      url={form.og_image_url}
                      uploading={uploading === "og_image_url"}
                      onUpload={(file) => handleImageUpload("og_image_url", file)}
                      onRemove={() => setForm((f) => ({ ...f, og_image_url: null }))}
                    />
                  </Field>
                  <Field label="OG image alt text">
                    <input value={form.og_image_alt} onChange={(e) => setForm((f) => ({ ...f, og_image_alt: e.target.value }))} className="admin-input" />
                  </Field>

                  <SectionHeading>Twitter / X</SectionHeading>
                  <Field label="Twitter card type">
                    <select value={form.twitter_card} onChange={(e) => setForm((f) => ({ ...f, twitter_card: e.target.value as PostInput["twitter_card"] }))} className="admin-input">
                      <option value="summary_large_image">Summary large image</option>
                      <option value="summary">Summary</option>
                    </select>
                  </Field>
                  <Field label="Twitter title">
                    <input value={form.twitter_title ?? ""} onChange={(e) => setForm((f) => ({ ...f, twitter_title: e.target.value }))} placeholder="Falls back to OG title" className="admin-input" />
                  </Field>
                  <Field label="Twitter description">
                    <textarea value={form.twitter_description ?? ""} onChange={(e) => setForm((f) => ({ ...f, twitter_description: e.target.value }))} rows={2} className="admin-input resize-none" />
                  </Field>
                  <Field label="Twitter image">
                    <ImageField
                      url={form.twitter_image_url ?? null}
                      uploading={uploading === "twitter_image_url"}
                      onUpload={(file) => handleImageUpload("twitter_image_url", file)}
                      onRemove={() => setForm((f) => ({ ...f, twitter_image_url: null }))}
                    />
                  </Field>
                  <Field label="Twitter image alt text">
                    <input value={form.twitter_image_alt ?? ""} onChange={(e) => setForm((f) => ({ ...f, twitter_image_alt: e.target.value }))} className="admin-input" />
                  </Field>
                </div>
              )}
            </div>

            {/* Panel footer */}
            <div className="flex shrink-0 gap-2 border-t border-[var(--color-surface-border)] px-5 py-4">
              <button type="submit" disabled={saving} className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editingId ? "Save changes" : "Create post"}
              </button>
              <button type="button" onClick={() => setFormOpen(false)} className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="-mb-1 mt-2 border-t border-[var(--color-surface-border)] pt-4 text-xs font-bold uppercase tracking-wide text-text-faint first:mt-0 first:border-0 first:pt-0">
      {children}
    </h3>
  );
}

function ImageField({ url, uploading, onUpload, onRemove }: {
  url: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
      )}
      <label className="glass flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-white hover:bg-white/10">
        {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
        {url ? "Replace" : "Upload"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
      </label>
      {url && (
        <button type="button" onClick={onRemove} className="text-xs font-semibold text-text-faint hover:text-hot">
          Remove
        </button>
      )}
    </div>
  );
}

function DropItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center px-4 py-2 text-left text-xs font-semibold hover:bg-white/10 ${danger ? "text-red-400" : "text-white"}`}
    >
      {children}
    </button>
  );
}
