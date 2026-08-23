"use client";

import { X } from "lucide-react";
import type { Category } from "@/lib/types";
import {
  type GameFilters,
  TAG_FILTER_OPTIONS,
  PLATFORM_OPTIONS,
  GAME_MODE_OPTIONS,
} from "@/lib/game-filters";

interface Chip {
  key: string;
  label: string;
  onRemove: () => void;
}

export function FilterChips({
  filters,
  categories,
  onChange,
  onClearAll,
}: {
  filters: GameFilters;
  categories: Category[];
  onChange: (next: GameFilters) => void;
  onClearAll: () => void;
}) {
  const chips: Chip[] = [];

  if (filters.q.trim()) {
    chips.push({
      key: "q",
      label: `“${filters.q.trim()}”`,
      onRemove: () => onChange({ ...filters, q: "" }),
    });
  }

  for (const slug of filters.categories) {
    const category = categories.find((c) => c.slug === slug);
    chips.push({
      key: `cat-${slug}`,
      label: category?.name ?? slug,
      onRemove: () => onChange({ ...filters, categories: filters.categories.filter((c) => c !== slug) }),
    });
  }

  for (const tag of filters.tags) {
    const opt = TAG_FILTER_OPTIONS.find((o) => o.value === tag);
    chips.push({
      key: `tag-${tag}`,
      label: opt?.label ?? tag,
      onRemove: () => onChange({ ...filters, tags: filters.tags.filter((t) => t !== tag) }),
    });
  }

  for (const platform of filters.platforms) {
    const opt = PLATFORM_OPTIONS.find((o) => o.value === platform);
    chips.push({
      key: `platform-${platform}`,
      label: opt?.label ?? platform,
      onRemove: () => onChange({ ...filters, platforms: filters.platforms.filter((p) => p !== platform) }),
    });
  }

  for (const mode of filters.modes) {
    const opt = GAME_MODE_OPTIONS.find((o) => o.value === mode);
    chips.push({
      key: `mode-${mode}`,
      label: opt?.label ?? mode,
      onRemove: () => onChange({ ...filters, modes: filters.modes.filter((m) => m !== mode) }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="glass-strong flex items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2 text-xs font-semibold text-white transition-colors hover:bg-white/[0.16]"
        >
          {chip.label}
          <X size={13} strokeWidth={2.5} className="text-text-faint" />
        </button>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="text-xs font-semibold text-[var(--color-menu-yellow)] underline-offset-2 hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
