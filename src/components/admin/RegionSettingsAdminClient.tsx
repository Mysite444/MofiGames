"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Loader2, Save, Plus, Trash2 } from "lucide-react";
import {
  fetchLocalizationSettings,
  updateLocalizationSettings,
  fetchCurrenciesAdmin,
  type AdminLocalizationSettings,
  type LocalizationSettingsInput,
  type AdminCurrency,
  type CurrencyByRegionRow,
  type RegionalContentRestrictionRow,
  type CountryRedirectRow,
} from "@/lib/supabase/admin-content";

const TIMEZONES = [
  "UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "Europe/London", "Europe/Berlin", "Europe/Moscow", "Africa/Cairo",
  "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Shanghai", "Asia/Tokyo", "Australia/Sydney", "Pacific/Auckland",
];

const DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "DD MMM YYYY", "MMM D, YYYY"];
const NUMBER_FORMATS = [
  { value: "1,234.56", label: "1,234.56 (comma / period)" },
  { value: "1.234,56", label: "1.234,56 (period / comma)" },
  { value: "1 234,56", label: "1 234,56 (space / comma)" },
  { value: "1234.56", label: "1234.56 (no separator)" },
];

/** Admin → Localization → Region Settings. Default country/region,
 * timezone, date/time/number formats, first day of week, measurement
 * units, the language switcher, and the three optional region-based
 * lists (Currency by Region, Regional Content Restrictions,
 * Country-Based Redirects) — all stored on the one localization_settings
 * row (see migration 0014). */
export function RegionSettingsAdminClient() {
  const [settings, setSettings] = useState<AdminLocalizationSettings | null>(null);
  const [form, setForm] = useState<LocalizationSettingsInput>({});
  const [currencies, setCurrencies] = useState<AdminCurrency[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [data, currencyList] = await Promise.all([fetchLocalizationSettings(), fetchCurrenciesAdmin()]);
      setSettings(data);
      setForm(data);
      setCurrencies(currencyList);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load region settings.");
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
      const updated = await updateLocalizationSettings(form);
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function updateCurrencyByRegion(rows: CurrencyByRegionRow[]) {
    setForm((f) => ({ ...f, currency_by_region: rows }));
  }
  function updateRestrictions(rows: RegionalContentRestrictionRow[]) {
    setForm((f) => ({ ...f, regional_content_restrictions: rows }));
  }
  function updateRedirects(rows: CountryRedirectRow[]) {
    setForm((f) => ({ ...f, country_redirects: rows }));
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

  const currencyByRegion = form.currency_by_region ?? [];
  const restrictions = form.regional_content_restrictions ?? [];
  const redirects = form.country_redirects ?? [];

  return (
    <form onSubmit={handleSave} className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Localization — Region Settings</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Defaults, formats, the language switcher, and optional region-based rules.
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

      <div className="glass flex flex-col gap-4 rounded-2xl p-6">
        <SectionHeading>Defaults</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default country (ISO 3166-1)">
            <input
              value={form.default_country ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, default_country: e.target.value.toUpperCase() }))}
              placeholder="US"
              maxLength={2}
              className="admin-input font-mono uppercase"
            />
          </Field>
          <Field label="Default region / state">
            <input
              value={form.default_region ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, default_region: e.target.value }))}
              placeholder="California"
              className="admin-input"
            />
          </Field>
        </div>

        <SectionHeading>Formats</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Time zone">
            <select
              value={form.timezone ?? "UTC"}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              className="admin-input"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </Field>
          <Field label="Date format">
            <select
              value={form.date_format ?? "MM/DD/YYYY"}
              onChange={(e) => setForm((f) => ({ ...f, date_format: e.target.value }))}
              className="admin-input"
            >
              {DATE_FORMATS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </Field>
          <Field label="Time format">
            <select
              value={form.time_format ?? "12h"}
              onChange={(e) => setForm((f) => ({ ...f, time_format: e.target.value as "12h" | "24h" }))}
              className="admin-input"
            >
              <option value="12h">12-hour (2:30 PM)</option>
              <option value="24h">24-hour (14:30)</option>
            </select>
          </Field>
          <Field label="Number format">
            <select
              value={form.number_format ?? "1,234.56"}
              onChange={(e) => setForm((f) => ({ ...f, number_format: e.target.value }))}
              className="admin-input"
            >
              {NUMBER_FORMATS.map((n) => (
                <option key={n.value} value={n.value}>{n.label}</option>
              ))}
            </select>
          </Field>
          <Field label="First day of week">
            <select
              value={form.first_day_of_week ?? "sunday"}
              onChange={(e) => setForm((f) => ({ ...f, first_day_of_week: e.target.value as "sunday" | "monday" | "saturday" }))}
              className="admin-input"
            >
              <option value="sunday">Sunday</option>
              <option value="monday">Monday</option>
              <option value="saturday">Saturday</option>
            </select>
          </Field>
          <Field label="Measurement units">
            <select
              value={form.measurement_units ?? "imperial"}
              onChange={(e) => setForm((f) => ({ ...f, measurement_units: e.target.value as "metric" | "imperial" }))}
              className="admin-input"
            >
              <option value="imperial">Imperial (mi, lb, °F)</option>
              <option value="metric">Metric (km, kg, °C)</option>
            </select>
          </Field>
        </div>

        <SectionHeading>Language switcher</SectionHeading>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Style">
            <select
              value={form.language_switcher_style ?? "dropdown"}
              onChange={(e) => setForm((f) => ({ ...f, language_switcher_style: e.target.value as "dropdown" | "flags" | "list" }))}
              className="admin-input"
            >
              <option value="dropdown">Dropdown</option>
              <option value="flags">Flag icons</option>
              <option value="list">Inline list</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-white">
            <input
              type="checkbox"
              checked={form.language_switcher_enabled ?? true}
              onChange={(e) => setForm((f) => ({ ...f, language_switcher_enabled: e.target.checked }))}
              className="h-4 w-4 rounded"
            />
            Show language switcher on site
          </label>
        </div>

        <SectionHeading>Currency by region (optional)</SectionHeading>
        <p className="-mt-2 text-[11px] text-text-faint">
          Automatically pick a currency based on the visitor&apos;s country, when currency detection is on.
        </p>
        <ListEditor
          rows={currencyByRegion as unknown as ListRow[]}
          onChange={(rows) => updateCurrencyByRegion(rows as unknown as CurrencyByRegionRow[])}
          columns={[
            { key: "country_code", label: "Country (ISO 2)", width: "w-28", uppercase: true, maxLength: 2 },
            { key: "currency_code", label: "Currency", type: "select", options: currencies.map((c) => c.code) },
          ]}
          emptyRow={{ country_code: "", currency_code: currencies[0]?.code ?? "" }}
        />

        <SectionHeading>Regional content restrictions (optional)</SectionHeading>
        <div className="-mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.regional_content_restrictions_enabled ?? false}
            onChange={(e) => setForm((f) => ({ ...f, regional_content_restrictions_enabled: e.target.checked }))}
            className="h-4 w-4 rounded"
            id="restrictions-enabled"
          />
          <label htmlFor="restrictions-enabled" className="text-xs text-text-muted">Enforce these restrictions</label>
        </div>
        <ListEditor
          rows={restrictions as unknown as ListRow[]}
          onChange={(rows) => updateRestrictions(rows as unknown as RegionalContentRestrictionRow[])}
          columns={[
            { key: "country_code", label: "Country (ISO 2)", width: "w-28", uppercase: true, maxLength: 2 },
            { key: "restriction_type", label: "Rule", type: "select", options: ["block", "allow_only"] },
            { key: "note", label: "Note" },
          ]}
          emptyRow={{ country_code: "", restriction_type: "block", note: "" }}
        />

        <SectionHeading>Country-based redirects (optional)</SectionHeading>
        <div className="-mt-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.country_redirects_enabled ?? false}
            onChange={(e) => setForm((f) => ({ ...f, country_redirects_enabled: e.target.checked }))}
            className="h-4 w-4 rounded"
            id="redirects-enabled"
          />
          <label htmlFor="redirects-enabled" className="text-xs text-text-muted">Enforce these redirects</label>
        </div>
        <ListEditor
          rows={redirects as unknown as ListRow[]}
          onChange={(rows) => updateRedirects(rows as unknown as CountryRedirectRow[])}
          columns={[
            { key: "country_code", label: "Country (ISO 2)", width: "w-28", uppercase: true, maxLength: 2 },
            { key: "redirect_path", label: "Redirect to path or URL" },
            { key: "is_active", label: "Active", type: "checkbox" },
          ]}
          emptyRow={{ country_code: "", redirect_path: "", is_active: true }}
        />
      </div>
    </form>
  );
}

