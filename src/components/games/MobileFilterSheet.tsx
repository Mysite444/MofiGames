"use client";

import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { MobileActionSheet } from "@/components/MobileActionSheet";
import type { Category } from "@/lib/types";
import {
  type GameFilters,
  type SortValue,
  SORT_OPTIONS,
  TAG_FILTER_OPTIONS,
  PLATFORM_OPTIONS,
  GAME_MODE_OPTIONS,
} from "@/lib/game-filters";

function ChipToggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{ touchAction: "manipulation" }}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
        active
          ? "border-[var(--color-menu-yellow)] bg-[rgba(0,0,0,0.22)] text-white"
          : "border-white/12 bg-white/5 text-text-muted"
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-faint">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function MobileFilterSheet({
  open,
  onClose,
  filters,
  onChange,
  categories,
  onReset,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  filters: GameFilters;
  onChange: (next: GameFilters) => void;
  categories: Category[];
  onReset: () => void;
  resultCount: number;
}) {
  function setSort(sort: SortValue) {
    onChange({ ...filters, sort });
  }
  function toggleCategory(slug: string) {
    const next = filters.categories.includes(slug)
      ? filters.categories.filter((v) => v !== slug)
      : [...filters.categories, slug];
    onChange({ ...filters, categories: next });
  }
  function toggleTag(value: (typeof TAG_FILTER_OPTIONS)[number]["value"]) {
    const next = filters.tags.includes(value) ? filters.tags.filter((v) => v !== value) : [...filters.tags, value];
    onChange({ ...filters, tags: next });
  }
  function togglePlatform(value: (typeof PLATFORM_OPTIONS)[number]["value"]) {
    const next = filters.platforms.includes(value)
      ? filters.platforms.filter((v) => v !== value)
      : [...filters.platforms, value];
    onChange({ ...filters, platforms: next });
  }
  function toggleMode(value: (typeof GAME_MODE_OPTIONS)[number]["value"]) {
    const next = filters.modes.includes(value) ? filters.modes.filter((v) => v !== value) : [...filters.modes, value];
    onChange({ ...filters, modes: next });
  }

  return (
    <MobileActionSheet open={open} onClose={onClose} title="Filters & Sort" icon={<SlidersHorizontal size={17} />}>
      <div className="flex max-h-[55vh] flex-col gap-5 overflow-y-auto pr-1">
        <Section title="Sort By">
          {SORT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <ChipToggle key={opt.value} active={filters.sort === opt.value} onClick={() => setSort(opt.value)}>
                <Icon size={14} strokeWidth={2.25} />
                {opt.shortLabel}
              </ChipToggle>
            );
          })}
        </Section>

        <Section title="Category">
          {categories.map((c) => (
            <ChipToggle key={c.slug} active={filters.categories.includes(c.slug)} onClick={() => toggleCategory(c.slug)}>
              {c.name}
            </ChipToggle>
          ))}
        </Section>

        <Section title="Tags">
          {TAG_FILTER_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <ChipToggle key={opt.value} active={filters.tags.includes(opt.value)} onClick={() => toggleTag(opt.value)}>
                <Icon size={14} strokeWidth={2.25} />
                {opt.label}
              </ChipToggle>
            );
          })}
        </Section>

        <Section title="Platform">
          {PLATFORM_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <ChipToggle key={opt.value} active={filters.platforms.includes(opt.value)} onClick={() => togglePlatform(opt.value)}>
                <Icon size={14} strokeWidth={2.25} />
                {opt.label}
              </ChipToggle>
            );
          })}
        </Section>

        <Section title="Game Mode">
          {GAME_MODE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <ChipToggle key={opt.value} active={filters.modes.includes(opt.value)} onClick={() => toggleMode(opt.value)}>
                <Icon size={14} strokeWidth={2.25} />
                {opt.label}
              </ChipToggle>
            );
          })}
        </Section>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onReset}
          style={{ touchAction: "manipulation" }}
          className="glass flex-1 rounded-full py-2.5 text-sm font-semibold text-white"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{ touchAction: "manipulation" }}
          className="btn-cta flex-[2] py-2.5 text-sm"
        >
          Show {resultCount} {resultCount === 1 ? "Game" : "Games"}
        </button>
      </div>
    </MobileActionSheet>
  );
}
