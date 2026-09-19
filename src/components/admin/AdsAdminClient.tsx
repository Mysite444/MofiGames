"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Loader2,
  Save,
  Megaphone,
  LayoutTemplate,
  RectangleHorizontal,
  PanelLeft,
  Gamepad2,
  PanelBottom,
  PinOff,
  Gift,
  Code2,
} from "lucide-react";
import { fetchAdSettings, updateAdSettings, type AdminAdSettings, type AdSettingsInput } from "@/lib/supabase/admin-content";

/** Admin → Monetization → Advertisement Management. One settings singleton
 * covering every ad placement the public site can render — Google
 * AdSense, Header, Player, Sidebar, In-Game, Footer, Sticky, Reward, and
 * a freeform Custom HTML slot — each independently toggleable,
 * CrazyGames-style. Saved as one form, same pattern as Site Identity. */
export function AdsAdminClient() {
  const [settings, setSettings] = useState<AdminAdSettings | null>(null);
  const [form, setForm] = useState<AdSettingsInput>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchAdSettings();
      setSettings(data);
      setForm(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load advertisement settings.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set<K extends keyof AdSettingsInput>(key: K, value: AdSettingsInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    setSaved(false);
    try {
      const updated = await updateAdSettings(form);
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
    <form onSubmit={handleSave} className="max-w-3xl pb-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Advertisement Management</h1>
          <p className="mt-0.5 text-sm text-text-faint">
            Turn ad placements on or off and configure each one — no code changes needed.
          </p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="glow-yellow-button sticky top-4 flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--color-menu-bg)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saved ? "Saved!" : "Save changes"}
        </button>
      </div>

      {formError && (
        <div className="mb-6 rounded-xl bg-hot/15 px-4 py-3 text-sm font-medium text-hot">{formError}</div>
      )}

      <div className="flex flex-col gap-5">
        {/* Google AdSense */}
        <AdSection
          icon={<Megaphone size={17} />}
          title="Google AdSense"
          description="Account-level AdSense — auto ads and the publisher client id used across placements."
          enabled={form.adsense_enabled ?? false}
          onToggle={(v) => set("adsense_enabled", v)}
        >
          <Field label="Publisher client ID">
            <input
              value={form.adsense_client_id ?? ""}
              onChange={(e) => set("adsense_client_id", e.target.value || null)}
              placeholder="ca-pub-XXXXXXXXXXXXXXXX"
              className="admin-input"
            />
          </Field>
          <ToggleRow
            label="Enable Auto Ads"
            hint="Let Google automatically place ads across the site."
            checked={form.adsense_auto_ads ?? false}
            onChange={(v) => set("adsense_auto_ads", v)}
          />
        </AdSection>

        {/* Header Ads */}
        <AdSection
          icon={<LayoutTemplate size={17} />}
          title="Header Ads"
          description="Banner shown at the top of the page, under the site header."
          enabled={form.header_ads_enabled ?? false}
          onToggle={(v) => set("header_ads_enabled", v)}
        >
          <Field label="Ad slot ID">
            <input
              value={form.header_ads_slot_id ?? ""}
              onChange={(e) => set("header_ads_slot_id", e.target.value || null)}
              placeholder="e.g. 1234567890"
              className="admin-input"
            />
          </Field>
          <CodeField
            label="Custom code (optional)"
            hint="Overrides the slot ID above — paste a full ad tag/script instead."
            value={form.header_ads_code ?? ""}
            onChange={(v) => set("header_ads_code", v)}
          />
        </AdSection>

        {/* Player Ads */}
        <AdSection
          icon={<RectangleHorizontal size={17} />}
          title="Player Ads"
          description="728×90 banner shown directly under the game player, on the game page."
          enabled={form.player_ads_enabled ?? false}
          onToggle={(v) => set("player_ads_enabled", v)}
        >
          <Field label="Ad slot ID">
            <input
              value={form.player_ads_slot_id ?? ""}
              onChange={(e) => set("player_ads_slot_id", e.target.value || null)}
              placeholder="e.g. 1234567890"
              className="admin-input"
            />
          </Field>
          <CodeField
            label="Custom code (optional)"
            hint="Overrides the slot ID above — paste a full ad tag/script instead."
            value={form.player_ads_code ?? ""}
            onChange={(v) => set("player_ads_code", v)}
          />
        </AdSection>

        {/* Sidebar Ads */}
        <AdSection
          icon={<PanelLeft size={17} />}
          title="Sidebar Ads"
          description="Shown in the sidebar/rail alongside content on desktop layouts."
          enabled={form.sidebar_ads_enabled ?? false}
          onToggle={(v) => set("sidebar_ads_enabled", v)}
        >
          <Field label="Ad slot ID">
            <input
              value={form.sidebar_ads_slot_id ?? ""}
              onChange={(e) => set("sidebar_ads_slot_id", e.target.value || null)}
              placeholder="e.g. 1234567890"
              className="admin-input"
            />
          </Field>
          <CodeField
            label="Custom code (optional)"
            hint="Overrides the slot ID above — paste a full ad tag/script instead."
            value={form.sidebar_ads_code ?? ""}
            onChange={(v) => set("sidebar_ads_code", v)}
          />
        </AdSection>

        {/* In-Game Ads */}
        <AdSection
          icon={<Gamepad2 size={17} />}
          title="In-Game Ads"
          description="Interstitial shown around gameplay — e.g. before a game loads."
          enabled={form.ingame_ads_enabled ?? false}
          onToggle={(v) => set("ingame_ads_enabled", v)}
        >
          <Field label="Ad slot ID">
            <input
              value={form.ingame_ads_slot_id ?? ""}
              onChange={(e) => set("ingame_ads_slot_id", e.target.value || null)}
              placeholder="e.g. 1234567890"
              className="admin-input"
            />
          </Field>
          <Field label="Show every N plays">
            <input
              type="number"
              min={1}
              max={100}
              value={form.ingame_ads_frequency ?? 3}
              onChange={(e) => set("ingame_ads_frequency", Number(e.target.value) || 1)}
              className="admin-input"
            />
          </Field>
          <CodeField
            label="Custom code (optional)"
            hint="Overrides the slot ID above — paste a full ad tag/script instead."
            value={form.ingame_ads_code ?? ""}
            onChange={(v) => set("ingame_ads_code", v)}
          />
        </AdSection>

        {/* Footer Ads */}
        <AdSection
          icon={<PanelBottom size={17} />}
          title="Footer Ads"
          description="Banner shown at the bottom of the page, above the footer."
          enabled={form.footer_ads_enabled ?? false}
          onToggle={(v) => set("footer_ads_enabled", v)}
        >
          <Field label="Ad slot ID">
            <input
              value={form.footer_ads_slot_id ?? ""}
              onChange={(e) => set("footer_ads_slot_id", e.target.value || null)}
              placeholder="e.g. 1234567890"
              className="admin-input"
            />
          </Field>
          <CodeField
            label="Custom code (optional)"
            hint="Overrides the slot ID above — paste a full ad tag/script instead."
            value={form.footer_ads_code ?? ""}
            onChange={(v) => set("footer_ads_code", v)}
          />
        </AdSection>

        {/* Sticky Ads */}
        <AdSection
          icon={<PinOff size={17} />}
          title="Sticky Ads"
          description="Anchored banner that stays fixed on screen while the page scrolls."
          enabled={form.sticky_ads_enabled ?? false}
          onToggle={(v) => set("sticky_ads_enabled", v)}
        >
          <Field label="Ad slot ID">
            <input
              value={form.sticky_ads_slot_id ?? ""}
              onChange={(e) => set("sticky_ads_slot_id", e.target.value || null)}
              placeholder="e.g. 1234567890"
              className="admin-input"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Position">
              <select
                value={form.sticky_ads_position ?? "bottom"}
                onChange={(e) => set("sticky_ads_position", e.target.value as "top" | "bottom")}
                className="admin-input"
              >
                <option value="bottom">Bottom</option>
                <option value="top">Top</option>
              </select>
            </Field>
            <div className="flex items-end pb-1">
              <ToggleRow
                label="Dismissible"
                hint="Let visitors close it."
                checked={form.sticky_ads_dismissible ?? true}
                onChange={(v) => set("sticky_ads_dismissible", v)}
              />
            </div>
          </div>
          <CodeField
            label="Custom code (optional)"
            hint="Overrides the slot ID above — paste a full ad tag/script instead."
            value={form.sticky_ads_code ?? ""}
            onChange={(v) => set("sticky_ads_code", v)}
          />
        </AdSection>

        {/* Reward Ads */}
        <AdSection
          icon={<Gift size={17} />}
          title="Reward Ads"
          description="Opt-in rewarded video — visitors choose to watch one in exchange for a perk."
          enabled={form.reward_ads_enabled ?? false}
          onToggle={(v) => set("reward_ads_enabled", v)}
        >
          <Field label="Ad slot ID">
            <input
              value={form.reward_ads_slot_id ?? ""}
              onChange={(e) => set("reward_ads_slot_id", e.target.value || null)}
              placeholder="e.g. 1234567890"
              className="admin-input"
            />
          </Field>
          <Field label="Reward label">
            <input
              value={form.reward_ads_reward_label ?? ""}
              onChange={(e) => set("reward_ads_reward_label", e.target.value)}
              placeholder="e.g. Bonus unlocked"
              maxLength={80}
              className="admin-input"
            />
          </Field>
          <CodeField
            label="Custom code (optional)"
            hint="Overrides the slot ID above — paste a full ad tag/script instead."
            value={form.reward_ads_code ?? ""}
            onChange={(v) => set("reward_ads_code", v)}
          />
        </AdSection>

        {/* Custom HTML Ads */}
        <AdSection
          icon={<Code2 size={17} />}
          title="Custom HTML Ads"
          description="Freeform markup/script slot for any other ad network."
          enabled={form.custom_html_ads_enabled ?? false}
          onToggle={(v) => set("custom_html_ads_enabled", v)}
        >
          <CodeField
            label="HTML / script"
            hint="Pasted verbatim wherever the site mounts the custom ad placement."
            value={form.custom_html_ads_code ?? ""}
            onChange={(v) => set("custom_html_ads_code", v)}
            rows={5}
          />
        </AdSection>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      {children}
    </label>
  );
}

function CodeField({
  label,
  hint,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string | null) => void;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-text-muted">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        rows={rows}
        placeholder="<script>...</script>"
        spellCheck={false}
        className="admin-input resize-y font-mono text-xs"
      />
      <p className="text-[11px] text-text-faint">{hint}</p>
    </label>
  );
}

/** Compact on/off switch used inline next to a field, not a full section. */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2.5">
      <div>
        <p className="text-xs font-semibold text-white">{label}</p>
        {hint && <p className="text-[11px] text-text-faint">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

/** Card wrapper for one ad placement: icon, title, description, and a
 * top-right on/off switch that gates whether the fields below actually
 * apply on the public site. */
function AdSection({
  icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-menu-yellow)] text-black">
            {icon}
          </span>
          <div>
            <h2 className="font-display text-base font-bold text-white">{title}</h2>
            <p className="mt-0.5 text-xs text-text-faint">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          role="switch"
          aria-checked={enabled}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
            enabled ? "bg-[var(--color-menu-yellow)]" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      <div className={`flex flex-col gap-4 ${enabled ? "" : "opacity-50"}`}>
        <fieldset disabled={!enabled} className="contents">
          {children}
        </fieldset>
      </div>
    </div>
  );
}
