"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Pencil, Trash2, X, Loader2, Sparkles, LayoutGrid, Tag } from "lucide-react";

// Slugs that are seeded from categories.ts (migration 0065) — shown with a
// "Built-in" badge in the table so admins know they're core genres.
const BUILT_IN_SLUGS = new Set([
  "multiplayer", "action", "adventure", "arcade", "brain", "driving",
  "io-games", "shooting-games", "puzzle-games", "simulation", "sports",
  "strategy", "trivia", "word", "casual", "board", "card", "clicker",
]);
import {
  fetchAllCategoriesAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
  generateSeoWithAi,
  type AdminCategory,
  type CategoryInput,
} from "@/lib/supabase/admin-content";
import { slugify } from "@/lib/prng";
import { ICON_NAMES } from "@/lib/icon-map";

const emptyForm: CategoryInput = {
  slug: "",
  name: "",
  icon: "Gamepad2",
  color_from: "#8b5cf6",
  color_to: "#ec4899",
  description: "",
  sort_order: 0,
  seo_title: "",
  seo_description: "",
  seo_canonical_url: null,
  seo_focus_keyword: "",
  seo_h1_title: "",
  seo_index: true,
  breadcrumbs_enabled: true,
  schema_collection_page: true,
  og_image_url: null,
  // Homepage Placement
  show_on_homepage: true,
  homepage_position: null,
  homepage_label: null,
  // Display template
  display_style: "default",
};

