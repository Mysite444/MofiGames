"use client";

import React, {
  useCallback,
  useEffect,
  useState,
  type DragEvent,
} from "react";
import {
  GripVertical,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  X,
  Check,
  Smartphone,
  LayoutGrid,
  Film,
  Rows3,
  Layers,
  AlignJustify,
} from "lucide-react";
import {
  fetchMobileHomepageSections,
  fetchAllCategoriesAdmin,
  createMobileHomepageSection,
  updateMobileHomepageSection,
  deleteMobileHomepageSection,
  reorderMobileHomepageSections,
  type MobileHomepageSectionAdmin,
  type MobileHomepageSectionInput,
  type MobileGameSort,
  type AdminCategory,
} from "@/lib/supabase/admin-content";
import { ALL_REGISTRY_SECTIONS } from "@/lib/homepage-section-registry";
import { categories as staticCategories } from "@/lib/categories";

// ---------------------------------------------------------------------------
// Template metadata — visual previews + descriptions
// ---------------------------------------------------------------------------

interface TemplateInfo {
  id: 1 | 2 | 3 | 4 | 5;
  name: string;
  description: string;
  Icon: typeof Film;
  preview: JSX.Element;
}

const TEMPLATE_INFOS: TemplateInfo[] = [
  {
    id: 1,
    name: "Hero Video",
    description: "Full-width 16:9 hero with muted autoplay preview video. Best for one featured game.",
    Icon: Film,
    preview: (
      <div className="h-16 w-full overflow-hidden rounded-lg bg-white/10">
        <div className="flex h-full items-end justify-between gap-1 p-2">
          <div className="h-3 w-20 rounded bg-white/30" />
          <div className="flex h-7 w-14 shrink-0 items-center justify-center rounded-full bg-white text-[9px] font-bold text-black">
            ▶ Play
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 2,
    name: "3 × 2 Fixed Grid",
    description: "6 games in a static 3-column × 2-row grid. No scroll — all cards visible at once.",
    Icon: LayoutGrid,
    preview: (
      <div className="grid grid-cols-3 gap-1 rounded-lg p-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-square rounded bg-white/20" />
        ))}
      </div>
    ),
  },
  {
    id: 3,
    name: "Rect Swipe (Colored)",
    description: "Coloured category background with star icon. Swipeable portrait cards.",
    Icon: Layers,
    preview: (
      <div className="rounded-lg bg-purple-900/40 p-2">
        <div className="mb-1.5 flex items-center gap-1">
          <div className="h-4 w-4 rounded-full bg-purple-400/60" />
          <div className="h-2 w-16 rounded bg-white/40" />
        </div>
        <div className="flex gap-1.5 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-14 w-9 shrink-0 rounded-lg bg-white/20" style={{ aspectRatio: "2/3" }} />
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 4,
    name: "Color Category Swipe",
    description: "Full-width category-coloured band with icon watermark. Swipeable square cards.",
    Icon: Rows3,
    preview: (
      <div className="rounded-lg bg-gradient-to-r from-blue-900/60 to-blue-800/40 p-2">
        <div className="mb-1.5 flex items-center gap-1">
          <div className="h-5 w-5 rounded-full bg-white/20" />
          <div className="h-2 w-16 rounded bg-white/50" />
        </div>
        <div className="flex gap-1.5 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 w-10 shrink-0 rounded-lg bg-white/20" />
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 5,
    name: "Standard Swipe",
    description: "Classic icon + title header with horizontal swipe scroll. The default row style.",
    Icon: AlignJustify,
    preview: (
      <div className="rounded-lg p-2">
        <div className="mb-2 flex items-center gap-1.5">
          <div className="h-6 w-6 rounded-full bg-white/20" />
          <div className="h-2 w-20 rounded bg-white/40" />
        </div>
        <div className="flex gap-1.5 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-10 w-10 shrink-0 rounded-xl bg-white/20" />
          ))}
        </div>
      </div>
    ),
  },
];

// ---------------------------------------------------------------------------
// Section key options — system rows + all categories (static + DB)
// ---------------------------------------------------------------------------

interface SectionKeyOption {
  key: string;
  label: string;
  group: string;
}

