import type { Game, Category, IconName } from "@/lib/types";

/** Common props every mobile template receives. */
export interface MobileTemplateSectionProps {
  /** Games to render. Empty → component returns null. */
  games: Game[];
  /** Resolved category/section title (already uses admin override when set). */
  title: string;
  /** Optional subtitle */
  subtitle?: string | null;
  /** "View all" link href — undefined means no link rendered. */
  viewAllHref?: string;
  /** Accent colour from the category's colorFrom field, or a system default. */
  accent?: string;
  /** Icon name — used by templates that show a section icon. */
  icon?: IconName;
  /** Whether to show the View All link at all. */
  showViewAll?: boolean;
  /** Full category object for colour/icon fallbacks. */
  category?: Category | null;
}
