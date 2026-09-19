"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Save, Upload, X, ImagePlus, Check } from "lucide-react";
import {
  fetchSiteIdentity,
  updateSiteIdentity,
  uploadMediaAsset,
  fetchMediaAssets,
  type AdminSiteIdentity,
  type SiteIdentityInput,
  type AdminMediaAsset,
} from "@/lib/supabase/admin-content";

/** Admin → Site Settings → Site Identity. Site Name, Site Tagline, Logo,
 * and the full favicon / app-icon set as their own section, separate from
 * the deeper SEO Global Settings — this is what shows up in the header
 * logo, the browser tab, iOS home-screen bookmarks, and PWA installs, and
 * it's editable here without touching code. */
export function SiteIdentityAdminClient() {
  const [settings, setSettings] = useState<AdminSiteIdentity | null>(null);
  const [form, setForm] = useState<SiteIdentityInput>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchSiteIdentity();
      setSettings(data);
      setForm(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load site identity settings.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateSiteIdentity(form);
      setSettings(updated);
      setForm(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <div className="rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>;
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-20 text-text-faint">
        <Loader2 size={22} className="animate-spin" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Site Identity</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Site name, tagline, logo, and the full favicon / app-icon set — shown in the header, the
            browser tab, home-screen bookmarks, and PWA installs across the whole site.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saved ? "Saved!" : "Save changes"}
        </button>
      </div>

      {formError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{formError}</div>
      )}

      <div className="glass flex flex-col gap-5 rounded-2xl p-6">
        <Field label="Site Name">
          <input
            value={form.site_name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, site_name: e.target.value }))}
            className="admin-input"
            maxLength={80}
            required
          />
        </Field>

        <Field label="Site Tagline">
          <input
            value={form.site_tagline ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, site_tagline: e.target.value }))}
            className="admin-input"
            maxLength={200}
            placeholder="A short line describing your site"
          />
        </Field>

        <Field label="Copyright Text">
          <input
            value={form.copyright_text ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, copyright_text: e.target.value }))}
            className="admin-input"
            maxLength={200}
            placeholder={`© ${new Date().getFullYear()} MofiGames. All rights reserved.`}
          />
          <p className="mt-1 text-[11px] text-text-faint">
            Shown exactly as typed in the site footer — include the © symbol and year yourself, e.g. “© {new Date().getFullYear()} MofiGames. All rights reserved.”
          </p>
        </Field>

        <ImageField
          label="Logo"
          hint="SVG, PNG, or WebP, up to 2MB. Shown next to the site name in the header. Leave blank to use the default icon."
          value={form.logo_url ?? null}
          onChange={(url) => setForm((f) => ({ ...f, logo_url: url }))}
          accept="image/svg+xml,image/png,image/webp"
        />
      </div>

      <div className="mt-5 glass flex flex-col gap-5 rounded-2xl p-6">
        <div>
          <h2 className="font-display text-base font-bold text-white">Favicon &amp; App Icons</h2>
          <p className="mt-0.5 text-xs text-text-faint">
            The full icon set browsers and devices ask for. Upload each size directly, or pick one
            already sitting in the Media Library (Icons). Every field is optional — anything left
            blank falls back to the site&apos;s bundled default icon, so nothing ever looks broken.
          </p>
        </div>

        <ImageField
          label="favicon.ico"
          hint="Multi-resolution .ico or PNG, up to 2MB. The classic browser-tab icon and the universal fallback older browsers request."
          value={form.favicon_url ?? null}
          onChange={(url) => setForm((f) => ({ ...f, favicon_url: url }))}
          accept="image/x-icon,image/vnd.microsoft.icon,.ico,image/png"
          preview="small"
        />

        <div className="grid grid-cols-2 gap-5">
          <ImageField
            label="favicon-16x16.png"
            hint="PNG, 16×16, up to 2MB."
            value={form.favicon_16_url ?? null}
            onChange={(url) => setForm((f) => ({ ...f, favicon_16_url: url }))}
            accept="image/png,image/webp"
            preview="small"
          />
          <ImageField
            label="favicon-32x32.png"
            hint="PNG, 32×32, up to 2MB."
            value={form.favicon_32_url ?? null}
            onChange={(url) => setForm((f) => ({ ...f, favicon_32_url: url }))}
            accept="image/png,image/webp"
            preview="small"
          />
        </div>

        <ImageField
          label="favicon.svg"
          hint="SVG, up to 2MB. Scalable, crisp at any size — modern browsers prefer this over the PNGs/ICO when it's set."
          value={form.favicon_svg_url ?? null}
          onChange={(url) => setForm((f) => ({ ...f, favicon_svg_url: url }))}
          accept="image/svg+xml"
          preview="small"
        />

        <ImageField
          label="apple-touch-icon.png"
          hint="PNG, 180×180, up to 2MB. Used for iOS/iPadOS home-screen bookmarks."
          value={form.apple_touch_icon_url ?? null}
          onChange={(url) => setForm((f) => ({ ...f, apple_touch_icon_url: url }))}
          accept="image/png,image/webp"
        />

        <div className="grid grid-cols-2 gap-5">
          <ImageField
            label="icon-192.png"
            hint="PNG, 192×192, up to 2MB. Android home-screen / PWA install icon."
            value={form.icon_192_url ?? null}
            onChange={(url) => setForm((f) => ({ ...f, icon_192_url: url }))}
            accept="image/png,image/webp"
          />
          <ImageField
            label="icon-512.png"
            hint="PNG, 512×512, up to 2MB. PWA install prompt / splash-screen icon."
            value={form.icon_512_url ?? null}
            onChange={(url) => setForm((f) => ({ ...f, icon_512_url: url }))}
            accept="image/png,image/webp"
          />
        </div>
      </div>
    </form>
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

