"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, FolderKanban } from "lucide-react";
import {
  fetchReportCategoriesAdmin,
  createReportCategoryAdmin,
  updateReportCategoryAdmin,
  deleteReportCategoryAdmin,
  type ReportCategoryRow,
} from "@/lib/supabase/admin-content";

const GROUP_LABELS: Record<ReportCategoryRow["group"], string> = {
  user: "User Reports",
  abuse: "Abuse & Moderation",
  copyright: "Copyright",
};

/** Admin → Reports → Report Categories. Purely organizational — tags
 * available on any report/case for filtering across every Reports screen.
 * See supabase/migrations/0015_reports_moderation.sql. */
export function ReportCategoriesAdminClient() {
  const [categories, setCategories] = useState<ReportCategoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState<ReportCategoryRow["group"]>("abuse");
  const [saving, setSaving] = useState(false);

  function load() {
    fetchReportCategoriesAdmin("all")
      .then(setCategories)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load categories."));
  }

  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createReportCategoryAdmin({ key: key.trim(), label: label.trim(), group });
      setKey("");
      setLabel("");
      setFormOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create category.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: ReportCategoryRow) {
    try {
      await updateReportCategoryAdmin(c.id, { isActive: !c.is_active });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category.");
    }
  }

  async function remove(c: ReportCategoryRow) {
    if (!confirm(`Delete category "${c.label}"? Reports already tagged with it will become uncategorized.`)) return;
    try {
      await deleteReportCategoryAdmin(c.id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category.");
    }
  }

  const grouped = categories?.reduce<Record<string, ReportCategoryRow[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Report Categories</h1>
          <p className="mt-0.5 text-sm text-text-faint">Tags used to organize User, Abuse, and Copyright reports.</p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((v) => !v)}
          className="glow-yellow-button flex items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2 text-sm font-bold text-white"
        >
          <Plus size={15} />
          New category
        </button>
      </div>

      {formOpen && (
        <form onSubmit={submit} className="glass mb-6 rounded-xl p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="text-xs text-text-faint">
              <span className="mb-1 block font-semibold text-white/80">Key</span>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="e.g. fraud"
                required
                className="admin-input w-full"
              />
            </label>
            <label className="text-xs text-text-faint">
              <span className="mb-1 block font-semibold text-white/80">Label</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Fraud"
                required
                className="admin-input w-full"
              />
            </label>
            <label className="text-xs text-text-faint">
              <span className="mb-1 block font-semibold text-white/80">Group</span>
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value as ReportCategoryRow["group"])}
                className="admin-input w-full"
              >
                <option value="user">User Reports</option>
                <option value="abuse">Abuse & Moderation</option>
                <option value="copyright">Copyright</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="glow-yellow-button rounded-full bg-[var(--color-menu-bg)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving && <Loader2 size={14} className="mr-1.5 inline animate-spin" />}
              Create
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="glass rounded-full px-4 py-2 text-sm font-semibold text-white/80 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{error}</div>}

      {categories === null && (
        <div className="flex items-center justify-center py-20 text-text-faint">
          <Loader2 size={22} className="animate-spin" />
        </div>
      )}

      {grouped &&
        (Object.keys(grouped) as ReportCategoryRow["group"][]).map((g) => (
          <div key={g} className="mb-6">
            <span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-text-faint">
              <FolderKanban size={13} /> {GROUP_LABELS[g] ?? g}
            </span>
            <div className="flex flex-col gap-2">
              {grouped[g].map((c) => (
                <div key={c.id} className="glass flex items-center justify-between gap-3 rounded-xl p-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {c.label} <span className="font-normal text-text-faint">({c.key})</span>
                    </p>
                    {c.description && <p className="text-xs text-text-faint">{c.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleActive(c)}
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        c.is_active ? "bg-emerald-400/15 text-emerald-400" : "bg-white/10 text-white/50"
                      }`}
                    >
                      {c.is_active ? "Active" : "Inactive"}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      className="text-xs font-semibold text-white/50 hover:text-hot"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
}
