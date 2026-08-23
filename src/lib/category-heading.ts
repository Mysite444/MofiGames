import type { Category } from "./types";

/**
 * CrazyGames-style genre page title, e.g. "Action" -> "Action Games",
 * but ".io Games" / "Shooting Games" / "Puzzle Games" (whose `name` already
 * ends in "Games") are left as-is instead of becoming "…Games Games".
 * An admin-set `seoH1Title` always wins when present.
 */
export function categoryHeadingTitle(category: Category): string {
  const override = category.seoH1Title?.trim();
  if (override) return override;
  return /games?$/i.test(category.name.trim()) ? category.name : `${category.name} Games`;
}
