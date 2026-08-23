"use client";

import { useState } from "react";
import type { CategoryContentBlock } from "@/lib/types";

/**
 * CrazyGames-style long-form SEO copy block sitting after the grid and
 * pagination on category pages.
 *
 * Collapsed state (default):
 *   – Fixed 160 px max-height so the first 1–2 blocks are visible.
 *   – Thin white scrollbar on the right signals there is more content.
 *   – A left-aligned "Show More" link sits directly below the container.
 *
 * Expanded state (after click):
 *   – No height cap; all blocks render fully.
 *   – Scrollbar is removed (overflow is no longer constrained).
 *   – Link swaps to "Show Less".
 *
 * Renders nothing when the category has no authored content.
 */
export function CategoryContentSection({ content }: { content?: CategoryContentBlock[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!content || content.length === 0) return null;

  return (
    <div className="w-full">
      {/* Content block — clipped + scrollable when collapsed, unrestricted when expanded */}
      <div
        className={
          expanded
            ? "flex flex-col gap-5"
            : "content-scroll flex max-h-[160px] flex-col gap-5 overflow-y-auto pr-2"
        }
      >
        {content.map((block) => (
          <div key={block.heading}>
            <h2 className="font-display text-base font-bold text-white">{block.heading}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{block.body}</p>
          </div>
        ))}
      </div>

      {/* Left-aligned link — mirrors CrazyGames' "Show More / Show Less" placement */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-3 text-sm font-semibold text-[var(--color-menu-yellow)] underline-offset-2 hover:underline"
      >
        {expanded ? "Show Less" : "Show More"}
      </button>
    </div>
  );
}
