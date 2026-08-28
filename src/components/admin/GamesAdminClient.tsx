"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Eye,
  Star,
  Sparkles,
  HardDrive,
  CheckCircle2,
  Search,
  MoreVertical,
  Copy,
  RotateCcw,
  ChevronDown,
  Flame,
  Tag as TagIcon,
} from "lucide-react";
import {
  fetchGamesAdminList,
  fetchAllCategoriesAdmin,
  fetchAllTagsAdmin,
  createGame,
  updateGame,
  deleteGame,
  duplicateGame,
  trashGame,
  restoreGame,
  runGamesBulkAction,
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
  type GamesAdminStatusFilter,
  type GamesAdminSort,
  type GamesBulkActionInput,
} from "@/lib/supabase/admin-content";
import { slugify } from "@/lib/prng";

const TAGS = ["TOP", "HOT", "NEW", "UPDATED"] as const;
const PAGE_SIZE = 20;

const STATUS_TABS: { value: GamesAdminStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "trash", label: "Trash" },
];

const SORT_OPTIONS: { value: GamesAdminSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "updated", label: "Recently updated" },
  { value: "title_asc", label: "Title A–Z" },
  { value: "title_desc", label: "Title Z–A" },
  { value: "most_played", label: "Most played" },
  { value: "published_date", label: "Published date" },
];