function buildSectionKeyOptions(dbCategories: AdminCategory[]): SectionKeyOption[] {
  const staticSlugs = new Set(staticCategories.map((c) => c.slug));
  const options: SectionKeyOption[] = [];

  // System curated rows
  for (const s of ALL_REGISTRY_SECTIONS.filter((r) => r.type === "system")) {
    options.push({ key: s.key, label: s.defaultLabel, group: "System" });
  }

  // Built-in genres
  for (const s of ALL_REGISTRY_SECTIONS.filter((r) => r.type === "genre")) {
    const slug = s.key.slice("genre:".length);
    const dbOverride = dbCategories.find((c) => c.slug === slug);
    options.push({
      key: s.key,
      label: dbOverride?.name ?? s.defaultLabel,
      group: "Built-in Genres",
    });
  }

  // Admin-created categories
  for (const cat of dbCategories.filter((c) => !staticSlugs.has(c.slug))) {
    options.push({
      key: `category:${cat.slug}`,
      label: cat.name,
      group: "Your Categories",
    });
  }

  return options;
}

// ---------------------------------------------------------------------------
// Human-readable label for a section_key
// ---------------------------------------------------------------------------
function labelFor(key: string, options: SectionKeyOption[]): string {
  return options.find((o) => o.key === key)?.label ?? key;
}

// ---------------------------------------------------------------------------
// Edit / Create modal
// ---------------------------------------------------------------------------

const SORT_OPTIONS: { value: MobileGameSort; label: string }[] = [
  { value: "popular", label: "Most Popular" },
  { value: "new", label: "Newest First" },
  { value: "trending", label: "Trending" },
  { value: "featured", label: "Featured" },
  { value: "editors_pick", label: "Editor's Picks" },
  { value: "random", label: "Random" },
];

interface EditModalProps {
  section: MobileHomepageSectionAdmin | null; // null = new
  keyOptions: SectionKeyOption[];
  existingKeys: Set<string>;
  onSave: (input: Partial<MobileHomepageSectionInput>) => Promise<void>;
  onClose: () => void;
}

