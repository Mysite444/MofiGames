"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, X, Loader2, Search, AlertTriangle, CheckCircle2, ArrowUpDown } from "lucide-react";
import {
  fetchAllTagsAdminWithUsage,
  createTag,
  updateTag,
  deleteTag,
  runTagsBulkDelete,
  type AdminTagWithUsage,
  type TagInput,
} from "@/lib/supabase/admin-content";
import { slugify } from "@/lib/prng";

// ─── Types ────────────────────────────────────────────────────────────────

type SortKey = "name" | "usage";
type ToastKind = "success" | "error";
interface ToastMsg { id: number; kind: ToastKind; text: string }
interface ConfirmCfg { title: string; description: string; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void> }

const emptyForm: TagInput = {
  slug: "", name: "", color: "#ffd60a",
  seo_title: "", seo_description: "", seo_canonical_url: null, seo_h1_title: "", seo_index: true,
};

// ─── Component ────────────────────────────────────────────────────────────

export function TagsAdminClient() {
  const [tags, setTags] = useState<AdminTagWithUsage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [showUnusedOnly, setShowUnusedOnly] = useState(false);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Editor
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TagInput>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Toast / Confirm
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const toastRef = useRef(0);
  const [confirm, setConfirm] = useState<ConfirmCfg | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // ── Data ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoadError(null);
    try { setTags(await fetchAllTagsAdminWithUsage()); }
    catch (err) { setLoadError(err instanceof Error ? err.message : "Failed to load tags."); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredTags = useMemo(() => {
    if (!tags) return tags;
    let list = [...tags];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((t) => t.name.toLowerCase().includes(q) || t.slug.includes(q));
    if (showUnusedOnly) list = list.filter((t) => t.gameCount === 0 && t.postCount === 0);
    list.sort((a, b) => {
      if (sort === "usage") return (b.gameCount + b.postCount) - (a.gameCount + a.postCount);
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [tags, search, sort, showUnusedOnly]);

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

  const displayIds = useMemo(() => (filteredTags ?? []).map((t) => t.id), [filteredTags]);
  const allSelected = displayIds.length > 0 && displayIds.every((id) => selected.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelected((s) => { const n = new Set(s); displayIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); displayIds.forEach((id) => n.add(id)); return n; });
    }
  }
  function toggleRow(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Bulk delete ───────────────────────────────────────────────────────

  function confirmBulkDelete() {
    const count = selected.size;
    setConfirm({
      title: "Bulk delete tags",
      description: `Delete ${count} tag${count === 1 ? "" : "s"}? They will be removed from all games and posts. This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        setBulkLoading(true);
        try {
          const result = await runTagsBulkDelete([...selected]);
          toast("success", `${result.affected} tag${result.affected === 1 ? "" : "s"} deleted.`);
          setSelected(new Set());
          await load();
        } catch (err) {
          toast("error", err instanceof Error ? err.message : "Bulk delete failed.");
        } finally { setBulkLoading(false); }
      },
    });
  }

  // ── Single delete ─────────────────────────────────────────────────────

  function handleDelete(tag: AdminTagWithUsage) {
    const usageParts: string[] = [];
    if (tag.gameCount > 0) usageParts.push(`${tag.gameCount} game${tag.gameCount === 1 ? "" : "s"}`);
    if (tag.postCount > 0) usageParts.push(`${tag.postCount} post${tag.postCount === 1 ? "" : "s"}`);
    const usageNote = usageParts.length > 0 ? ` It will be removed from ${usageParts.join(" and ")}.` : "";
    setConfirm({
      title: "Delete tag",
      description: `Delete the "${tag.name}" tag?${usageNote} This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
      onConfirm: async () => {
        await deleteTag(tag.id);
        toast("success", `"${tag.name}" deleted.`);
        setSelected((s) => { const n = new Set(s); n.delete(tag.id); return n; });
        await load();
      },
    });
  }

  // ── Editor ────────────────────────────────────────────────────────────

  function openCreate() { setEditingId(null); setForm(emptyForm); setSlugTouched(false); setFormError(null); setFormOpen(true); }
  function openEdit(tag: AdminTagWithUsage) {
    setEditingId(tag.id);
    setForm({ slug: tag.slug, name: tag.name, color: tag.color, seo_title: tag.seo_title, seo_description: tag.seo_description, seo_canonical_url: tag.seo_canonical_url, seo_h1_title: tag.seo_h1_title, seo_index: tag.seo_index });
    setSlugTouched(true); setFormError(null); setFormOpen(true);
  }
  function handleNameChange(name: string) { setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) })); }

  async function handleSave(e: FormEvent) {
    e.preventDefault(); setFormError(null);
    if (!form.name.trim() || !form.slug.trim()) { setFormError("Name and slug are required."); return; }
    setSaving(true);
    try {
      if (editingId) { await updateTag(editingId, form); } else { await createTag(form); }
      toast("success", editingId ? `"${form.name}" updated.` : `"${form.name}" created.`);
      await load(); setFormOpen(false);
    } catch (err) { setFormError(err instanceof Error ? err.message : "Failed to save."); }
    finally { setSaving(false); }
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
                className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Tags</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {tags ? `${tags.length} tag${tags.length === 1 ? "" : "s"} total` : "Loading…"}
          </p>
        </div>
        <button type="button" onClick={openCreate}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white">
          <Plus size={16} /> Add Tag
        </button>
      </div>

      {loadError && <div className="mb-4 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tags…" className="admin-input w-full pl-8" />
        </div>
        <button type="button" onClick={() => setSort((s) => s === "name" ? "usage" : "name")}
          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20">
          <ArrowUpDown size={12} />
          {sort === "name" ? "Sort: A–Z" : "Sort: Usage"}
        </button>
        <button type="button" onClick={() => setShowUnusedOnly((v) => !v)}
          className={`rounded-full px-3 py-2 text-xs font-semibold transition-colors ${showUnusedOnly ? "bg-white text-black" : "bg-white/10 text-text-faint hover:bg-white/15 hover:text-white"}`}>
          Unused only
        </button>
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

      {/* Table */}
      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3">
                <input type="checkbox" className="h-4 w-4 rounded" checked={allSelected} onChange={toggleAll} />
              </th>
              <th className="px-4 py-3 font-semibold">Tag</th>
              <th className="px-4 py-3 font-semibold">Slug</th>
              <th className="px-4 py-3 font-semibold">Games</th>
              <th className="px-4 py-3 font-semibold">Posts</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {tags === null && <tr><td colSpan={6} className="px-4 py-10 text-center text-text-faint"><Loader2 size={18} className="mx-auto animate-spin" /></td></tr>}
            {tags?.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-text-faint">No tags yet — click &quot;Add Tag&quot; to create the first one.</td></tr>}
            {tags && tags.length > 0 && filteredTags?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-text-faint">No tags match the current filters.</td></tr>
            )}
            {filteredTags?.map((tag) => (
              <tr key={tag.id} className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3"><input type="checkbox" className="h-4 w-4 rounded" checked={selected.has(tag.id)} onChange={() => toggleRow(tag.id)} /></td>
                <td className="px-4 py-3">
                  <span className="inline-block rounded-full px-2.5 py-1 text-xs font-bold text-black" style={{ backgroundColor: tag.color }}>{tag.name}</span>
                </td>
                <td className="px-4 py-3 text-white/80">{tag.slug}</td>
                <td className="px-4 py-3 text-white/70">{tag.gameCount}</td>
                <td className="px-4 py-3 text-white/70">
                  {tag.gameCount === 0 && tag.postCount === 0
                    ? <span className="text-text-faint">Unused</span>
                    : tag.postCount}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button type="button" onClick={() => openEdit(tag)} aria-label={`Edit ${tag.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"><Pencil size={15} /></button>
                    <button type="button" onClick={() => handleDelete(tag)} aria-label={`Delete ${tag.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-hot/15 hover:text-hot"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Editor panel */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setFormOpen(false)}>
          <form onSubmit={handleSave} onClick={(e) => e.stopPropagation()}
            className="glass-opaque flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--color-surface-border)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">{editingId ? "Edit Tag" : "Add Tag"}</h2>
              <button type="button" onClick={() => setFormOpen(false)} aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10">
                <X size={18} className="text-white/70" />
              </button>
            </div>

            {formError && <p className="mb-4 rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{formError}</p>}

            <div className="flex flex-col gap-4">
              <Field label="Name"><input value={form.name} onChange={(e) => handleNameChange(e.target.value)} className="admin-input" required /></Field>
              <Field label="Slug">
                <input value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: slugify(e.target.value) })); }} className="admin-input" required />
              </Field>
              <Field label="Color"><input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} className="admin-input h-10 p-1" /></Field>

              <h3 className="-mb-1 mt-2 border-t border-[var(--color-surface-border)] pt-4 text-xs font-bold uppercase tracking-wide text-text-faint">SEO</h3>
              <Field label="SEO title"><input value={form.seo_title} onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))} placeholder="Falls back to the tag name" maxLength={70} className="admin-input" /></Field>
              <Field label="SEO description"><textarea value={form.seo_description} onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))} rows={2} maxLength={300} className="admin-input resize-none" /></Field>
              <Field label="H1 title"><input value={form.seo_h1_title} onChange={(e) => setForm((f) => ({ ...f, seo_h1_title: e.target.value }))} placeholder="Falls back to the tag name" className="admin-input" /></Field>
              <Field label="Canonical URL"><input value={form.seo_canonical_url ?? ""} onChange={(e) => setForm((f) => ({ ...f, seo_canonical_url: e.target.value || null }))} placeholder="Auto-generated if left blank" className="admin-input" /></Field>
              <label className="flex items-center gap-2 text-xs text-text-muted">
                <input type="checkbox" checked={form.seo_index ?? true} onChange={(e) => setForm((f) => ({ ...f, seo_index: e.target.checked }))} className="h-4 w-4 rounded" />
                Index this tag page in search
              </label>
            </div>

            <div className="mt-6 flex gap-2">
              <button type="submit" disabled={saving}
                className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editingId ? "Save changes" : "Create tag"}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5 text-sm"><span className="text-xs font-semibold text-text-muted">{label}</span>{children}</label>;
}