type ToastKind = "success" | "error";
interface ToastMessage {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ConfirmState {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

const emptyForm: GameInput = {
  slug: "",
  title: "",
  category_slug: "",
  description: "",
  instructions: "",
  controls: "",

  thumbnail_url: null,
  cover_image_url: null,
  landscape_cover_url: null,
  square_cover_url: null,
  portrait_cover_url: null,
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
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // --- List controls: search / filter / sort / pagination (Phase 2) -----
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState(""); // what the admin is typing
  const [q, setQ] = useState(""); // debounced value actually sent to the API
  const [status, setStatus] = useState<GamesAdminStatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [featuredFilter, setFeaturedFilter] = useState<"" | "true" | "false">("");
  const [trendingFilter, setTrendingFilter] = useState<"" | "true" | "false">("");
  const [sort, setSort] = useState<GamesAdminSort>("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Debounce the search box — 350ms after the admin stops typing, not on
  // every keystroke (Phase 2: "debounced search").
  useEffect(() => {
    const handle = setTimeout(() => {
      setQ(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [searchInput]);

  // --- Selection / bulk actions (Phase 1) --------------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkTagAction, setBulkTagAction] = useState<"add_tags" | "remove_tags" | null>(null);
  const [bulkTagSelection, setBulkTagSelection] = useState<string[]>([]);

  // --- Row-level menus / preview / toasts / confirm dialog ---------------
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [previewGame, setPreviewGame] = useState<AdminGame | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const toastIdRef = useRef(0);

  function pushToast(kind: ToastKind, text: string) {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }

  function askConfirm(state: ConfirmState) {
    setConfirmState(state);
  }

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GameInput>(emptyForm);
  const [slugTouched, setSlugTouched] = useState(false);

  const [thumbMode, setThumbMode] = useState<"url" | "upload">("url");
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [coverMode, setCoverMode] = useState<"url" | "upload">("url");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  // Three purpose-specific covers (migration 0068)
  const [landscapeCoverMode, setLandscapeCoverMode] = useState<"url" | "upload">("url");
  const [landscapeCoverFile, setLandscapeCoverFile] = useState<File | null>(null);
  const [squareCoverMode, setSquareCoverMode] = useState<"url" | "upload">("url");
  const [squareCoverFile, setSquareCoverFile] = useState<File | null>(null);
  const [portraitCoverMode, setPortraitCoverMode] = useState<"url" | "upload">("url");
  const [portraitCoverFile, setPortraitCoverFile] = useState<File | null>(null);
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
      const [result, c, t] = await Promise.all([
        fetchGamesAdminList({
          page,
          pageSize: PAGE_SIZE,
          q: q || undefined,
          status,
          category: categoryFilter || undefined,
          tag: tagFilter || undefined,
          featured: featuredFilter === "" ? undefined : featuredFilter === "true",
          trending: trendingFilter === "" ? undefined : trendingFilter === "true",
          sort,
        }),
        fetchAllCategoriesAdmin(),
        fetchAllTagsAdmin(),
      ]);
      setGames(result.games);
      setTotal(result.total);
      setCategories(c);
      setTags(t);
      // Selection never survives a reload — the set of ids on screen (or
      // matching the filter) may have just changed underneath it.
      setSelectedIds(new Set());
      setSelectAllMatching(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load games.");
    }
  }, [page, q, status, categoryFilter, tagFilter, featuredFilter, trendingFilter, sort]);

  useEffect(() => {
    load();
  }, [load]);

  // Deep link from the Categories admin ("N games" → Games filtered by
  // that category). Read once on mount rather than via next/navigation's
  // useSearchParams, which would require wrapping this page in a
  // Suspense boundary just for a one-time initial value.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("category");
    if (cat) {
      setCategoryFilter(cat);
      setFiltersOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetListToDefaults() {
    setSearchInput("");
    setQ("");
    setStatus("all");
    setCategoryFilter("");
    setTagFilter("");
    setFeaturedFilter("");
    setTrendingFilter("");
    setSort("newest");
    setPage(1);
  }

  const filtersActive =
    Boolean(q) || status !== "all" || Boolean(categoryFilter) || Boolean(tagFilter) || Boolean(featuredFilter) || Boolean(trendingFilter);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageIds = games?.map((g) => g.id) ?? [];
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const selectionCount = selectAllMatching ? total : selectedIds.size;

  function toggleSelected(id: string) {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllOnPage() {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        for (const id of pageIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...pageIds]);
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }

  /** Resolves the actual list of game ids a bulk action should run
   * against — either the individually checked rows, or every game
   * currently matching the filters ("Select all N matching") when that
   * option was chosen. The latter needs one extra request (unpaginated
   * ids only) since the checkbox state only ever holds what's on screen. */
  async function resolveTargetIds(): Promise<string[]> {
    if (!selectAllMatching) return [...selectedIds];
    const result = await fetchGamesAdminList({
      page: 1,
      pageSize: Math.min(total, 500),
      q: q || undefined,
      status,
      category: categoryFilter || undefined,
      tag: tagFilter || undefined,
      featured: featuredFilter === "" ? undefined : featuredFilter === "true",
      trending: trendingFilter === "" ? undefined : trendingFilter === "true",
      sort,
    });
    return result.games.map((g) => g.id);
  }

  async function runBulk(input: Omit<GamesBulkActionInput, "ids">, confirmedIds?: string[]) {
    setBulkBusy(true);
    try {
      const ids = confirmedIds ?? (await resolveTargetIds());
      if (ids.length === 0) {
        pushToast("error", "Nothing to do — no games matched.");
        return;
      }
      const result = await runGamesBulkAction({ ...input, ids });
      const verb =
        input.action === "publish"
          ? "published"
          : input.action === "draft" || input.action === "unpublish"
            ? "unpublished"
            : input.action === "trash"
              ? "moved to Trash"
              : input.action === "restore"
                ? "restored"
                : input.action === "delete_permanent"
                  ? "permanently deleted"
                  : input.action === "assign_category"
                    ? "reassigned"
                    : input.action === "add_tags"
                      ? "tagged"
                      : input.action === "remove_tags"
                        ? "untagged"
                        : input.action === "set_featured"
                          ? "marked Featured"
                          : input.action === "remove_featured"
                            ? "unmarked as Featured"
                            : input.action === "set_trending"
                              ? "marked Trending"
                              : "unmarked as Trending";
      let text = `${result.affected} game${result.affected === 1 ? "" : "s"} ${verb}.`;
      if (result.skipped) text += ` ${result.skipped} skipped (${result.skippedReason}).`;
      pushToast(result.warning ? "error" : "success", result.warning ?? text);
      clearSelection();
      setBulkCategoryOpen(false);
      setBulkTagAction(null);
      setBulkTagSelection([]);
      await load();
    } catch (err) {
      pushToast("error", err instanceof Error ? err.message : "Bulk action failed. Nothing was changed.");
    } finally {
      setBulkBusy(false);
    }
  }

  function resetMediaPickers() {
    setThumbMode("url");
    setThumbFile(null);
    setCoverMode("url");
    setCoverFile(null);
    setLandscapeCoverMode("url");
    setLandscapeCoverFile(null);
    setSquareCoverMode("url");
    setSquareCoverFile(null);
    setPortraitCoverMode("url");
    setPortraitCoverFile(null);
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
      landscape_cover_url: game.landscape_cover_url,
      square_cover_url: game.square_cover_url,
      portrait_cover_url: game.portrait_cover_url,
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
    if (form.is_published && !form.thumbnail_url && !(thumbMode === "upload" && thumbFile)) {
      setFormError("Add a thumbnail before publishing — or uncheck Published to save as a draft.");
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
      let landscapeCoverUrl = form.landscape_cover_url;
      if (landscapeCoverMode === "upload" && landscapeCoverFile) {
        landscapeCoverUrl = await uploadGameMedia(form.slug, "landscape-cover", landscapeCoverFile, form.landscape_cover_url);
      }
      let squareCoverUrl = form.square_cover_url;
      if (squareCoverMode === "upload" && squareCoverFile) {
        squareCoverUrl = await uploadGameMedia(form.slug, "square-cover", squareCoverFile, form.square_cover_url);
      }
      let portraitCoverUrl = form.portrait_cover_url;
      if (portraitCoverMode === "upload" && portraitCoverFile) {
        portraitCoverUrl = await uploadGameMedia(form.slug, "portrait-cover", portraitCoverFile, form.portrait_cover_url);
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
        landscape_cover_url: landscapeCoverUrl,
        square_cover_url: squareCoverUrl,
        portrait_cover_url: portraitCoverUrl,
        preview_video_url: previewUrl,
        loading_screen_url: loadingScreenUrl,
        storage_path: form.play_type === "upload" ? storagePath : null,
        embed_url: form.play_type === "embed" ? form.embed_url : null,
      };

      if (editingId) {
        await updateGame(editingId, payload);
        pushToast("success", `"${payload.title}" saved.`);
      } else {
        await createGame(payload);
        pushToast("success", `"${payload.title}" created.`);
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

  function handleDelete(game: AdminGame) {
    // "Delete" from the main list is the reversible Move to Trash — a
    // game is never one click away from an unrecoverable, storage-wiping
    // permanent delete (Phase 7/13). Permanent delete only appears as a
    // row action once a game is already in the Trash.
    askConfirm({
      title: "Move to Trash?",
      description: `"${game.title}" will be hidden from the site and moved to Trash. You can restore it or delete it permanently from there.`,
      confirmLabel: "Move to Trash",
      onConfirm: async () => {
        setRowBusyId(game.id);
        try {
          await trashGame(game.id);
          pushToast("success", `"${game.title}" moved to Trash.`);
          await load();
        } catch (err) {
          pushToast("error", err instanceof Error ? err.message : "Failed to move to Trash. Nothing was changed.");
        } finally {
          setRowBusyId(null);
        }
      },
    });
  }

  function handleRestore(game: AdminGame) {
    setRowBusyId(game.id);
    restoreGame(game.id)
      .then(() => {
        pushToast("success", `"${game.title}" restored from Trash.`);
        return load();
      })
      .catch((err) => pushToast("error", err instanceof Error ? err.message : "Failed to restore. Nothing was changed."))
      .finally(() => setRowBusyId(null));
  }

  function handlePermanentDelete(game: AdminGame) {
    askConfirm({
      title: "Delete permanently?",
      description: `"${game.title}" and its media files will be permanently deleted. This can't be undone.`,
      confirmLabel: "Delete permanently",
      danger: true,
      onConfirm: async () => {
        setRowBusyId(game.id);
        try {
          const result = await deleteGame(game.id);
          pushToast(
            result.warning ? "error" : "success",
            result.warning ?? `"${game.title}" permanently deleted.`
          );
          await load();
        } catch (err) {
          pushToast("error", err instanceof Error ? err.message : "Failed to delete. Nothing was changed.");
        } finally {
          setRowBusyId(null);
        }
      },
    });
  }

  function handleDuplicate(game: AdminGame) {
    setRowBusyId(game.id);
    duplicateGame(game.id)
      .then((created) => {
        pushToast("success", `Duplicated as "${created.title}" — saved as a draft.`);
        return load();
      })
      .catch((err) => pushToast("error", err instanceof Error ? err.message : "Failed to duplicate. Nothing was changed."))
      .finally(() => setRowBusyId(null));
  }

  function handleQuickPublishToggle(game: AdminGame) {
    if (!game.is_published && !game.thumbnail_url) {
      pushToast("error", "Add a thumbnail before publishing — edit the game first.");
      return;
    }
    setRowBusyId(game.id);
    updateGame(game.id, { is_published: !game.is_published })
      .then(() => {
        pushToast("success", `"${game.title}" ${game.is_published ? "unpublished" : "published"}.`);
        return load();
      })
      .catch((err) => pushToast("error", err instanceof Error ? err.message : "Failed to update. Nothing was changed."))
      .finally(() => setRowBusyId(null));
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Games</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            {games ? `${total} game${total === 1 ? "" : "s"}` : "Loading…"}
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

      {/* Status tabs (Phase 1/7) — Trash is its own explicit tab, never
          mixed into "All". */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
              status === tab.value
                ? "bg-[var(--color-menu-bg)] text-white"
                : "glass text-white/70 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search / filters / sort (Phase 2) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title, slug, category, tag…"
            className="admin-input w-64 pl-8"
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`glass flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold ${
            filtersActive ? "text-white" : "text-white/70 hover:text-white"
          }`}
        >
          Filters
          <ChevronDown size={13} className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
        </button>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as GamesAdminSort)}
          className="admin-input w-44 text-xs"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {filtersActive && (
          <button
            type="button"
            onClick={resetListToDefaults}
            className="text-xs font-semibold text-white/60 underline underline-offset-2 hover:text-white"
          >
            Clear filters
          </button>
        )}
      </div>

      {filtersOpen && (
        <div className="glass mb-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-3">
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            className="admin-input w-40 text-xs"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={tagFilter}
            onChange={(e) => {
              setTagFilter(e.target.value);
              setPage(1);
            }}
            className="admin-input w-36 text-xs"
          >
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={featuredFilter}
            onChange={(e) => {
              setFeaturedFilter(e.target.value as typeof featuredFilter);
              setPage(1);
            }}
            className="admin-input w-36 text-xs"
          >
            <option value="">Featured: any</option>
            <option value="true">Featured only</option>
            <option value="false">Not featured</option>
          </select>
          <select
            value={trendingFilter}
            onChange={(e) => {
              setTrendingFilter(e.target.value as typeof trendingFilter);
              setPage(1);
            }}
            className="admin-input w-36 text-xs"
          >
            <option value="">Trending: any</option>
            <option value="true">Trending only</option>
            <option value="false">Not trending</option>
          </select>
        </div>
      )}

      {/* Bulk selection banner + action bar (Phase 1) */}
      {selectionCount > 0 && (
        <div className="glass mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-white/85">
            <span className="font-semibold">
              {selectionCount} game{selectionCount === 1 ? "" : "s"} selected
            </span>
            {!selectAllMatching && allOnPageSelected && total > pageIds.length && (
              <button
                type="button"
                onClick={() => setSelectAllMatching(true)}
                className="text-xs font-semibold text-gold underline underline-offset-2"
              >
                Select all {total} matching games
              </button>
            )}
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-semibold text-white/60 underline underline-offset-2 hover:text-white"
            >
              Clear selection
            </button>
          </div>
          <BulkActionsMenu
            inTrash={status === "trash"}
            busy={bulkBusy}
            onAction={(action) => {
              if (action === "assign_category") {
                setBulkCategoryOpen(true);
                setBulkTagAction(null);
                return;
              }
              if (action === "add_tags" || action === "remove_tags") {
                setBulkTagAction(action);
                setBulkCategoryOpen(false);
                setBulkTagSelection([]);
                return;
              }
              if (action === "trash") {
                askConfirm({
                  title: "Move to Trash?",
                  description: `${selectionCount} selected game${selectionCount === 1 ? "" : "s"} will be hidden from the site and moved to Trash.`,
                  confirmLabel: "Move to Trash",
                  onConfirm: () => runBulk({ action }),
                });
                return;
              }
              if (action === "restore") {
                askConfirm({
                  title: "Restore from Trash?",
                  description: `${selectionCount} selected game${selectionCount === 1 ? "" : "s"} will be restored.`,
                  confirmLabel: "Restore",
                  onConfirm: () => runBulk({ action }),
                });
                return;
              }
              if (action === "delete_permanent") {
                askConfirm({
                  title: "Delete permanently?",
                  description: `${selectionCount} selected game${selectionCount === 1 ? "" : "s"} and their media files will be permanently deleted. This can't be undone.`,
                  confirmLabel: "Delete permanently",
                  danger: true,
                  onConfirm: () => runBulk({ action }),
                });
                return;
              }
              void runBulk({ action });
            }}
          />
        </div>
      )}

      {bulkCategoryOpen && (
        <div className="glass mb-3 flex flex-wrap items-center gap-2 rounded-xl px-4 py-3">
          <span className="text-xs font-semibold text-white/70">Assign category:</span>
          <select id="bulk-category-select" className="admin-input w-48 text-xs" defaultValue="">
            <option value="" disabled>
              Choose a category…
            </option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={bulkBusy}
            onClick={() => {
              const select = document.getElementById("bulk-category-select") as HTMLSelectElement | null;
              if (!select?.value) return;
              void runBulk({ action: "assign_category", categorySlug: select.value });
            }}
            className="glow-yellow-button rounded-full bg-[var(--color-menu-bg)] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => setBulkCategoryOpen(false)}
            className="text-xs font-semibold text-white/60 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {bulkTagAction && (
        <div className="glass mb-3 flex flex-wrap items-center gap-2 rounded-xl px-4 py-3">
          <span className="text-xs font-semibold text-white/70">
            {bulkTagAction === "add_tags" ? "Add tags:" : "Remove tags:"}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setBulkTagSelection((prev) =>
                    prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                  )
                }
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  bulkTagSelection.includes(t.id) ? "bg-[var(--color-menu-bg)] text-white" : "bg-white/10 text-white/70"
                }`}
              >
                {t.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={bulkBusy || bulkTagSelection.length === 0}
            onClick={() => void runBulk({ action: bulkTagAction, tagIds: bulkTagSelection })}
            className="glow-yellow-button rounded-full bg-[var(--color-menu-bg)] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              setBulkTagAction(null);
              setBulkTagSelection([]);
            }}
            className="text-xs font-semibold text-white/60 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      <div className="glass overflow-x-auto rounded-xl">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAllOnPage}
                  disabled={pageIds.length === 0}
                  aria-label="Select all games on this page"
                  className="h-4 w-4 rounded"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Title</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">Tags</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Featured / Trending</th>
              <th className="hidden px-4 py-3 font-semibold sm:table-cell">Plays</th>
              <th className="hidden px-4 py-3 font-semibold xl:table-cell">Created</th>
              <th className="hidden px-4 py-3 font-semibold xl:table-cell">Updated</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {games === null && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {games?.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-text-faint">
                  {status === "trash"
                    ? "Trash is empty."
                    : filtersActive
                      ? "No games match your search/filters."
                      : 'No games yet — click "Add Game" to create the first one.'}
                </td>
              </tr>
            )}
            {games?.map((g) => {
              const gameTags = tags.filter((t) => g.tagIds.includes(t.id));
              const isTrashed = Boolean(g.deleted_at);
              return (
                <tr
                  key={g.id}
                  className={`border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03] ${
                    rowBusyId === g.id ? "opacity-50" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectAllMatching || selectedIds.has(g.id)}
                      onChange={() => toggleSelected(g.id)}
                      aria-label={`Select ${g.title}`}
                      className="h-4 w-4 rounded"
                    />
                  </td>
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
                        <div className="truncate text-xs text-text-faint">
                          /{g.slug}
                          {g.duplicated_from && " · duplicate"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/80">{g.category_slug}</td>
                  <td className="hidden px-4 py-3 lg:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {gameTags.slice(0, 2).map((t) => (
                        <span key={t.id} className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70">
                          {t.name}
                        </span>
                      ))}
                      {gameTags.length > 2 && (
                        <span className="text-[11px] text-text-faint">+{gameTags.length - 2}</span>
                      )}
                      {gameTags.length === 0 && <span className="text-[11px] text-text-faint">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {isTrashed ? (
                        <span className="rounded-full bg-hot/15 px-2.5 py-1 text-xs font-semibold text-hot">Trash</span>
                      ) : (
                        <>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                              g.is_published ? "bg-emerald-500/15 text-emerald-400" : "bg-white/10 text-text-faint"
                            }`}
                          >
                            {g.is_published ? "Published" : "Draft"}
                          </span>
                          {!g.is_published && g.scheduled_publish_at && (
                            <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-xs font-semibold text-blue-300">
                              Scheduled {new Date(g.scheduled_publish_at).toLocaleDateString()}
                            </span>
                          )}
                          {g.visibility !== "public" && (
                            <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                              {g.visibility === "private" ? "Private" : "Unlisted"}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <div className="flex items-center gap-2 text-xs">
                      {g.is_featured && (
                        <span className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-gold">
                          <Star size={11} className="fill-gold" /> Featured
                        </span>
                      )}
                      {g.is_trending && (
                        <span className="flex items-center gap-1 rounded-full bg-hot/15 px-2 py-0.5 text-hot">
                          <Flame size={11} className="fill-hot" /> Trending
                        </span>
                      )}
                      {!g.is_featured && !g.is_trending && <span className="text-text-faint">—</span>}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-white/70 sm:table-cell">{g.plays.toLocaleString()}</td>
                  <td className="hidden px-4 py-3 text-xs text-white/60 xl:table-cell">
                    {new Date(g.created_at).toLocaleDateString()}
                  </td>
                  <td className="hidden px-4 py-3 text-xs text-white/60 xl:table-cell">
                    {new Date(g.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <RowActionsMenu
                        game={g}
                        isTrashed={isTrashed}
                        busy={rowBusyId === g.id}
                        onEdit={() => openEdit(g)}
                        onPreview={() => setPreviewGame(g)}
                        onDuplicate={() => handleDuplicate(g)}
                        onPublishToggle={() => handleQuickPublishToggle(g)}
                        onTrash={() => handleDelete(g)}
                        onRestore={() => handleRestore(g)}
                        onPermanentDelete={() => handlePermanentDelete(g)}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-text-faint">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="glass rounded-full px-4 py-2 font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page} of {totalPages} · {total} game{total === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="glass rounded-full px-4 py-2 font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}


      {formOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setFormOpen(false)}>
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="glass-opaque flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-[var(--color-surface-border)] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-bold text-white">
                  {editingId ? "Edit Game" : "Add Game"}
                </h2>
                {editingId && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      form.is_published
                        ? "bg-emerald-500/15 text-emerald-400"
                        : form.scheduled_publish_at
                          ? "bg-blue-500/15 text-blue-300"
                          : "bg-white/10 text-text-faint"
                    }`}
                  >
                    {form.is_published ? "Published" : form.scheduled_publish_at ? "Scheduled" : "Draft"}
                  </span>
                )}
              </div>
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

              {/* ── Game Covers ──────────────────────────────────────── */}
              <SectionHeading>Game Covers</SectionHeading>

              <p className="mb-4 text-[12px] text-text-faint">
                Upload separate covers for different card layouts. This prevents important artwork
                (characters, logos, cars, weapons) from being cropped incorrectly on different
                homepage sections. All three are optional — existing games without them fall back
                to the thumbnail automatically.
              </p>

              <Field label="Landscape Cover — 1280 × 720 · 16:9">
                <MediaPicker
                  mode={landscapeCoverMode}
                  onModeChange={setLandscapeCoverMode}
                  urlValue={form.landscape_cover_url}
                  onUrlChange={(v) => setForm((f) => ({ ...f, landscape_cover_url: v }))}
                  onFileChange={setLandscapeCoverFile}
                  accept="image/*"
                  kind="image"
                />
                <p className="mt-1.5 text-[11px] text-text-faint">
                  Used for: large homepage cards · Your Games · Trending · Featured · Popular · Today&apos;s Best
                </p>
              </Field>

              <Field label="Square Cover — 800 × 800 · 1:1">
                <MediaPicker
                  mode={squareCoverMode}
                  onModeChange={setSquareCoverMode}
                  urlValue={form.square_cover_url}
                  onUrlChange={(v) => setForm((f) => ({ ...f, square_cover_url: v }))}
                  onFileChange={setSquareCoverFile}
                  accept="image/*"
                  kind="image"
                />
                <p className="mt-1.5 text-[11px] text-text-faint">
                  Used for: Continue Playing · Favorites · Saved Games · compact square card grids
                </p>
              </Field>

              <Field label="Portrait Cover — 800 × 1200 · 2:3">
                <MediaPicker
                  mode={portraitCoverMode}
                  onModeChange={setPortraitCoverMode}
                  urlValue={form.portrait_cover_url}
                  onUrlChange={(v) => setForm((f) => ({ ...f, portrait_cover_url: v }))}
                  onFileChange={setPortraitCoverFile}
                  accept="image/*"
                  kind="image"
                />
                <p className="mt-1.5 text-[11px] text-text-faint">
                  Used for: portrait grids · MofiGames Originals-style tiles · mobile portrait layouts
                </p>
              </Field>

              {/* ── Legacy media ────────────────────────────────────── */}
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

              <Field label="Cover image (legacy fallback)">
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
                {form.is_published ? (editingId ? "Update" : "Publish") : "Save Draft"}
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

      {previewGame && <GamePreviewModal game={previewGame} tags={tags} onClose={() => setPreviewGame(null)} />}

      {confirmState && (
        <ConfirmDialog
          state={confirmState}
          busy={bulkBusy || rowBusyId !== null}
          onCancel={() => setConfirmState(null)}
          onConfirm={async () => {
            const action = confirmState.onConfirm;
            setConfirmState(null);
            await action();
          }}
        />
      )}

      <ToastStack toasts={toasts} />
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

// --- Floating dropdown menus (bulk actions + row actions) -----------------
// Rendered via a portal into document.body so the menu is never clipped by
// the table wrapper's `overflow-x-auto`/`.glass` (backdrop-filter creates a
// containing block that would otherwise trap position:fixed descendants),
// and positioned from the trigger button's live bounding rect so it tracks
// scrolling/resizing correctly. Closes on outside click, Escape, or scroll.

function Dropdown({
  trigger,
  align = "right",
  children,
}: {
  trigger: (props: { onClick: () => void; buttonRef: React.RefObject<HTMLButtonElement | null> }) => React.ReactNode;
  align?: "left" | "right";
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (align === "right") {
        setCoords({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
      } else {
        setCoords({ top: rect.bottom + 6, left: rect.left });
      }
    }
    updatePosition();

    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, align]);

  return (
    <>
      {trigger({ onClick: () => setOpen((v) => !v), buttonRef: triggerRef })}
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              style={{ position: "fixed", top: coords.top, left: coords.left, right: coords.right }}
              className="glass-opaque z-[70] min-w-[200px] overflow-hidden rounded-xl border border-[var(--color-surface-border)] py-1 shadow-2xl"
            >
              {children(() => setOpen(false))}
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function MenuItem({
  onClick,
  danger,
  disabled,
  icon,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? "text-hot hover:bg-hot/10" : "text-white/85 hover:bg-white/10"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

/** Bulk-action dropdown (Phase 1). Only shows actions that make sense for
 * the current status tab — Restore/Delete permanently in the Trash view,
 * everything else outside it. "Unpublish" and "Move to Draft" are
 * presented as a single item here — the schema has both action names for
 * API-side clarity, but there's no separate "draft" state distinct from
 * "not published" in this data model (only is_published + an optional
 * schedule), so two buttons that do the same thing would just be
 * confusing. */
function BulkActionsMenu({
  inTrash,
  busy,
  onAction,
}: {
  inTrash: boolean;
  busy: boolean;
  onAction: (action: GamesBulkActionInput["action"]) => void;
}) {
  return (
    <Dropdown
      align="right"
      trigger={({ onClick, buttonRef }) => (
        <button
          ref={buttonRef}
          type="button"
          onClick={onClick}
          disabled={busy}
          className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy && <Loader2 size={13} className="animate-spin" />}
          Bulk actions
          <ChevronDown size={13} />
        </button>
      )}
    >
      {(close) =>
        inTrash ? (
          <>
            <MenuItem
              icon={<RotateCcw size={14} />}
              onClick={() => {
                onAction("restore");
                close();
              }}
            >
              Restore
            </MenuItem>
            <MenuItem
              danger
              icon={<Trash2 size={14} />}
              onClick={() => {
                onAction("delete_permanent");
                close();
              }}
            >
              Delete permanently
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem
              icon={<CheckCircle2 size={14} />}
              onClick={() => {
                onAction("publish");
                close();
              }}
            >
              Publish
            </MenuItem>
            <MenuItem
              icon={<X size={14} />}
              onClick={() => {
                onAction("unpublish");
                close();
              }}
            >
              Unpublish / Move to Draft
            </MenuItem>
            <MenuItem
              danger
              icon={<Trash2 size={14} />}
              onClick={() => {
                onAction("trash");
                close();
              }}
            >
              Move to Trash
            </MenuItem>
            <div className="my-1 border-t border-[var(--color-surface-border)]" />
            <MenuItem
              icon={<TagIcon size={14} />}
              onClick={() => {
                onAction("assign_category");
                close();
              }}
            >
              Assign category…
            </MenuItem>
            <MenuItem
              icon={<TagIcon size={14} />}
              onClick={() => {
                onAction("add_tags");
                close();
              }}
            >
              Add tags…
            </MenuItem>
            <MenuItem
              icon={<TagIcon size={14} />}
              onClick={() => {
                onAction("remove_tags");
                close();
              }}
            >
              Remove tags…
            </MenuItem>
            <div className="my-1 border-t border-[var(--color-surface-border)]" />
            <MenuItem
              icon={<Star size={14} />}
              onClick={() => {
                onAction("set_featured");
                close();
              }}
            >
              Set Featured
            </MenuItem>
            <MenuItem
              icon={<Star size={14} />}
              onClick={() => {
                onAction("remove_featured");
                close();
              }}
            >
              Remove Featured
            </MenuItem>
            <MenuItem
              icon={<Flame size={14} />}
              onClick={() => {
                onAction("set_trending");
                close();
              }}
            >
              Set Trending
            </MenuItem>
            <MenuItem
              icon={<Flame size={14} />}
              onClick={() => {
                onAction("remove_trending");
                close();
              }}
            >
              Remove Trending
            </MenuItem>
          </>
        )
      }
    </Dropdown>
  );
}

/** Per-row action menu (Phase 1 row actions + Phase 7/11/12). Trashed rows
 * only ever offer Edit/Preview/Duplicate/Restore/Delete permanently — no
 * quick-publish and no "Move to Trash" (it's already there), same logic
 * WordPress and every other CMS uses for its Trash view. */
function RowActionsMenu({
  game,
  isTrashed,
  busy,
  onEdit,
  onPreview,
  onDuplicate,
  onPublishToggle,
  onTrash,
  onRestore,
  onPermanentDelete,
}: {
  game: AdminGame;
  isTrashed: boolean;
  busy: boolean;
  onEdit: () => void;
  onPreview: () => void;
  onDuplicate: () => void;
  onPublishToggle: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  return (
    <Dropdown
      align="right"
      trigger={({ onClick, buttonRef }) => (
        <button
          ref={buttonRef}
          type="button"
          onClick={onClick}
          disabled={busy}
          aria-label={`Actions for ${game.title}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <MoreVertical size={15} />}
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuItem
            icon={<Pencil size={14} />}
            onClick={() => {
              onEdit();
              close();
            }}
          >
            Edit
          </MenuItem>
          <MenuItem
            icon={<Eye size={14} />}
            onClick={() => {
              onPreview();
              close();
            }}
          >
            Preview
          </MenuItem>
          <MenuItem
            icon={<Copy size={14} />}
            onClick={() => {
              onDuplicate();
              close();
            }}
          >
            Duplicate
          </MenuItem>
          {!isTrashed && game.is_published && (
            <a
              href={`/${game.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={close}
              className="flex items-center gap-2 px-3.5 py-2 text-sm text-white/85 hover:bg-white/10"
            >
              <ExternalLink size={14} /> View live
            </a>
          )}
          <div className="my-1 border-t border-[var(--color-surface-border)]" />
          {!isTrashed && (
            <MenuItem
              icon={<CheckCircle2 size={14} />}
              onClick={() => {
                onPublishToggle();
                close();
              }}
            >
              {game.is_published ? "Unpublish" : "Publish"}
            </MenuItem>
          )}
          {!isTrashed ? (
            <MenuItem
              danger
              icon={<Trash2 size={14} />}
              onClick={() => {
                onTrash();
                close();
              }}
            >
              Move to Trash
            </MenuItem>
          ) : (
            <>
              <MenuItem
                icon={<RotateCcw size={14} />}
                onClick={() => {
                  onRestore();
                  close();
                }}
              >
                Restore
              </MenuItem>
              <MenuItem
                danger
                icon={<Trash2 size={14} />}
                onClick={() => {
                  onPermanentDelete();
                  close();
                }}
              >
                Delete permanently
              </MenuItem>
            </>
          )}
        </>
      )}
    </Dropdown>
  );
}

/** Confirmation modal for destructive/bulk actions (Phase 13) — always
 * states exactly what will happen and how many games are affected,
 * never a bare "Are you sure?". */
function ConfirmDialog({
  state,
  busy,
  onCancel,
  onConfirm,
}: {
  state: ConfirmState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-opaque w-full max-w-sm rounded-2xl border border-[var(--color-surface-border)] p-5"
      >
        <h3 className="font-display text-base font-bold text-white">{state.title}</h3>
        <p className="mt-2 text-sm text-white/75">{state.description}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full py-2.5 text-sm font-bold text-white disabled:opacity-60 ${
              state.danger ? "bg-hot" : "glow-yellow-button bg-[var(--color-menu-bg)]"
            }`}
          >
            {busy && <Loader2 size={15} className="animate-spin" />}
            {state.confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Success/error toast stack (Phase 14) — every mutating action in this
 * file reports back through pushToast() rather than failing silently or
 * only showing errors. */
function ToastStack({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[90] flex max-w-sm flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`glass-opaque flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl ${
            t.kind === "success" ? "border-emerald-500/30 text-emerald-300" : "border-hot/30 text-hot"
          }`}
        >
          {t.kind === "success" ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          )}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Quick in-admin preview (Phase 11) — thumbnail, title, description,
 * category, tags, and an SEO/social preview, without leaving the admin.
 * "Open full page" links straight to the live route; that route itself
 * already safely shows drafts to a signed-in admin via RLS
 * (getRealGameBySlug in games-server.ts bypasses the public/metadata
 * cache for an authenticated admin) — nothing here duplicates that, this
 * modal is just a faster look without a page navigation. There's no
 * separate "screenshots" field in this schema (only the cover/thumbnail/
 * trailer media already shown in the editor), so none is shown here. */
function GamePreviewModal({
  game,
  tags,
  onClose,
}: {
  game: AdminGame;
  tags: AdminTag[];
  onClose: () => void;
}) {
  const gameTags = tags.filter((t) => game.tagIds.includes(t.id));
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-opaque flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border border-[var(--color-surface-border)] p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white">Preview</h2>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {game.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={game.thumbnail_url} alt="" className="mb-4 aspect-video w-full rounded-xl object-cover" />
        ) : (
          <div className="mb-4 flex aspect-video w-full items-center justify-center rounded-xl bg-white/10 text-xs text-text-faint">
            No thumbnail yet
          </div>
        )}

        <h3 className="font-display text-xl font-bold text-white">{game.title}</h3>
        <p className="mt-1 text-xs text-text-faint">
          /{game.slug} · {game.category_slug}
        </p>

        {gameTags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {gameTags.map((t) => (
              <span key={t.id} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70">
                {t.name}
              </span>
            ))}
          </div>
        )}

        {game.description && <p className="mt-3 text-sm text-white/80">{game.description}</p>}

        <div className="mt-4 rounded-xl bg-white/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-faint">Search result preview</p>
          <p className="mt-1 truncate text-sm text-blue-300">mofigames.com/{game.slug}</p>
          <p className="truncate text-sm font-medium text-white/90">{game.meta_title || game.title}</p>
          <p className="line-clamp-2 text-xs text-white/60">{game.meta_description || game.description}</p>
        </div>

        <div className="mt-5 flex gap-2">
          <a
            href={`/${game.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white"
          >
            <ExternalLink size={15} />
            Open full page
          </a>
          <button
            type="button"
            onClick={onClose}
            className="glass rounded-full px-5 py-2.5 text-sm font-semibold text-white/80 hover:text-white"
          >
            Close
          </button>
        </div>

        {!game.is_published && (
          <p className="mt-3 text-center text-xs text-amber-300">
            This game isn&apos;t published — &quot;Open full page&quot; only shows it while you&apos;re signed in as
            an admin.
          </p>
        )}
      </div>
    </div>
  );
}
