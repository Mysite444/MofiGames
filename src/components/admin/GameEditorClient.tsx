"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  Save,
  Globe,
  EyeOff,
  Clock,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Settings,
  Image as ImageIcon,
  Search,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import type { AdminGame, AdminCategory, AdminTag } from "@/lib/supabase/admin-content";

// ─── Types ──────────────────────────────────────────────────────────────────

type SidebarTab = "publish" | "details" | "media" | "seo";

type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "unsaved";

interface EditorForm {
  // Core
  title: string;
  slug: string;
  description: string;
  instructions: string;
  content: string;          // live published content
  content_draft: string;    // what the editor is working on
  controls: string;
  // Classification
  category_slug: string;
  tagIds: string[];
  // Game info
  developer: string;
  publisher: string;
  release_date: string;
  version: string;
  multiplayer: boolean;
  mobile_support: boolean;
  orientation: "landscape" | "portrait";
  // Publish
  is_published: boolean;
  visibility: "public" | "private" | "unlisted";
  scheduled_publish_at: string;
  is_featured: boolean;
  is_trending: boolean;
  is_recommended: boolean;
  // Media
  thumbnail_url: string;
  landscape_cover_url: string;
  square_cover_url: string;
  portrait_cover_url: string;
  preview_video_url: string;
  video_trailer_url: string;
  // SEO
  meta_title: string;
  meta_description: string;
  seo_h1_title: string;
  seo_focus_keyword: string;
  seo_excerpt: string;
  seo_canonical_url: string;
  og_title: string;
  og_description: string;
  og_image_url: string;
  seo_index: boolean;
  seo_follow: boolean;
}

