"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, X, Loader2, Power, Star } from "lucide-react";
import {
  fetchCurrenciesAdmin,
  createCurrency,
  updateCurrency,
  deleteCurrency,
  type AdminCurrency,
  type CurrencyInput,
} from "@/lib/supabase/admin-content";

const emptyForm: CurrencyInput = {
  code: "",
  name: "",
  symbol: "",
  symbol_position: "before",
  decimal_separator: ".",
  thousands_separator: ",",
  decimal_places: 2,
  exchange_rate: 1,
  exchange_rate_mode: "manual",
  is_default: false,
  is_enabled: true,
  sort_order: 0,
};

/** Admin → Localization → Currency. Default Currency, Supported
 * Currencies, Symbol, Position, decimal/thousands separators, and exchange
 * rates (automatic vs manual) all live on this one screen — same
 * "properties of one row" reasoning as Languages. Currency by Region lives
 * on the Region Settings screen since it's a mapping between two lists
 * (countries and currencies) rather than a property of a currency itself. */
export function CurrenciesAdminClient() {
  const [currencies, setCurrencies] = useState<AdminCurrency[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<CurrencyInput>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setCurrencies(await fetchCurrenciesAdmin());
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load currencies.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setForm({ ...emptyForm, sort_order: currencies?.length ?? 0 });
    setFormError(null);
    setFormOpen(true);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.code.trim() || !form.name.trim() || !form.symbol.trim()) {
      setFormError("Currency code, name, and symbol are required.");
      return;
    }
    setSaving(true);
    try {
      await createCurrency(form);
      await load();
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(c: AdminCurrency) {
    setBusyCode(c.code);
    try {
      const updated = await updateCurrency(c.code, { is_enabled: !c.is_enabled });
      setCurrencies((cs) => cs?.map((x) => (x.code === c.code ? updated : x)) ?? cs);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setBusyCode(null);
    }
  }

  async function handleSetDefault(c: AdminCurrency) {
    if (c.is_default) return;
    setBusyCode(c.code);
    try {
      await updateCurrency(c.code, { is_default: true, is_enabled: true });
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setBusyCode(null);
    }
  }

  async function handleRateModeChange(c: AdminCurrency, mode: "automatic" | "manual") {
    setBusyCode(c.code);
    try {
      const updated = await updateCurrency(c.code, { exchange_rate_mode: mode });
      setCurrencies((cs) => cs?.map((x) => (x.code === c.code ? updated : x)) ?? cs);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to update.");
    } finally {
      setBusyCode(null);
    }
  }

  async function handleRateChange(c: AdminCurrency, rate: number) {
    setCurrencies((cs) => cs?.map((x) => (x.code === c.code ? { ...x, exchange_rate: rate } : x)) ?? cs);
  }

  async function handleRateBlur(c: AdminCurrency) {
    setBusyCode(c.code);
    try {
      await updateCurrency(c.code, { exchange_rate: c.exchange_rate });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to update rate.");
      await load();
    } finally {
      setBusyCode(null);
    }
  }

  async function handleDelete(c: AdminCurrency) {
    if (!confirm(`Remove ${c.name} (${c.code}) as a supported currency?`)) return;
    try {
      await deleteCurrency(c.code);
      await load();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Localization — Currency</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Default currency, supported currencies, symbol position, separators, and exchange rates.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="glow-yellow-button flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white"
        >
          <Plus size={16} />
          Add currency
        </button>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{loadError}</div>
      )}

      <div className="glass overflow-hidden rounded-xl">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[var(--color-surface-border)] text-xs uppercase tracking-wide text-text-faint">
              <th className="px-4 py-3 font-semibold">Currency</th>
              <th className="px-4 py-3 font-semibold">Format</th>
              <th className="px-4 py-3 font-semibold">Rate</th>
              <th className="px-4 py-3 font-semibold">Default</th>
              <th className="px-4 py-3 font-semibold">Enabled</th>
              <th className="px-4 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {currencies === null && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-faint">
                  <Loader2 size={18} className="mx-auto animate-spin" />
                </td>
              </tr>
            )}
            {currencies?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-text-faint">
                  No currencies yet.
                </td>
              </tr>
            )}
            {currencies?.map((c) => (
              <tr key={c.code} className="border-b border-[var(--color-surface-border)] last:border-0 hover:bg-white/[0.03]">
                <td className="px-4 py-3">
                  <div className="font-semibold text-white/90">{c.name}</div>
                  <div className="font-mono text-xs text-text-faint">{c.code}</div>
                </td>
                <td className="px-4 py-3 text-xs text-white/70">
                  {c.symbol_position === "before" ? `${c.symbol}1${c.thousands_separator}234${c.decimal_separator}${"0".repeat(c.decimal_places)}` : `1${c.thousands_separator}234${c.decimal_separator}${"0".repeat(c.decimal_places)}${c.symbol}`}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.000001"
                      min={0}
                      value={c.exchange_rate}
                      disabled={c.exchange_rate_mode === "automatic" || busyCode === c.code}
                      onChange={(e) => handleRateChange(c, Number(e.target.value))}
                      onBlur={() => handleRateBlur(c)}
                      className="admin-input w-24 py-1 text-xs disabled:opacity-50"
                    />
                    <select
                      value={c.exchange_rate_mode}
                      onChange={(e) => handleRateModeChange(c, e.target.value as "automatic" | "manual")}
                      disabled={busyCode === c.code}
                      className="admin-input w-auto py-1 text-xs"
                    >
                      <option value="manual">Manual</option>
                      <option value="automatic">Automatic</option>
                    </select>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleSetDefault(c)}
                    disabled={busyCode === c.code}
                    aria-label={c.is_default ? "Default currency" : `Set ${c.name} as default`}
                    title={c.is_default ? "Default currency" : "Set as default"}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 ${
                      c.is_default ? "text-[var(--color-menu-yellow)]" : "text-white/30"
                    }`}
                  >
                    <Star size={15} fill={c.is_default ? "currentColor" : "none"} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => handleToggleEnabled(c)}
                    disabled={busyCode === c.code || c.is_default}
                    aria-label={c.is_enabled ? "Disable" : "Enable"}
                    title={c.is_default ? "Default currency can't be disabled" : c.is_enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-40 ${
                      c.is_enabled ? "text-emerald-400" : "text-white/40"
                    }`}
                  >
                    <Power size={15} />
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      disabled={c.is_default}
                      aria-label={`Delete ${c.name}`}
                      title={c.is_default ? "Default currency can't be deleted" : "Delete"}
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

      {formOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setFormOpen(false)}>
          <form
            onSubmit={handleSave}
            onClick={(e) => e.stopPropagation()}
            className="glass-opaque flex h-full w-full max-w-md flex-col border-l border-[var(--color-surface-border)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-surface-border)] px-5 pb-4 pt-5">
              <h2 className="font-display text-lg font-bold text-white">Add currency</h2>
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
              <Field label="Currency code (ISO 4217)">
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="EUR"
                  className="admin-input font-mono"
                  required
                />
              </Field>
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Euro"
                  className="admin-input"
                  required
                />
              </Field>
              <Field label="Symbol">
                <input
                  value={form.symbol}
                  onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
                  placeholder="€"
                  className="admin-input"
                  required
                />
              </Field>
              <Field label="Symbol position">
                <select
                  value={form.symbol_position}
                  onChange={(e) => setForm((f) => ({ ...f, symbol_position: e.target.value as "before" | "after" }))}
                  className="admin-input"
                >
                  <option value="before">Before amount ($10)</option>
                  <option value="after">After amount (10€)</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Decimal separator">
                  <input
                    value={form.decimal_separator}
                    onChange={(e) => setForm((f) => ({ ...f, decimal_separator: e.target.value }))}
                    maxLength={1}
                    className="admin-input"
                  />
                </Field>
                <Field label="Thousands separator">
                  <input
                    value={form.thousands_separator}
                    onChange={(e) => setForm((f) => ({ ...f, thousands_separator: e.target.value }))}
                    maxLength={1}
                    className="admin-input"
                  />
                </Field>
              </div>
              <Field label="Decimal places">
                <input
                  type="number"
                  min={0}
                  max={6}
                  value={form.decimal_places}
                  onChange={(e) => setForm((f) => ({ ...f, decimal_places: Number(e.target.value) }))}
                  className="admin-input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Exchange rate (vs default)">
                  <input
                    type="number"
                    step="0.000001"
                    min={0}
                    value={form.exchange_rate}
                    onChange={(e) => setForm((f) => ({ ...f, exchange_rate: Number(e.target.value) }))}
                    className="admin-input"
                  />
                </Field>
                <Field label="Rate mode">
                  <select
                    value={form.exchange_rate_mode}
                    onChange={(e) => setForm((f) => ({ ...f, exchange_rate_mode: e.target.value as "automatic" | "manual" }))}
                    className="admin-input"
                  >
                    <option value="manual">Manual</option>
                    <option value="automatic">Automatic</option>
                  </select>
                </Field>
              </div>
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
                Add currency
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
