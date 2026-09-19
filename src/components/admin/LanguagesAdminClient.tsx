"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, X, Loader2, Power, Star, MoveVertical } from "lucide-react";
import {
  fetchLanguagesAdmin,
  createLanguage,
  updateLanguage,
  deleteLanguage,
  type AdminLanguage,
  type LanguageInput,
} from "@/lib/supabase/admin-content";

const emptyForm: LanguageInput = {
  code: "",
  name: "",
  native_name: "",
  flag_emoji: "",
  is_rtl: false,
  is_default: false,
  is_enabled: true,
  sort_order: 0,
};

/** Admin → Localization → Languages. Supported Languages, Default
 * Language, Enable/Disable, and RTL/LTR all live on this one screen since
 * they're all properties of the same `languages` row. The Language
 * Switcher's on/off + style, and Auto Language Detection, live on the
 * Region / Advanced screens since they're site-wide behavior rather than
 * per-language data. */
export function LanguagesAdminClient() {
  const [languages, setLanguages] = useState<AdminLanguage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<LanguageInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setLanguages(await fetchLanguagesAdmin());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load languages.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setForm({ ...emptyForm, sort_order: languages?.length ?? 0 });
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.code.trim() || !form.name.trim()) {
      setFormError("Language code and name are required.");
      return;
    }
    setSaving(true);
    try {
      await createLanguage(form);
      await load();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(l: AdminLanguage, field: "is_enabled" | "is_rtl") {
    setBusyCode(l.code);
    try {
      const updated = await updateLanguage(l.code, { [field]: !l[field] });
      setLanguages((ls) => ls?.map((x) => (x.code === l.code ? updated : x)) ?? ls);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setBusyCode(null);
    }
  }

  async function handleSetDefault(l: AdminLanguage) {
    if (l.is_default) return;
    setBusyCode(l.code);
    try {
      await updateLanguage(l.code, { is_default: true, is_enabled: true });
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setBusyCode(null);
    }
  }

  async function handleDelete(l: AdminLanguage) {
    if (!confirm(`Remove ${l.name} (${l.code}) as a supported language?`)) return;
    try {
      await deleteLanguage(l.code);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Localization — Languages</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Supported languages, the default language, enable/disable, and RTL/LTR direction.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={16} />
          Add language
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">Language</th>
              <th className="px-4 py-3 font-semibold">Code</th>
              <th className="px-4 py-3 font-semibold">Direction</th>
              <th className="px-4 py-3 font-semibold">Default</th>
              <th className="px-4 py-3 font-semibold">Enabled</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {languages === null && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {languages?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-faint">
                  No languages yet.
                </td>
              </tr>
            )}
            {languages?.map((l) => (
              <tr key={l.code} className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{l.flag_emoji || "🌐"}</span>
                    <div>
                      <div className="font-semibold text-white/90">{l.name}</div>
                      {l.native_name && <div className="text-xs text-text-faint">{l.native_name}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-white/70">{l.code}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleToggle(l, "is_rtl")}
                    disabled={busyCode === l.code}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      l.is_rtl ? "bg-[var(--color-menu-yellow)] text-black" : "bg-white/10 text-white/70"
                    }`}
                    title="Click to toggle RTL/LTR"
                  >
                    {l.is_rtl ? "RTL" : "LTR"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleSetDefault(l)}
                    disabled={busyCode === l.code}
                    aria-label={l.is_default ? "Default language" : `Set ${l.name} as default`}
                    title={l.is_default ? "Default language" : "Set as default"}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 ${
                      l.is_default ? "text-[var(--color-menu-yellow)]" : "text-white/30"
                    }`}
                  >
                    <Star size={15} fill={l.is_default ? "currentColor" : "none"} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleToggle(l, "is_enabled")}
                    disabled={busyCode === l.code || l.is_default}
                    aria-label={l.is_enabled ? "Disable" : "Enable"}
                    title={l.is_default ? "Default language can't be disabled" : l.is_enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-40 ${
                      l.is_enabled ? "text-emerald-400" : "text-white/40"
                    }`}
                  >
                    <Power size={15} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDelete(l)}
                      disabled={l.is_default}
                      aria-label={`Delete ${l.name}`}
                      title={l.is_default ? "Default language can't be deleted" : "Delete"}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-hot/15 hover:text-hot disabled:opacity-30 disabled:hover:bg-transparent"
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
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-text-faint">
        <MoveVertical size={12} />
        Sort order is set when a language is added; edit it directly in the database if you need to reorder later.
      </p>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setFormOpen(false)}>
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="glass-opaque flex h-full w-full max-w-md flex-col border-l border-[var(--color-surface-border)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-surface-border)] px-5 pb-4 pt-5">
              <h2 className="font-display text-lg font-bold text-white">Add language</h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X size={18} className="text-white/70" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
            {formError && (
              <p className="mb-4 rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{formError}</p>
            )}

            <div className="flex flex-col gap-4">
              <Field label="Locale code">
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="en or pt-BR"
                  className="admin-input font-mono"
                  required
                />
              </Field>
              <Field label="Name (English)">
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Spanish"
                  className="admin-input"
                  required
                />
              </Field>
              <Field label="Native name">
                <input
                  value={form.native_name}
                  onChange={(e) => setForm((f) => ({ ...f, native_name: e.target.value }))}
                  placeholder="Español"
                  className="admin-input"
                />
              </Field>
              <Field label="Flag emoji (optional)">
                <input
                  value={form.flag_emoji}
                  onChange={(e) => setForm((f) => ({ ...f, flag_emoji: e.target.value }))}
                  placeholder="🇪🇸"
                  className="admin-input"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={form.is_rtl}
                  onChange={(e) => setForm((f) => ({ ...f, is_rtl: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Right-to-left (RTL)
              </label>
              <label className="flex items-center gap-2 text-sm text-white">
                <input
                  type="checkbox"
                  checked={form.is_enabled}
                  onChange={(e) => setForm((f) => ({ ...f, is_enabled: e.target.checked }))}
                  className="h-4 w-4 rounded"
                />
                Enabled
              </label>
            </div>

            </div>

            <div className="flex shrink-0 gap-2 border-t border-[var(--color-surface-border)] bg-[var(--color-menu-bg)] p-4">
              <button
                type="submit"
                disabled={saving}
                className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving && <Loader2 size={15} className="animate-spin" />}
                Add language
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      {children}
    </label>
  );
}
