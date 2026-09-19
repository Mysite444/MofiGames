"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, Loader2, Play, Trash2, ScrollText, ChevronDown } from "lucide-react";
import {
  fetchImportProviders,
  createImportProvider,
  updateImportProvider,
  deleteImportProvider,
  upsertImportRule,
  runImportProvider,
  type ImportProvider,
} from "@/lib/supabase/automation-content";
import { fetchAllCategoriesAdmin, fetchAllTagsAdmin, type AdminCategory, type AdminTag } from "@/lib/supabase/admin-content";

const emptyProviderForm = { name: "", slug: "", feed_url: "" };

function RuleEditor({
  provider,
  categories,
  tags,
  onSaved,
}: {
  provider: ImportProvider;
  categories: AdminCategory[];
  tags: AdminTag[];
  onSaved: (p: ImportProvider) => void;
}) {
  const rule = provider.rule;
  const [autoPublish, setAutoPublish] = useState(rule?.auto_publish ?? false);
  const [skipDuplicates, setSkipDuplicates] = useState(rule?.skip_duplicate_games ?? true);
  const [autoUpdate, setAutoUpdate] = useState(rule?.auto_update_existing_games ?? true);
  const [category, setCategory] = useState(rule?.default_category_slug ?? "");
  const [tagIds, setTagIds] = useState<string[]>(rule?.default_tag_ids ?? []);
  const [maxItems, setMaxItems] = useState(rule?.max_items_per_run ?? 100);
  const [maxRetries, setMaxRetries] = useState(rule?.max_retries ?? 3);
  const [cron, setCron] = useState(rule?.schedule_cron ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const savedRule = await upsertImportRule({
        provider_id: provider.id,
        schedule_cron: cron || null,
        auto_publish: autoPublish,
        skip_duplicate_games: skipDuplicates,
        auto_update_existing_games: autoUpdate,
        default_category_slug: category || null,
        default_tag_ids: tagIds,
        max_items_per_run: maxItems,
        max_retries: maxRetries,
      });
      onSaved({ ...provider, rule: savedRule });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save import rules.");
    } finally {
      setSaving(false);
    }
  }

  function toggleTag(id: string) {
    setTagIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  return (
    <div className="flex flex-col gap-3 text-xs">
      {error && <p className="text-hot">{error}</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} />
          Auto publish or save as draft
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
          Skip duplicate games
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={autoUpdate} onChange={(e) => setAutoUpdate(e.target.checked)} />
          Auto update existing games
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          <span className="text-text-faint">Default category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-2 py-1 text-white"
          >
            <option value="">— none —</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-text-faint">Import scheduler (cron)</span>
          <input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="0 * * * *"
            className="w-28 rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-2 py-1 font-mono text-white"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-text-faint">Max items/run</span>
          <input
            type="number"
            value={maxItems}
            onChange={(e) => setMaxItems(Number(e.target.value))}
            className="w-16 rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-2 py-1 text-white"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-text-faint">Max retries</span>
          <input
            type="number"
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
            className="w-14 rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-2 py-1 text-white"
          />
        </label>
      </div>

      <div>
        <span className="mb-1 block text-text-faint">Default tags (auto assign tags)</span>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => toggleTag(t.id)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                tagIds.includes(t.id) ? "bg-[var(--color-menu-yellow)] text-black" : "bg-white/10 text-white/70 hover:bg-white/20"
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="self-start rounded-full bg-white/10 px-3 py-1.5 font-bold text-white hover:bg-white/20 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save import rules"}
      </button>
    </div>
  );
}

/** Admin → Automation → Imports. Import Scheduler (providers + per-
 * provider cron), Import Rules, and entry points to Import Logs/
 * History/Error Reports (the shared Job Logs view, filtered). */
