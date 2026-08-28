"use client";

import { useState } from "react";

// Below this length the description reads as one short line already, so
// the "Show More" toggle is pointless clutter — only show it once the
// text is actually long enough to be truncated (matches CrazyGames, which
// only shows the link when the paragraph genuinely runs past one line).
const TRUNCATE_THRESHOLD = 110;

/**
 * CrazyGames-style genre page heading: big FAT title (Nunito, wound up to
 * its 900/Black weight — matches CrazyGames' own font, which the site's
 * usual Space Grotesk display font can't reproduce no matter the weight
 * class), a single truncated description line with an inline "Show More" /
 * "Show Less" toggle. Kept as its own client component so the parent
 * page.tsx (and the heading itself) can stay server-rendered — only the
 * toggle is interactive.
 */
export function CategoryPageHeading({ title, description }: { title: string; description?: string }) {
  const [expanded, setExpanded] = useState(false);
  const canTruncate = Boolean(description && description.length > TRUNCATE_THRESHOLD);

  return (
    <div>
      <h1 className="font-category-fat text-3xl tracking-tight text-white sm:text-4xl">
        {title}
      </h1>
      {description && (
        <div className="mt-2 flex max-w-3xl items-baseline gap-2">
          <p className={`min-w-0 text-sm text-text-muted sm:text-[15px] ${!expanded && canTruncate ? "truncate" : ""}`}>
            {description}
          </p>
          {canTruncate && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="shrink-0 text-sm font-semibold text-[var(--color-menu-yellow)] underline-offset-2 hover:underline"
            >
              {expanded ? "Show Less" : "Show More"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
