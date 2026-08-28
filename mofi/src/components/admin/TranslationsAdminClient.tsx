"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2, X, Loader2, AlertTriangle, Search } from "lucide-react";
import {
  fetchLanguagesAdmin,
  fetchTranslationsAdmin,
  upsertTranslation,
  deleteTranslationKey,
  fetchMissingTranslationsReport,
  type AdminLanguage,
  type AdminTranslation,
  type TranslationNamespace,
  type MissingTranslationReportRow,
} from "@/lib/supabase/admin-content";

const NAMESPACES: { value: TranslationNamespace; label: string }[] = [
  { value: "ui", label: "UI Text" },
  { value: "menu", label: "Menu" },
  { value: "page", label: "Pages" },
  { value: "email", label: "Email templates" },
  { value: "error", label: "Error messages" },
];

/** Admin → Localization → Translations. One namespace + one language at a
 * time, edited inline; new keys are created against whichever language is
 * currently selected (usually the default) and then filled in for the
 * rest. The Missing Translation Report is a collapsible panel fed by its
 * own endpoint rather than derived client-side, since it needs to look
 * across every language & namespace at once. */
export function TranslationsAdminClient() {
  const [languages, setLanguages] = useState<AdminLanguage[] | null>(null);
  const [namespace, setNamespace] = useState<TranslationNamespace>("ui");
  const [languageCode, setLanguageCode] = useState<string>("");
  const [rows, setRows] = useState<AdminTranslation[] | null>(null);
  const [q, setQ] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState<MissingTranslationReportRow[] | null>(null);

  useEffect(() => {
    fetchLanguagesAdmin()
      .then((ls) => {
        setLanguages(ls);
        const def = ls.find((l) => l.is_default) ?? ls[0];
        if (def) setLanguageCode(def.code);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load languages."));
  }, []);

  const load = useCallback(async () => {
    if (!languageCode) return;
    setLoadError(null);
    try {
      setRows(await fetchTranslationsAdmin({ namespace, languageCode, q: q || undefined }));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load translations.");
    }
  }, [namespace, languageCode, q]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleValueBlur(row: AdminTranslation, value: string) {
    if (value === row.value) return;
    setSavingKey(row.key);
    try {
      await upsertTranslation({ namespace: row.namespace, key: row.key, language_code: row.language_code, value });
      setRows((rs) => rs?.map((r) => (r.key === row.key ? { ...r, value } : r)) ?? rs);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to save.");
      await load();
    } finally {
      setSavingKey(null);
    }
  }

  function handleValueChange(key: string, value: string) {
    setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, value } : r)) ?? rs);
  }

  async function handleAddKey(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    if (!newKey.trim()) {
      setAddError("Key is required.");
      return;
    }
    setAdding(true);
    try {
      await upsertTranslation({ namespace, key: newKey.trim(), language_code: languageCode, value: newValue });
      await load();
      setAddOpen(false);
      setNewKey("");
      setNewValue("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add key.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteKey(row: AdminTranslation) {
    if (!confirm(`Delete "${row.key}" in every language? This can't be undone.`)) return;
    try {
      await deleteTranslationKey(row.namespace, row.key);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  async function toggleReport() {
    setReportOpen((v) => !v);
    if (!report) {
      try {
        setReport(await fetchMissingTranslationsReport());
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Failed to load the missing translation report.");
      }
    }
  }

  const languageName = useMemo(
    () => languages?.find((l) => l.code === languageCode)?.name ?? languageCode,
    [languages, languageCode]
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Localization — Translations</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            UI, menu, page, email template, and error message strings, per language.
          </p>
        </div>
        <button
          type="button"
          onClick={toggleReport}
          className="flex items-center gap-1.5 rounded-full border border-[var(--color-surface-border)] px-4 py-2 text-xs font-bold text-white/80 hover:text-white"
        >
          <AlertTriangle size={14} />
          Missing translation report
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      {reportOpen && (
        <div className="glass mb-6 rounded-xl p-4">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-text-faint">
            Keys missing a value in at least one enabled language
          </h3>
          {report === null && <Loader2 size={16} className="animate-spin text-text-faint" />}
          {report?.length === 0 && <p className="text-sm text-text-faint">Nothing missing — all caught up.</p>}
          {report && report.length > 0 && (
            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {report.map((r) => (
                <div key={`${r.namespace}::${r.key}`} className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-mono text-white/80">
                    <span className="text-text-faint">{r.namespace}.</span>
                    {r.key}
                  </span>
                  <span className="text-hot">{r.missingLanguages.join(", ")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {NAMESPACES.map((n) => (
          <button
            key={n.value}
            type="button"
            onClick={() => setNamespace(n.value)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
              namespace === n.value ? "bg-[var(--color-menu-yellow)] text-black" : "bg-white/10 text-white/70 hover:bg-white/20"
            }`}
          >
            {n.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={languageCode}
            onChange={(e) => setLanguageCode(e.target.value)}
            className="admin-input w-auto py-1.5 text-xs"
          >
            {languages?.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search keys or values…"
              className="admin-input w-48 py-1.5 pl-7 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setNewKey("");
              setNewValue("");
              setAddError(null);
              setAddOpen(true);
            }}
            className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-3.5 py-1.5 text-xs font-bold text-white"
          >
            <Plus size={13} />
            Add key
          </button>
        </div>
      </div>

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="w-1/3 px-4 py-3 font-semibold">Key</th>
              <th className="px-4 py-3 font-semibold">{languageName} value</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-text-faint">
                  No keys yet in this namespace for {languageName}.
                </td>
              </tr>
            )}
            {rows?.map((row) => (
              <tr key={row.key} className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3 font-mono text-xs text-white/80 align-top">{row.key}</td>
                <td className="px-4 py-3">
                  <textarea
                    value={row.value}
                    onChange={(e) => handleValueChange(row.key, e.target.value)}
                    onBlur={(e) => handleValueBlur(row, e.target.value)}
                    rows={row.value.length > 80 ? 3 : 1}
                    className="admin-input resize-none text-xs"
                  />
                  {savingKey === row.key && <span className="text-[10px] text-text-faint">Saving…</span>}
                </td>
                <td className="px-4 py-3 align-top">
                  <button
                    type="button"
                    onClick={() => handleDeleteKey(row)}
                    aria-label={`Delete ${row.key}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-hot/15 hover:text-hot"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {addOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setAddOpen(false)}>
          <form
            onSubmit={handleAddKey}
            onClick={(e) => e.stopPropagation()}
            className="glass-opaque flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-[var(--color-surface-border)] p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white">Add translation key</h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
              >
                <X size={18} className="text-white/70" />
              </button>
            </div>

            {addError && (
              <p className="mb-4 rounded-lg bg-hot/15 px-3 py-2 text-xs font-medium text-hot">{addError}</p>
            )}

            <div className="flex flex-col gap-4">
              <Field label={`Namespace: ${NAMESPACES.find((n) => n.value === namespace)?.label}`}>
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="nav.home"
                  className="admin-input font-mono"
                  required
                />
              </Field>
              <Field label={`Value (${languageName})`}>
                <textarea
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  rows={3}
                  className="admin-input resize-none"
                />
              </Field>
            </div>

            <div className="mt-6 flex gap-2">
              <button
                type="submit"
                disabled={adding}
                className="glow-yellow-button flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-menu-bg)] py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {adding && <Loader2 size={15} className="animate-spin" />}
                Add key
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
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
