"use client";

import {
  useCallback, useEffect, useMemo, useRef,
  useState, type DragEvent, type FormEvent,
} from "react";
import Link from "next/link";
import {
  Plus, Pencil, Trash2, X, Loader2, Sparkles,
  LayoutGrid, Tag, Search, GripVertical, AlertTriangle, CheckCircle2,
  ChevronUp, ChevronDown,
} from "lucide-react";

const BUILT_IN_SLUGS = new Set([
  "multiplayer", "action", "adventure", "arcade", "brain", "driving",
  "io-games", "shooting-games", "puzzle-games", "simulation", "sports",
  "strategy", "trivia", "word", "casual", "board", "card", "clicker",
]);

import {
  fetchAllCategoriesAdminWithUsage,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  generateSeoWithAi,
  type AdminCategoryWithUsage,
  type CategoryInput,
} from "@/lib/supabase/admin-content";
import { slugify } from "@/lib/prng";
import { ICON_NAMES } from "@/lib/icon-map";

// ─── Types ────────────────────────────────────────────────────────────────

type ToastKind = "success" | "error";
interface ToastMsg { id: number; kind: ToastKind; text: string }
interface ConfirmCfg { title: string; description: string; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void> }

// ─── Default form ─────────────────────────────────────────────────────────

const emptyForm: CategoryInput = {
  slug: "", name: "", icon: "Gamepad2",
  color_from: "#8b5cf6", color_to: "#ec4899",
  description: "", sort_order: 0,
  seo_title: "", seo_description: "", seo_canonical_url: null,
  seo_focus_keyword: "", seo_h1_title: "", seo_index: true,
  breadcrumbs_enabled: true, schema_collection_page: true,
  og_image_url: null,
  show_on_homepage: true, homepage_position: null, homepage_label: null,
  display_style: "default",
  content: [],
};

// ─── Component ────────────────────────────────────────────────────────────