// Generic small list editor shared by the three optional region lists.
// Every row is a plain object of strings/booleans; columns declare how to
// render/edit each field. Kept intentionally simple (no per-row save) since
// the whole array is submitted together with the rest of the form.
type ColumnDef = {
  key: string;
  label: string;
  type?: "text" | "select" | "checkbox";
  options?: string[];
  width?: string;
  uppercase?: boolean;
  maxLength?: number;
};

type ListRow = Record<string, string | boolean>;

function ListEditor({
  rows,
  onChange,
  columns,
  emptyRow,
}: {
  rows: ListRow[];
  onChange: (rows: ListRow[]) => void;
  columns: ColumnDef[];
  emptyRow: ListRow;
}) {
  function updateRow(index: number, key: string, value: string | boolean) {
    const next = rows.map((r, i) => (i === index ? { ...r, [key]: value } : r));
    onChange(next);
  }
  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }
  function addRow() {
    onChange([...rows, emptyRow]);
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 && <p className="text-xs text-text-faint">None configured.</p>}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          {columns.map((col) => (
            <div key={col.key} className={col.width ?? "flex-1"}>
              {col.type === "select" ? (
                <select
                  value={String(row[col.key] ?? "")}
                  onChange={(e) => updateRow(i, col.key, e.target.value)}
                  className="admin-input py-1.5 text-xs"
                >
                  {(col.options ?? []).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : col.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={Boolean(row[col.key])}
                  onChange={(e) => updateRow(i, col.key, e.target.checked)}
                  className="h-4 w-4 rounded"
                />
              ) : (
                <input
                  value={String(row[col.key] ?? "")}
                  onChange={(e) =>
                    updateRow(i, col.key, col.uppercase ? e.target.value.toUpperCase() : e.target.value)
                  }
                  maxLength={col.maxLength}
                  placeholder={col.label}
                  className="admin-input py-1.5 text-xs"
                />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => removeRow(i)}
            aria-label="Remove row"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-hot/15 hover:text-hot"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="mt-1 flex w-fit items-center gap-1.5 rounded-full border border-dashed border-[var(--color-surface-border)] px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white"
      >
        <Plus size={13} />
        Add row
      </button>
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
