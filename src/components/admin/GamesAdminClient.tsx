"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Star,
  Heart,
  Sparkles,
  HardDrive,
  CheckCircle2,
} from "lucide-react";
import {
  fetchAllGamesAdmin,
  fetchAllCategoriesAdmin,
  fetchAllTagsAdmin,
  createGame,
  updateGame,
  deleteGame,
  uploadThumbnail,
  uploadGameMedia,
  uploadGameBuild,
  generateSeoWithAi,
  scanOrphanedGameFiles,
  cleanupOrphanedGameFiles,
  type AdminGame,
  type AdminCategory,
  type AdminTag,
  type GameInput,
  type OrphanScanReport,
  type OrphanCleanupReport,
  type GameStorageBucket,
} from "@/lib/supabase/admin-content";
import { slugify } from "@/lib/prng";

const TAGS = ["TOP", "HOT", "NEW", "UPDATED"] as const;

const emptyForm: GameInput = {
  slug: "",
  title: "",
  category_slug: "",
  description: "",
  instructions: "",
  controls: "",

  thumbnail_url: null,
  cover_image_url: null,
  video_trailer_url: null,
  preview_video_url: null,
  loading_screen_url: null,
  estimated_loading_seconds: null,

  play_type: "embed",
  embed_url: "",
  storage_path: null,

  developer: "",
  publisher: "",
  release_date: null,
  version: "",

  tag: null,
  rating: 4.5,
  rating_count: 0,
  plays: 0,
  favorite_count: 0,

  multiplayer: false,
  mobile_support: true,
  fullscreen_enabled: true,
  save_progress_enabled: true,
  width: null,
  height: null,
  orientation: "landscape",

  is_published: true,
  scheduled_publish_at: null,
  visibility: "public",

  is_featured: false,
  featured_order: null,
  is_trending: false,
  is_recommended: false,
  is_editors_pick: false,
  editors_pick_order: null,
  is_sponsored: false,
  sponsored_order: null,
  sponsor_label: null,

  meta_title: "",
  meta_description: "",
  seo_canonical_url: null,
  seo_focus_keyword: "",
  seo_secondary_keywords: [],
  seo_h1_title: "",
  seo_excerpt: "",
  seo_author: "",
  seo_index: true,
  seo_follow: true,
  seo_max_snippet: -1,
  seo_max_image_preview: "large",
  seo_max_video_preview: -1,
  seo_noarchive: false,
  seo_nosnippet: false,
  og_title: "",
  og_description: "",
  og_image_url: null,
  og_image_alt: "",
  twitter_title: "",
  twitter_description: "",
  twitter_image_url: null,
  twitter_image_alt: "",
  twitter_card: "summary_large_image",
  schema_video_game: true,
  schema_software_application: true,
  schema_review: false,
  schema_breadcrumb: true,

  tagIds: [],
};