function gameToForm(game: AdminGame): EditorForm {
  return {
    title: game.title,
    slug: game.slug,
    description: game.description ?? "",
    instructions: game.instructions ?? "",
    content: game.content ?? "",
    content_draft: game.content_draft ?? game.content ?? "",
    controls: game.controls ?? "",
    category_slug: game.category_slug,
    tagIds: game.tagIds ?? [],
    developer: game.developer ?? "",
    publisher: game.publisher ?? "",
    release_date: game.release_date ?? "",
    version: game.version ?? "",
    multiplayer: game.multiplayer ?? false,
    mobile_support: game.mobile_support ?? true,
    orientation: game.orientation ?? "landscape",
    is_published: game.is_published ?? false,
    visibility: game.visibility ?? "public",
    scheduled_publish_at: game.scheduled_publish_at ?? "",
    is_featured: game.is_featured ?? false,
    is_trending: game.is_trending ?? false,
    is_recommended: game.is_recommended ?? false,
    thumbnail_url: game.thumbnail_url ?? "",
    landscape_cover_url: game.landscape_cover_url ?? "",
    square_cover_url: game.square_cover_url ?? "",
    portrait_cover_url: game.portrait_cover_url ?? "",
    preview_video_url: game.preview_video_url ?? "",
    video_trailer_url: game.video_trailer_url ?? "",
    meta_title: game.meta_title ?? "",
    meta_description: game.meta_description ?? "",
    seo_h1_title: game.seo_h1_title ?? "",
    seo_focus_keyword: game.seo_focus_keyword ?? "",
    seo_excerpt: game.seo_excerpt ?? "",
    seo_canonical_url: game.seo_canonical_url ?? "",
    og_title: game.og_title ?? "",
    og_description: game.og_description ?? "",
    og_image_url: game.og_image_url ?? "",
    seo_index: game.seo_index ?? true,
    seo_follow: game.seo_follow ?? true,
  };
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function GameEditorClient({
  initialGame,
  categories,
  tags,
}: {
  initialGame: AdminGame;
  categories: AdminCategory[];
  tags: AdminTag[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<EditorForm>(() => gameToForm(initialGame));
  const [game, setGame] = useState<AdminGame>(initialGame);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("idle");
  const [autosaveTime, setAutosaveTime] = useState<Date | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("publish");
  const [slugTouched, setSlugTouched] = useState(true);
  const [tagSearch, setTagSearch] = useState("");

  // Collapsible sidebar sections
  const [sections, setSections] = useState({
    status: true,
    classification: true,
    attributes: false,
    media: true,
    covers: false,
    seoBasic: true,
    seoAdvanced: false,
    social: false,
  });

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContent = useRef<string>(form.content_draft);
  const isDirtyRef = useRef(false);

  // ── Autosave ──────────────────────────────────────────────────────────────
  const autosave = useCallback(
    async (draft: string) => {
      if (draft === lastSavedContent.current) return;
      setAutosaveStatus("saving");
      try {
        const res = await fetch(`/api/admin/games/${game.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content_draft: draft }),
        });
        if (!res.ok) throw new Error("Autosave failed");
        lastSavedContent.current = draft;
        setAutosaveStatus("saved");
        setAutosaveTime(new Date());
        isDirtyRef.current = false;
      } catch {
        setAutosaveStatus("error");
      }
    },
    [game.id]
  );

  // Trigger autosave 2.5s after editor content changes
  function handleContentChange(html: string) {
    setForm((f) => ({ ...f, content_draft: html }));
    setAutosaveStatus("unsaved");
    isDirtyRef.current = true;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void autosave(html);
    }, 2500);
  }

  // Flush pending autosave on unmount
  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  function setField<K extends keyof EditorForm>(key: K, val: EditorForm[K]) {
    setForm((f) => ({ ...f, [key]: val }));
    setAutosaveStatus("unsaved");
    isDirtyRef.current = true;
  }

  function handleTitleChange(title: string) {
    setForm((f) => ({
      ...f,
      title,
      slug: slugTouched ? f.slug : slugify(title),
    }));
    setAutosaveStatus("unsaved");
  }

  function toggleTag(id: string) {
    setForm((f) => ({
      ...f,
      tagIds: f.tagIds.includes(id)
        ? f.tagIds.filter((t) => t !== id)
        : [...f.tagIds, id],
    }));
    setAutosaveStatus("unsaved");
  }

  function toggleSection(key: keyof typeof sections) {
    setSections((s) => ({ ...s, [key]: !s[key] }));
  }

  // ── Save / Publish helpers ─────────────────────────────────────────────────

  async function patchGame(payload: Record<string, unknown>): Promise<AdminGame> {
    const res = await fetch(`/api/admin/games/${game.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Save failed");
    return json.game as AdminGame;
  }

  /** Build the full game payload from the current form. */
  function buildPayload(overrides: Partial<EditorForm> = {}): Record<string, unknown> {
    const f = { ...form, ...overrides };
    return {
      title: f.title.trim(),
      slug: f.slug.trim(),
      description: f.description,
      instructions: f.instructions,
      content: f.content,
      content_draft: f.content_draft,
      controls: f.controls,
      category_slug: f.category_slug,
      tagIds: f.tagIds,
      developer: f.developer,
      publisher: f.publisher,
      release_date: f.release_date || null,
      version: f.version,
      multiplayer: f.multiplayer,
      mobile_support: f.mobile_support,
      orientation: f.orientation,
      is_published: f.is_published,
      visibility: f.visibility,
      scheduled_publish_at: f.scheduled_publish_at || null,
      is_featured: f.is_featured,
      is_trending: f.is_trending,
      is_recommended: f.is_recommended,
      thumbnail_url: f.thumbnail_url || null,
      landscape_cover_url: f.landscape_cover_url || null,
      square_cover_url: f.square_cover_url || null,
      portrait_cover_url: f.portrait_cover_url || null,
      preview_video_url: f.preview_video_url || null,
      video_trailer_url: f.video_trailer_url || null,
      meta_title: f.meta_title,
      meta_description: f.meta_description,
      seo_h1_title: f.seo_h1_title,
      seo_focus_keyword: f.seo_focus_keyword,
      seo_excerpt: f.seo_excerpt,
      seo_canonical_url: f.seo_canonical_url || null,
      og_title: f.og_title,
      og_description: f.og_description,
      og_image_url: f.og_image_url || null,
      seo_index: f.seo_index,
      seo_follow: f.seo_follow,
    };
  }

  function validate(): string | null {
    if (!form.title.trim()) return "Title is required.";
    if (!form.slug.trim()) return "Slug is required.";
    if (!form.category_slug) return "Category is required.";
    return null;
  }

  async function handleSaveDraft(e?: FormEvent) {
    e?.preventDefault();
    const err = validate();
    if (err) { setSaveError(err); return; }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      const updated = await patchGame({ ...buildPayload(), is_published: false });
      setGame(updated);
      setForm(gameToForm(updated));
      lastSavedContent.current = updated.content_draft ?? updated.content ?? "";
      setAutosaveStatus("saved");
      setAutosaveTime(new Date());
      setSaveSuccess("Draft saved.");
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    const err = validate();
    if (err) { setSaveError(err); return; }
    if (!form.thumbnail_url) {
      setSaveError("Add a thumbnail before publishing.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
      // Copy content_draft → content on publish
      const publishPayload = {
        ...buildPayload(),
        is_published: true,
        content: form.content_draft || form.content,
      };
      const updated = await patchGame(publishPayload);
      setGame(updated);
      setForm(gameToForm(updated));
      lastSavedContent.current = updated.content_draft ?? updated.content ?? "";
      setAutosaveStatus("saved");
      setAutosaveTime(new Date());
      setSaveSuccess(
        form.is_published ? "Game updated and live." : "Game published and live."
      );
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpublish() {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await patchGame({ is_published: false });
      setGame(updated);
      setForm((f) => ({ ...f, is_published: false }));
      setSaveSuccess("Game unpublished.");
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unpublish failed.");
    } finally {
      setSaving(false);
    }
  }

  // ── Autosave status label ──────────────────────────────────────────────────
  function autosaveLabel() {
    switch (autosaveStatus) {
      case "saving":   return "Saving…";
      case "saved":    return autosaveTime ? `Saved ${relativeTime(autosaveTime)}` : "Saved";
      case "unsaved":  return "Unsaved changes";
      case "error":    return "Autosave failed";
      default:         return game.updated_at
        ? `Last saved ${relativeTime(new Date(game.updated_at))}` : "";
    }
  }

  function relativeTime(d: Date): string {
    const secs = Math.round((Date.now() - d.getTime()) / 1000);
    if (secs < 5) return "just now";
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.round(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(tagSearch.toLowerCase())
  );

  const gameSlug = game.slug;
  const previewUrl = `/${gameSlug}?preview=1`;
  const publicUrl  = `/${gameSlug}`;

  // ── Status colors ──────────────────────────────────────────────────────────
  const statusBadge = form.is_published
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
    : form.scheduled_publish_at
    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
    : "bg-white/8 text-white/50 border-white/10";

  const statusLabel = form.is_published
    ? "Published"
    : form.scheduled_publish_at
    ? "Scheduled"
    : "Draft";

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black">

      {/* ── Sticky header bar ─────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/90 px-4 py-2.5 backdrop-blur-sm z-30">
        <button
          type="button"
          onClick={() => router.push("/admin/games")}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-white/60 hover:bg-white/8 hover:text-white"
        >
          <ArrowLeft size={14} />
          Games
        </button>

        <span className="text-white/20">/</span>

        <h1 className="max-w-xs truncate text-sm font-medium text-white">
          {form.title || "Untitled game"}
        </h1>

        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadge}`}
        >
          {statusLabel}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {/* Autosave status */}
          <span
            className={`text-xs ${
              autosaveStatus === "saving" ? "text-amber-400" :
              autosaveStatus === "saved"  ? "text-emerald-400/80" :
              autosaveStatus === "error"  ? "text-red-400" :
              autosaveStatus === "unsaved" ? "text-white/50" :
              "text-white/30"
            }`}
          >
            {autosaveStatus === "saving" && <Loader2 size={11} className="inline mr-1 animate-spin" />}
            {autosaveLabel()}
          </span>

          {/* Preview */}
          <a
            href={previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:border-white/20 hover:text-white"
          >
            <Eye size={13} />
            Preview
          </a>

          {/* Save Draft */}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/70 hover:border-white/20 hover:text-white disabled:opacity-40"
          >
            <Save size={13} />
            Save Draft
          </button>

          {/* Publish / Update */}
          <button
            type="button"
            onClick={handlePublish}
            disabled={saving}
            className="glow-yellow-button flex items-center gap-1.5 rounded-lg bg-white px-4 py-1.5 text-xs font-semibold text-black hover:bg-white/90 disabled:opacity-40"
          >
            {saving ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Globe size={13} />
            )}
            {form.is_published ? "Update" : "Publish"}
          </button>
        </div>
      </header>

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {(saveSuccess || saveError) && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
          {saveSuccess && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-300 shadow-lg backdrop-blur">
              <Check size={15} /> {saveSuccess}
            </div>
          )}
          {saveError && (
            <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 shadow-lg backdrop-blur">
              <AlertCircle size={15} /> {saveError}
              <button className="ml-2 text-white/50 hover:text-white" onClick={() => setSaveError(null)}>✕</button>
            </div>
          )}
        </div>
      )}

      {/* ── Two-column body ───────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Main content area ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto px-6 py-6 xl:px-10">
          <div className="mx-auto max-w-3xl space-y-4">

            {/* Game title */}
            <div>
              <input
                type="text"
                placeholder="Game title…"
                value={form.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="w-full border-0 bg-transparent py-2 text-3xl font-bold text-white placeholder:text-white/20 focus:outline-none"
              />
              {/* Slug row */}
              <div className="flex items-center gap-2 text-xs text-white/40">
                <span>Slug:</span>
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setField("slug", e.target.value);
                  }}
                  className="flex-1 border-0 bg-transparent text-white/50 focus:text-white focus:outline-none"
                  placeholder="url-slug"
                />
                {form.is_published && (
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-0.5 hover:text-white"
                  >
                    <ExternalLink size={11} /> View live
                  </a>
                )}
              </div>
              <div className="mt-2 h-px bg-white/8" />
            </div>

            {/* Rich content editor */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-white/30">
                Article Content
              </label>
              <RichTextEditor
                value={form.content_draft}
                onChange={handleContentChange}
                placeholder="Write the game article here — how to play, tips, controls, features, FAQ…"
                minHeight={500}
              />
              <p className="mt-1.5 text-[11px] text-white/25">
                Supports headings, bold, italic, lists, links, images, tables, and YouTube embeds.
                Content auto-saves as you type.
              </p>
            </div>

            {/* Short description */}
            <EditorSection title="Short Description">
              <textarea
                rows={3}
                placeholder="A brief description shown on game cards and in search results…"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                className="admin-input w-full resize-y"
              />
            </EditorSection>

            {/* Instructions */}
            <EditorSection title="Instructions">
              <textarea
                rows={3}
                placeholder="How to play — shown below the game embed…"
                value={form.instructions}
                onChange={(e) => setField("instructions", e.target.value)}
                className="admin-input w-full resize-y"
              />
            </EditorSection>

            {/* Controls */}
            <EditorSection title="Controls">
              <textarea
                rows={2}
                placeholder="Keyboard / mouse controls, e.g. WASD to move, Space to jump…"
                value={form.controls}
                onChange={(e) => setField("controls", e.target.value)}
                className="admin-input w-full resize-y"
              />
            </EditorSection>
          </div>
        </main>

        {/* ── Right sidebar ─────────────────────────────────────────────── */}
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-white/10 bg-black/40 lg:block">

          {/* Tab bar */}
          <div className="flex border-b border-white/10">
            {(["publish","details","media","seo"] as SidebarTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                  sidebarTab === tab
                    ? "border-b border-white text-white"
                    : "text-white/40 hover:text-white/70"
                }`}
              >
                {tab === "publish" ? "Publish" :
                 tab === "details" ? "Details" :
                 tab === "media"   ? "Media"   : "SEO"}
              </button>
            ))}
          </div>

          <div className="space-y-0 divide-y divide-white/8">

            {/* ── PUBLISH TAB ─────────────────────────────────────── */}
            {sidebarTab === "publish" && (
              <>
                {/* Status section */}
                <SidebarSection
                  title="Status & Visibility"
                  open={sections.status}
                  onToggle={() => toggleSection("status")}
                >
                  <div className="space-y-3">
                    {/* Status indicator */}
                    <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                      <span className="text-xs text-white/60">Status</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusBadge}`}>
                        {statusLabel}
                      </span>
                    </div>

                    {/* Visibility */}
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-white/50">Visibility</span>
                      <select
                        value={form.visibility}
                        onChange={(e) => setField("visibility", e.target.value as "public" | "private" | "unlisted")}
                        className="admin-input"
                      >
                        <option value="public">Public</option>
                        <option value="unlisted">Unlisted</option>
                        <option value="private">Private</option>
                      </select>
                    </label>

                    {/* Scheduled */}
                    <label className="flex flex-col gap-1">
                      <span className="flex items-center gap-1 text-[11px] text-white/50">
                        <Clock size={11} /> Schedule (optional)
                      </span>
                      <input
                        type="datetime-local"
                        value={form.scheduled_publish_at}
                        onChange={(e) => setField("scheduled_publish_at", e.target.value)}
                        className="admin-input"
                      />
                    </label>

                    {/* Flags */}
                    <div className="flex flex-col gap-1.5">
                      {([
                        ["is_featured", "Featured"],
                        ["is_trending", "Trending"],
                        ["is_recommended", "Recommended"],
                      ] as [keyof EditorForm, string][]).map(([key, label]) => (
                        <label key={key} className="flex cursor-pointer items-center justify-between py-0.5">
                          <span className="text-xs text-white/70">{label}</span>
                          <Toggle
                            checked={form[key] as boolean}
                            onChange={(v) => setField(key, v)}
                          />
                        </label>
                      ))}
                    </div>

                    {/* Publish actions */}
                    <div className="flex flex-col gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handlePublish}
                        disabled={saving}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-white py-2.5 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-40"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                        {form.is_published ? "Update" : "Publish"}
                      </button>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveDraft}
                          disabled={saving}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2 text-xs font-medium text-white/70 hover:border-white/20 hover:text-white disabled:opacity-40"
                        >
                          <Save size={12} /> Draft
                        </button>
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/10 py-2 text-xs font-medium text-white/70 hover:border-white/20 hover:text-white"
                        >
                          <Eye size={12} /> Preview
                        </a>
                      </div>

                      {form.is_published && (
                        <button
                          type="button"
                          onClick={handleUnpublish}
                          disabled={saving}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-500/20 py-2 text-xs font-medium text-red-400/70 hover:border-red-500/40 hover:text-red-400 disabled:opacity-40"
                        >
                          <EyeOff size={12} /> Unpublish
                        </button>
                      )}
                    </div>

                    {/* Dates */}
                    {(game.published_at || game.created_at) && (
                      <div className="space-y-1 border-t border-white/8 pt-2">
                        {game.published_at && (
                          <InfoRow label="Published" value={new Date(game.published_at).toLocaleDateString()} />
                        )}
                        <InfoRow label="Created" value={new Date(game.created_at).toLocaleDateString()} />
                        {game.updated_at && (
                          <InfoRow label="Updated" value={relativeTime(new Date(game.updated_at))} />
                        )}
                      </div>
                    )}
                  </div>
                </SidebarSection>
              </>
            )}

            {/* ── DETAILS TAB ─────────────────────────────────────── */}
            {sidebarTab === "details" && (
              <>
                {/* Classification */}
                <SidebarSection
                  title="Classification"
                  open={sections.classification}
                  onToggle={() => toggleSection("classification")}
                >
                  <div className="space-y-3">
                    {/* Category */}
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-white/50">Category *</span>
                      <select
                        value={form.category_slug}
                        onChange={(e) => setField("category_slug", e.target.value)}
                        className="admin-input"
                      >
                        <option value="">Select category…</option>
                        {categories.map((c) => (
                          <option key={c.slug} value={c.slug}>{c.name}</option>
                        ))}
                      </select>
                    </label>

                    {/* Tags */}
                    <div>
                      <span className="mb-1.5 block text-[11px] text-white/50">Tags</span>
                      <div className="relative mb-1.5">
                        <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30" />
                        <input
                          type="text"
                          placeholder="Search tags…"
                          value={tagSearch}
                          onChange={(e) => setTagSearch(e.target.value)}
                          className="admin-input w-full pl-7 text-xs"
                        />
                      </div>
                      <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                        {filteredTags.map((t) => {
                          const active = form.tagIds.includes(t.id);
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => toggleTag(t.id)}
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                                active
                                  ? "bg-white text-black"
                                  : "bg-white/8 text-white/60 hover:bg-white/15"
                              }`}
                            >
                              {t.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </SidebarSection>

                {/* Game attributes */}
                <SidebarSection
                  title="Game Attributes"
                  open={sections.attributes}
                  onToggle={() => toggleSection("attributes")}
                >
                  <div className="space-y-3">
                    <TextField label="Developer" value={form.developer} onChange={(v) => setField("developer", v)} placeholder="Developer name" />
                    <TextField label="Publisher" value={form.publisher} onChange={(v) => setField("publisher", v)} placeholder="Publisher name" />
                    <TextField label="Release Date" value={form.release_date} onChange={(v) => setField("release_date", v)} placeholder="YYYY-MM-DD" />
                    <TextField label="Version" value={form.version} onChange={(v) => setField("version", v)} placeholder="1.0" />

                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] text-white/50">Orientation</span>
                      <select
                        value={form.orientation}
                        onChange={(e) => setField("orientation", e.target.value as "landscape" | "portrait")}
                        className="admin-input"
                      >
                        <option value="landscape">Landscape</option>
                        <option value="portrait">Portrait</option>
                      </select>
                    </label>

                    <div className="flex flex-col gap-1.5">
                      {([
                        ["multiplayer", "Multiplayer"],
                        ["mobile_support", "Mobile Support"],
                      ] as [keyof EditorForm, string][]).map(([key, label]) => (
                        <label key={key} className="flex cursor-pointer items-center justify-between">
                          <span className="text-xs text-white/70">{label}</span>
                          <Toggle
                            checked={form[key] as boolean}
                            onChange={(v) => setField(key, v)}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </SidebarSection>
              </>
            )}

            {/* ── MEDIA TAB ───────────────────────────────────────── */}
            {sidebarTab === "media" && (
              <>
                {/* Thumbnail + covers */}
                <SidebarSection
                  title="Thumbnail & Covers"
                  open={sections.media}
                  onToggle={() => toggleSection("media")}
                >
                  <div className="space-y-3">
                    <MediaField
                      label="Thumbnail *"
                      sublabel="Square, 200×200 – 800×800 px"
                      value={form.thumbnail_url}
                      onChange={(v) => setField("thumbnail_url", v)}
                    />
                    <MediaField
                      label="Landscape Cover"
                      sublabel="16:9, e.g. 1280×720"
                      value={form.landscape_cover_url}
                      onChange={(v) => setField("landscape_cover_url", v)}
                    />
                    <MediaField
                      label="Square Cover"
                      sublabel="1:1, e.g. 800×800"
                      value={form.square_cover_url}
                      onChange={(v) => setField("square_cover_url", v)}
                    />
                    <MediaField
                      label="Portrait Cover"
                      sublabel="2:3, e.g. 720×1080"
                      value={form.portrait_cover_url}
                      onChange={(v) => setField("portrait_cover_url", v)}
                    />
                  </div>
                </SidebarSection>

                {/* Videos */}
                <SidebarSection
                  title="Videos"
                  open={sections.covers}
                  onToggle={() => toggleSection("covers")}
                >
                  <div className="space-y-3">
                    <MediaField
                      label="Preview Video"
                      sublabel="Autoplay on hover (MP4, WebM)"
                      value={form.preview_video_url}
                      onChange={(v) => setField("preview_video_url", v)}
                      isVideo
                    />
                    <MediaField
                      label="Trailer"
                      sublabel="YouTube / MP4 URL"
                      value={form.video_trailer_url}
                      onChange={(v) => setField("video_trailer_url", v)}
                      isVideo
                    />
                  </div>
                </SidebarSection>
              </>
            )}

            {/* ── SEO TAB ─────────────────────────────────────────── */}
            {sidebarTab === "seo" && (
              <>
                <SidebarSection
                  title="Search Engine"
                  open={sections.seoBasic}
                  onToggle={() => toggleSection("seoBasic")}
                >
                  <div className="space-y-3">
                    <TextField
                      label="SEO Title"
                      value={form.meta_title}
                      onChange={(v) => setField("meta_title", v)}
                      placeholder={form.title}
                      maxLength={120}
                    />
                    <TextareaField
                      label="Meta Description"
                      value={form.meta_description}
                      onChange={(v) => setField("meta_description", v)}
                      placeholder="Compelling 155-char description for search snippets…"
                      maxLength={165}
                      rows={3}
                    />
                    <TextField
                      label="Focus Keyword"
                      value={form.seo_focus_keyword}
                      onChange={(v) => setField("seo_focus_keyword", v)}
                      placeholder="main keyword"
                    />
                    <TextField
                      label="H1 Title Override"
                      value={form.seo_h1_title}
                      onChange={(v) => setField("seo_h1_title", v)}
                      placeholder={form.title}
                    />
                    <TextField
                      label="Canonical URL"
                      value={form.seo_canonical_url}
                      onChange={(v) => setField("seo_canonical_url", v)}
                      placeholder="https://mofigames.com/…"
                    />
                    <div className="flex gap-3">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/70">
                        <input
                          type="checkbox"
                          checked={form.seo_index}
                          onChange={(e) => setField("seo_index", e.target.checked)}
                          className="accent-white"
                        />
                        Index
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/70">
                        <input
                          type="checkbox"
                          checked={form.seo_follow}
                          onChange={(e) => setField("seo_follow", e.target.checked)}
                          className="accent-white"
                        />
                        Follow
                      </label>
                    </div>
                  </div>
                </SidebarSection>

                <SidebarSection
                  title="Social / Open Graph"
                  open={sections.social}
                  onToggle={() => toggleSection("social")}
                >
                  <div className="space-y-3">
                    <TextField
                      label="OG Title"
                      value={form.og_title}
                      onChange={(v) => setField("og_title", v)}
                      placeholder={form.meta_title || form.title}
                    />
                    <TextareaField
                      label="OG Description"
                      value={form.og_description}
                      onChange={(v) => setField("og_description", v)}
                      placeholder="Social share description…"
                      rows={2}
                    />
                    <MediaField
                      label="OG / Social Image"
                      sublabel="1200×630 px recommended"
                      value={form.og_image_url}
                      onChange={(v) => setField("og_image_url", v)}
                    />
                    <TextareaField
                      label="SEO Excerpt"
                      value={form.seo_excerpt}
                      onChange={(v) => setField("seo_excerpt", v)}
                      placeholder="Optional excerpt for structured data…"
                      rows={2}
                    />
                  </div>
                </SidebarSection>
              </>
            )}

          </div>
        </aside>
      </div>
    </div>
  );
}

// ─── Sidebar sub-components ──────────────────────────────────────────────────

function SidebarSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-widest text-white/40">
          {title}
        </span>
        {open ? (
          <ChevronDown size={13} className="text-white/30" />
        ) : (
          <ChevronRight size={13} className="text-white/30" />
        )}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/30">{title}</h3>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-white" : "bg-white/15"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full transition-transform ${
          checked ? "translate-x-4 bg-black" : "bg-white/60"
        }`}
      />
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/50">{label}</span>
        {maxLength && value.length > 0 && (
          <span className={`text-[10px] ${value.length > maxLength * 0.9 ? "text-amber-400" : "text-white/30"}`}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="admin-input"
      />
    </label>
  );
}

function TextareaField({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/50">{label}</span>
        {maxLength && value.length > 0 && (
          <span className={`text-[10px] ${value.length > maxLength * 0.9 ? "text-amber-400" : "text-white/30"}`}>
            {value.length}/{maxLength}
          </span>
        )}
      </div>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="admin-input resize-none"
      />
    </label>
  );
}

function MediaField({
  label,
  sublabel,
  value,
  onChange,
  isVideo = false,
}: {
  label: string;
  sublabel?: string;
  value: string;
  onChange: (v: string) => void;
  isVideo?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <span className="text-[11px] text-white/50">{label}</span>
        {sublabel && <span className="ml-1.5 text-[10px] text-white/25">{sublabel}</span>}
      </div>
      <input
        type="url"
        placeholder={isVideo ? "https://…/video.mp4" : "https://…/image.jpg"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="admin-input w-full"
      />
      {value && !isVideo && (
        <div className="relative h-20 w-full overflow-hidden rounded-lg bg-white/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      )}
      {value && isVideo && (
        <div className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/50">
          <Settings size={11} /> Video URL set
        </div>
      )}
      {!value && !isVideo && (
        <div className="flex h-16 w-full items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.02]">
          <ImageIcon size={20} className="text-white/15" />
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-white/40">{label}</span>
      <span className="text-white/60">{value}</span>
    </div>
  );
}