export function CategoriesAdminClient() {
  const [categories, setCategories] = useState<AdminCategory[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryInput>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setCategories(await fetchAllCategoriesAdmin());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load categories.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingSlug(null);
    setForm(emptyForm);
    setSlugTouched(false);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(cat: AdminCategory) {
    setEditingSlug(cat.slug);
    setForm({
      slug: cat.slug,
      name: cat.name,
      icon: cat.icon,
      color_from: cat.color_from,
      color_to: cat.color_to,
      description: cat.description,
      sort_order: cat.sort_order,
      seo_title: cat.seo_title,
      seo_description: cat.seo_description,
      seo_canonical_url: cat.seo_canonical_url,
      seo_focus_keyword: cat.seo_focus_keyword,
      seo_h1_title: cat.seo_h1_title,
      seo_index: cat.seo_index,
      breadcrumbs_enabled: cat.breadcrumbs_enabled,
      schema_collection_page: cat.schema_collection_page,
      og_image_url: cat.og_image_url,
      // Homepage Placement
      show_on_homepage: cat.show_on_homepage,
      homepage_position: cat.homepage_position,
      homepage_label: cat.homepage_label,
      // Display template
      display_style: cat.display_style,
    });
    setSlugTouched(true);
    setFormError(null);
    setFormOpen(true);
  }

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: slugTouched ? f.slug : slugify(name) }));
  }

  async function handleAiGenerateCategorySeo() {
    if (!form.name) return;
    setAiLoading(true);
    setFormError(null);
    try {
      const result = await generateSeoWithAi({
        itemType: "category",
        title: `${form.name} Games`,
        description: form.description,
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
    } finally {
      setAiLoading(false);
    }
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
      if (editingSlug) {
        await updateCategory(editingSlug, form);
      } else {
        await createCategory(form);
      }
      await load();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(cat: AdminCategory) {
    if (
      !confirm(
        `Delete "${cat.name}"? Games in this category will block deletion until they're moved or removed.`
      )
    )
      return;
    try {
      await deleteCategory(cat.slug);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete — it may still have games in it.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Categories</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {categories ? `${categories.length} categor${categories.length === 1 ? "y" : "ies"}` : "Loading…"}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={16} />
          Add Category
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Slug</th>
              <th className="px-4 py-3 font-semibold">Colors</th>
              <th className="px-4 py-3 font-semibold">Template</th>
              <th className="px-4 py-3 font-semibold">Homepage</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {categories === null && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {categories?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-faint">
                  No categories yet — click &quot;Add Category&quot; to create the first one.
                </td>
              </tr>
            )}
            {categories?.map((c) => (
              <tr
                key={c.slug}
                className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3 font-semibold text-white">
                  <div className="flex items-center gap-2">
                    {c.name}
                    {BUILT_IN_SLUGS.has(c.slug) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-faint">
                        <Tag size={9} />
                        Built-in
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-white/80">/{c.slug}</td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block h-5 w-10 rounded-full"
                    style={{ background: `linear-gradient(90deg, ${c.color_from}, ${c.color_to})` }}
                  />
                </td>
                {/* Display template badge */}
                <td className="px-4 py-3">
                  {c.display_style === "portrait" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300">
                      {/* Tall card icon */}
                      <span className="flex gap-0.5">
                        <span className="inline-block h-3 w-1.5 rounded-sm bg-blue-300/60" />
                        <span className="inline-block h-3 w-1.5 rounded-sm bg-blue-300/60" />
                        <span className="inline-block h-3 w-1.5 rounded-sm bg-blue-300/60" />
                      </span>
                      Portrait
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] text-text-faint">
                      {/* Wide card icon */}
                      <span className="flex flex-col gap-0.5">
                        <span className="inline-block h-1.5 w-4 rounded-sm bg-text-faint/50" />
                        <span className="inline-block h-1.5 w-4 rounded-sm bg-text-faint/50" />
                        <span className="inline-block h-1.5 w-4 rounded-sm bg-text-faint/50" />
                      </span>
                      Landscape
                    </span>
                  )}
                </td>
                {/* Homepage placement badge */}
                <td className="px-4 py-3">
                  {!c.show_on_homepage ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-text-faint">
                      Hidden
                    </span>
                  ) : c.homepage_position != null ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-featured/15 px-2 py-0.5 text-[11px] font-semibold text-featured">
                      <LayoutGrid size={10} />
                      Position {c.homepage_position}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-text-faint">
                      Auto
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      aria-label={`Edit ${c.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      aria-label={`Delete ${c.name}`}
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
                {editingSlug ? "Edit Category" : "Add Category"}
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
              {/* ── Basic Info ─────────────────────────────────── */}
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
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
                  disabled={Boolean(editingSlug)}
                  required
                />
                {editingSlug && (
                  <p className="mt-1 text-[11px] text-text-faint">
                    Slug can&apos;t be changed after creation — games reference it directly.
                  </p>
                )}
              </Field>

              <Field label="Icon">
                <select
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  className="admin-input"
                  required
                >
                  {ICON_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-text-faint">
                  Which Lucide icon represents this genre — shown next to its name everywhere
                  the category appears.
                </p>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Color from">
                  <input
                    type="color"
                    value={form.color_from}
                    onChange={(e) => setForm((f) => ({ ...f, color_from: e.target.value }))}
                    className="admin-input h-10 p-1"
                  />
                </Field>
                <Field label="Color to">
                  <input
                    type="color"
                    value={form.color_to}
                    onChange={(e) => setForm((f) => ({ ...f, color_to: e.target.value }))}
                    className="admin-input h-10 p-1"
                  />
                </Field>
              </div>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="admin-input resize-none"
                />
              </Field>

              <Field label="Sort order">
                <input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                  className="admin-input"
                />
              </Field>

              {/* ── Display Template ───────────────────────────── */}
              <SectionHeading>Display Template</SectionHeading>

              <div className="rounded-xl border border-[var(--color-surface-border)] bg-white/[0.02] p-4">
                <p className="mb-4 text-[11px] leading-relaxed text-text-faint">
                  Choose how this category&apos;s games are shown as a scrollable row on the
                  homepage and on mobile. This affects both desktop and mobile layouts.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {(["default", "portrait"] as const).map((style) => {
                    const isSelected = (form.display_style ?? "default") === style;
                    return (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, display_style: style }))}
                        className={`flex flex-col items-center gap-3 rounded-xl border p-4 text-sm transition-all ${
                          isSelected
                            ? "border-yellow-400/70 bg-yellow-400/10 text-white"
                            : "border-[var(--color-surface-border)] bg-white/[0.02] text-text-muted hover:bg-white/[0.06]"
                        }`}
                      >
                        {/* Mini card strip preview */}
                        <div className="flex items-end gap-1.5">
                          {style === "default"
                            ? Array.from({ length: 4 }).map((_, i) => (
                                <div
                                  key={i}
                                  className={`h-[28px] w-[44px] rounded-md ${
                                    isSelected ? "bg-yellow-400/30" : "bg-white/15"
                                  }`}
                                />
                              ))
                            : Array.from({ length: 4 }).map((_, i) => (
                                <div
                                  key={i}
                                  className={`h-[46px] w-[28px] rounded-md ${
                                    isSelected ? "bg-yellow-400/30" : "bg-white/15"
                                  }`}
                                />
                              ))}
                        </div>
                        <div className="text-center">
                          <p className={`font-semibold ${isSelected ? "text-yellow-400" : ""}`}>
                            {style === "default" ? "Landscape" : "Portrait"}
                          </p>
                          <p className="mt-0.5 text-[10px] text-text-faint">
                            {style === "default"
                              ? "Wide 16:9 cards — standard layout"
                              : "Tall 2:3 cards — Originals style"}
                          </p>
                        </div>
                        {isSelected && (
                          <span className="rounded-full bg-yellow-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-400">
                            Active
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Homepage Placement ─────────────────────────── */}
              <SectionHeading>Homepage Placement</SectionHeading>

              <div className="rounded-xl border border-[var(--color-surface-border)] bg-white/[0.02] p-4">
                <p className="mb-3 text-[11px] leading-relaxed text-text-faint">
                  Control where this category row appears on the home page. Games in this
                  category must be published &amp; public for the row to display.
                </p>

                {/* Show on homepage toggle */}
                <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={form.show_on_homepage ?? true}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, show_on_homepage: e.target.checked }))
                    }
                    className="h-4 w-4 rounded accent-yellow-400"
                  />
                  <span className="font-medium text-white">Show category row on homepage</span>
                </label>

                {(form.show_on_homepage ?? true) && (
                  <div className="mt-4 flex flex-col gap-4">
                    {/* Position */}
                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="text-xs font-semibold text-text-muted">
                        Homepage position
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={9999}
                        value={form.homepage_position ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            homepage_position:
                              e.target.value === "" ? null : Number(e.target.value),
                          }))
                        }
                        placeholder="Blank = auto at bottom"
                        className="admin-input"
                      />
                      <p className="text-[11px] text-text-faint">
                        Lower numbers appear <strong className="text-white/60">higher</strong> on
                        the page. This position is compared against{" "}
                        <strong className="text-white/60">every</strong> row on the homepage — Featured
                        Games, Sponsored, the built-in genres, and every other category — not just other
                        categories, so you can place this row anywhere on the page. Leave blank to
                        auto-append at the very bottom. You can also drag-reorder this same row from
                        Admin → Homepage → Categories.
                      </p>

                      {/* Visual position hint */}
                      {form.homepage_position != null && (
                        <div className="mt-1 rounded-lg bg-featured/10 px-3 py-2 text-[11px] text-featured">
                          ✦ This category will appear at position{" "}
                          <strong>{form.homepage_position}</strong> among every row on the homepage.
                        </div>
                      )}
                      {form.homepage_position == null && (
                        <div className="mt-1 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-text-faint">
                          This category will appear at the <strong className="text-white/50">very bottom</strong> of
                          the homepage, below every other row.
                        </div>
                      )}
                    </div>

                    {/* Custom section label */}
                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="text-xs font-semibold text-text-muted">
                        Custom section label
                      </span>
                      <input
                        value={form.homepage_label ?? ""}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            homepage_label: e.target.value || null,
                          }))
                        }
                        placeholder={`Falls back to "${form.name || "category name"}"`}
                        className="admin-input"
                      />
                      <p className="text-[11px] text-text-faint">
                        Override the heading shown on the homepage row — e.g.{" "}
                        <em>&quot;Play with Friends&quot;</em> instead of{" "}
                        <em>&quot;Multiplayer&quot;</em>.
                      </p>
                    </div>
                  </div>
                )}

                {!(form.show_on_homepage ?? true) && (
                  <div className="mt-3 rounded-lg bg-hot/10 px-3 py-2 text-[11px] text-hot">
                    This category is hidden from the homepage. Individual game flags (Featured,
                    Trending, etc.) still work normally.
                  </div>
                )}
              </div>

              {/* ── SEO ────────────────────────────────────────── */}
              <SectionHeading>SEO</SectionHeading>

              <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <p className="text-xs text-text-faint">Draft an SEO title, description &amp; keyword from the category name.</p>
                <button
                  type="button"
                  disabled={aiLoading || !form.name}
                  onClick={handleAiGenerateCategorySeo}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Generate with AI
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={`SEO title (${(form.seo_title ?? "").length}/70)`}>
                  <input
                    value={form.seo_title}
                    onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))}
                    placeholder="Falls back to the category name"
                    maxLength={70}
                    className="admin-input"
                  />
                </Field>
                <Field label="H1 title (on-page heading)">
                  <input
                    value={form.seo_h1_title}
                    onChange={(e) => setForm((f) => ({ ...f, seo_h1_title: e.target.value }))}
                    placeholder="Falls back to the category name"
                    className="admin-input"
                  />
                </Field>
              </div>
              <Field label={`SEO description (${(form.seo_description ?? "").length}/300)`}>
                <textarea
                  value={form.seo_description}
                  onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))}
                  rows={2}
                  maxLength={300}
                  placeholder="Falls back to the category description"
                  className="admin-input resize-none"
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Focus keyword">
                  <input
                    value={form.seo_focus_keyword}
                    onChange={(e) => setForm((f) => ({ ...f, seo_focus_keyword: e.target.value }))}
                    placeholder="e.g. free puzzle games online"
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
              </div>
              <Field label="Social share image URL">
                <input
                  value={form.og_image_url ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, og_image_url: e.target.value || null }))}
                  placeholder="Falls back to the site default social image"
                  className="admin-input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.seo_index ?? true}
                    onChange={(e) => setForm((f) => ({ ...f, seo_index: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Index in search
                </label>
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.breadcrumbs_enabled ?? true}
                    onChange={(e) => setForm((f) => ({ ...f, breadcrumbs_enabled: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Breadcrumbs
                </label>
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.schema_collection_page ?? true}
                    onChange={(e) => setForm((f) => ({ ...f, schema_collection_page: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  CollectionPage schema
                </label>
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editingSlug ? "Save changes" : "Create category"}
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

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="-mb-1 mt-2 border-t border-[var(--color-surface-border)] pt-4 text-xs font-bold uppercase tracking-wide text-text-faint first:mt-0 first:border-0 first:pt-0">
      {children}
    </h3>
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
