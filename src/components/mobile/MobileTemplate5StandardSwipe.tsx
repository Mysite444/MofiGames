"use client";

/**
 * Template 5 — Standard Swipe
 *
 * The default horizontal-scroll row that already exists in MobileGameRow.
 * Wraps MobileGameRow so the template system can select it the same way
 * as the other four templates. Icon + title header, square game cards,
 * scrollable rail.
 */
import { MobileGameRow } from "@/components/MobileGameRow";
import type { MobileTemplateSectionProps } from "./MobileTemplateProps";
import type { IconName } from "@/lib/types";

export function MobileTemplate5StandardSwipe({
  games,
  title,
  subtitle,
  viewAllHref,
  accent = "#ffffff",
  icon = "Gamepad2",
  showViewAll = true,
}: MobileTemplateSectionProps) {
  if (games.length === 0) return null;

  return (
    <MobileGameRow
      title={title}
      icon={icon as IconName}
      accent={accent}
      games={games}
      viewMoreHref={showViewAll ? viewAllHref : undefined}
      cardSize="square"
      hideTitles
    />
  );
}