export function GamesAdminClient() {
  const [games, setGames] = useState<AdminGame[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GameInput>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);

  const [thumbMode, setThumbMode] = useState<"url" | "upload">("url");
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [coverMode, setCoverMode] = useState<"url" | "upload">("url");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [previewMode, setPreviewMode] = useState<"url" | "upload">("url");
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [loadingScreenMode, setLoadingScreenMode] = useState<"url" | "upload">("url");
  const [loadingScreenFile, setLoadingScreenFile] = useState<File | null>(null);
  const [buildFiles, setBuildFiles] = useState<FileList | null>(null);
  const [buildProgress, setBuildProgress] = useState<{ done: number; total: number } | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const [cleanupOpen, setCleanupOpen] = useState(false);
  const [cleanupScanning, setCleanupScanning] = useState(false);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupScan, setCleanupScan] = useState<OrphanScanReport | null>(null);
  const [cleanupResult, setCleanupResult] = useState<OrphanCleanupReport | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [g, c, t] = await Promise.all([
        fetchAllGamesAdmin(),
        fetchAllCategoriesAdmin(),
        fetchAllTagsAdmin(),
      ]);
      setGames(g);
      setCategories(c);
      setTags(t);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load games.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function resetMediaPickers() {
    setThumbMode("url");
    setThumbFile(null);
    setCoverMode("url");
    setCoverFile(null);
    setPreviewMode("url");
    setPreviewFile(null);
    setLoadingScreenMode("url");
    setLoadingScreenFile(null);
    setBuildFiles(null);
  }

  function openCreate() {
    setEditingId(null);
    setForm({ ...emptyForm, category_slug: categories[0]?.slug ?? "" });
    resetMediaPickers();
    setSlugTouched(false);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(game: AdminGame) {
    setEditingId(game.id);
    setForm({
      slug: game.slug,
      title: game.title,
      category_slug: game.category_slug,
      description: game.description,
      instructions: game.instructions,
      controls: game.controls,
      thumbnail_url: game.thumbnail_url,
      cover_image_url: game.cover_image_url,
      video_trailer_url: game.video_trailer_url,
      preview_video_url: game.preview_video_url,
      loading_screen_url: game.loading_screen_url,
      estimated_loading_seconds: game.estimated_loading_seconds,
      play_type: game.play_type,
      embed_url: game.embed_url,
      storage_path: game.storage_path,
      developer: game.developer,
      publisher: game.publisher,
      release_date: game.release_date,
      version: game.version,
      tag: game.tag,
      rating: game.rating,
      rating_count: game.rating_count,
      plays: game.plays,
      favorite_count: game.favorite_count,
      multiplayer: game.multiplayer,
      mobile_support: game.mobile_support,
      fullscreen_enabled: game.fullscreen_enabled,
      save_progress_enabled: game.save_progress_enabled ?? true,
      width: game.width,
      height: game.height,
      orientation: game.orientation,
      is_published: game.is_published,
      scheduled_publish_at: game.scheduled_publish_at,
      visibility: game.visibility,
      is_featured: game.is_featured,
      featured_order: game.featured_order,
      is_trending: game.is_trending,
      is_recommended: game.is_recommended,
      is_editors_pick: game.is_editors_pick,
      editors_pick_order: game.editors_pick_order,
      is_sponsored: game.is_sponsored,
      sponsored_order: game.sponsored_order,
      sponsor_label: game.sponsor_label,
      meta_title: game.meta_title,
      meta_description: game.meta_description,
      seo_canonical_url: game.seo_canonical_url,
      seo_focus_keyword: game.seo_focus_keyword,
      seo_secondary_keywords: game.seo_secondary_keywords,
      seo_h1_title: game.seo_h1_title,
      seo_excerpt: game.seo_excerpt,
      seo_author: game.seo_author,
      seo_index: game.seo_index,
      seo_follow: game.seo_follow,
      seo_max_snippet: game.seo_max_snippet,
      seo_max_image_preview: game.seo_max_image_preview,
      seo_max_video_preview: game.seo_max_video_preview,
      seo_noarchive: game.seo_noarchive,
      seo_nosnippet: game.seo_nosnippet,
      og_title: game.og_title,
      og_description: game.og_description,
      og_image_url: game.og_image_url,
      og_image_alt: game.og_image_alt,
      twitter_title: game.twitter_title,
      twitter_description: game.twitter_description,
      twitter_image_url: game.twitter_image_url,
      twitter_image_alt: game.twitter_image_alt,
      twitter_card: game.twitter_card,
      schema_video_game: game.schema_video_game,
      schema_software_application: game.schema_software_application,
      schema_review: game.schema_review,
      schema_breadcrumb: game.schema_breadcrumb,
      tagIds: game.tagIds,
    });
    resetMediaPickers();
    setSlugTouched(true);
    setFormError(null);
    setFormOpen(true);
  }

  function handleTitleChange(title: string) {
    setForm((f) => ({ ...f, title, slug: slugTouched ? f.slug : slugify(title) }));
  }

  async function handleAiGenerateGameSeo() {
    if (!form.title) return;
    setAiLoading(true);
    setFormError(null);
    try {
      const category = categories.find((c) => c.slug === form.category_slug)?.name;
      const result = await generateSeoWithAi({
        itemType: "game",
        title: form.title,
        description: form.description,
        category,
        fields: ["seo_title", "meta_description", "focus_keyword", "secondary_keywords", "seo_excerpt", "og_description"],
      });
      setForm((f) => ({
        ...f,
        meta_title: typeof result.seo_title === "string" ? result.seo_title : f.meta_title,
        meta_description: typeof result.meta_description === "string" ? result.meta_description : f.meta_description,
        seo_focus_keyword: typeof result.focus_keyword === "string" ? result.focus_keyword : f.seo_focus_keyword,
        seo_secondary_keywords: Array.isArray(result.secondary_keywords)
          ? result.secondary_keywords
          : f.seo_secondary_keywords,
        seo_excerpt: typeof result.seo_excerpt === "string" ? result.seo_excerpt : f.seo_excerpt,
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

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.title.trim() || !form.slug.trim() || !form.category_slug) {
      setFormError("Title, slug, and category are required.");
      return;
    }
    if (form.play_type === "embed" && !form.embed_url?.trim()) {
      setFormError("Add an embed URL, or switch to file upload.");
      return;
    }
    if (form.play_type === "upload" && !buildFiles && !form.storage_path) {
      setFormError("Upload a game build, or switch to embed URL.");
      return;
    }

    setSaving(true);
    try {
      let thumbnailUrl = form.thumbnail_url;
      if (thumbMode === "upload" && thumbFile) {
        thumbnailUrl = await uploadThumbnail(form.slug, thumbFile, form.thumbnail_url);
      }
      let coverUrl = form.cover_image_url;
      if (coverMode === "upload" && coverFile) {
        coverUrl = await uploadGameMedia(form.slug, "cover", coverFile, form.cover_image_url);
      }
      let previewUrl = form.preview_video_url;
      if (previewMode === "upload" && previewFile) {
        previewUrl = await uploadGameMedia(form.slug, "preview", previewFile, form.preview_video_url);
      }
      let loadingScreenUrl = form.loading_screen_url;
      if (loadingScreenMode === "upload" && loadingScreenFile) {
        loadingScreenUrl = await uploadGameMedia(form.slug, "loading-screen", loadingScreenFile, form.loading_screen_url);
      }

      let storagePath = form.storage_path;
      if (form.play_type === "upload" && buildFiles) {
        setBuildProgress({ done: 0, total: buildFiles.length });
        storagePath = await uploadGameBuild(form.slug, buildFiles, (done, total) =>
          setBuildProgress({ done, total })
        );
      }

      const payload: GameInput = {
        ...form,
        thumbnail_url: thumbnailUrl,
        cover_image_url: coverUrl,
        preview_video_url: previewUrl,
        loading_screen_url: loadingScreenUrl,
        storage_path: form.play_type === "upload" ? storagePath : null,
        embed_url: form.play_type === "embed" ? form.embed_url : null,
      };

      if (editingId) {
        await updateGame(editingId, payload);
      } else {
        await createGame(payload);
      }
      await load();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
      setBuildProgress(null);
    }
  }

  async function handleDelete(game: AdminGame) {
    if (!confirm(`Delete "${game.title}"? This can't be undone.`)) return;
    try {
      await deleteGame(game.id);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  function openCleanup() {
    setCleanupOpen(true);
    setCleanupResult(null);
    setCleanupError(null);
    void runScan();
  }

  async function runScan() {
    setCleanupScanning(true);
    setCleanupError(null);
    try {
      const report = await scanOrphanedGameFiles();
      setCleanupScan(report);
    } catch (err) {
      setCleanupError(err instanceof Error ? err.message : "Failed to scan storage.");
    } finally {
      setCleanupScanning(false);
    }
  }

  async function runCleanup() {
    const totalOrphans = cleanupScan
      ? Object.values(cleanupScan.buckets).reduce((sum, b) => sum + b.orphanCount, 0)
      : 0;
    if (totalOrphans === 0) return;
    if (!confirm(`Permanently delete ${totalOrphans} orphaned file${totalOrphans === 1 ? "" : "s"} from storage? This can't be undone.`)) {
      return;
    }
    setCleanupRunning(true);
    setCleanupError(null);
    try {
      const result = await cleanupOrphanedGameFiles();
      setCleanupResult(result);
      setCleanupScan(null);
      // Re-scan so the report reflects reality (e.g. a bucket that hit the
      // per-scan cap may still have more orphans left to find).
      await runScan();
    } catch (err) {
      setCleanupError(err instanceof Error ? err.message : "Failed to clean up storage.");
    } finally {
      setCleanupRunning(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Games</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {games ? `${games.length} game${games.length === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={openCleanup}
            className="glass flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold text-white/80 hover:text-white"
            title="Find and remove orphaned game media files left behind in storage"
          >
            <HardDrive size={16} />
            Clean up storage
          </button>
          <button
            type="button"
            onClick={openCreate}
            disabled={categories.length === 0}
            className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} />
            Add Game
          </button>
        </div>
      </div>

      {categories.length === 0 && games !== null && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-amber-500/15 px-4 py-3 text-sm text-amber-300">
          <AlertTriangle size={18} className="shrink-0" />
          <span>
            Add at least one category before adding games —{" "}
            <Link href="/admin/categories" className="font-semibold underline underline-offset-2">
              go to Categories
            </Link>
            .
          </span>
        </div>
      )}

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Stats</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {games === null && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {games?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-text-faint">
                  No games yet — click &quot;Add Game&quot; to create the first one.
                </td>
              </tr>
            )}
            {games?.map((g) => (
              <tr
                key={g.id}
                className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {g.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={g.thumbnail_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-white/10" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-white">{g.title}</div>
                      <div className="truncate text-xs text-text-faint">/{g.slug}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-white/80">{g.category_slug}</td>
                <td className="px-4 py-3 text-white/70">
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                      <Star size={12} className="fill-gold text-gold" />
                      {g.rating.toFixed(1)} ({g.rating_count})
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart size={12} className="fill-hot text-hot" />
                      {g.favorite_count}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        g.is_published ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-text-faint"
                      }`}
                    >
                      {g.is_published ? "Published" : "Draft"}
                    </span>
                    {!g.is_published && g.scheduled_publish_at && (
                      <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-semibold text-blue-300">
                        Scheduled {new Date(g.scheduled_publish_at).toLocaleString()}
                      </span>
                    )}
                    {g.visibility !== "public" && (
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                        {g.visibility === "private" ? "Private" : "Unlisted"}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Link
                      href={`/game/${g.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`View ${g.title}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <ExternalLink size={15} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => openEdit(g)}
                      aria-label={`Edit ${g.title}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(g)}
                      aria-label={`Delete ${g.title}`}
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
            className="glass-opaque flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-[var(--color-surface-border)] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">
                {editingId ? "Edit Game" : "Add Game"}
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
              <SectionHeading>Basics</SectionHeading>

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
              </Field>

              <Field label="Category">
                <select
                  value={form.category_slug}
                  onChange={(e) => setForm((f) => ({ ...f, category_slug: e.target.value }))}
                  className="admin-input"
                  required
                >
                  <option value="" disabled>
                    Select a category
                  </option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
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
                          style={{ backgroundColor: tag.color, color: "#000", opacity: active ? 1 : 0.35 }}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              )}

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="admin-input resize-none"
                />
              </Field>

              <Field label="Instructions">
                <textarea
                  value={form.instructions}
                  onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                  rows={3}
                  placeholder="How to play — objective, tips, win condition…"
                  className="admin-input resize-none"
                />
              </Field>

              <Field label="Controls">
                <textarea
                  value={form.controls}
                  onChange={(e) => setForm((f) => ({ ...f, controls: e.target.value }))}
                  rows={3}
                  placeholder={"One control per line, e.g.\nWASD = move\nSpace = jump"}
                  className="admin-input resize-none"
                />
              </Field>

              <SectionHeading>Media</SectionHeading>

              <Field label="Thumbnail">
                <MediaPicker
                  mode={thumbMode}
                  onModeChange={setThumbMode}
                  urlValue={form.thumbnail_url}
                  onUrlChange={(v) => setForm((f) => ({ ...f, thumbnail_url: v }))}
                  onFileChange={setThumbFile}
                  accept="image/*"
                  kind="image"
                />
              </Field>

              <Field label="Cover image">
                <MediaPicker
                  mode={coverMode}
                  onModeChange={setCoverMode}
                  urlValue={form.cover_image_url}
                  onUrlChange={(v) => setForm((f) => ({ ...f, cover_image_url: v }))}
                  onFileChange={setCoverFile}
                  accept="image/*"
                  kind="image"
                />
              </Field>

              <Field label="Video trailer (URL, e.g. YouTube)">
                <input
                  value={form.video_trailer_url ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, video_trailer_url: e.target.value }))}
                  placeholder="https://…"
                  className="admin-input"
                />
              </Field>

              <Field label="Preview video (hover / autoplay loop)">
                <MediaPicker
                  mode={previewMode}
                  onModeChange={setPreviewMode}
                  urlValue={form.preview_video_url}
                  onUrlChange={(v) => setForm((f) => ({ ...f, preview_video_url: v }))}
                  onFileChange={setPreviewFile}
                  accept="video/*"
                  kind="video"
                />
                <p className="mt-1.5 text-[11px] text-text-faint">
                  Short, silent, looping clip shown on hover (desktop) and as the autoplay background on
                  the mobile game page — like CrazyGames.
                </p>
              </Field>

              <Field label="Loading screen image">
                <MediaPicker
                  mode={loadingScreenMode}
                  onModeChange={setLoadingScreenMode}
                  urlValue={form.loading_screen_url}
                  onUrlChange={(v) => setForm((f) => ({ ...f, loading_screen_url: v }))}
                  onFileChange={setLoadingScreenFile}
                  accept="image/*"
                  kind="image"
                />
              </Field>

              <Field label="Estimated loading time (seconds, optional)">
                <input
                  type="number"
                  min={0}
                  value={form.estimated_loading_seconds ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      estimated_loading_seconds: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  className="admin-input"
                />
              </Field>

              <SectionHeading>Playback</SectionHeading>

              <Field label="Game file">
                <div className="mb-2 flex gap-1.5">
                  <ToggleButton
                    active={form.play_type === "embed"}
                    onClick={() => setForm((f) => ({ ...f, play_type: "embed" }))}
                  >
                    Embed URL
                  </ToggleButton>
                  <ToggleButton
                    active={form.play_type === "upload"}
                    onClick={() => setForm((f) => ({ ...f, play_type: "upload" }))}
                  >
                    Upload build
                  </ToggleButton>
                </div>
                {form.play_type === "embed" ? (
                  <input
                    value={form.embed_url ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, embed_url: e.target.value }))}
                    placeholder="https://…"
                    className="admin-input"
                  />
                ) : (
                  <div>
                    <input
                      type="file"
                      // @ts-expect-error non-standard but widely supported attribute for folder selection
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={(e) => setBuildFiles(e.target.files)}
                      className="admin-input file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
                    />
                    <p className="mt-1.5 text-[11px] text-text-faint">
                      Select the game build&apos;s folder — must contain an index.html.
                    </p>
                    {buildProgress && (
                      <p className="mt-1.5 text-[11px] text-white/70">
                        Uploading {buildProgress.done}/{buildProgress.total}…
                      </p>
                    )}
                    {form.storage_path && !buildFiles && (
                      <p className="mt-1.5 truncate text-[11px] text-text-faint">
                        Current file: {form.storage_path}
                      </p>
                    )}
                  </div>
                )}
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Width (px)">
                  <input
                    type="number"
                    min={1}
                    value={form.width ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, width: e.target.value === "" ? null : Number(e.target.value) }))
                    }
                    placeholder="e.g. 960"
                    className="admin-input"
                  />
                </Field>
                <Field label="Height (px)">
                  <input
                    type="number"
                    min={1}
                    value={form.height ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        height: e.target.value === "" ? null : Number(e.target.value),
                      }))
                    }
                    placeholder="e.g. 540"
                    className="admin-input"
                  />
                </Field>
              </div>

              <Field label="Orientation">
                <div className="flex gap-1.5">
                  <ToggleButton
                    active={form.orientation === "landscape"}
                    onClick={() => setForm((f) => ({ ...f, orientation: "landscape" }))}
                  >
                    Landscape
                  </ToggleButton>
                  <ToggleButton
                    active={form.orientation === "portrait"}
                    onClick={() => setForm((f) => ({ ...f, orientation: "portrait" }))}
                  >
                    Portrait
                  </ToggleButton>
                </div>
                <p className="mt-1.5 text-[11px] text-text-faint">
                  Portrait games automatically rotate to fit the frame on mobile/fullscreen.
                </p>
              </Field>

              <label className="flex items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={form.mobile_support}
                  onChange={(e) => setForm((f) => ({ ...f, mobile_support: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Mobile support
              </label>

              <label className="flex items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={form.fullscreen_enabled}
                  onChange={(e) => setForm((f) => ({ ...f, fullscreen_enabled: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Allow fullscreen
              </label>

              <label className="flex items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={form.save_progress_enabled}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, save_progress_enabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded"
                />
                Show Save Progress button
              </label>
              <p className="ml-6 -mt-1.5 text-[11px] text-text-faint">
                Show the Save Progress button in the player action bar. Disable for embed games
                that handle saving internally.
              </p>

              <label className="flex items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={form.multiplayer}
                  onChange={(e) => setForm((f) => ({ ...f, multiplayer: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Multiplayer
              </label>

              <SectionHeading>Credits &amp; version</SectionHeading>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Developer">
                  <input
                    value={form.developer}
                    onChange={(e) => setForm((f) => ({ ...f, developer: e.target.value }))}
                    className="admin-input"
                  />
                </Field>
                <Field label="Publisher">
                  <input
                    value={form.publisher}
                    onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))}
                    className="admin-input"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Release date">
                  <input
                    type="date"
                    value={form.release_date ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, release_date: e.target.value || null }))}
                    className="admin-input"
                  />
                </Field>
                <Field label="Version">
                  <input
                    value={form.version}
                    onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                    placeholder="e.g. 1.2.0"
                    className="admin-input"
                  />
                </Field>
              </div>

              <SectionHeading>Discovery &amp; status</SectionHeading>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Badge (Tag)">
                  <select
                    value={form.tag ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, tag: (e.target.value || null) as GameInput["tag"] }))
                    }
                    className="admin-input"
                  >
                    <option value="">None</option>
                    {TAGS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Rating (seed, auto-updates once played reviews come in)">
                  <input
                    type="number"
                    min={0}
                    max={5}
                    step={0.1}
                    value={form.rating}
                    onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) }))}
                    className="admin-input"
                  />
                </Field>
              </div>

              <Field label="Plays (seed)">
                <input
                  type="number"
                  min={0}
                  value={form.plays}
                  onChange={(e) => setForm((f) => ({ ...f, plays: Number(e.target.value) }))}
                  className="admin-input"
                />
              </Field>

              {editingId && (
                <div className="grid grid-cols-2 gap-3 text-xs text-text-faint">
                  <span>Play count: auto-maintained ({form.plays})</span>
                  <span>Favorite count: auto-maintained ({form.favorite_count})</span>
                  <span className="col-span-2">
                    Average rating: auto-maintained ({form.rating.toFixed(1)} from {form.rating_count} rating
                    {form.rating_count === 1 ? "" : "s"})
                  </span>
                </div>
              )}

              <Field label="Visibility">
                <select
                  value={form.visibility}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, visibility: e.target.value as GameInput["visibility"] }))
                  }
                  className="admin-input"
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted (reachable by direct link only)</option>
                  <option value="private">Private (admins only)</option>
                </select>
              </Field>

              <label className="flex items-center gap-2 text-sm text-white/85">
                <input
                  type="checkbox"
                  checked={form.is_published}
                  onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Published (uncheck to save as Draft)
              </label>

              {!form.is_published && (
                <Field label="Scheduled publish time (optional)">
                  <input
                    type="datetime-local"
                    value={form.scheduled_publish_at ? form.scheduled_publish_at.slice(0, 16) : ""}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        scheduled_publish_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      }))
                    }
                    className="admin-input"
                  />
                  <p className="mt-1 text-xs text-text-faint">
                    Leave blank to keep as a plain draft. Set a time and the Scheduled Publishing automation job
                    (Admin → Automation) will publish it automatically once that time arrives.
                  </p>
                </Field>
              )}

              <div className="grid grid-cols-3 gap-2">
                <label className="flex items-center gap-2 text-sm text-white/85">
                  <input
                    type="checkbox"
                    checked={form.is_featured ?? false}
                    onChange={(e) => setForm((f) => ({ ...f, is_featured: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Featured
                </label>
                <label className="flex items-center gap-2 text-sm text-white/85">
                  <input
                    type="checkbox"
                    checked={form.is_trending ?? false}
                    onChange={(e) => setForm((f) => ({ ...f, is_trending: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Trending
                </label>
                <label className="flex items-center gap-2 text-sm text-white/85">
                  <input
                    type="checkbox"
                    checked={form.is_recommended ?? false}
                    onChange={(e) => setForm((f) => ({ ...f, is_recommended: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Recommended
                </label>
              </div>

              <SectionHeading>SEO</SectionHeading>

              <div className="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3 py-2">
                <p className="text-xs text-text-faint">
                  Draft SEO title, description &amp; keywords from the game&apos;s title/description.
                </p>
                <button
                  type="button"
                  disabled={aiLoading || !form.title}
                  onClick={handleAiGenerateGameSeo}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Generate with AI
                </button>
              </div>

              {/* Google SERP live preview — lets an admin sanity-check the
                  title/description that will actually show up in search
                  results, including truncation, without leaving the form. */}
              <div className="rounded-xl border border-[var(--color-surface-border)] bg-white p-3">
                <p className="truncate text-[13px] text-[#1a0dab]">
                  {(form.meta_title || form.title || "Untitled game").slice(0, 70)}
                </p>
                <p className="truncate text-[12px] text-[#006621]">
                  mofigames.com/game/{form.slug || "your-game"}
                </p>
                <p className="line-clamp-2 text-[12px] text-[#4d5156]">
                  {(form.meta_description || form.seo_excerpt || form.description || "No description yet.").slice(0, 160)}
                </p>
              </div>

              <Field label={`Meta title (${(form.meta_title ?? "").length}/70)`}>
                <input
                  value={form.meta_title}
                  onChange={(e) => setForm((f) => ({ ...f, meta_title: e.target.value }))}
                  placeholder="Falls back to the game title if left blank"
                  maxLength={70}
                  className="admin-input"
                />
              </Field>
              <Field label={`Meta description (${(form.meta_description ?? "").length}/300)`}>
                <textarea
                  value={form.meta_description}
                  onChange={(e) => setForm((f) => ({ ...f, meta_description: e.target.value }))}
                  rows={2}
                  placeholder="Falls back to the game description if left blank"
                  maxLength={300}
                  className="admin-input resize-none"
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="H1 title (on-page heading)">
                  <input
                    value={form.seo_h1_title}
                    onChange={(e) => setForm((f) => ({ ...f, seo_h1_title: e.target.value }))}
                    placeholder="Falls back to the game title"
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
                <Field label="Focus keyword">
                  <input
                    value={form.seo_focus_keyword}
                    onChange={(e) => setForm((f) => ({ ...f, seo_focus_keyword: e.target.value }))}
                    placeholder="e.g. free racing game online"
                    className="admin-input"
                  />
                </Field>
                <Field label="Author">
                  <input
                    value={form.seo_author}
                    onChange={(e) => setForm((f) => ({ ...f, seo_author: e.target.value }))}
                    placeholder="Falls back to the site default author"
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
                      seo_secondary_keywords: e.target.value
                        .split(",")
                        .map((k) => k.trim())
                        .filter(Boolean),
                    }))
                  }
                  placeholder="racing game, free browser game, no download"
                  className="admin-input"
                />
              </Field>
              <Field label="SEO excerpt (used as fallback description/OG text)">
                <textarea
                  value={form.seo_excerpt}
                  onChange={(e) => setForm((f) => ({ ...f, seo_excerpt: e.target.value }))}
                  rows={2}
                  maxLength={300}
                  className="admin-input resize-none"
                />
              </Field>

              <p className="-mb-1 mt-1 text-[11px] font-bold uppercase tracking-wide text-text-faint">
                Robots &amp; indexing
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.seo_index ?? true}
                    onChange={(e) => setForm((f) => ({ ...f, seo_index: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Index
                </label>
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.seo_follow ?? true}
                    onChange={(e) => setForm((f) => ({ ...f, seo_follow: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Follow
                </label>
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.seo_noarchive ?? false}
                    onChange={(e) => setForm((f) => ({ ...f, seo_noarchive: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  No archive
                </label>
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.seo_nosnippet ?? false}
                    onChange={(e) => setForm((f) => ({ ...f, seo_nosnippet: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  No snippet
                </label>
              </div>
              <Field label="Max image preview size">
                <select
                  value={form.seo_max_image_preview ?? "large"}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, seo_max_image_preview: e.target.value as GameInput["seo_max_image_preview"] }))
                  }
                  className="admin-input"
                >
                  <option value="none">None</option>
                  <option value="standard">Standard</option>
                  <option value="large">Large</option>
                </select>
              </Field>

              <p className="-mb-1 mt-1 text-[11px] font-bold uppercase tracking-wide text-text-faint">
                Open Graph (Facebook, Discord, etc.)
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="OG title">
                  <input
                    value={form.og_title}
                    onChange={(e) => setForm((f) => ({ ...f, og_title: e.target.value }))}
                    placeholder="Falls back to the meta title"
                    className="admin-input"
                  />
                </Field>
                <Field label="OG image URL">
                  <input
                    value={form.og_image_url ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, og_image_url: e.target.value || null }))}
                    placeholder="Falls back to the cover/thumbnail image"
                    className="admin-input"
                  />
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

              <p className="-mb-1 mt-1 text-[11px] font-bold uppercase tracking-wide text-text-faint">
                Twitter / X card
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Twitter title">
                  <input
                    value={form.twitter_title}
                    onChange={(e) => setForm((f) => ({ ...f, twitter_title: e.target.value }))}
                    placeholder="Falls back to the OG title"
                    className="admin-input"
                  />
                </Field>
                <Field label="Card type">
                  <select
                    value={form.twitter_card}
                    onChange={(e) => setForm((f) => ({ ...f, twitter_card: e.target.value as GameInput["twitter_card"] }))}
                    className="admin-input"
                  >
                    <option value="summary_large_image">Summary large image</option>
                    <option value="summary">Summary</option>
                    <option value="player">Player</option>
                    <option value="app">App</option>
                  </select>
                </Field>
              </div>

              <p className="-mb-1 mt-1 text-[11px] font-bold uppercase tracking-wide text-text-faint">
                Structured data (JSON-LD)
              </p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.schema_video_game ?? true}
                    onChange={(e) => setForm((f) => ({ ...f, schema_video_game: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  VideoGame
                </label>
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.schema_software_application ?? true}
                    onChange={(e) => setForm((f) => ({ ...f, schema_software_application: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  SoftwareApplication
                </label>
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.schema_breadcrumb ?? true}
                    onChange={(e) => setForm((f) => ({ ...f, schema_breadcrumb: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Breadcrumb
                </label>
                <label className="flex items-center gap-2 text-xs text-text-muted">
                  <input
                    type="checkbox"
                    checked={form.schema_review ?? false}
                    onChange={(e) => setForm((f) => ({ ...f, schema_review: e.target.checked }))}
                    className="h-4 w-4 rounded"
                  />
                  Review
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
                {editingId ? "Save changes" : "Create game"}
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

      {cleanupOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setCleanupOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="glass-opaque flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-[var(--color-surface-border)] p-5"
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">Clean up storage</h2>
              <button
                type="button"
                onClick={() => setCleanupOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X size={18} className="text-white/70" />
              </button>
            </div>
            <p className="mb-4 text-xs text-text-faint">
              Scans game-thumbnails, game-media, and game-files for files no game currently references — leftovers
              from deleted games or replaced media — and removes them.
            </p>

            {cleanupError && (
              <p className="mb-4 rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{cleanupError}</p>
            )}

            {cleanupResult && (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-300">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                <span>
                  Removed {cleanupResult.totalDeleted} orphaned file{cleanupResult.totalDeleted === 1 ? "" : "s"}.
                  {cleanupResult.errors.length > 0 &&
                    ` ${cleanupResult.errors.length} error(s) — see server logs.`}
                </span>
              </div>
            )}

            {cleanupScanning && !cleanupScan ? (
              <div className="flex items-center gap-2 py-6 text-sm text-text-faint">
                <Loader2 size={16} className="animate-spin" />
                Scanning storage…
              </div>
            ) : cleanupScan ? (
              <div className="flex flex-col gap-3">
                {(Object.entries(cleanupScan.buckets) as [string, OrphanScanReport["buckets"][GameStorageBucket]][]).map(
                  ([bucket, info]) => (
                    <div key={bucket} className="rounded-xl bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-white">{bucket}</span>
                        <span
                          className={`text-xs font-bold ${info.orphanCount > 0 ? "text-amber-400" : "text-emerald-400"}`}
                        >
                          {info.orphanCount} orphan{info.orphanCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-text-faint">
                        {info.scanned} object{info.scanned === 1 ? "" : "s"} scanned
                        {info.truncated && " (capped — re-run after cleaning up to scan the rest)"}
                      </p>
                      {info.sample.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-[11px] text-text-faint">
                          {info.sample.map((p) => (
                            <li key={p} className="truncate font-mono">
                              {p}
                            </li>
                          ))}
                          {info.orphanCount > info.sample.length && (
                            <li className="italic">…and {info.orphanCount - info.sample.length} more</li>
                          )}
                        </ul>
                      )}
                    </div>
                  )
                )}
                {cleanupScan.errors.length > 0 && (
                  <p className="text-xs text-hot">{cleanupScan.errors.join(" · ")}</p>
                )}
              </div>
            ) : null}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={runCleanup}
                disabled={
                  cleanupRunning ||
                  cleanupScanning ||
                  !cleanupScan ||
                  Object.values(cleanupScan.buckets).every((b) => b.orphanCount === 0)
                }
                className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {cleanupRunning && <Loader2 size={15} className="animate-spin" />}
                Delete orphaned files
              </button>
              <button
                type="button"
                onClick={() => void runScan()}
                disabled={cleanupScanning || cleanupRunning}
                className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white disabled:opacity-40"
              >
                Re-scan
              </button>
            </div>
          </div>
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

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
        active ? "bg-white text-black" : "bg-white/10 text-white/70 hover:bg-white/15"
      }`}
    >
      {children}
    </button>
  );
}

/** Shared URL-or-upload picker for images/video used across the media
 * fields (thumbnail, cover image, preview video, loading screen). Mirrors
 * the original thumbnail field's toggle pattern. */
function MediaPicker({
  mode,
  onModeChange,
  urlValue,
  onUrlChange,
  onFileChange,
  accept,
  kind,
}: {
  mode: "url" | "upload";
  onModeChange: (mode: "url" | "upload") => void;
  urlValue: string | null | undefined;
  onUrlChange: (value: string) => void;
  onFileChange: (file: File | null) => void;
  accept: string;
  kind: "image" | "video";
}) {
  return (
    <div>
      <div className="mb-2 flex gap-1.5">
        <ToggleButton active={mode === "url"} onClick={() => onModeChange("url")}>
          {kind === "image" ? "Image URL" : "Video URL"}
        </ToggleButton>
        <ToggleButton active={mode === "upload"} onClick={() => onModeChange("upload")}>
          Upload {kind}
        </ToggleButton>
      </div>
      {mode === "url" ? (
        <input
          value={urlValue ?? ""}
          onChange={(e) => onUrlChange(e.target.value)}
          placeholder="https://…"
          className="admin-input"
        />
      ) : (
        <input
          type="file"
          accept={accept}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="admin-input file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
        />
      )}
      {urlValue && mode === "url" && kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlValue} alt="" className="mt-2 h-16 w-16 rounded-lg object-cover" />
      )}
      {urlValue && mode === "url" && kind === "video" && (
        <video src={urlValue} muted loop className="mt-2 h-20 w-32 rounded-lg object-cover" />
      )}
    </div>
  );
}