export function AutomationImportsAdminClient() {
  const [providers, setProviders] = useState<ImportProvider[] | null>(null);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [tags, setTags] = useState<AdminTag[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyProviderForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, c, t] = await Promise.all([fetchImportProviders(), fetchAllCategoriesAdmin(), fetchAllTagsAdmin()]);
      setProviders(p);
      setCategories(c);
      setTags(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load import providers.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.slug.trim() || !form.feed_url.trim()) {
      setFormError("Name, slug, and feed URL are required.");
      return;
    }
    setSaving(true);
    try {
      await createImportProvider(form);
      await load();
      setForm(emptyProviderForm);
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add provider.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(p: ImportProvider) {
    setProviders((ps) => ps?.map((x) => (x.id === p.id ? { ...x, enabled: !x.enabled } : x)) ?? ps);
    try {
      await updateImportProvider(p.id, { enabled: !p.enabled });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update provider.");
      await load();
    }
  }

  async function handleDelete(p: ImportProvider) {
    if (!confirm(`Remove import provider "${p.name}"? Already-imported games won't be deleted.`)) return;
    try {
      await deleteImportProvider(p.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete provider.");
    }
  }

  async function handleRun(p: ImportProvider) {
    setRunning(p.id);
    setRunResult((r) => ({ ...r, [p.id]: "" }));
    try {
      const { outcome } = await runImportProvider(p.id);
      setRunResult((r) => ({
        ...r,
        [p.id]: `${outcome.status}: ${outcome.itemsOk}/${outcome.itemsProcessed} ok${outcome.error ? ` — ${outcome.error}` : ""}`,
      }));
    } catch (err) {
      setRunResult((r) => ({ ...r, [p.id]: err instanceof Error ? err.message : "Import failed." }));
    } finally {
      setRunning(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Automation — Imports</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Feed providers, import rules, and history for Auto Import Games. Feeds must return a JSON array of games.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/admin/automation/logs?jobKey=auto_import_games"
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/20"
          >
            <ScrollText size={15} /> Import logs &amp; history
          </Link>
          <button
            type="button"
            onClick={() => setFormOpen((o) => !o)}
            className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white"
          >
            <Plus size={16} /> Add provider
          </button>
        </div>
      </div>

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {formOpen && (
        <form onSubmit={handleCreate} className="glass mb-6 flex flex-col gap-3 rounded-xl p-4">
          {formError && <p className="text-sm text-hot">{formError}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              placeholder="Provider name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-3 py-2 text-sm text-white"
            />
            <input
              placeholder="slug"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              className="rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-3 py-2 text-sm text-white"
            />
            <input
              placeholder="https://example.com/games-feed.json"
              value={form.feed_url}
              onChange={(e) => setForm((f) => ({ ...f, feed_url: e.target.value }))}
              className="rounded-lg border border-[var(--color-surface-border)] bg-white/5 px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="self-start rounded-full bg-[var(--color-menu-yellow)] px-4 py-2 text-sm font-bold text-black disabled:opacity-60"
          >
            {saving ? "Adding…" : "Add provider"}
          </button>
        </form>
      )}

      {providers === null && (
        <div className="flex items-center justify-center py-20 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {providers?.length === 0 && (
        <div className="glass rounded-xl px-4 py-10 text-center text-text-faint">
          No import providers configured yet — add one to enable Auto Import Games.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {providers?.map((p) => (
          <div key={p.id} className="glass overflow-hidden rounded-xl">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="font-semibold text-white">{p.name}</p>
                <p className="truncate text-xs text-text-faint">{p.feed_url}</p>
                {runResult[p.id] && <p className="mt-0.5 text-xs text-white/70">{runResult[p.id]}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRun(p)}
                  disabled={running === p.id}
                  className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-60"
                >
                  {running === p.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  Run import
                </button>
                <button
                  type="button"
                  onClick={() => toggleEnabled(p)}
                  role="switch"
                  aria-checked={p.enabled}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    p.enabled ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      p.enabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <button type="button" onClick={() => handleDelete(p)} className="rounded-full p-1.5 text-text-faint hover:bg-hot/15 hover:text-hot">
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded((id) => (id === p.id ? null : p.id))}
                  className="rounded-full p-1.5 text-text-faint hover:bg-white/10 hover:text-white"
                >
                  <ChevronDown size={16} className={`transition-transform ${expanded === p.id ? "rotate-180" : ""}`} />
                </button>
              </div>
            </div>
            {expanded === p.id && (
              <div className="border-t border-[var(--color-surface-border)] p-4">
                <RuleEditor
                  provider={p}
                  categories={categories}
                  tags={tags}
                  onSaved={(updated) => setProviders((ps) => ps?.map((x) => (x.id === updated.id ? updated : x)) ?? ps)}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