function EditModal({ section, keyOptions, existingKeys, onSave, onClose }: EditModalProps) {
  const isNew = !section;

  const [sectionKey, setSectionKey] = useState(section?.section_key ?? "");
  const [templateId, setTemplateId] = useState<1 | 2 | 3 | 4 | 5>(
    (section?.template_id as 1 | 2 | 3 | 4 | 5) ?? 5
  );
  const [title, setTitle] = useState(section?.title ?? "");
  const [subtitle, setSubtitle] = useState(section?.subtitle ?? "");
  const [gameLimit, setGameLimit] = useState(section?.game_limit ?? 10);
  const [gameSort, setGameSort] = useState<MobileGameSort>(section?.game_sort ?? "popular");
  const [showViewAll, setShowViewAll] = useState(section?.show_view_all ?? true);
  const [isEnabled, setIsEnabled] = useState(section?.is_enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Available keys: exclude already-used ones (except current section's own key)
  const availableKeys = keyOptions.filter(
    (o) => o.key === section?.section_key || !existingKeys.has(o.key)
  );

  async function handleSave() {
    if (isNew && !sectionKey) {
      setError("Please select a category or section.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<MobileHomepageSectionInput> = {
        template_id: templateId,
        title: title.trim() || null,
        subtitle: subtitle.trim() || null,
        game_limit: gameLimit,
        game_sort: gameSort,
        show_view_all: showViewAll,
        is_enabled: isEnabled,
      };
      if (isNew) payload.section_key = sectionKey;
      await onSave(payload);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="glass w-full max-w-lg rounded-2xl p-5">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white">
            {isNew ? "Add Section" : "Edit Section"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-text-faint hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-hot/15 px-3 py-2.5 text-sm text-hot">{error}</div>
        )}

        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Section key — only selectable on new sections */}
          {isNew ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">Category / Section *</span>
              <select
                value={sectionKey}
                onChange={(e) => setSectionKey(e.target.value)}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/30"
              >
                <option value="">Select…</option>
                {["System", "Built-in Genres", "Your Categories"].map((group) => {
                  const grouped = availableKeys.filter((o) => o.group === group);
                  if (grouped.length === 0) return null;
                  return (
                    <optgroup key={group} label={group}>
                      {grouped.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
          ) : (
            <div className="rounded-lg bg-white/5 px-3 py-2">
              <p className="text-xs text-text-muted">Category / Section</p>
              <p className="text-sm font-semibold text-white">
                {labelFor(section!.section_key, keyOptions)}
              </p>
            </div>
          )}

          {/* Template picker */}
          <div>
            <p className="mb-2 text-xs font-semibold text-text-muted">Template</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TEMPLATE_INFOS.map((t) => {
                const Icon = t.Icon;
                const selected = templateId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTemplateId(t.id)}
                    className={`rounded-xl p-2.5 text-left transition-all ${
                      selected
                        ? "ring-2 ring-white bg-white/10"
                        : "bg-white/5 hover:bg-white/10 ring-1 ring-white/10"
                    }`}
                  >
                    {/* Mini preview */}
                    <div className="mb-2 overflow-hidden rounded-lg bg-black/30">
                      {t.preview}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Icon size={13} className={selected ? "text-white" : "text-text-faint"} />
                      <p className={`text-[11px] font-bold ${selected ? "text-white" : "text-text-muted"}`}>
                        {t.name}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[10px] text-text-faint leading-tight">
                      {t.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">
              Section Title <span className="text-text-faint">(leave blank for default)</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="e.g. Racing Games"
              className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </label>

          {/* Subtitle */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-text-muted">Subtitle (optional)</span>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              maxLength={160}
              placeholder="Short description shown beneath the title"
              className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white placeholder:text-text-faint focus:outline-none focus:ring-1 focus:ring-white/30"
            />
          </label>

          {/* Game Sort + Game Limit — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">Sort games by</span>
              <select
                value={gameSort}
                onChange={(e) => setGameSort(e.target.value as MobileGameSort)}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/30"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-text-muted">Game limit (1–30)</span>
              <input
                type="number"
                value={gameLimit}
                onChange={(e) => setGameLimit(Math.max(1, Math.min(30, Number(e.target.value))))}
                min={1}
                max={30}
                className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/30"
              />
            </label>
          </div>

          {/* Toggles */}
          <div className="flex flex-col gap-2">
            <Toggle
              label="Show &quot;View All&quot; link"
              checked={showViewAll}
              onChange={setShowViewAll}
            />
            <Toggle
              label="Section enabled"
              checked={isEnabled}
              onChange={setIsEnabled}
            />
          </div>
        </div>

        {/* Footer actions */}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-text-muted hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || (isNew && !sectionKey)}
            className="flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-black disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {isNew ? "Add Section" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg bg-white/5 px-3 py-2.5">
      <span className="text-sm text-white" dangerouslySetInnerHTML={{ __html: label }} />
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-white" : "bg-white/20"
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-black transition-transform ${
            checked ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Delete confirmation
// ---------------------------------------------------------------------------

interface DeleteConfirmProps {
  section: MobileHomepageSectionAdmin;
  keyOptions: SectionKeyOption[];
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

function DeleteConfirm({ section, keyOptions, onConfirm, onClose }: DeleteConfirmProps) {
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="glass w-full max-w-sm rounded-2xl p-5">
        <h2 className="font-display text-base font-bold text-white">Delete section?</h2>
        <p className="mt-2 text-sm text-text-muted">
          Remove <span className="font-semibold text-white">{labelFor(section.section_key, keyOptions)}</span> from
          the mobile homepage? This can be re-added later.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-text-muted hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="flex items-center gap-2 rounded-full bg-hot/80 px-4 py-2 text-sm font-bold text-white hover:bg-hot disabled:opacity-40"
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section row
// ---------------------------------------------------------------------------

function TemplateChip({ id }: { id: number }) {
  const info = TEMPLATE_INFOS.find((t) => t.id === id);
  if (!info) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-text-muted">
      <info.Icon size={10} />
      T{id} {info.name}
    </span>
  );
}

interface SectionRowProps {
  section: MobileHomepageSectionAdmin;
  index: number;
  total: number;
  keyOptions: SectionKeyOption[];
  saving: boolean;
  dragId: string | null;
  dragOverId: string | null;
  onDragStart: (id: string) => void;
  onDragOver: (e: DragEvent, id: string) => void;
  onDrop: (id: string) => void;
  onDragEnd: () => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  onEdit: (section: MobileHomepageSectionAdmin) => void;
  onToggle: (section: MobileHomepageSectionAdmin) => void;
  onDelete: (section: MobileHomepageSectionAdmin) => void;
}

function SectionRow({
  section,
  index,
  total,
  keyOptions,
  saving,
  dragId,
  dragOverId,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onMoveUp,
  onMoveDown,
  onEdit,
  onToggle,
  onDelete,
}: SectionRowProps) {
  const label = labelFor(section.section_key, keyOptions);
  const isDragging = dragId === section.id;
  const isDragOver = dragOverId === section.id && dragId && dragId !== section.id;

  return (
    <li
      draggable
      onDragStart={() => onDragStart(section.id)}
      onDragOver={(e) => onDragOver(e, section.id)}
      onDrop={() => onDrop(section.id)}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 transition-all ${
        isDragging ? "opacity-40" : ""
      } ${isDragOver ? "ring-2 ring-white/40 ring-inset" : ""}`}
    >
      {/* Drag handle */}
      <span className="cursor-grab shrink-0 text-text-faint active:cursor-grabbing">
        <GripVertical size={16} />
      </span>

      {/* Up / Down buttons */}
      <div className="flex flex-col shrink-0">
        <button
          type="button"
          onClick={() => onMoveUp(index)}
          disabled={index === 0 || saving}
          className="text-text-faint hover:text-white disabled:opacity-20"
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          onClick={() => onMoveDown(index)}
          disabled={index === total - 1 || saving}
          className="text-text-faint hover:text-white disabled:opacity-20"
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Position badge */}
      <span className="hidden sm:flex h-5 min-w-[1.75rem] shrink-0 items-center justify-center rounded bg-white/10 text-[10px] font-bold text-text-faint">
        {index + 1}
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p
            className={`truncate text-sm font-semibold ${
              section.is_enabled ? "text-white" : "text-text-muted line-through"
            }`}
          >
            {section.title ?? label}
          </p>
          {!section.is_enabled && (
            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-text-faint">
              Hidden
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <TemplateChip id={section.template_id} />
          <span className="text-[11px] text-text-faint">
            {section.game_limit} games · {section.game_sort}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => onToggle(section)}
          className="rounded-full p-1.5 text-text-faint hover:bg-white/10 hover:text-white"
          title={section.is_enabled ? "Disable section" : "Enable section"}
        >
          {section.is_enabled ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          type="button"
          onClick={() => onEdit(section)}
          className="rounded-full p-1.5 text-text-faint hover:bg-white/10 hover:text-white"
          title="Edit section"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(section)}
          className="rounded-full p-1.5 text-text-faint hover:bg-white/10 hover:text-hot"
          title="Delete section"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function MobileHomepageAdminClient() {
  const [sections, setSections] = useState<MobileHomepageSectionAdmin[] | null>(null);
  const [dbCategories, setDbCategories] = useState<AdminCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editTarget, setEditTarget] = useState<MobileHomepageSectionAdmin | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MobileHomepageSectionAdmin | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [s, c] = await Promise.all([
        fetchMobileHomepageSections(),
        fetchAllCategoriesAdmin(),
      ]);
      setSections(s);
      setDbCategories(c);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load mobile homepage data.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const keyOptions = buildSectionKeyOptions(dbCategories);
  const existingKeys = new Set((sections ?? []).map((s) => s.section_key));

  // ── Drag-and-drop ──────────────────────────────────────────────────────
  function handleDragOver(e: DragEvent, id: string) {
    e.preventDefault();
    if (dragId && id !== dragId && id !== dragOverId) setDragOverId(id);
  }

  function handleDrop(dropId: string) {
    if (!dragId || !sections || dragId === dropId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const ids = sections.map((s) => s.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(dropId);
    setDragId(null);
    setDragOverId(null);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    persistOrder(next);
  }

  function moveAt(index: number, dir: -1 | 1) {
    if (!sections) return;
    const next = [...sections];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next.map((s) => s.id));
  }

  async function persistOrder(orderedIds: string[]) {
    if (!sections) return;
    // Optimistic update
    const byId = new Map(sections.map((s) => [s.id, s]));
    setSections(orderedIds.map((id) => byId.get(id)!).filter(Boolean));
    setSaving(true);
    try {
      await reorderMobileHomepageSections(orderedIds);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save order.");
      await load(); // revert on error
    } finally {
      setSaving(false);
    }
  }

  // ── Create / Update ────────────────────────────────────────────────────
  async function handleSave(input: Partial<MobileHomepageSectionInput>) {
    if (editTarget === "new") {
      await createMobileHomepageSection(input as MobileHomepageSectionInput);
    } else if (editTarget) {
      await updateMobileHomepageSection(editTarget.id, input);
    }
    await load();
  }

  // ── Toggle enable/disable ──────────────────────────────────────────────
  async function handleToggle(section: MobileHomepageSectionAdmin) {
    setSaving(true);
    try {
      await updateMobileHomepageSection(section.id, { is_enabled: !section.is_enabled });
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to toggle section.");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteMobileHomepageSection(deleteTarget.id);
    setDeleteTarget(null);
    await load();
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone size={20} className="text-text-muted" />
            <h2 className="font-display text-xl font-bold text-white">Mobile Homepage</h2>
          </div>
          <p className="mt-1 text-sm text-text-faint">
            Drag to reorder sections. Each section uses one of 5 templates and gets its games
            from the shared category/game database — no separate mobile data.
            &ldquo;Continue Playing&rdquo; is always first and cannot be removed.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setEditTarget("new")}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-black hover:bg-white/90"
        >
          <Plus size={15} />
          Add Section
        </button>
      </div>

      {loadError && (
        <div className="mb-5 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">
          {loadError}
        </div>
      )}

      {/* Pinned "Continue Playing" — always first, not editable */}
      <div className="mb-2 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 opacity-60">
        <GripVertical size={16} className="text-text-faint cursor-not-allowed" />
        <span className="flex h-5 w-7 items-center justify-center rounded bg-white/10 text-[10px] font-bold text-text-faint">
          ★
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">Continue Playing</p>
          <p className="text-[11px] text-text-faint">Always first · Not configurable</p>
        </div>
      </div>

      {/* Sections list */}
      {sections === null ? (
        <div className="glass flex items-center justify-center rounded-xl py-16 text-text-faint">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : sections.length === 0 ? (
        <div className="glass rounded-xl px-4 py-10 text-center">
          <Smartphone size={32} className="mx-auto mb-3 text-text-faint" />
          <p className="text-sm font-semibold text-white">No sections yet</p>
          <p className="mt-1 text-xs text-text-faint">
            Click &ldquo;Add Section&rdquo; to build the mobile homepage.
          </p>
        </div>
      ) : (
        <>
          {saving && (
            <div className="mb-2 flex items-center gap-2 text-xs text-text-faint">
              <Loader2 size={12} className="animate-spin" />
              Saving order…
            </div>
          )}
          <ul className="flex flex-col gap-1.5">
            {sections.map((s, i) => (
              <SectionRow
                key={s.id}
                section={s}
                index={i}
                total={sections.length}
                keyOptions={keyOptions}
                saving={saving}
                dragId={dragId}
                dragOverId={dragOverId}
                onDragStart={setDragId}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                onMoveUp={() => moveAt(i, -1)}
                onMoveDown={() => moveAt(i, 1)}
                onEdit={setEditTarget}
                onToggle={handleToggle}
                onDelete={setDeleteTarget}
              />
            ))}
          </ul>
        </>
      )}

      {/* Template legend */}
      <div className="mt-6 glass rounded-xl p-4">
        <p className="mb-3 text-xs font-semibold text-text-muted">Template Reference</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {TEMPLATE_INFOS.map((t) => {
            const Icon = t.Icon;
            return (
              <div key={t.id} className="rounded-lg bg-white/5 p-2.5">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Icon size={12} className="text-text-faint" />
                  <p className="text-[11px] font-bold text-white">T{t.id} — {t.name}</p>
                </div>
                <p className="text-[10px] text-text-faint leading-tight">{t.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modals */}
      {editTarget !== null && (
        <EditModal
          section={editTarget === "new" ? null : editTarget}
          keyOptions={keyOptions}
          existingKeys={existingKeys}
          onSave={handleSave}
          onClose={() => setEditTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirm
          section={deleteTarget}
          keyOptions={keyOptions}
          onConfirm={handleDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
