"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Upload, Trash2, Loader2, Copy, Check, Pencil, X, Wand2 } from "lucide-react";
import {
  fetchMediaAssets,
  uploadMediaAsset,
  deleteMediaAsset,
  updateMediaAsset,
  type AdminMediaAsset,
  type MediaCategory,
} from "@/lib/supabase/admin-content";
import { validateMediaFileName } from "@/lib/file-validation";
import { detectUrlDimensions } from "@/lib/media-dimensions";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDimensions(width: number | null, height: number | null): string {
  if (!width || !height) return "Unknown";
  return `${width} × ${height}px`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

interface EditForm {
  file_name: string;
  alt_text: string;
  title: string;
  description: string;
}

function toEditForm(asset: AdminMediaAsset): EditForm {
  return {
    file_name: asset.file_name,
    alt_text: asset.alt_text ?? "",
    title: asset.title ?? "",
    description: asset.description ?? "",
  };
}

/** Shared list/upload/delete UI for every Media Management sub-page
 * (Images, Thumbnails, Icons, Videos, GIFs) — same `media_assets` table and
 * `media-library` bucket, just filtered/namespaced by `category`. */
export function MediaAdminClient({
  category,
  title,
  description,
  accept,
}: {
  category: MediaCategory;
  title: string;
  description: string;
  accept: string;
}) {
  const [assets, setAssets] = useState<AdminMediaAsset[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingAsset, setEditingAsset] = useState<AdminMediaAsset | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    file_name: "",
    alt_text: "",
    title: "",
    description: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setAssets(await fetchMediaAssets(category));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load media.");
    }
  }, [category]);

  useEffect(() => {
    setAssets(null);
    load();
  }, [load]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadMediaAsset(category, file);
      }
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(asset: AdminMediaAsset) {
    if (!confirm(`Delete "${asset.file_name}"? This can't be undone.`)) return;
    try {
      await deleteMediaAsset(asset);
      setAssets((prev) => prev?.filter((a) => a.id !== asset.id) ?? prev);
      if (editingAsset?.id === asset.id) closeEdit();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  async function handleCopy(asset: AdminMediaAsset) {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      setTimeout(() => setCopiedId((id) => (id === asset.id ? null : id)), 1500);
    } catch {
      // clipboard access denied — nothing to fall back to here
    }
  }

  function openEdit(asset: AdminMediaAsset) {
    setEditingAsset(asset);
    setEditForm(toEditForm(asset));
    setEditError(null);
  }

  function closeEdit() {
    setEditingAsset(null);
    setEditError(null);
  }

  async function handleEditSave(e: FormEvent) {
    e.preventDefault();
    if (!editingAsset) return;

    const nameCheck = validateMediaFileName(editForm.file_name);
    if (!nameCheck.valid) {
      setEditError(nameCheck.error ?? "Invalid filename.");
      return;
    }

    setSaving(true);
    setEditError(null);
    try {
      const updated = await updateMediaAsset(editingAsset.id, {
        file_name: editForm.file_name,
        alt_text: editForm.alt_text,
        title: editForm.title,
        description: editForm.description,
      });
      setAssets((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? prev);
      setEditingAsset(updated);
      closeEdit();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDetectDimensions() {
    if (!editingAsset) return;
    setDetecting(true);
    setEditError(null);
    try {
      const dimensions = await detectUrlDimensions(editingAsset.url, editingAsset.category);
      if (!dimensions) {
        setEditError("Couldn't determine dimensions for this file.");
        return;
      }
      const updated = await updateMediaAsset(editingAsset.id, dimensions);
      setAssets((prev) => prev?.map((a) => (a.id === updated.id ? updated : a)) ?? prev);
      setEditingAsset(updated);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to detect dimensions.");
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
          <p className="mt-0.5 text-sm text-text-faint">{description}</p>
        </div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {uploading ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {(loadError || uploadError) && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">
          {loadError || uploadError}
        </div>
      )}

      {assets === null && (
        <div className="glass flex items-center justify-center rounded-xl py-16 text-text-faint">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}

      {assets?.length === 0 && (
        <div className="glass flex flex-col items-center gap-3 rounded-xl py-16 text-center text-text-faint">
          <Upload size={24} />
          <p className="text-sm">
            No {title.toLowerCase()} yet — click &quot;Upload&quot; to add the first one.
          </p>
        </div>
      )}

      {assets && assets.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((asset) => (
            <div key={asset.id} className="glass overflow-hidden rounded-xl">
              <button
                type="button"
                onClick={() => openEdit(asset)}
                className="flex aspect-square w-full items-center justify-center bg-black/20"
                aria-label={`Edit ${asset.file_name}`}
              >
                {category === "video" ? (
                  <video
                    src={asset.url}
                    muted
                    loop
                    className="h-full w-full object-cover"
                    aria-label={asset.alt_text || asset.title || asset.file_name}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.url}
                    alt={asset.alt_text || asset.title || asset.file_name}
                    className="h-full w-full object-contain"
                  />
                )}
              </button>
              <div className="p-2.5">
                <p
                  className="truncate text-xs font-semibold text-white"
                  title={asset.title || asset.file_name}
                >
                  {asset.title || asset.file_name}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-text-faint" title={asset.file_name}>
                  {asset.file_name}
                </p>
                <p className="mt-0.5 text-[11px] text-text-faint">{formatBytes(asset.file_size)}</p>
                <div className="mt-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEdit(asset)}
                    aria-label={`Edit ${asset.file_name}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopy(asset)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/5 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/10 hover:text-white"
                  >
                    {copiedId === asset.id ? <Check size={13} /> : <Copy size={13} />}
                    {copiedId === asset.id ? "Copied" : "Copy URL"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(asset)}
                    aria-label={`Delete ${asset.file_name}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/70 hover:bg-hot/15 hover:text-hot"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingAsset && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={closeEdit}>
          <form
            onSubmit={handleEditSave}
            onClick={(e) => e.stopPropagation()}
            className="glass-opaque flex h-full w-full max-w-md flex-col border-l border-[var(--color-surface-border)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-surface-border)] px-5 pb-4 pt-5">
              <h2 className="font-display text-lg font-bold text-white">Edit Media</h2>
              <button
                type="button"
                onClick={closeEdit}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X size={18} className="text-white/70" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black/20">
              {editingAsset.category === "video" ? (
                <video src={editingAsset.url} muted loop controls className="h-full w-full object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={editingAsset.url}
                  alt={editingAsset.alt_text || editingAsset.title || editingAsset.file_name}
                  className="h-full w-full object-contain"
                />
              )}
            </div>

            {editError && (
              <p className="mb-4 rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{editError}</p>
            )}

            <div className="flex flex-col gap-4">
              <Field label="Filename">
                <input
                  value={editForm.file_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, file_name: e.target.value }))}
                  className="admin-input"
                  required
                  maxLength={255}
                />
              </Field>

              <Field label="Title">
                <input
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className="admin-input"
                  placeholder="Displayed in the media grid instead of the filename"
                />
              </Field>

              <Field label="Alt text">
                <textarea
                  value={editForm.alt_text}
                  onChange={(e) => setEditForm((f) => ({ ...f, alt_text: e.target.value }))}
                  rows={2}
                  className="admin-input resize-none"
                  placeholder={
                    editingAsset.category === "video"
                      ? "Accessible label wherever this video is referenced"
                      : "Describes the image for screen readers and SEO"
                  }
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="admin-input resize-none"
                  placeholder="Internal note — not shown on the public site"
                />
              </Field>

              <SectionHeading>File details</SectionHeading>

              <ReadOnlyField label="MIME type" value={editingAsset.mime_type || "Unknown"} />

              <ReadOnlyField label="Dimensions" value={formatDimensions(editingAsset.width, editingAsset.height)}>
                {!editingAsset.width && (
                  <button
                    type="button"
                    onClick={handleDetectDimensions}
                    disabled={detecting}
                    className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-60"
                  >
                    {detecting ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                    Detect
                  </button>
                )}
              </ReadOnlyField>

              <ReadOnlyField label="File size" value={formatBytes(editingAsset.file_size)} />

              <ReadOnlyField label="Upload date" value={formatDate(editingAsset.created_at)} />

              <Field label="URL">
                <div className="flex items-center gap-1.5">
                  <input value={editingAsset.url} readOnly className="admin-input truncate text-white/70" />
                  <button
                    type="button"
                    onClick={() => handleCopy(editingAsset)}
                    aria-label="Copy URL"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/70 hover:bg-white/10 hover:text-white"
                  >
                    {copiedId === editingAsset.id ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              </Field>
            </div>

            </div>

            <div className="flex shrink-0 gap-2 border-t border-[var(--color-surface-border)] bg-[var(--color-menu-bg)] p-4">
              <button
                type="submit"
                disabled={saving}
                className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                Save changes
              </button>
              <button
                type="button"
                onClick={closeEdit}
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

function ReadOnlyField({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      <div className="flex items-center rounded-xl bg-white/5 px-3 py-2 text-white/70">
        <span className="truncate">{value}</span>
        {children}
      </div>
    </div>
  );
}