export function CategoriesAdminClient() {
  const [categories, setCategories] = useState<AdminCategoryWithUsage[] | null>(null);
  const [orderedSlugs, setOrderedSlugs] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Drag
  const dragSlug = useRef<string | null>(null);
  const dragOverSlug = useRef<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // Editor
  const [formOpen, setFormOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryInput>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // Toast / Confirm
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastRef = useRef(0);
  const [confirm, setConfirm] = useState<ConfirmCfg | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchAllCategoriesAdminWithUsage();
      setCategories(data);
      setOrderedSlugs(data.map((c) => c.slug));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load categories.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const catMap = useMemo(
    () => new Map((categories ?? []).map((c) => [c.slug, c])),
    [categories],
  );

  const displayList = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ordered = orderedSlugs.map((s) => catMap.get(s)).filter(Boolean) as AdminCategoryWithUsage[];
    if (!q) return ordered;
    return ordered.filter((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q));
  }, [orderedSlugs, catMap, search]);

  // ── Toast ─────────────────────────────────────────────────────────────

  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = ++toastRef.current;
    setToasts((p) => [...p, { id, kind, text }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4000);
  }, []);

  // ── Confirm ───────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!confirm) return;
    setConfirmLoading(true);
    try { await confirm.onConfirm(); }
    finally { setConfirmLoading(false); setConfirm(null); }
  }

  // ── Selection ─────────────────────────────────────────────────────────

  const allSelected = displayList.length > 0 && displayList.every((c) => selected.has(c.slug));

  function toggleAll() {
    if (allSelected) {
      setSelected((s) => { const n = new Set(s); displayList.forEach((c) => n.delete(c.slug)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); displayList.forEach((c) => n.add(c.slug)); return n; });
    }
  }

  function toggleRow(slug: string) {
    setSelected((s) => { const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  }

  // ── Bulk delete ───────────────────────────────────────────────────────

  function confirmBulkDelete() {
    const count = selected.size;
    setConfirm({
      title: "Bulk delete categories",
      description: `Delete ${count} categor${count === 1 ? "y" : "ies"}? Any games in them will become uncategorised. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkLoading(true);
        let deleted = 0;
        const errors: string[] = [];
        for (const slug of selected) {
          const cat = catMap.get(slug);
          if (cat && cat.gameCount > 0) {
            errors.push(`"${cat.name}" has ${cat.gameCount} game(s) — move them first.`);
            continue;
          }
          try { await deleteCategory(slug); deleted++; }
          catch (err) { errors.push(err instanceof Error ? err.message : `Failed to delete ${slug}.`); }
        }
        setBulkLoading(false);
        if (deleted > 0) { toast("success", `${deleted} categor${deleted === 1 ? "y" : "ies"} deleted.`); }
        if (errors.length > 0) { toast("error", errors.join(" ")); }
        setSelected(new Set());
        await load();
      },
    });
  }

  // ── Drag-and-drop (HTML5 native — no dependency needed) ───────────────

  function onDragStart(e: DragEvent, slug: string) {
    dragSlug.current = slug;
    setDragging(true);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: DragEvent, slug: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    dragOverSlug.current = slug;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const from = dragSlug.current;
    const to = dragOverSlug.current;
    if (!from || !to || from === to) return;
    setOrderedSlugs((prev) => {
      const next = [...prev];
      const fi = next.indexOf(from);
      const ti = next.indexOf(to);
      if (fi === -1 || ti === -1) return prev;
      next.splice(fi, 1);
      next.splice(ti, 0, from);
      return next;
    });
  }

  function onDragEnd() {
    dragSlug.current = null;
    dragOverSlug.current = null;
    setDragging(false);
  }

  async function saveOrder() {
    setSavingOrder(true);
    try {
      await reorderCategories(orderedSlugs);
      toast("success", "Category order saved.");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Failed to save order.");
    } finally {
      setSavingOrder(false);
    }
  }

  // ── Single delete ─────────────────────────────────────────────────────

  function handleDelete(cat: AdminCategoryWithUsage) {
    if (cat.gameCount > 0) {
      toast("error", `"${cat.name}" has ${cat.gameCount} game${cat.gameCount === 1 ? "" : "s"} assigned. Move them to another category first.`);
      return;
    }
    setConfirm({
      title: "Delete category",
      description: `Delete "${cat.name}"? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await deleteCategory(cat.slug);
        toast("success", `"${cat.name}" deleted.`);
        setSelected((s) => { const n = new Set(s); n.delete(cat.slug); return n; });
        await load();
      },
    });
  }

  // ── Editor ────────────────────────────────────────────────────────────

  function openCreate() {
    setEditingSlug(null); setForm(emptyForm); setSlugTouched(false);
    setFormError(null); setFormOpen(true);
  }

  function openEdit(cat: AdminCategoryWithUsage) {
    setEditingSlug(cat.slug);
    setForm({
      slug: cat.slug, name: cat.name, icon: cat.icon,
      color_from: cat.color_from, color_to: cat.color_to,
      description: cat.description, sort_order: cat.sort_order,
      seo_title: cat.seo_title, seo_description: cat.seo_description,
      seo_canonical_url: cat.seo_canonical_url, seo_focus_keyword: cat.seo_focus_keyword,
      seo_h1_title: cat.seo_h1_title, seo_index: cat.seo_index,
      breadcrumbs_enabled: cat.breadcrumbs_enabled, schema_collection_page: cat.schema_collection_page,
      og_image_url: cat.og_image_url,
      show_on_homepage: cat.show_on_homepage, homepage_position: cat.homepage_position,
      homepage_label: cat.homepage_label, display_style: cat.display_style,
      content: cat.content ?? [],
    });
    setSlugTouched(true); setFormError(null); setFormOpen(true);
  }

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
  }

  async function handleAiGenerateCategorySeo() {
    if (!form.name) return;
    setAiLoading(true); setFormError(null);
    try {
      const result = await generateSeoWithAi({
        itemType: "category", title: `${form.name} Games`, description: form.description,
        fields: ["seo_title", "meta_description", "focus_keyword"],
      });
      setForm((f) => ({
        ...f,
        seo_title: typeof result.seo_title === "string" ? result.seo_title : f.seo_title,
        seo_description: typeof result.meta_description === "string" ? result.meta_description : f.seo_description,
        seo_focus_keyword: typeof result.focus_keyword === "string" ? result.focus_keyword : f.seo_focus_keyword,
      }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "AI generation failed.");
    } finally { setAiLoading(false); }
  }

  // ── Content blocks ────────────────────────────────────────────────────

  function addContentBlock() {
    setForm((f) => ({ ...f, content: [...(f.content ?? []), { heading: "", body: "" }] }));
  }

  function removeContentBlock(i: number) {
    setForm((f) => ({ ...f, content: (f.content ?? []).filter((_, j) => j !== i) }));
  }

  function updateContentBlock(i: number, field: "heading" | "body", value: string) {
    setForm((f) => {
      const content = [...(f.content ?? [])];
      content[i] = { ...content[i], [field]: value };
      return { ...f, content };
    });
  }

  function moveContentBlock(i: number, dir: -1 | 1) {
    setForm((f) => {
      const content = [...(f.content ?? [])];
      const j = i + dir;
      if (j < 0 || j >= content.length) return f;
      [content[i], content[j]] = [content[j], content[i]];
      return { ...f, content };
    });
  }

  // ── Save ──────────────────────────────────────────────────────────────

  async function handleSave(e: FormEvent) {
    e.preventDefault(); setFormError(null);
    if (!form.name.trim() || !form.slug.trim()) { setFormError("Name and slug are required."); return; }
    setSaving(true);
    try {
      if (editingSlug) { await updateCategory(editingSlug, form); }
      else { await createCategory(form); }
      toast("success", editingSlug ? `"${form.name}" updated.` : `"${form.name}" created.`);
      await load(); setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally { setSaving(false); }
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toast stack */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${t.kind === "success" ? "bg-green-500 text-white" : "bg-red-500 text-white"}`}>
            {t.kind === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            {t.text}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="glass-opaque w-full max-w-md rounded-2xl p-6">
            <div className="mb-2 flex items-start gap-3">
              {confirm.danger && <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-400" />}
              <h3 className="font-display text-lg font-bold text-white">{confirm.title}</h3>
            </div>
            <p className="mb-5 text-sm text-text-faint">{confirm.description}</p>
            <div className="flex gap-2">
              <button type="button" disabled={confirmLoading} onClick={handleConfirm}
                className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-60 ${confirm.danger ? "bg-red-500 hover:bg-red-600" : "glow-yellow-button bg-[var(--color-menu-bg)]"}`}>
                {confirmLoading && <Loader2 size={14} className="animate-spin" />}
                {confirm.confirmLabel}
              </button>
              <button type="button" disabled={confirmLoading} onClick={() => setConfirm(null)}
                className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Categories</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {categories ? `${categories.length} categor${categories.length === 1 ? "y" : "ies"}` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {dragging === false && orderedSlugs.join(",") !== (categories ?? []).map((c) => c.slug).join(",") && (
            <button type="button" onClick={saveOrder} disabled={savingOrder}
              className="flex items-center gap-1.5 rounded-full bg-featured/20 px-4 py-2.5 text-sm font-bold text-featured hover:bg-featured/30 disabled:opacity-60">
              {savingOrder ? <Loader2 size={14} className="animate-spin" /> : null}
              Save order
            </button>
          )}
          <button type="button" onClick={openCreate}
            className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white">
            <Plus size={16} /> Add Category
          </button>
        </div>
      </div>

      {loadError && <div className="mb-4 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>}

      {/* Search */}
      <div className="relative mb-3 w-64">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search categories…" className="admin-input w-full pl-8" />
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-white/[0.05] px-4 py-2.5">
          <span className="text-sm font-semibold text-white">{selected.size} selected</span>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs text-text-faint hover:text-white">Clear</button>
          {bulkLoading
            ? <Loader2 size={14} className="animate-spin text-white/60" />
            : <button type="button" onClick={confirmBulkDelete}
                className="flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1.5 text-xs font-bold text-red-400 hover:bg-red-500/25">
                <Trash2 size={12} /> Delete selected
              </button>
          }
        </div>
      )}

      {/* Drag-order hint */}
      {!search && categories && categories.length > 1 && (
        <p className="mb-2 text-[11px] text-text-faint">
          <GripVertical size={11} className="mr-0.5 inline" />
          Drag rows to reorder. Click <strong className="text-white/60">Save order</strong> to persist.
        </p>
      )}

      {/* Table */}
      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3">
                <input type="checkbox" className="h-4 w-4 rounded" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="w-6 px-2 py-3" />
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Slug</th>
              <th className="px-4 py-3 font-semibold">Games</th>
              <th className="px-4 py-3 font-semibold">Colors</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Template</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Homepage</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {categories === null && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-text-faint"><Loader2 size={18} className="mx-auto animate-spin" /></td></tr>
            )}
            {categories?.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-text-faint">No categories yet — click &quot;Add Category&quot;.</td></tr>
            )}
            {categories && categories.length > 0 && displayList.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-text-faint">No categories match &quot;{search}&quot;.</td></tr>
            )}
            {displayList.map((c) => (
              <tr
                key={c.slug}
                draggable={!search}
                onDragStart={(e) => onDragStart(e, c.slug)}
                onDragOver={(e) => onDragOver(e, c.slug)}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                className={`border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03] ${dragSlug.current === c.slug ? "opacity-40" : ""}`}
              >
                <td className="px-4 py-3">
                  <input type="checkbox" className="h-4 w-4 rounded" checked={selected.has(c.slug)} onChange={() => toggleRow(c.slug)} />
                </td>
                <td className="px-2 py-3 text-text-faint">
                  {!search && <GripVertical size={15} className="cursor-grab" />}
                </td>
                <td className="px-4 py-3 font-semibold text-white">
                  <div className="flex items-center gap-2">
                    {c.name}
                    {BUILT_IN_SLUGS.has(c.slug) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-faint">
                        <Tag size={9} /> Built-in
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-white/80">/{c.slug}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/games?category=${encodeURIComponent(c.slug)}`} className="text-white/70 underline-offset-2 hover:text-white hover:underline">
                    {c.gameCount}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-block h-5 w-10 rounded-full" style={{ background: `linear-gradient(90deg, ${c.color_from}, ${c.color_to})` }} />
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {c.display_style === "portrait" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300">
                      <span className="flex gap-0.5"><span className="inline-block h-3 w-1.5 rounded-sm bg-blue-300/60" /><span className="inline-block h-3 w-1.5 rounded-sm bg-blue-300/60" /><span className="inline-block h-3 w-1.5 rounded-sm bg-blue-300/60" /></span>
                      Portrait
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-text-faint">
                      <span className="flex flex-col gap-0.5"><span className="inline-block h-1.5 w-4 rounded-sm bg-text-faint/50" /><span className="inline-block h-1.5 w-4 rounded-sm bg-text-faint/50" /><span className="inline-block h-1.5 w-4 rounded-sm bg-text-faint/50" /></span>
                      Landscape
                    </span>
                  )}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {!c.show_on_homepage ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-text-faint">Hidden</span>
                  ) : c.homepage_position != null ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-featured/15 px-2 py-0.5 text-[11px] font-semibold text-featured">
                      <LayoutGrid size={10} /> Position {c.homepage_position}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-text-faint">Auto</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button type="button" onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white">
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => handleDelete(c)} aria-label={`Delete ${c.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-hot/15 hover:text-hot">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Editor panel — all existing fields preserved */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setFormOpen(false)}>
          <form onSubmit={handleSave} onClick={(e) => e.stopPropagation()}
            className="glass-opaque flex h-full w-full max-w-md flex-col border-l border-[var(--color-surface-border)]">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-surface-border)] px-5 pb-4 pt-5">
              <h2 className="font-display text-lg font-bold text-white">{editingSlug ? "Edit Category" : "Add Category"}</h2>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10">
                <X size={18} className="text-white/70" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
            {formError && <p className="mb-4 rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{formError}</p>}

            <div className="flex flex-col gap-4">
              <Field label="Name"><input value={form.name} onChange={(e) => handleNameChange(e.target.value)} className="admin-input" required /></Field>
              <Field label="Slug (URL)">
                <input value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: slugify(e.target.value) })); }} className="admin-input" disabled={Boolean(editingSlug)} required />
                {editingSlug && <p className="mt-1 text-[11px] text-text-faint">Slug can&apos;t be changed after creation — games reference it directly.</p>}
              </Field>
              <Field label="Icon">
                <select value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} className="admin-input" required>
                  {ICON_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Color from"><input type="color" value={form.color_from} onChange={(e) => setForm((f) => ({ ...f, color_from: e.target.value }))} className="admin-input h-10 p-1" /></Field>
                <Field label="Color to"><input type="color" value={form.color_to} onChange={(e) => setForm((f) => ({ ...f, color_to: e.target.value }))} className="admin-input h-10 p-1" /></Field>
              </div>
              <Field label="Description"><textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="admin-input resize-none" /></Field>
              <Field label="Sort order">
                <input type="number" value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))} className="admin-input" />
                <p className="mt-1 text-[11px] text-text-faint">Overridden by drag-and-drop order above.</p>
              </Field>

              {/* ── Content Sections ─────────────────────────────────────── */}
              <SectionHeading>Content Sections</SectionHeading>
              <p className="text-[11px] leading-relaxed text-text-faint">
                These heading + paragraph blocks appear in the expandable &quot;Show more&quot; section on the category page. Leave empty to hide the section entirely.
              </p>
              {(form.content ?? []).map((block, i) => (
                <div key={i} className="rounded-xl border border-[var(--color-surface-border)] bg-white/[0.02] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-text-faint">Section {i + 1}</span>
                    <div className="ml-auto flex items-center gap-1">
                      <button type="button" disabled={i === 0} onClick={() => moveContentBlock(i, -1)}
                        className="flex h-6 w-6 items-center justify-center rounded text-white/40 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-20">
                        <ChevronUp size={13} />
                      </button>
                      <button type="button" disabled={i === (form.content ?? []).length - 1} onClick={() => moveContentBlock(i, 1)}
                        className="flex h-6 w-6 items-center justify-center rounded text-white/40 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-20">
                        <ChevronDown size={13} />
                      </button>
                      <button type="button" onClick={() => removeContentBlock(i)} aria-label="Remove section"
                        className="flex h-6 w-6 items-center justify-center rounded text-white/40 hover:bg-hot/15 hover:text-hot">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <Field label="Heading">
                      <input
                        value={block.heading}
                        onChange={(e) => updateContentBlock(i, "heading", e.target.value)}
                        placeholder="e.g. Play With Friends, Not Just Bots"
                        className="admin-input"
                      />
                    </Field>
                    <Field label="Body">
                      <textarea
                        value={block.body}
                        onChange={(e) => updateContentBlock(i, "body", e.target.value)}
                        rows={3}
                        placeholder="Two or three sentences describing this aspect of the category…"
                        className="admin-input resize-none"
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addContentBlock}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-surface-border)] py-2.5 text-xs font-semibold text-text-faint hover:border-white/30 hover:text-white/80">
                <Plus size={13} /> Add section
              </button>

              {/* Display Template — preserved exactly from original */}
              <SectionHeading>Display Template</SectionHeading>
              <div className="rounded-xl border border-[var(--color-surface-border)] bg-white/[0.02] p-4">
                <p className="mb-4 text-[11px] leading-relaxed text-text-faint">Choose how this category&apos;s games are shown as a scrollable row on the homepage and on mobile.</p>
                <div className="grid grid-cols-2 gap-3">
                  {(["default", "portrait"] as const).map((style) => {
                    const isSelected = (form.display_style ?? "default") === style;
                    return (
                      <button key={style} type="button" onClick={() => setForm((f) => ({ ...f, display_style: style }))}
                        className={`flex flex-col items-center gap-3 rounded-xl border p-4 text-sm transition-all ${isSelected ? "border-yellow-400/70 bg-yellow-400/10 text-white" : "border-[var(--color-surface-border)] bg-white/[0.02] text-text-muted hover:bg-white/[0.06]"}`}>
                        <div className="flex items-end gap-1.5">
                          {style === "default"
                            ? Array.from({ length: 4 }).map((_, i) => <div key={i} className={`h-[28px] w-[44px] rounded-md ${isSelected ? "bg-yellow-400/30" : "bg-white/15"}`} />)
                            : Array.from({ length: 4 }).map((_, i) => <div key={i} className={`h-[46px] w-[28px] rounded-md ${isSelected ? "bg-yellow-400/30" : "bg-white/15"}`} />)}
                        </div>
                        <div className="text-center">
                          <p className={`font-semibold ${isSelected ? "text-yellow-400" : ""}`}>{style === "default" ? "Landscape" : "Portrait"}</p>
                          <p className="mt-0.5 text-[10px] text-text-faint">{style === "default" ? "Wide 16:9 cards — standard layout" : "Tall 2:3 cards — Originals style"}</p>
                        </div>
                        {isSelected && <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-400">Active</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Homepage Placement — preserved exactly */}
              <SectionHeading>Homepage Placement</SectionHeading>
              <div className="rounded-xl border border-[var(--color-surface-border)] bg-white/[0.02] p-4">
                <p className="mb-3 text-[11px] leading-relaxed text-text-faint">Control where this category row appears on the home page.</p>
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" checked={form.show_on_homepage ?? true} onChange={(e) => setForm((f) => ({ ...f, show_on_homepage: e.target.checked }))} className="h-4 w-4 rounded accent-yellow-400" />
                  <span className="font-medium text-white">Show category row on homepage</span>
                </label>
                {(form.show_on_homepage ?? true) && (
                  <div className="mt-4 flex flex-col gap-4">
                    <Field label="Homepage position">
                      <input type="number" min={1} max={9999} value={form.homepage_position ?? ""} onChange={(e) => setForm((f) => ({ ...f, homepage_position: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="Blank = auto at bottom" className="admin-input" />
                    </Field>
                    <Field label="Custom section label">
                      <input value={form.homepage_label ?? ""} onChange={(e) => setForm((f) => ({ ...f, homepage_label: e.target.value || null }))} placeholder={`Falls back to "${form.name || "category name"}"`} className="admin-input" />
                    </Field>
                  </div>
                )}
              </div>

              {/* SEO — preserved exactly */}
              <SectionHeading>SEO</SectionHeading>
              <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <p className="text-xs text-text-faint">Draft an SEO title, description &amp; keyword from the category name.</p>
                <button type="button" disabled={aiLoading || !form.name} onClick={handleAiGenerateCategorySeo}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-50">
                  {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Generate with AI
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={`SEO title (${(form.seo_title ?? "").length}/70)`}><input value={form.seo_title} onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))} placeholder="Falls back to the category name" maxLength={70} className="admin-input" /></Field>
                <Field label="H1 title (on-page heading)"><input value={form.seo_h1_title} onChange={(e) => setForm((f) => ({ ...f, seo_h1_title: e.target.value }))} placeholder="Falls back to the category name" className="admin-input" /></Field>
              </div>
              <Field label={`SEO description (${(form.seo_description ?? "").length}/300)`}><textarea value={form.seo_description} onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))} rows={2} maxLength={300} placeholder="Falls back to the category description" className="admin-input resize-none" /></Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Focus keyword"><input value={form.seo_focus_keyword} onChange={(e) => setForm((f) => ({ ...f, seo_focus_keyword: e.target.value }))} placeholder="e.g. free puzzle games online" className="admin-input" /></Field>
                <Field label="Canonical URL"><input value={form.seo_canonical_url ?? ""} onChange={(e) => setForm((f) => ({ ...f, seo_canonical_url: e.target.value || null }))} placeholder="Auto-generated if left blank" className="admin-input" /></Field>
              </div>
              <Field label="Social share image URL"><input value={form.og_image_url ?? ""} onChange={(e) => setForm((f) => ({ ...f, og_image_url: e.target.value || null }))} placeholder="Falls back to the site default social image" className="admin-input" /></Field>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={form.seo_index ?? true} onChange={(e) => setForm((f) => ({ ...f, seo_index: e.target.checked }))} className="h-4 w-4 rounded" />Index in search</label>
                <label className="flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={form.breadcrumbs_enabled ?? true} onChange={(e) => setForm((f) => ({ ...f, breadcrumbs_enabled: e.target.checked }))} className="h-4 w-4 rounded" />Breadcrumbs</label>
                <label className="flex items-center gap-2 text-xs text-text-muted"><input type="checkbox" checked={form.schema_collection_page ?? true} onChange={(e) => setForm((f) => ({ ...f, schema_collection_page: e.target.checked }))} className="h-4 w-4 rounded" />CollectionPage schema</label>
              </div>
            </div>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-[var(--color-surface-border)] bg-[var(--color-menu-bg)] p-4">
              <button type="submit" disabled={saving}
                className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editingSlug ? "Save changes" : "Create category"}
              </button>
              <button type="button" onClick={() => setFormOpen(false)}
                className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="-mb-1 mt-2 border-t border-[var(--color-surface-border)] pt-4 text-xs font-bold uppercase tracking-wide text-text-faint first:mt-0 first:border-0 first:pt-0">{children}</h3>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs font-semibold text-text-muted">{label}</span>{children}</label>;
}