/** One row for a single image/icon slot: live preview, manual URL entry,
 * "Upload file" (goes into the shared media-library bucket under the
 * "icon" category, same as Admin → Media Management → Icons), and
 * "Choose from Media" (picks an already-uploaded asset from that same
 * category instead of uploading a new one). */
function ImageField({
  label,
  hint,
  value,
  onChange,
  accept,
  preview = "normal",
}: {
  label: string;
  hint: string;
  value: string | null;
  onChange: (url: string | null) => void;
  accept: string;
  preview?: "normal" | "small";
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const asset = await uploadMediaAsset("icon", file);
      onChange(asset.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const size = preview === "small" ? 40 : 56;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      <div className="flex items-center gap-3">
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/5"
          style={{ width: size, height: size }}
        >
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={`${label} preview`} className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] text-text-faint">None</span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <input
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="https://... or upload / choose a file"
            className="admin-input"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15 disabled:opacity-60"
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
            >
              <ImagePlus size={13} />
              Choose from Media
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-text-faint hover:bg-white/10 hover:text-white"
              >
                <X size={13} />
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => handleFile(e.target.files)}
          />
          <p className="text-[11px] text-text-faint">{hint}</p>
          {uploadError && <p className="text-[11px] font-medium text-hot">{uploadError}</p>}
        </div>
      </div>

      {pickerOpen && (
        <MediaLibraryPickerModal
          label={label}
          onClose={() => setPickerOpen(false)}
          onSelect={(url) => {
            onChange(url);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** Modal listing every asset already uploaded under Admin → Media
 * Management → Icons, so an icon slot can reuse one instead of uploading
 * a duplicate. Read-only picker — managing/deleting assets stays on the
 * Media Management page itself. */
function MediaLibraryPickerModal({
  label,
  onClose,
  onSelect,
}: {
  label: string;
  onClose: () => void;
  onSelect: (url: string) => void;
}) {
  const [assets, setAssets] = useState<AdminMediaAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMediaAssets("icon")
      .then((data) => {
        if (!cancelled) setAssets(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load media.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="glass flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-sm font-bold text-white">Choose an icon</h3>
            <p className="text-[11px] text-text-faint">For: {label} — from Media Management → Icons</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-faint hover:bg-white/10 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto">
          {error && <p className="text-sm font-medium text-hot">{error}</p>}
          {!error && !assets && (
            <div className="flex items-center justify-center py-16 text-text-faint">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {assets && assets.length === 0 && (
            <p className="py-10 text-center text-sm text-text-faint">
              No icons uploaded yet. Use &quot;Upload file&quot; instead, or add some from Admin →
              Media Management → Icons.
            </p>
          )}
          {assets && assets.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => onSelect(asset.url)}
                  className="group flex flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-2.5 hover:border-white/25 hover:bg-white/10"
                  title={asset.file_name}
                >
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-black/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.url} alt={asset.file_name} className="h-full w-full object-contain" />
                  </div>
                  <span className="flex items-center gap-1 truncate text-[10px] text-text-faint group-hover:text-white">
                    <Check size={10} className="shrink-0 opacity-0 group-hover:opacity-100" />
                    <span className="truncate">{asset.file_name}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
